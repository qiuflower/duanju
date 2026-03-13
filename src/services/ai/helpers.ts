// Frontend helpers — pure utility functions only (AI logic on backend)

// --- Lightweight shims to replace @google/genai types/enums ---

export const Type = {
    OBJECT: "OBJECT",
    ARRAY: "ARRAY",
    STRING: "STRING",
    NUMBER: "NUMBER",
    INTEGER: "INTEGER",
    BOOLEAN: "BOOLEAN",
} as const;

export const Modality = {
    AUDIO: "AUDIO",
} as const;

export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to timeout a promise
export const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Request timed out after ${ms / 1000}s`)), ms);
        promise
            .then(res => { clearTimeout(timer); resolve(res); })
            .catch(err => { clearTimeout(timer); reject(err); });
    });
};

export async function retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    initialDelay: number = 2000,
    timeoutMs: number = 1200000 // Default 20m timeout per attempt
): Promise<T> {
    let retries = 0;
    while (true) {
        try {
            return await withTimeout(operation(), timeoutMs);
        } catch (error: any) {
            const status = error?.status || error?.code || error?.response?.status;
            const message = error?.message || JSON.stringify(error);
            const isRetryable = status === 429 || status === 503 || status === 500 || message.includes("429") || message.includes("quota") || message.includes("timed out");

            if (isRetryable && retries < maxRetries) {
                const delay = initialDelay * Math.pow(2, retries);
                await wait(delay);
                retries++;
                continue;
            }
            throw error;
        }
    }
}

// Robust JSON Parsing Helper
export const safeJsonParse = <T>(text: string | undefined, fallback: T): T => {
    if (!text) return fallback;

    let cleaned = text.trim();
    cleaned = cleaned.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    const tryParse = (str: string): T | undefined => {
        try { return JSON.parse(str); } catch { return undefined; }
    };

    const fixTrailingCommas = (str: string) => str.replace(/,\s*([}\]])/g, '$1');

    let result = tryParse(cleaned);
    if (result !== undefined) return result;

    result = tryParse(fixTrailingCommas(cleaned));
    if (result !== undefined) return result;

    const firstOpen = cleaned.indexOf('{');
    const firstArray = cleaned.indexOf('[');
    let start = -1;
    let end = -1;

    if (firstOpen !== -1 && (firstArray === -1 || firstOpen < firstArray)) {
        start = firstOpen;
        end = cleaned.lastIndexOf('}');
    } else if (firstArray !== -1) {
        start = firstArray;
        end = cleaned.lastIndexOf(']');
    }

    if (start !== -1 && end !== -1 && end > start) {
        const extracted = cleaned.substring(start, end + 1);
        result = tryParse(extracted);
        if (result !== undefined) return result;
        result = tryParse(fixTrailingCommas(extracted));
        if (result !== undefined) return result;
    }

    const openChar = (firstOpen !== -1 && (firstArray === -1 || firstOpen < firstArray)) ? '{' : '[';
    const closeChar = openChar === '{' ? '}' : ']';
    if (start !== -1) {
        let depth = 0;
        let inString = false;
        let escapeNext = false;
        let balancedEnd = -1;
        for (let i = start; i < cleaned.length; i++) {
            const ch = cleaned[i];
            if (escapeNext) { escapeNext = false; continue; }
            if (ch === '\\') { escapeNext = true; continue; }
            if (ch === '"') { inString = !inString; continue; }
            if (inString) continue;
            if (ch === openChar) depth++;
            else if (ch === closeChar) { depth--; if (depth === 0) { balancedEnd = i; break; } }
        }
        if (balancedEnd > start) {
            const balanced = cleaned.substring(start, balancedEnd + 1);
            result = tryParse(balanced);
            if (result !== undefined) return result;
            result = tryParse(fixTrailingCommas(balanced));
            if (result !== undefined) return result;
        }
    }

    const base = (start !== -1 && end !== -1 && end > start)
        ? fixTrailingCommas(cleaned.substring(start, end + 1))
        : fixTrailingCommas(cleaned);

    const closers = ['', '}', ']}', '"}', '"}]', '"}]}'];
    for (const closer of closers) {
        result = tryParse(base + closer);
        if (result !== undefined) return result;
    }

    return fallback;
};
