import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { storage } from "../server/storage";
import { api } from "../shared/routes";
import { z } from "zod";
import OpenAI from "openai";
import googleTTS from "google-tts-api";
import { Buffer } from "buffer";

const MASTER_PROMPT = `
You are a Medical Prescription Interpretation Agent designed to assist patients in understanding doctor prescriptions clearly and safely.
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
5. Patient Safety: Add warning if unclear, never advise stopping medicine.
`;

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Parse prescription route - handles both /api/prescriptions/parse and /prescriptions/parse
// (Vercel rewrites /api/* -> /api, Express receives the path after /api/)
app.post(["/api/prescriptions/parse", "/prescriptions/parse"], async (req: Request, res: Response) => {
  try {
    const input = api.prescriptions.parse.input.parse(req.body);
    const base64Data = input.image.split(",")[1] || input.image;
    const mimeType = input.image.split(";")[0].split(":")[1] || "image/jpeg";
    const prompt = `Target language: ${input.language}. Parse the attached prescription.`;

    const apiKey = process.env.OPENAI_API_KEY || process.env.XAI_API_KEY;
    if (!apiKey) {
      res.status(400).json({ message: "OPENAI_API_KEY is not configured in Vercel environment variables." });
      return;
    }

    const isXAI = apiKey.startsWith("xai-");
    const baseURL = isXAI ? "https://api.x.ai/v1" : (process.env.OPENAI_BASE_URL || undefined);
    const model = process.env.OPENAI_MODEL || (isXAI ? "grok-2-vision-1212" : "gpt-4o");

    console.log(`[VaidyaVaani] Using ${isXAI ? "xAI" : "OpenAI"} model: ${model}`);

    const openai = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
    const imageUrl = input.image.startsWith("data:") ? input.image : `data:${mimeType};base64,${base64Data}`;

    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: MASTER_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

    const responseText = response.choices[0].message.content || "";
    const cleaned = responseText.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
    const resultObj = JSON.parse(cleaned);
    const parsedResponse = api.prescriptions.parse.responses[200].parse(resultObj);

    try {
      await storage.createPrescription({
        language: input.language,
        parsedMedicines: parsedResponse.parsed_medicines,
        simplifiedExplanation: parsedResponse.simplified_explanation,
        vernacularTranslation: parsedResponse.vernacular_translation,
        safetyNotes: parsedResponse.safety_notes,
        ttsReadyText: parsedResponse.tts_ready_text,
        imageUrl: null,
        ocrText: null,
      });
    } catch (dbErr) {
      console.warn("[VaidyaVaani] DB save skipped:", dbErr);
    }

    res.status(200).json(parsedResponse);
  } catch (err) {
    console.error("[VaidyaVaani] Parse error:", err);
    if (err instanceof z.ZodError) {
      res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
    } else {
      res.status(500).json({ message: err instanceof Error ? err.message : "Failed to parse prescription" });
    }
  }
});

// TTS route
app.post(["/api/tts", "/tts"], async (req: Request, res: Response) => {
  try {
    const input = api.prescriptions.tts.input.parse(req.body);
    let lang = "hi";
    if (/[ఀ-౿]/.test(input.text)) lang = "te";
    else if (!/[ऀ-ॿ]/.test(input.text) && /^[a-zA-Z\s.,]*$/.test(input.text)) lang = "en";

    const getAllAudio = (googleTTS as any).getAllAudioBase64 ?? googleTTS.getAllAudioBase64;
    const audioChunks = await getAllAudio(input.text, { lang, slow: false, host: "https://translate.google.com" });
    const fullBuffer = Buffer.concat(audioChunks.map((c: any) => Buffer.from(c.base64, "base64")));
    res.setHeader("Content-Type", "audio/mp3");
    res.status(200).send(fullBuffer);
  } catch (err) {
    console.error("[VaidyaVaani] TTS error:", err);
    res.status(500).json({ message: "Failed to generate audio" });
  }
});

// Medicine images routes
app.post(["/api/medicine-images", "/medicine-images"], async (req: Request, res: Response) => {
  try {
    const saved = await storage.saveMedicineImage(req.body);
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ message: "Failed to save medicine image" });
  }
});

app.get(["/api/medicine-images", "/medicine-images"], async (_req: Request, res: Response) => {
  try {
    const images = await storage.getMedicineImages();
    res.json(images);
  } catch (err) {
    res.status(500).json({ message: "Failed to list medicine images" });
  }
});

app.delete(["/api/medicine-images/:id", "/medicine-images/:id"], async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ message: "Invalid ID" }); return; }
    await storage.deleteMedicineImage(id);
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete medicine image" });
  }
});

// Global error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[VaidyaVaani] Unhandled error:", err);
  res.status(err.status || 500).json({ message: err.message || "Internal Server Error" });
});

export default app;
