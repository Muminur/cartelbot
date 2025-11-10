import { ParsedSignal } from "@/types";
import { parseSignal } from "./text-parser";
import { createWorker, Worker } from "tesseract.js";

let worker: Worker | null = null;

async function getWorker(): Promise<Worker> {
  if (!worker) {
    worker = await createWorker("eng");
  }
  return worker;
}

export async function terminateWorker(): Promise<void> {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}

export async function extractTextFromImage(
  imageBuffer: Buffer | string
): Promise<string> {
  try {
    const tesseractWorker = await getWorker();
    const {
      data: { text },
    } = await tesseractWorker.recognize(imageBuffer);
    return text.trim();
  } catch (error) {
    await terminateWorker();
    throw new Error(
      `OCR extraction failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export async function parseImageSignal(
  imageBuffer: Buffer | string
): Promise<ParsedSignal> {
  const extractedText = await extractTextFromImage(imageBuffer);

  if (!extractedText || extractedText.length < 10) {
    return {
      symbol: "",
      entries: [],
      targets: [],
      stopLoss: 0,
      confidence: 0,
      errors: ["OCR extraction failed - no text found in image"],
    };
  }

  const parsed = parseSignal(extractedText);

  if (parsed.confidence < 50) {
    parsed.errors.push(
      "Low confidence parse from image - please verify extracted data"
    );
  }

  return parsed;
}

export function validateImageFile(file: File): string | null {
  const maxSize = 10 * 1024 * 1024;
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

  if (!allowedTypes.includes(file.type)) {
    return "Invalid file type. Only JPEG, PNG, and WebP images are allowed";
  }

  if (file.size > maxSize) {
    return "File too large. Maximum size is 10MB";
  }

  return null;
}
