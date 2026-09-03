import { type InsertPrescription, type Prescription, type InsertMedicineImage, type MedicineImage } from "../shared/schema";

export interface IStorage {
  getPrescriptions(): Promise<Prescription[]>;
  getPrescription(id: number): Promise<Prescription | undefined>;
  createPrescription(prescription: InsertPrescription): Promise<Prescription>;
  saveMedicineImage(data: InsertMedicineImage): Promise<MedicineImage>;
  deleteMedicineImage(id: number): Promise<void>;
  getMedicineImages(): Promise<MedicineImage[]>;
}

export class MemStorage implements IStorage {
  private prescriptionsMap: Map<number, Prescription>;
  private medicineImagesMap: Map<number, MedicineImage>;
  private prescriptionIdCounter: number;
  private medicineImageIdCounter: number;

  constructor() {
    this.prescriptionsMap = new Map();
    this.medicineImagesMap = new Map();
    this.prescriptionIdCounter = 1;
    this.medicineImageIdCounter = 1;
  }

  async getPrescriptions(): Promise<Prescription[]> {
    return Array.from(this.prescriptionsMap.values());
  }

  async getPrescription(id: number): Promise<Prescription | undefined> {
    return this.prescriptionsMap.get(id);
  }

  async createPrescription(insertPrescription: InsertPrescription): Promise<Prescription> {
    const id = this.prescriptionIdCounter++;
    const prescription: Prescription = {
      ...insertPrescription,
      id,
      imageUrl: insertPrescription.imageUrl ?? null,
      ocrText: insertPrescription.ocrText ?? null,
      parsedMedicines: (insertPrescription.parsedMedicines as any[]) ?? null,
      simplifiedExplanation: insertPrescription.simplifiedExplanation ?? null,
      vernacularTranslation: insertPrescription.vernacularTranslation ?? null,
      safetyNotes: insertPrescription.safetyNotes ?? null,
      ttsReadyText: insertPrescription.ttsReadyText ?? null,
      createdAt: new Date(),
    };
    this.prescriptionsMap.set(id, prescription);
    return prescription;
  }

  async saveMedicineImage(data: InsertMedicineImage): Promise<MedicineImage> {
    const id = this.medicineImageIdCounter++;
    const image: MedicineImage = {
      ...data,
      id,
      prescriptionId: data.prescriptionId ?? null,
      createdAt: new Date(),
    };
    this.medicineImagesMap.set(id, image);
    return image;
  }

  async deleteMedicineImage(id: number): Promise<void> {
    this.medicineImagesMap.delete(id);
  }

  async getMedicineImages(): Promise<MedicineImage[]> {
    const images = Array.from(this.medicineImagesMap.values());
    images.sort((a, b) => b.createdAt!.getTime() - a.createdAt!.getTime());
    return images;
  }
}

export const storage = new MemStorage();

