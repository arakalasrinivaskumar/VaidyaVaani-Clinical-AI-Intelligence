import express, { type Request, Response, NextFunction } from "express";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import * as googleTTS from "google-tts-api";

// ─── Inline Resilient Zod Schemas ───────────────────────────────────

const ParsePrescriptionInput = z.object({
  image: z.string(),
  language: z.enum(["hindi", "telugu"]).default("hindi"),
});

const ParsedMedicineSchema = z.object({
  medicine_name: z.string().nullish().transform(v => v || "Prescribed Medicine"),
  strength: z.string().nullish().transform(v => v || "As directed"),
  dosage_frequency: z.string().nullish().transform(v => v || "As directed"),
  duration: z.string().nullish().transform(v => v || "As prescribed"),
  instructions: z.string().nullish().transform(v => v || "Follow doctor instructions"),
}).passthrough();

const ParsePrescriptionOutput = z.object({
  parsed_medicines: z.array(ParsedMedicineSchema).default([]),
  simplified_explanation: z.string().nullish().transform(v => v || "Prescription interpreted successfully."),
  vernacular_translation: z.string().nullish().transform(v => v || ""),
  safety_notes: z.string().nullish().transform(v => v || "Please consult your doctor before modifying medication."),
  tts_ready_text: z.string().nullish().transform(v => v || "कृपया डॉक्टर के निर्देशानुसार दवा लें।"),
}).passthrough();

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

OUTPUT FORMAT (STRICT JSON ONLY):
Return output in the following JSON structure ONLY. Do not include markdown formatting or extra text.
CRITICAL: ALL STRING VALUES MUST BE IN THE TARGET LANGUAGE (Except medicine names which should be in English or transliterated).

{
  "parsed_medicines": [
    {
      "medicine_name": "Name of medicine in English",
      "strength": "Strength (e.g., 500mg) in target language",
      "dosage_frequency": "Frequency in target language (e.g. दिन में दो बार / రోజుకు రెండుసార్లు)",
      "duration": "Duration in target language (e.g. 5 दिन / 5 రోజులు)",
      "instructions": "Instructions in target language (e.g. खाने के बाद / భోజనం తర్వాత)"
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

// Helper: Safely extract JSON from raw model string
function extractAndParseJson(raw: string): any {
  let cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  return JSON.parse(cleaned);
}

// ─── Express App ────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Health check
app.get(["/api/health", "/health", "/"], (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "VaidyaVaani API", timestamp: new Date().toISOString() });
});

// Key Candidate Interface
interface KeyCandidate {
  provider: "openai" | "xai" | "gemini";
  key: string;
  name: string;
}

// Scans all environment variables and gathers all available API keys
function getCandidateKeys(): KeyCandidate[] {
  const candidates: KeyCandidate[] = [];

  for (const [name, val] of Object.entries(process.env)) {
    if (!val || typeof val !== "string") continue;
    const key = val.trim();
    if (!key || key.length < 10) continue;

    const uName = name.toUpperCase();

    // Check provider based on name pattern or key value prefix
    if (uName.includes("GEMINI") || uName.includes("GOOGLE") || key.startsWith("AIza")) {
      candidates.push({ provider: "gemini", key, name });
    } else if (uName.includes("XAI") || uName.includes("GROK") || key.startsWith("xai-")) {
      candidates.push({ provider: "xai", key, name });
    } else if (uName.includes("OPENAI") || uName.includes("GPT") || key.startsWith("sk-")) {
      candidates.push({ provider: "openai", key, name });
    }
  }

  // Deduplicate keys by value
  const seen = new Set<string>();
  return candidates.filter((item) => {
    if (seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
}

// Helper: Call OpenAI or xAI
async function parseWithOpenAI(candidate: KeyCandidate, imageBase64: string, mimeType: string, language: string) {
  const isXAI = candidate.provider === "xai" || candidate.key.startsWith("xai-");
  const baseURL = isXAI ? "https://api.x.ai/v1" : (process.env.OPENAI_BASE_URL || undefined);
  const model = process.env.OPENAI_MODEL || (isXAI ? "grok-2-vision-1212" : "gpt-4o");

  console.log(`[VaidyaVaani] Trying key [${candidate.name}] (${candidate.provider}) model=${model}`);

  const OpenAIClient = (OpenAI as any).default || OpenAI;
  const openai = new OpenAIClient({ apiKey: candidate.key, ...(baseURL ? { baseURL } : {}) });

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
          { type: "text", text: `Target language: ${language}. Parse the attached prescription image accurately.` },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0].message.content || "{}";
  const parsed = extractAndParseJson(raw);
  return ParsePrescriptionOutput.parse(parsed);
}

// Helper: Call Google Gemini with automatic model fallback
async function parseWithGemini(candidate: KeyCandidate, imageBase64: string, mimeType: string, language: string) {
  console.log(`[VaidyaVaani] Trying key [${candidate.name}] (Google Gemini)`);
  const genAI = new GoogleGenerativeAI(candidate.key);

  const modelsToTry = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-1.5-pro"];
  const cleanBase64 = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
  let lastGeminiErr: any = null;

  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
        },
      });

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
      const parsed = extractAndParseJson(raw);
      return ParsePrescriptionOutput.parse(parsed);
    } catch (err: any) {
      lastGeminiErr = err;
      console.warn(`[VaidyaVaani] Gemini model [${modelName}] failed: ${err?.message || err}`);
    }
  }

  throw lastGeminiErr || new Error("All Gemini models failed");
}

// ─── Parse Prescription Route (Auto Key Rotation Pool) ────────────────
app.post(["/api/prescriptions/parse", "/prescriptions/parse"], async (req: Request, res: Response) => {
  try {
    const input = ParsePrescriptionInput.parse(req.body);
    const candidates = getCandidateKeys();

    if (candidates.length === 0) {
      res.status(400).json({
        message: "No API keys found in environment variables. Please add GEMINI_API_KEY (from https://aistudio.google.com/) or OPENAI_API_KEY to your Vercel Environment Variables and Redeploy.",
      });
      return;
    }

    const mimeType = input.image.startsWith("data:")
      ? (input.image.split(";")[0].split(":")[1] || "image/jpeg")
      : "image/jpeg";

    const errors: string[] = [];

    // Loop through all candidate keys automatically until one succeeds!
    for (const candidate of candidates) {
      try {
        let parsed;
        if (candidate.provider === "gemini") {
          parsed = await parseWithGemini(candidate, input.image, mimeType, input.language);
        } else {
          parsed = await parseWithOpenAI(candidate, input.image, mimeType, input.language);
        }

        console.log(`[VaidyaVaani] Success with key [${candidate.name}]`);
        res.status(200).json(parsed);
        return;
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        console.warn(`[VaidyaVaani] Key [${candidate.name}] failed: ${errMsg}`);
        errors.push(`[${candidate.name} (${candidate.provider})]: ${errMsg.slice(0, 150)}`);
      }
    }

    // All candidate keys failed
    console.error("[VaidyaVaani] All API keys in rotation pool failed:", errors);
    res.status(402).json({
      message: `All ${candidates.length} configured API keys in your pool failed or returned errors. If you just added new keys in Vercel, remember to click "Redeploy" on the Deployments tab so the new keys take effect!`,
      details: errors,
    });
  } catch (err) {
    console.error("[VaidyaVaani] Parse validation error:", err);
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
