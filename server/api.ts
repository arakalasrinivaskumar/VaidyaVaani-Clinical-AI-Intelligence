import express, { type Request, Response, NextFunction } from "express";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import * as googleTTS from "google-tts-api";

// ─── Inline Zod Schemas ─────────────────────────────────────────────

const ParsePrescriptionInput = z.object({
  image: z.string(),
  language: z.enum(["hindi", "telugu"]),
});

const ParsedMedicineSchema = z.object({
  medicine_name: z.string(),
  strength: z.string(),
  dosage_frequency: z.string(),
  duration: z.string(),
  instructions: z.string(),
});

const ParsePrescriptionOutput = z.object({
  parsed_medicines: z.array(ParsedMedicineSchema),
  simplified_explanation: z.string(),
  vernacular_translation: z.string(),
  safety_notes: z.string(),
  tts_ready_text: z.string(),
});

const TtsInput = z.object({ text: z.string() });

// ─── Master Prompt ──────────────────────────────────────────────────

const MASTER_PROMPT = `You are a Medical Prescription Interpretation Agent designed to assist patients in understanding doctor prescriptions clearly and safely.
Your task is to:
* Interpret OCR-extracted prescription text
* Understand medical dosage instructions
* Translate and simplify them into the requested TARGET LANGUAGE (e.g. Hindi, Telugu)
* Generate patient-friendly explanations in the TARGET LANGUAGE
* Ensure clarity, accuracy, and safety

You must not diagnose or change medical intent.
You must not invent medicines or dosages.

OUTPUT FORMAT (STRICT JSON):
Return output in the following JSON structure ONLY. Do not include markdown formatting or backticks.
CRITICAL: ALL STRING VALUES MUST BE IN THE TARGET LANGUAGE (Except medicine names which should be in English or transliterated).

{
  "parsed_medicines": [
    {
      "medicine_name": "Name of medicine in English",
      "strength": "Strength (e.g., 500mg) translated if needed",
      "dosage_frequency": "Frequency translated to target language (e.g., in Hindi: दिन में दो बार)",
      "duration": "Duration translated to target language (e.g., in Hindi: 5 दिन)",
      "instructions": "Instructions translated to target language (e.g., in Hindi: खाने के बाद)"
    }
  ],
  "simplified_explanation": "A complete, friendly explanation of ALL medicines translated fully into the TARGET LANGUAGE.",
  "vernacular_translation": "The literal translation of the prescription into the TARGET LANGUAGE.",
  "safety_notes": "Safety warnings translated into the TARGET LANGUAGE",
  "tts_ready_text": "A natural sounding spoken paragraph in the TARGET LANGUAGE explaining the prescription, with clear pauses (e.g. use periods/commas) that will be sent to Text-to-Speech."
}

PROCESSING RULES
1. OCR Normalization: Correct errors, identify medicines/dosage.
2. Abbreviations: OD (Once), BD (Twice), TID (Three times), HS (Night), SOS (As needed), AC (Before food), PC (After food).
3. Dosage: Maintain exact dosage. Convert frequency into human-understandable format in the TARGET LANGUAGE.
4. Translation rules: You MUST translate the explanation, instructions, duration, dosage, safety notes, and TTS text completely into the TARGET LANGUAGE provided by the user.
5. Patient Safety: Add warning if unclear, never advise stopping medicine.`;

// ─── Express App ────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Health check
app.get(["/api/health", "/health", "/"], (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "VaidyaVaani API", timestamp: new Date().toISOString() });
});

// Helper for Vision AI API call (tries OpenAI/xAI, falls back to Gemini)
async function parseWithOpenAI(apiKey: string, imageBase64: string, mimeType: string, language: string) {
  const isXAI = apiKey.startsWith("xai-");
  const baseURL = isXAI ? "https://api.x.ai/v1" : (process.env.OPENAI_BASE_URL || undefined);
  const model = process.env.OPENAI_MODEL || (isXAI ? "grok-2-vision-1212" : "gpt-4o");

  console.log(`[VaidyaVaani] Calling ${isXAI ? "xAI" : "OpenAI"} model=${model}`);

  const OpenAIClient = (OpenAI as any).default || OpenAI;
  const openai = new OpenAIClient({ apiKey, ...(baseURL ? { baseURL } : {}) });

  const imageUrl = imageBase64.startsWith("data:")
    ? imageBase64
    : `data:${mimeType};base64,${imageBase64}`;

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: MASTER_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: `Target language: ${language}. Parse the attached prescription.` },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0].message.content || "{}";
  const cleaned = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
  return ParsePrescriptionOutput.parse(JSON.parse(cleaned));
}

async function parseWithGemini(geminiKey: string, imageBase64: string, mimeType: string, language: string) {
  console.log(`[VaidyaVaani] Calling Gemini (gemini-1.5-flash)`);
  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const cleanBase64 = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
  const result = await model.generateContent([
    `${MASTER_PROMPT}\n\nTarget language: ${language}. Parse the attached prescription. Return output strictly in valid JSON matching the specified structure.`,
    {
      inlineData: {
        data: cleanBase64,
        mimeType: mimeType || "image/jpeg",
      },
    },
  ]);

  const raw = result.response.text();
  const cleaned = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
  return ParsePrescriptionOutput.parse(JSON.parse(cleaned));
}

// ─── Parse Prescription Route ─────────────────────────────────────────
app.post(["/api/prescriptions/parse", "/prescriptions/parse"], async (req: Request, res: Response) => {
  try {
    const input = ParsePrescriptionInput.parse(req.body);

    const xaiKey = process.env.XAI_API_KEY_1 || process.env.XAI_API_KEY;
    const openAIKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY_1;
    const geminiKey = process.env.GEMINI_API_KEY;

    const mimeType = input.image.startsWith("data:")
      ? (input.image.split(";")[0].split(":")[1] || "image/jpeg")
      : "image/jpeg";

    let lastError: Error | null = null;

    // Priority 1: Try xAI (Grok-2 Vision) if xAI key is available
    if (xaiKey) {
      try {
        const parsed = await parseWithOpenAI(xaiKey, input.image, mimeType, input.language);
        res.status(200).json(parsed);
        return;
      } catch (err: any) {
        console.warn("[VaidyaVaani] xAI failed, trying fallback:", err.message);
        lastError = err;
      }
    }

    // Priority 2: Try OpenAI if key is available
    if (openAIKey) {
      try {
        const parsed = await parseWithOpenAI(openAIKey, input.image, mimeType, input.language);
        res.status(200).json(parsed);
        return;
      } catch (err: any) {
        console.warn("[VaidyaVaani] OpenAI failed, trying fallback:", err.message);
        lastError = err;
      }
    }

    // Priority 3: Try Google Gemini if GEMINI_API_KEY is available
    if (geminiKey) {
      try {
        const parsed = await parseWithGemini(geminiKey, input.image, mimeType, input.language);
        res.status(200).json(parsed);
        return;
      } catch (err: any) {
        console.warn("[VaidyaVaani] Gemini failed:", err.message);
        lastError = err;
      }
    }

    // If no provider succeeded or no keys configured:
    if (lastError) {
      const isQuotaError = lastError.message.includes("429") || lastError.message.includes("quota") || lastError.message.includes("credits");
      if (isQuotaError) {
        res.status(402).json({
          message: "API Quota Exceeded: The configured OpenAI/xAI API key has run out of billing credits. Please add billing credits at https://platform.openai.com/settings/organization/billing or configure a valid GEMINI_API_KEY in Vercel."
        });
        return;
      }
      res.status(500).json({ message: lastError.message });
      return;
    }

    res.status(400).json({
      message: "No API keys configured in Vercel Environment Variables. Please set OPENAI_API_KEY, XAI_API_KEY, or GEMINI_API_KEY.",
      envChecked: ["OPENAI_API_KEY", "OPENAI_KEY_1", "XAI_API_KEY_1", "XAI_API_KEY", "GEMINI_API_KEY"],
    });
  } catch (err) {
    console.error("[VaidyaVaani] Parse error:", err);
    if (err instanceof z.ZodError) {
      res.status(400).json({ message: err.errors[0]?.message || "Validation error" });
    } else {
      res.status(500).json({ message: err instanceof Error ? err.message : "Failed to parse prescription" });
    }
  }
});

// ─── TTS ────────────────────────────────────────────────────────────
app.post(["/api/tts", "/tts"], async (req: Request, res: Response) => {
  try {
    const { text } = TtsInput.parse(req.body);
    let lang = "hi";
    if (/[ఀ-౿]/.test(text)) lang = "te";
    else if (!/[ऀ-ॿ]/.test(text) && /^[a-zA-Z\s.,!?]*$/.test(text)) lang = "en";

    const getAllAudio = (googleTTS as any).getAllAudioBase64 || (googleTTS as any).default?.getAllAudioBase64;
    if (!getAllAudio) throw new Error("google-tts-api not loaded correctly");

    const chunks = await getAllAudio(text, { lang, slow: false, host: "https://translate.google.com" });
    const buffer = Buffer.concat(chunks.map((c: any) => Buffer.from(c.base64, "base64")));
    res.setHeader("Content-Type", "audio/mp3");
    res.status(200).send(buffer);
  } catch (err) {
    console.error("[VaidyaVaani] TTS error:", err);
    res.status(500).json({ message: err instanceof Error ? err.message : "TTS failed" });
  }
});

// ─── Medicine Images ────────────────────────────────────────────────
const medicineImages: any[] = [];
let imgCounter = 1;

app.post(["/api/medicine-images", "/medicine-images"], (req: Request, res: Response) => {
  const img = { ...req.body, id: imgCounter++, createdAt: new Date().toISOString() };
  medicineImages.push(img);
  res.status(201).json(img);
});

app.get(["/api/medicine-images", "/medicine-images"], (_req: Request, res: Response) => {
  res.json([...medicineImages].reverse());
});

app.delete(["/api/medicine-images/:id", "/medicine-images/:id"], (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  const idx = medicineImages.findIndex((i) => i.id === id);
  if (idx === -1) { res.status(404).json({ message: "Not found" }); return; }
  medicineImages.splice(idx, 1);
  res.json({ success: true });
});

// ─── Global Error Handler ───────────────────────────────────────────
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[VaidyaVaani] Unhandled:", err);
  res.status(err.status || 500).json({ message: err.message || "Internal Server Error" });
});

export = app;
