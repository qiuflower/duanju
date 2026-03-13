import sharp from 'sharp';

export const isHttpUrl = (s: string) => /^https?:\/\//i.test(s);
export const isBase64 = (s: string) => /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(s);

export const parseDataUrl = (value: string): { mimeType: string; base64: string } | null => {
    if (!value.startsWith("data:")) return null;
    const base64Token = ";base64,";
    const idx = value.indexOf(base64Token);
    if (idx === -1) return null;

    const mimeType = value.substring(5, idx);
    const base64 = value.substring(idx + base64Token.length);
    return { mimeType, base64 };
};

export const base64ByteSize = (base64: string) => Math.floor((base64.length * 3) / 4);

export const guessImageMimeFromBase64 = (base64: string): string => {
    const s = (base64 || "").trim().replace(/\s+/g, "");
    if (!s) return "image/png";
    if (s.startsWith("/9j/")) return "image/jpeg";
    if (s.startsWith("iVBORw0KGgo")) return "image/png";
    if (s.startsWith("R0lGOD")) return "image/gif";
    if (s.startsWith("UklGR")) return "image/webp";
    if (s.startsWith("Qk")) return "image/bmp";
    return "image/png";
};

export const normalizeImageToDataUrl = (value: string): string => {
    if (!value) return "";
    if (/^data:/i.test(value)) return value;
    if (isHttpUrl(value)) return value;
    const b64 = value.trim().replace(/\s+/g, "");
    const mimeType = guessImageMimeFromBase64(b64);
    return `data:${mimeType};base64,${b64}`;
};

export const findFirstHttpUrlDeep = (input: unknown): string | null => {
    const seen = new Set<unknown>();

    const walk = (v: unknown): string | null => {
        if (typeof v === "string") {
            const s = v.trim();
            if (isHttpUrl(s)) return s;
            return null;
        }

        if (!v || typeof v !== "object") return null;
        if (seen.has(v)) return null;
        seen.add(v);

        if (Array.isArray(v)) {
            for (const item of v) {
                const hit = walk(item);
                if (hit) return hit;
            }
            return null;
        }

        for (const key of Object.keys(v as any)) {
            const hit = walk((v as any)[key]);
            if (hit) return hit;
        }
        return null;
    };

    return walk(input);
};

/**
 * Server-side image compression using sharp (replaces browser Canvas)
 */
export const compressDataUrlToJpegBase64 = async (
    dataUrl: string,
    maxDim: number,
    quality: number
): Promise<string | null> => {
    try {
        const parsed = parseDataUrl(dataUrl);
        if (!parsed) return null;

        const inputBuffer = Buffer.from(parsed.base64, 'base64');
        const metadata = await sharp(inputBuffer).metadata();

        if (!metadata.width || !metadata.height) return null;

        const scale = Math.min(1, maxDim / Math.max(metadata.width, metadata.height));
        const targetW = Math.max(1, Math.round(metadata.width * scale));
        const targetH = Math.max(1, Math.round(metadata.height * scale));

        const outputBuffer = await sharp(inputBuffer)
            .resize(targetW, targetH, { fit: 'inside' })
            .jpeg({ quality: Math.round(quality * 100) })
            .toBuffer();

        return outputBuffer.toString('base64');
    } catch (e) {
        console.error("Sharp compression failed:", e);
        return null;
    }
};
