import { Asset, GlobalStyle, GenerateContentResponse } from "@/shared/types";
import { retryWithBackoff, safeJsonParse, ai } from "./helpers";

// --- HELPER: Extract Image (Base64 or URL) from Response ---
export const extractImageFromResponse = (response: GenerateContentResponse): string => {
    const candidate = response.candidates?.[0];
    if (!candidate) throw new Error("No candidates returned.");

    // 1. Inline Base64
    const imagePart = candidate.content?.parts?.find((p) => p.inlineData);
    if (imagePart?.inlineData) {
        return `data:${imagePart.inlineData.mimeType || "image/png"};base64,${imagePart.inlineData.data}`;
    }

    // 2. Text containing URL (T8Star / Proxy often returns URL)
    const textPart = candidate.content?.parts?.find((p) => p.text);
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

export async function ensurePngDataUrl(url: string): Promise<string> {
    try {
        if (!url) return url;
        if (url.startsWith("data:image/png")) return url;

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
            const rawDataUrl = await toDataUrl(blob);
            if (rawDataUrl.startsWith("data:image/png")) return rawDataUrl;
            dataUrl = rawDataUrl;
        }

        if (dataUrl.startsWith("data:image/png")) return dataUrl;

        const img = new Image();
        const loaded = new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("Failed to load image for PNG conversion"));
        });
        img.src = dataUrl;
        await loaded;

        const width = img.naturalWidth || img.width || 0;
        const height = img.naturalHeight || img.height || 0;
        if (!width || !height) return url;

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return url;
        ctx.drawImage(img, 0, 0);
        return canvas.toDataURL("image/png");
    } catch {
        return url;
    }
}

export const generateAssetImage = async (
    asset: Asset,
    style: GlobalStyle,
    overridePrompt?: string,
    referenceImageUrl?: string
): Promise<{ imageUrl: string, prompt: string }> => {
    // 1. Force Style Consistency
    const workStyle = style.work.custom || (style.work.selected !== 'None' ? style.work.selected : '');
    const useOriginalCharacters = style.work.useOriginalCharacters || false;
    const textureStyle = style.texture.custom || (style.texture.selected !== 'None' ? style.texture.selected : 'Realistic');
    const visualDna = style.visualTags || "";

    const isStandardPrefix = visualDna.trim().startsWith("[") && visualDna.includes("]");

    const isRealistic =
        textureStyle.toLowerCase().includes('real') ||
        textureStyle.toLowerCase().includes('photo') ||
        workStyle.toLowerCase().includes('movie') ||
        workStyle.toLowerCase().includes('film') ||
        textureStyle.includes('写实') ||
        textureStyle.includes('摄影');

    const realismPrompt = isRealistic ? "photorealistic, 8k, raw photo, highly detailed, cinematic lighting" : "";

    let stylePrefix = "";

    if (useOriginalCharacters) {
        if (!workStyle || !workStyle.trim()) {
            throw new Error("1:1 Restoration Mode requires a valid Work Name (Reference Work).");
        }

        const normalizedWork = workStyle.trim();
        const hasChinese = /[\u4e00-\u9fa5]/.test(normalizedWork);
        const suffix = hasChinese ? "美术风格" : " Art Style";

        if (!normalizedWork.endsWith(suffix.trim())) {
            stylePrefix = `${normalizedWork}${suffix}`;
        } else {
            stylePrefix = normalizedWork;
        }
    } else if (isStandardPrefix) {
        stylePrefix = visualDna;
    } else {
        const medium = workStyle || "Cinematic";
        const era = "Modern";
        const color = "Cinematic Color";
        const lighting = "Volumetric Lighting";
        const texture = textureStyle || "High Quality";

        stylePrefix = `[${medium}][${era}][${color}][${lighting}][${texture}], ((Art Style: ${workStyle})), ((Texture: ${textureStyle}))`;
    }


    const commonNegative = "text, watermark, signature, blurry, low quality, messy, comic panels, multiple panels, split screen, collage, grid, frame, border, speech bubble";

    let negativePrompt = commonNegative;
    let prompt = "";

    if (overridePrompt) {
        prompt = overridePrompt;
    } else {
        const userNotes = (overridePrompt || "").trim();

        if (asset.type === 'character') {
            const bgConstraint = "simple clean white background, no background elements, studio lighting";
            negativePrompt += ", multiple different characters, crowd, visual effects, glowing aura, magic spells, fire, lightning, particles, accessories floating";

            negativePrompt = negativePrompt.replace("split screen, ", "").replace("multiple panels, ", "");

            const refInstruction = referenceImageUrl ? "Use the attached image as the primary reference for the character's appearance (face, hair, features)." : "";

            prompt = `(Best quality, masterpiece), ${stylePrefix}.
            Widescreen Split Screen Composition (16:9 landscape, horizontal):
            [LEFT THIRD]: Extreme Close-up Portrait of ${asset.name}'s face. High definition, detailed eyes, looking directly at camera.
            [RIGHT TWO-THIRDS]: Full Body Character Sheet of ${asset.name}. Three distinct views: Front, Side, Back. Standing pose.
            ${bgConstraint}, Subject: ${asset.description}. 
            ${userNotes ? `Additional constraints: ${userNotes}` : ""}
            ${refInstruction}
            NO TEXT. Exclude: ${negativePrompt}`;
        } else if (asset.type === 'item') {
            const bgConstraint = "pure white background (RGB 255,255,255), no background elements, shadowless studio lighting, no ambient occlusion, no reflections, no environment";
            negativePrompt += ", person, people, man, woman, child, character, hand, fingers, holding, mannequin, stand, table, floor, surface, room, bedroom, kitchen, studio set, desk, environment, scenery, background scene, perspective scene, shadow, drop shadow, cast shadow, contact shadow, reflection, reflective, glare, glossy highlights, mirror";

            negativePrompt = negativePrompt.replace("split screen, ", "").replace("multiple panels, ", "");

            const refInstruction = referenceImageUrl ? "Match the attached reference image's lighting direction and rendering style exactly." : "";

            prompt = `(Best quality, masterpiece), ${stylePrefix}.
            Create a single flat layout image on a pure white background only. No scene, no room, no surfaces.
            Widescreen Split Screen Layout (16:9 landscape, horizontal):
            [LEFT AREA]: Item macro close-up in a perfect square (1:1). Emphasize material details and craftsmanship. Crisp silhouette with clear edge separation from background.
            [RIGHT AREA]: Three equal square views (1:1:1), aligned left-to-right: Front View, Side View, Top View. Orthographic views, no perspective distortion. Same scale, strict proportional correspondence, perfect alignment.
            ${bgConstraint}. Subject: ${asset.name}. Description: ${asset.description}.
            ${userNotes ? `Additional constraints: ${userNotes}` : ""}
            Output PNG with alpha channel.
            NO SHADOWS. NO REFLECTIONS. NO TEXT.
            ${refInstruction}
            Exclude: ${negativePrompt}`;
        } else {
            const refInstruction = referenceImageUrl ? "Use the attached image as the reference for the location's style and elements." : "";

            prompt = `(Best quality, masterpiece), ${stylePrefix}, Establishing shot, Environment design, Scenery Only, Subject: ${asset.name}. Description: ${asset.description}. 
            ${userNotes ? `Additional constraints: ${userNotes}` : ""}
            ${refInstruction}
            NO TEXT. Exclude: ${negativePrompt}`;
        }
    }

    const fetchImageAsBase64 = async (url: string): Promise<string | null> => {
        try {
            const res = await fetch(url);
            const blob = await res.blob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.error("Failed to fetch image for base64 conversion:", url, e);
            return null;
        }
    };

    const ensureAspectRatio16x9 = async (url: string): Promise<string> => {
        try {
            if (!url || !url.startsWith("data:image/")) return url;

            const img = new Image();
            const loaded = new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject(new Error("Failed to load image for aspect ratio conversion"));
            });
            img.src = url;
            await loaded;

            const srcW = img.naturalWidth || img.width || 0;
            const srcH = img.naturalHeight || img.height || 0;
            if (!srcW || !srcH) return url;

            const targetRatio = 16 / 9;
            const srcRatio = srcW / srcH;
            if (Math.abs(srcRatio - targetRatio) < 0.01) return url;

            let canvasW = srcW;
            let canvasH = srcH;

            if (srcRatio > targetRatio) {
                canvasW = srcW;
                canvasH = Math.max(1, Math.round(canvasW / targetRatio));
            } else {
                canvasH = srcH;
                canvasW = Math.max(1, Math.round(canvasH * targetRatio));
            }

            const canvas = document.createElement("canvas");
            canvas.width = canvasW;
            canvas.height = canvasH;
            const ctx = canvas.getContext("2d");
            if (!ctx) return url;

            ctx.clearRect(0, 0, canvasW, canvasH);

            const scale = Math.min(canvasW / srcW, canvasH / srcH);
            const drawW = Math.max(1, Math.round(srcW * scale));
            const drawH = Math.max(1, Math.round(srcH * scale));
            const dx = Math.round((canvasW - drawW) / 2);
            const dy = Math.round((canvasH - drawH) / 2);

            ctx.drawImage(img, dx, dy, drawW, drawH);
            return canvas.toDataURL("image/png");
        } catch {
            return url;
        }
    };

    const callModel = async (p: string) => {
        const parts: any[] = [{ text: p }];

        // Add Reference Image if available
        if (referenceImageUrl) {
            try {
                const matches = referenceImageUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
                if (matches && matches.length === 3) {
                    parts.push({
                        inlineData: {
                            mimeType: matches[1],
                            data: matches[2]
                        }
                    });
                } else if (referenceImageUrl.startsWith("http")) {
                    const b64 = await fetchImageAsBase64(referenceImageUrl);
                    if (b64) {
                        const m = b64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
                        if (m) {
                            parts.push({
                                inlineData: { mimeType: m[1], data: m[2] }
                            });
                        }
                    } else {
                        parts.push({
                            inlineData: { mimeType: "image/png", data: referenceImageUrl }
                        });
                    }
                }
            } catch (e) {
                console.warn("Failed to parse reference image", e);
            }
        }

        const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'nano-banana-2-2k',
            contents: { parts },
            config: { imageConfig: { aspectRatio: '16:9' } }
        }), 1, 2000, 600000);

        if (!response.candidates || response.candidates.length === 0) {
            throw new Error("Safety Block: No candidates returned.");
        }

        const raw = extractImageFromResponse(response);
        const png = await ensurePngDataUrl(raw);
        return await ensureAspectRatio16x9(png);
    };

    try {
        const imageUrl = await callModel(prompt);
        return { imageUrl, prompt };
    } catch (e: any) {
        console.warn("Asset Gen Attempt 1 Failed:", e.message);

        if (overridePrompt) throw e;

        try {
            const simplePrompt = `(Best quality), ${stylePrefix}, ${asset.type === 'character' ? 'Widescreen (16:9) landscape, horizontal, Character Sheet, Three Views (Front, Side, Back), white background' : asset.type === 'item' ? 'Widescreen (16:9) landscape, horizontal, split layout: left square macro close-up, right three equal squares (front, side, top), pure white background (RGB 255,255,255), no shadows, no reflections, PNG with alpha channel' : 'Environment concept art, no humans, empty scenery'}, Subject: ${asset.description}. Exclude: ${commonNegative}`;
            const imageUrl = await callModel(simplePrompt);
            return { imageUrl, prompt: simplePrompt };
        } catch (e2) {
            throw e2;
        }
    }
};

export const generateSceneImage = async (
    prompt: string,
    characterDesc: string = "",
    style?: GlobalStyle,
    assets: Asset[] = [],
    sceneAssetIds: string[] = []
): Promise<string> => {
    const ar = style?.aspectRatio || '16:9';
    const finalPrompt = prompt.substring(0, 1500);

    // 1. Identify Assets to Use
    let usedAssets: Asset[] = [];

    if (sceneAssetIds && sceneAssetIds.length > 0) {
        usedAssets = assets.filter(a => sceneAssetIds.includes(a.id) && (a.refImageUrl || a.refImageAssetId));
    } else {
        usedAssets = assets.filter(a => (a.refImageUrl || a.refImageAssetId) && prompt.includes(a.name));
    }

    usedAssets = usedAssets.slice(0, 3);

    // Resolve assets
    const { loadAssetBase64 } = await import("@/services/storage");
    const resolvedUsedAssets = await Promise.all(usedAssets.map(async a => {
        let url = a.refImageUrl;
        if (!url && a.refImageAssetId) {
            url = await loadAssetBase64(a.refImageAssetId) || undefined;
        }
        return { ...a, refImageUrl: url };
    }));

    // 2. Build Multi-modal Request Parts
    const parts: any[] = [];
    let instructions = "";

    resolvedUsedAssets.forEach((asset, index) => {
        if (asset.refImageUrl) {
            const cleanBase64 = asset.refImageUrl.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
            parts.push({
                inlineData: {
                    mimeType: "image/png",
                    data: cleanBase64
                }
            });
            instructions += ` Reference Image ${index + 1} is ${asset.name} (${asset.type}).`;
        }
    });

    // 3. Construct Final Prompt with strict reference enforcement
    let fullText = finalPrompt;
    if (instructions) {
        fullText = `STRICTLY FOLLOW REFERENCES. ${instructions} ${fullText}. Use the exact visual appearance of Reference Images for consistency.`;
    }

    // 4. Style & Anachronism Negative Prompts
    let negativePrompt = "comic panels, multiple panels, split screen, collage, grid, multiple views, frame, border, speech bubble, text, watermark, blurry";
    const styleStr = JSON.stringify(style || {}).toLowerCase();
    const isAncient = styleStr.includes('ancient') || styleStr.includes('wuxia') || styleStr.includes('period') || styleStr.includes('tang') || styleStr.includes('ming') || styleStr.includes('qing') || styleStr.includes('han') || styleStr.includes('historical');

    if (isAncient) {
        negativePrompt += ", television, tv, phone, mobile, smartphone, computer, laptop, car, vehicle, modern building, skyscraper, electric light, modern clothing, suit, tie, jeans, plastic, electronic device";
    }

    fullText = `${fullText}. --ar ${ar}`;
    fullText = `${fullText}. Exclude: ${negativePrompt}`;
    parts.push({ text: fullText });

    // 5. Call Model
    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'nano-banana-2-2k',
        contents: { parts: parts },
        config: { imageConfig: { aspectRatio: ar } }
    }), 2, 2000, 600000);

    if (!response.candidates || response.candidates.length === 0) {
        throw new Error("Generation blocked by safety filters or no candidates returned.");
    }

    const raw = extractImageFromResponse(response);
    return await ensurePngDataUrl(raw);
};
