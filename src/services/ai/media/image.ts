// Frontend image utilities — business logic (generateAssetImage, generateSceneImage) moved to backend
import { GenerateContentResponse } from "@/shared/types";

// --- HELPER: Extract Image (Base64 or URL) from Response ---
export const extractImageFromResponse = (response: GenerateContentResponse): string => {
    const candidate = response.candidates?.[0];
    if (!candidate) throw new Error("No candidates returned.");

    // 1. Inline Base64
    const imagePart = candidate.content?.parts?.find((p: any) => p.inlineData);
    if (imagePart?.inlineData) {
        return `data:${imagePart.inlineData.mimeType || "image/png"};base64,${imagePart.inlineData.data}`;
    }

    // 2. Text containing URL (T8Star / Proxy often returns URL)
    const textPart = candidate.content?.parts?.find((p: any) => p.text);
    if (textPart?.text) {
        let text = textPart.text.trim();

        // Handle Markdown image: ![alt](url)
        const mdMatch = text.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
        if (mdMatch) return mdMatch[1];

        // Handle "! url" format (common in some proxies)
        if (text.startsWith("! ")) text = text.substring(2).trim();

        // Check if it's a valid URL
        const urlMatch = text.match(/(https?:\/\/[^\s]+)/);
        if (urlMatch) {
            return urlMatch[1];
        }

        throw new Error(`Model Refusal: ${text}`);
    }

    throw new Error("No image data returned.");
};

export async function ensurePngDataUrl(url: string, maxDimension: number = 1024): Promise<string> {
    try {
        if (!url) return url;

        const toDataUrl = async (blob: Blob) => {
            return await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(String(reader.result || ""));
                reader.onerror = () => reject(new Error("Failed to read image blob"));
                reader.readAsDataURL(blob);
            });
        };

        let dataUrl = url;
        if (!url.startsWith("data:")) {
            const res = await fetch(url);
            const blob = await res.blob();
            dataUrl = await toDataUrl(blob);
        }

        // If already PNG and no size limit needed, return as-is
        if (dataUrl.startsWith("data:image/png") && maxDimension <= 0) return dataUrl;

        const img = new Image();
        const loaded = new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("Failed to load image for PNG conversion"));
        });
        img.src = dataUrl;
        await loaded;

        let width = img.naturalWidth || img.width || 0;
        let height = img.naturalHeight || img.height || 0;
        if (!width || !height) return url;

        // If already PNG and within size limit, return as-is
        if (dataUrl.startsWith("data:image/png") && maxDimension > 0 && Math.max(width, height) <= maxDimension) {
            return dataUrl;
        }

        // Downscale if exceeding maxDimension
        if (maxDimension > 0 && Math.max(width, height) > maxDimension) {
            const scale = maxDimension / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return url;
        ctx.drawImage(img, 0, 0, width, height);
        return canvas.toDataURL("image/png");
    } catch {
        return url;
    }
}
