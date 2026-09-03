"""
VaidyaVaani - Python FastAPI Backend
Provides AI-powered prescription parsing using Google Gemini,
Text-to-Speech via gTTS, and MongoDB storage for prescriptions.
"""

import os
import re
import json
import base64
import io
from typing import Optional, List
from datetime import datetime

import google.generativeai as genai
from openai import OpenAI
from fastapi import FastAPI, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field
from gtts import gTTS
from pymongo import MongoClient
from pymongo.collection import Collection
from bson import ObjectId
from dotenv import load_dotenv

# ──────────────────────────────────────────
# Config / Init
# ──────────────────────────────────────────
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
XAI_API_KEY = os.getenv("XAI_API_KEY", "")
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("MONGO_DB_NAME", "vaidyavaani")

# Allowed origins for CORS (default to localhost and production Vercel frontend)
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:3000,http://localhost:5000,http://localhost:5173,http://localhost:8000,http://127.0.0.1:3000,http://127.0.0.1:5000,http://127.0.0.1:5173,https://vaidya-vaani-clinical-ai-intelligence.vercel.app",
    ).split(",")
    if origin.strip()
]

# Initialize AI Clients
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

grok_client = None
if XAI_API_KEY and XAI_API_KEY != "your_grok_api_key_here":
    grok_client = OpenAI(
        api_key=XAI_API_KEY,
        base_url="https://api.x.ai/v1",
    )

# ──────────────────────────────────────────
# MongoDB
# ──────────────────────────────────────────
try:
    mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
    mongo_client.server_info()          # test connection
    db = mongo_client[DB_NAME]
    prescriptions_col: Collection = db["prescriptions"]
    medicine_images_col: Collection = db["medicine_images"]
    print("MongoDB connected:", MONGO_URI)
except Exception as e:
    print(f"MongoDB unavailable ({e}). Running in memory-only mode.")
    mongo_client = None
    db = None
    prescriptions_col = None
    medicine_images_col = None

# In-memory fallback stores
_mem_prescriptions: list = []
_mem_medicine_images: list = []

# ──────────────────────────────────────────
# FastAPI App & Security Configuration
# ──────────────────────────────────────────
app = FastAPI(
    title="VaidyaVaani API",
    description="Intelligent prescription parser with multilingual support",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
)

# ──────────────────────────────────────────
# Pydantic Schemas
# ──────────────────────────────────────────
class ParsePrescriptionRequest(BaseModel):
    image: str = Field(..., min_length=10, max_length=15_000_000, description="Base64 encoded image string")
    language: str = Field("hindi", description="Target language: hindi or telugu")

class ParsedMedicine(BaseModel):
    medicine_name: str = "Prescribed Medicine"
    strength: str = "As directed"
    dosage_frequency: str = "As directed"
    duration: str = "As prescribed"
    instructions: str = "Follow doctor instructions"

class ParsePrescriptionResponse(BaseModel):
    parsed_medicines: List[ParsedMedicine] = []
    simplified_explanation: str = ""
    vernacular_translation: str = ""
    safety_notes: str = ""
    tts_ready_text: str = ""

class TtsRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)

class MedicineImageRequest(BaseModel):
    name: str = Field(..., max_length=200)
    servings: str = Field(..., max_length=100)
    imageUrl: str = Field(..., max_length=15_000_000)
    prescriptionId: Optional[str] = None

# ──────────────────────────────────────────
# Master Gemini Prompt
# ──────────────────────────────────────────
MASTER_PROMPT = """
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
      "dosage_frequency": "Frequency translated to target language",
      "duration": "Duration translated to target language",
      "instructions": "Instructions translated to target language"
    }
  ],
  "simplified_explanation": "A complete, friendly explanation of ALL medicines translated fully into the TARGET LANGUAGE.",
  "vernacular_translation": "The literal translation of the prescription into the TARGET LANGUAGE.",
  "safety_notes": "Safety warnings translated into the TARGET LANGUAGE",
  "tts_ready_text": "A natural sounding spoken paragraph in the TARGET LANGUAGE explaining the prescription."
}

PROCESSING RULES
1. OCR Normalization: Correct errors, identify medicines/dosage.
2. Abbreviations: OD (Once), BD (Twice), TID (Three times), HS (Night), SOS (As needed), AC (Before food), PC (After food).
3. Dosage: Maintain exact dosage. Convert frequency into human-understandable format in the TARGET LANGUAGE.
4. Translation rules: Translate everything completely into the TARGET LANGUAGE.
5. Patient Safety: Add warning if unclear, never advise stopping medicine.
"""

# Language code mapping for gTTS
LANG_MAP = {
    "hindi": "hi",
    "telugu": "te",
    "english": "en",
    "tamil": "ta",
    "kannada": "kn",
    "bengali": "bn",
    "marathi": "mr",
    "gujarati": "gu",
}

def detect_lang_code(text: str, language: str) -> str:
    """Determine gTTS language code."""
    lang = LANG_MAP.get(language.lower())
    if lang:
        return lang
    if re.search(r"[\u0c00-\u0c7f]", text):
        return "te"  # Telugu
    if re.search(r"[\u0900-\u097F]", text):
        return "hi"  # Hindi/Devanagari
    return "en"


# ──────────────────────────────────────────
# Routes
# ──────────────────────────────────────────

@app.get("/")
async def root():
    return {"message": "VaidyaVaani Python API is running 🩺", "version": "1.0.0"}

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "mongodb": "connected" if mongo_client else "in-memory mode",
        "gemini": "configured" if GEMINI_API_KEY else "missing API key",
        "grok": "configured" if grok_client else "missing API key"
    }


@app.post("/api/prescriptions/parse", response_model=ParsePrescriptionResponse)
async def parse_prescription(req: ParsePrescriptionRequest):
    """
    Parse a prescription image using Google Gemini Vision.
    Accepts base64 image + target language, returns structured JSON.
    """
    try:
        if "," in req.image:
            mime_type = req.image.split(";")[0].split(":")[1]
            b64_data = req.image.split(",")[1]
        else:
            mime_type = "image/jpeg"
            b64_data = req.image

        prompt = f"Target language: {req.language}. Parse the attached prescription.\n\n{MASTER_PROMPT}"

        if not GEMINI_API_KEY:
            raise HTTPException(status_code=503, detail="AI parsing service is not configured with an API key")
        
        # Fallback model list
        model_names = ["gemini-2.0-flash", "gemini-1.5-flash-latest", "gemini-1.5-flash"]
        response = None
        last_err = None

        for m_name in model_names:
            try:
                model = genai.GenerativeModel(m_name)
                response = model.generate_content(
                    [
                        prompt,
                        {
                            "mime_type": mime_type,
                            "data": base64.b64decode(b64_data),
                        },
                    ]
                )
                break
            except Exception as e:
                last_err = e
                continue

        if not response:
            raise HTTPException(status_code=503, detail="AI Vision model failed to process prescription image.")

        raw_text = response.text
        cleaned = re.sub(r"^```(?:json)?\n?", "", raw_text, flags=re.IGNORECASE)
        cleaned = re.sub(r"\n?```\n?$", "", cleaned).strip()

        first_brace = cleaned.find("{")
        last_brace = cleaned.rfind("}")
        if first_brace != -1 and last_brace != -1:
            cleaned = cleaned[first_brace:last_brace + 1]

        result = json.loads(cleaned)

        # Save to MongoDB (or memory) with timestamp
        record = {
            "language": req.language,
            "parsed_medicines": result.get("parsed_medicines", []),
            "simplified_explanation": result.get("simplified_explanation", ""),
            "vernacular_translation": result.get("vernacular_translation", ""),
            "safety_notes": result.get("safety_notes", ""),
            "tts_ready_text": result.get("tts_ready_text", ""),
            "created_at": datetime.utcnow().isoformat(),
        }
        if prescriptions_col is not None:
            prescriptions_col.insert_one(record)
        else:
            _mem_prescriptions.append(record)

        return ParsePrescriptionResponse(**result)

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail="Failed to parse structured response from AI model")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to parse prescription")


@app.post("/api/tts")
async def text_to_speech(req: TtsRequest):
    """
    Convert text to speech using gTTS (Google Text-to-Speech).
    Returns an MP3 audio stream.
    """
    try:
        lang = detect_lang_code(req.text, "")
        tts = gTTS(text=req.text, lang=lang, slow=False)
        audio_buffer = io.BytesIO()
        tts.write_to_fp(audio_buffer)
        audio_buffer.seek(0)
        return StreamingResponse(audio_buffer, media_type="audio/mpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail="TTS generation failed")


@app.get("/api/prescriptions")
async def list_prescriptions(limit: int = Query(20, ge=1, le=50)):
    """Return recent stored prescriptions safely capped."""
    if prescriptions_col is not None:
        docs = list(prescriptions_col.find({}, {"_id": 0}).sort("created_at", -1).limit(limit))
    else:
        docs = list(reversed(_mem_prescriptions))[:limit]
    return docs


@app.post("/api/medicine-images")
async def save_medicine_image(req: MedicineImageRequest):
    """Save a medicine image record."""
    record = {
        "name": req.name,
        "servings": req.servings,
        "imageUrl": req.imageUrl,
        "prescriptionId": req.prescriptionId,
        "created_at": datetime.utcnow().isoformat(),
    }
    if medicine_images_col is not None:
        result = medicine_images_col.insert_one(record)
        record["id"] = str(result.inserted_id)
        record.pop("_id", None)
    else:
        record["id"] = str(len(_mem_medicine_images) + 1)
        _mem_medicine_images.append(record)
    return record


@app.get("/api/medicine-images")
async def list_medicine_images(limit: int = Query(20, ge=1, le=50)):
    """Return medicine image records safely capped."""
    if medicine_images_col is not None:
        docs = list(medicine_images_col.find({}, {"_id": 0}).sort("created_at", -1).limit(limit))
    else:
        docs = sorted(_mem_medicine_images, key=lambda x: x.get("created_at", ""), reverse=True)[:limit]
    return docs


@app.delete("/api/medicine-images/{image_id}")
async def delete_medicine_image(image_id: str):
    """Delete a medicine image by ID."""
    if medicine_images_col is not None:
        try:
            medicine_images_col.delete_one({"_id": ObjectId(image_id)})
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid image ID")
    else:
        global _mem_medicine_images
        _mem_medicine_images = [img for img in _mem_medicine_images if img.get("id") != image_id]
    return {"success": True}


@app.post("/api/prescriptions/parse-image-upload")
async def parse_prescription_upload(
    file: UploadFile = File(...),
    language: str = "hindi",
):
    """
    Alternative endpoint: upload image file directly (multipart/form-data).
    Capped at 10MB to prevent DoS.
    """
    MAX_FILE_SIZE = 10 * 1024 * 1024
    content = await file.read(MAX_FILE_SIZE + 1)
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (maximum 10MB)")

    b64 = base64.b64encode(content).decode("utf-8")
    mime = file.content_type or "image/jpeg"
    data_uri = f"data:{mime};base64,{b64}"
    req = ParsePrescriptionRequest(image=data_uri, language=language)
    return await parse_prescription(req)


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PYTHON_PORT", "8000"))
    print(f"Starting VaidyaVaani Python API on port {port}")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
