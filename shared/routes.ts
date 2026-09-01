import { z } from 'zod';
import { ParsePrescriptionRequest, ParsePrescriptionResponse, TtsRequest } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  // Prescription parsing moved to Edge function: /api/prescriptions/parse.ts
  prescriptions: {
    tts: {
      method: 'POST' as const,
      path: '/api/tts' as const,
      input: TtsRequest,
      responses: {
        200: z.any(),
        500: errorSchemas.internal,
      },
    },
    saveMedicineImage: {
      method: 'POST' as const,
      path: '/api/medicine-images' as const,
      input: z.any(),
      responses: {
        201: z.any(),
        500: errorSchemas.internal,
      },
    },
    listMedicineImages: {
      method: 'GET' as const,
      path: '/api/medicine-images' as const,
      responses: {
        200: z.array(z.any()),
      },
    },
  },
};
  // Prescription parsing moved to Edge function: /api/prescriptions/parse.ts
  prescriptions: {
    tts: {
      method: 'POST' as const,
      path: '/api/tts' as const,
      input: TtsRequest,
      responses: {
        200: z.any(),
        500: errorSchemas.internal,
      },
    },
    saveMedicineImage: {
      method: 'POST' as const,
      path: '/api/medicine-images' as const,
      input: z.any(),
      responses: {
        201: z.any(),
        500: errorSchemas.internal,
      },
    },
    listMedicineImages: {
      method: 'GET' as const,
      path: '/api/medicine-images' as const,
      responses: {
        200: z.array(z.any()),
      },
    },
  },
};
  // Note: This route is now an Edge function at /api/prescriptions/parse.ts
  prescriptions: {
    parse: {
      method: 'POST' as const,
      path: '/api/prescriptions/parse' as const,
      input: ParsePrescriptionRequest,
      responses: {
        200: ParsePrescriptionResponse,
        400: errorSchemas.validation,
        500: errorSchemas.internal,
      },
    },
    // ... rest unchanged
  },
};
  prescriptions: {
    parse: {
      method: 'POST' as const,
      path: '/api/prescriptions/parse' as const,
      input: ParsePrescriptionRequest,
      responses: {
        200: ParsePrescriptionResponse,
        400: errorSchemas.validation,
        500: errorSchemas.internal,
      },
    },
    tts: {
      method: 'POST' as const,
      path: '/api/tts' as const,
      input: TtsRequest,
      responses: {
        200: z.any(), // Returns audio buffer as binary
        500: errorSchemas.internal,
      },
    },
    saveMedicineImage: {
      method: 'POST' as const,
      path: '/api/medicine-images' as const,
      input: z.any(), // Using any for simplicity in fast mode
      responses: {
        201: z.any(),
        500: errorSchemas.internal,
      },
    },
    listMedicineImages: {
      method: 'GET' as const,
      path: '/api/medicine-images' as const,
      responses: {
        200: z.array(z.any()),
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
