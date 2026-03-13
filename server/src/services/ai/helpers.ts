import { GenerateContentResponse } from "../../shared/types";

// --- Helpers ---
export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
    Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms))
    ]);

export const retryWithBackoff = async <T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    baseDelay = 2000,
    onRetry?: (attempt: number, error: any) => void
): Promise<T> => {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (e: any) {
            if (i === maxRetries - 1) throw e;
            const delay = baseDelay * Math.pow(2, i);
            console.warn(`Retry ${i + 1}/${maxRetries} after ${delay}ms:`, e?.message || e);
            if (onRetry) onRetry(i + 1, e);
            await wait(delay);
        }
    }
    throw new Error("retryWithBackoff exhausted");
};

export const safeJsonParse = <T>(text: string | undefined, fallback: T): T => {
    if (!text) return fallback;
    try {
        // Strip markdown code fences if present
        let cleaned = text.trim();
        if (cleaned.startsWith("```json")) {
            cleaned = cleaned.slice(7);
        } else if (cleaned.startsWith("```")) {
            cleaned = cleaned.slice(3);
        }
        if (cleaned.endsWith("```")) {
            cleaned = cleaned.slice(0, -3);
        }
        cleaned = cleaned.trim();
        return JSON.parse(cleaned);
    } catch (e) {
        console.error("safeJsonParse failed:", e, "Input:", text?.substring(0, 200));
        return fallback;
    }
};

// Schema type constants (matching Google AI SDK conventions)
export const Type = {
    STRING: "STRING" as const,
    NUMBER: "NUMBER" as const,
    INTEGER: "INTEGER" as const,
    BOOLEAN: "BOOLEAN" as const,
    ARRAY: "ARRAY" as const,
    OBJECT: "OBJECT" as const,
};

// --- AI Singleton ---
// In backend mode, ModelManager is accessed via getModelManager()
import { getModelManager } from "./model-manager";

class AIModels {
    async generateContent(args: {
        model: string;
        contents: any;
        config?: any;
    }): Promise<GenerateContentResponse> {
        const mm = getModelManager();
        return mm.generateContent(args);
    }

    async generateVideos(args: any) {
        const mm = getModelManager();
        return mm.generateVideos(args);
    }
}

class AIOperations {
    async getVideosOperation(args: any) {
        const mm = getModelManager();
        return mm.getVideosOperation(args);
    }
}

class AIAudio {
    async speech(body: any): Promise<ArrayBuffer> {
        const mm = getModelManager();
        return mm.speech(body);
    }
}

export const ai = {
    models: new AIModels(),
    operations: new AIOperations(),
    audio: new AIAudio(),
};
