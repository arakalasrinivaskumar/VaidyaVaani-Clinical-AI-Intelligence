import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import express from "express";
import * as googleTTS from "google-tts-api";
import { Buffer } from "node:buffer";
import OpenAI from "openai";

const MASTER_PROMPT = `
Youare a Medical Prescription Interpretation Agent designed to assist patients in understanding doctor prescriptions clearly and safely.
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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Initialize AI Clients
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  app.post(api.prescriptions.parse.path, async (req, res) => {
    try {
      const input = api.prescriptions.parse.input.parse(req.body);
      const base64Data = input.image.split(',')[1] || input.image;
      const mimeType = input.image.split(';')[0].split(':')[1] || "image/jpeg";
      const prompt = `Target language: ${input.language}. Parse the attached prescription.`;

      let responseText: string;

      if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY environment variable is missing for OpenAI parsing");
      }
      console.log("Using OpenAI (gpt-4o) for parsing...");
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: MASTER_PROMPT },
          { role: "user", content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } }
          ]}
        ],
        response_format: { type: "json_object" }
      });
      responseText = response.choices[0].message.content || "";

      // Clean up string just in case there are markdown tags around the json
      const cleanedJsonText = responseText.replace(/^```(json)?\n?/i, '').replace(/\n?```\n?$/i, '').trim();

      const resultObj = JSON.parse(cleanedJsonText);
      const parsedResponse = api.prescriptions.parse.responses[200].parse(resultObj);

      // Store in DB for history
      try {
        await storage.createPrescription({
          language: input.language,
          parsedMedicines: parsedResponse.parsed_medicines,
          simplifiedExplanation: parsedResponse.simplified_explanation,
          vernacularTranslation: parsedResponse.vernacular_translation,
          safetyNotes: parsedResponse.safety_notes,
          ttsReadyText: parsedResponse.tts_ready_text,
          imageUrl: null, // Optionally process and upload image to long term storage here
          ocrText: null
        });
      } catch (dbErr) {
        // If the DB fails (e.g. not connected), we still want to return the parsed info
        console.warn("Could not save to database, but returning parsed data anyway:", dbErr);
      }

      res.status(200).json(parsedResponse);
    } catch (err) {
      console.error("Prescription parsing error:", err);
      if (err instanceof z.ZodError) {
        res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      } else {
        const errorMsg = err instanceof Error ? err.message : "Failed to parse prescription";
        // Try OpenAI fallback if parsing fails
        if (process.env.OPENAI_API_KEY) {
          try {
            const fallbackCompletion = await openai.chat.completions.create({
              model: "gpt-4o",
              messages: [
                { role: "system", content: MASTER_PROMPT },
                { role: "user", content: prompt },
              ],
              response_format: { type: "json_object" }
            });
            const fallbackText = fallbackCompletion.choices[0].message.content || "";
            const fallbackObj = JSON.parse(fallbackText);
            const fallbackResponse = api.prescriptions.parse.responses[200].parse(fallbackObj);
            res.status(200).json(fallbackResponse);
            return;
          } catch (openaiErr) {
            console.error("OpenAI fallback failed:", openaiErr);
          }
        }
        res.status(500).json({ message: errorMsg });
      }
    }
  });

  app.post(api.prescriptions.tts.path, async (req, res) => {
    try {
      const input = api.prescriptions.tts.input.parse(req.body);

      // Use the open source google-tts-api instead of OpenAI TTS
      // It downloads base64 chunks and we buffer them.
      const languageMap: Record<string, string> = {
        "hindi": "hi",
        "telugu": "te"
      };

      // Try to determine language from text loosely - or default to english/hindi mix
      let lang = "hi"; // default
      if (/[ఀ-౿]/.test(input.text)) {
        lang = "te"; // Has Telugu characters
      } else if (!/[ऀ-ॿ]/.test(input.text) && /^[a-zA-Z\s.,]*$/.test(input.text)) {
        lang = "en"; // English only
      }

      // Convert the text cleanly into a single Audio Buffer
      // We process large texts using getAllAudioBase64
      const audioChunks = await googleTTS.getAllAudioBase64(input.text, {
        lang: lang,
        slow: false,
        host: 'https://translate.google.com',
      });

      // Combine base64 parts
      const fullBuffer = Buffer.concat(
        audioChunks.map(chunk => Buffer.from(chunk.base64, 'base64'))
      );

      res.setHeader('Content-Type', 'audio/mp3');
      res.status(200).send(fullBuffer);
    } catch (err) {
      console.error("TTS generation error:", err);
      res.status(500).json({ message: "Failed to generate audio" });
    }
  });

  app.post("/api/medicine-images", async (req, res) => {
    try {
      const saved = await storage.saveMedicineImage(req.body);
      res.status(201).json(saved);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to save medicine image" });
    }
  });

  app.get("/api/medicine-images", async (req, res) => {
    try {
      const images = await storage.getMedicineImages();
      res.json(images);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to list medicine images" });
    }
  });

  app.delete("/api/medicine-images/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ message: "Invalid ID format" });
        return;
      }
      await storage.deleteMedicineImage(id);
      res.status(200).json({ success: true });
    } catch (err) {
      console.error("Failed to delete medicine image:", err);
      res.status(500).json({ message: "Failed to delete medicine image" });
    }
  });

  return httpServer;
}
