import { useMutation } from "@tanstack/react-query";
import type { ParsePrescriptionRequestType, ParsePrescriptionResponseType } from "@shared/schema";

export function useParsePrescription() {
  return useMutation({
    mutationFn: async (data: ParsePrescriptionRequestType) => {
      const res = await fetch("/api/prescriptions/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        let errorMessage = "Failed to parse prescription";
        const text = await res.text();
        try {
          const error = JSON.parse(text);
          if (error.details && Array.isArray(error.details) && error.details.length > 0) {
            errorMessage = `${error.message}\n\nKey Diagnostics:\n• ` + error.details.join("\n• ");
          } else {
            errorMessage = error.message || errorMessage;
          }
        } catch {
          if (res.status === 413) {
            errorMessage = "Image payload too large. Please upload a smaller image file.";
          } else {
            errorMessage = `Server error (${res.status}): ${text.slice(0, 100)}`;
          }
        }
        throw new Error(errorMessage);
      }
      
      return res.json() as Promise<ParsePrescriptionResponseType>;
    },
  });
}

export function useGenerateAudio() {
  return useMutation({
    mutationFn: async (text: string) => {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      
      if (!res.ok) {
        throw new Error("Failed to generate audio");
      }
      
      // Expected to return an audio blob
      return await res.blob();
    },
  });
}
