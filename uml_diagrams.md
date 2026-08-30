# VaidyaVaani Project UML Diagrams

This document contains the UML diagrams for the **VaidyaVaani** medical AI application. The project is a full-stack application designed to parse medical prescriptions, provide multilingual explanations, and facilitate medication tracking.

## 1. System Architecture

The following component diagram illustrates the high-level architecture of VaidyaVaani, showing the relationship between the frontend, the multiple backend options, and the external AI services.

```mermaid
graph TD
    subgraph Frontend
        Client["React Client (Vite)"]
    end

    subgraph "Primary Backend (Node.js)"
        NodeServer["Express Server"]
        Storage["Drizzle ORM / MemStorage"]
    end

    subgraph "Alternative Backend (Python)"
        PyServer["FastAPI Server"]
        PyStorage["MongoDB / In-Memory"]
    end

    subgraph "External Services"
        Gemini["Google Gemini AI"]
        TTS["Google TTS / gTTS"]
    end

    Client -->|HTTP / API| NodeServer
    Client -.->|Alternative API| PyServer
    
    NodeServer -->|Persistence| Storage
    NodeServer -->|Prescription Analysis| Gemini
    NodeServer -->|Text-to-Speech| TTS

    PyServer -->|Persistence| PyStorage
    PyServer -->|Prescription Analysis| Gemini
    PyServer -->|Text-to-Speech| TTS
```

## 2. Data Model

The data model is defined using Drizzle ORM and shared between the client and server. It consists of two primary entities: [Prescription](file:///d:/VAIDHYAVAANI/shared/schema.ts#38-39) and [MedicineImage](file:///d:/VAIDHYAVAANI/shared/schema.ts#40-41).

```mermaid
classDiagram
    class Prescription {
        +int id
        +string imageUrl
        +string language
        +string ocrText
        +jsonb parsedMedicines
        +string simplifiedExplanation
        +string vernacularTranslation
        +string safetyNotes
        +string ttsReadyText
        +timestamp createdAt
    }

    class MedicineImage {
        +int id
        +int prescriptionId
        +string name
        +string servings
        +string imageUrl
        +timestamp createdAt
    }

    class ParsedMedicine {
        <<Value Object>>
        +string medicine_name
        +string strength
        +string dosage_frequency
        +string duration
        +string instructions
    }

    Prescription "1" *-- "many" MedicineImage : "references"
    Prescription ..> ParsedMedicine : "contains (JSONB)"
```

## 3. Prescription Analysis Flow

The following sequence diagram shows the step-by-step process of parsing a prescription image.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant App as "React Client"
    participant Srv as "Express Server"
    participant Gemini as "Google Gemini API"
    participant DB as "Storage / DB"

    User->>App: Uploads Prescription Image
    User->>App: Selects Target Language
    App->>Srv: POST /api/prescriptions/parse (Base64, Lang)
    
    Srv->>Gemini: generateContent (Image + Master Prompt)
    Note over Gemini: Analyzes OCR, Extracts Dosages,<br/>Translates to Target Language
    Gemini-->>Srv: Structured JSON Response
    
    Srv->>DB: createPrescription (Save Result)
    DB-->>Srv: Success
    
    Srv-->>App: Return Parsed Analysis
    App-->>User: Displays Detailed Medicine Table
```

## 4. Text-to-Speech (TTS) Flow

This diagram shows how the vernacular explanation is converted to voice for accessibility.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant App as "React Client"
    participant Srv as "Express Server"
    participant GTTS as "Google TTS Service"

    User->>App: Clicks "Play Audio"
    App->>Srv: POST /api/tts (Text)
    
    Srv->>GTTS: getAllAudioBase64 (Text, Lang)
    GTTS-->>Srv: Audio Chunks (Base64)
    
    Srv->>Srv: Buffer.concat(Chunks)
    Srv-->>App: Return MP3 Audio Blob
    
    App->>User: Plays Clinical Explanation Audio
```
