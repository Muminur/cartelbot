import { ParsedSignal } from "@/types";
import { parseSignal } from "./text-parser";
import { createWorker, Worker } from "tesseract.js";

let worker: Worker | null = null;
let workerInitialized = false;

async function getWorker(): Promise<Worker> {
  try {
    if (!worker || !workerInitialized) {
      console.log("[OCR] Initializing Tesseract worker...");

      // Create worker with English language
      // Use CDN-hosted worker to avoid Next.js module resolution issues
      worker = await createWorker("eng", 1, {
        workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
        corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0',
        logger: (m) => {
          if (m.status === "recognizing text") {
            console.log(`[OCR] Progress: ${Math.round(m.progress * 100)}%`);
          }
        },
      });

      workerInitialized = true;
      console.log("[OCR] Tesseract worker initialized successfully");
    }
    return worker;
  } catch (error) {
    console.error("[OCR] Worker initialization failed:", error);
    workerInitialized = false;
    worker = null;
    throw new Error(
      `Failed to initialize OCR worker: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export async function terminateWorker(): Promise<void> {
  if (worker) {
    try {
      await worker.terminate();
      console.log("[OCR] Worker terminated successfully");
    } catch (error) {
      console.error("[OCR] Error terminating worker:", error);
    } finally {
      worker = null;
      workerInitialized = false;
    }
  }
}

export async function extractTextFromImage(
  imageBuffer: Buffer | string
): Promise<string> {
  let workerInstance: Worker | null = null;

  try {
    console.log("[OCR] Starting text extraction from image...");
    console.log("[OCR] Image buffer type:", typeof imageBuffer);
    console.log("[OCR] Image buffer size:", imageBuffer instanceof Buffer ? imageBuffer.length : imageBuffer.length);

    workerInstance = await getWorker();

    console.log("[OCR] Recognizing text...");
    const result = await workerInstance.recognize(imageBuffer);

    console.log("[OCR] Recognition complete");
    console.log("[OCR] Extracted text length:", result.data.text.length);
    console.log("[OCR] Confidence:", result.data.confidence);
    console.log("[OCR] Raw extracted text:", result.data.text);

    const extractedText = result.data.text.trim();

    if (!extractedText) {
      console.warn("[OCR] No text extracted from image");
    }

    return extractedText;
  } catch (error) {
    console.error("[OCR] Text extraction failed:", error);
    console.error("[OCR] Error details:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Terminate worker on error to force fresh initialization next time
    await terminateWorker();

    throw new Error(
      `OCR extraction failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export async function parseImageSignal(
  imageBuffer: Buffer | string
): Promise<ParsedSignal> {
  console.log("[OCR] Parsing image signal...");

  const extractedText = await extractTextFromImage(imageBuffer);

  console.log("[OCR] Extracted text for parsing:", extractedText);

  if (!extractedText || extractedText.length < 10) {
    console.warn("[OCR] Insufficient text extracted from image");
    return {
      symbol: "",
      entries: [],
      targets: [],
      stopLoss: 0,
      confidence: 0,
      errors: ["OCR extraction failed - no text found in image or text too short"],
    };
  }

  console.log("[OCR] Parsing extracted text with text parser...");
  const parsed = parseSignal(extractedText);

  console.log("[OCR] Parse result:", {
    symbol: parsed.symbol,
    entriesCount: parsed.entries.length,
    targetsCount: parsed.targets.length,
    stopLoss: parsed.stopLoss,
    confidence: parsed.confidence,
    errorsCount: parsed.errors.length,
  });

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
