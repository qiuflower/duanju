
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

export const compressDataUrlToJpegBase64 = async (
  dataUrl: string,
  maxDim: number,
  quality: number
): Promise<string | null> => {
  if (typeof document === "undefined") return null;

  const img = new Image();
  img.decoding = "async";
  img.crossOrigin = "anonymous";

  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load image for compression"));
  });

  img.src = dataUrl;
  await loaded;

  const width = img.naturalWidth || img.width || 0;
  const height = img.naturalHeight || img.height || 0;
  if (!width || !height) return null;

  const scale = Math.min(1, maxDim / Math.max(width, height));
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const out = canvas.toDataURL("image/jpeg", quality);
  const parsed = parseDataUrl(out);
  if (!parsed) return null;
  return parsed.base64;
};

export const prepareVideoImageForApi = async (
  input: string,
  options: { maxBytes: number }
): Promise<{ value: string; bytes: number }> => {
  if (!input) return { value: "", bytes: 0 };
  if (isHttpUrl(input)) return { value: input, bytes: 0 };

  const dataUrl = normalizeImageToDataUrl(input);
  const parsed = parseDataUrl(dataUrl);
  const base64 = (parsed?.base64 || "").trim().replace(/\s+/g, "");
  const bytes = base64ByteSize(base64);

  if (bytes <= options.maxBytes) {
    return { value: dataUrl, bytes };
  }

  const attempt1 = await compressDataUrlToJpegBase64(dataUrl, 1024, 0.82);
  if (attempt1 && base64ByteSize(attempt1) <= options.maxBytes) {
    return { value: `data:image/jpeg;base64,${attempt1}`, bytes: base64ByteSize(attempt1) };
  }

  const attempt2 = await compressDataUrlToJpegBase64(dataUrl, 768, 0.76);
  if (attempt2 && base64ByteSize(attempt2) <= options.maxBytes) {
    return { value: `data:image/jpeg;base64,${attempt2}`, bytes: base64ByteSize(attempt2) };
  }

  const attempt3 = await compressDataUrlToJpegBase64(dataUrl, 512, 0.7);
  if (attempt3) return { value: `data:image/jpeg;base64,${attempt3}`, bytes: base64ByteSize(attempt3) };

  return { value: dataUrl, bytes };
};
