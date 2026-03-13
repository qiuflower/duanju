import { Asset, GlobalStyle, GenerateContentResponse } from "../../../shared/types";
import { retryWithBackoff, safeJsonParse, ai } from "../helpers";
import { MODELS } from "../model-manager";
import { extractAssetTags, resolveTagToAsset, stripAssetTags, isStoryboardTag } from "../../../shared/asset-tags";
import sharp from 'sharp';
import fetch from 'node-fetch';

// --- HELPER: Extract Image (Base64 or URL) from Response ---
export const extractImageFromResponse = (response: GenerateContentResponse): string => {
    const candidate = response.candidates?.[0];
    if (!candidate) throw new Error("No candidates returned.");

    // 1. Inline Base64
    const imagePart = candidate.content?.parts?.find((p: any) => p.inlineData);
    if (imagePart?.inlineData) {
        return `data:${imagePart.inlineData.mimeType || "image/png"};base64,${imagePart.inlineData.data}`;
    }

    // 2. Text containing URL
    const textPart = candidate.content?.parts?.find((p: any) => p.text);
    if (textPart?.text) {
        let text = textPart.text.trim();

        const mdMatch = text.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
        if (mdMatch) return mdMatch[1];

        if (text.startsWith("! ")) text = text.substring(2).trim();

        const urlMatch = text.match(/(https?:\/\/[^\s]+)/);
        if (urlMatch) return urlMatch[1];

        throw new Error(`Model Refusal: ${text}`);
    }

    throw new Error("No image data returned.");
};

/**
 * Backend version: uses sharp for image processing instead of Canvas/Image browser APIs.
 */
export async function ensurePngDataUrl(url: string, maxDimension: number = 1024): Promise<string> {
    try {
        if (!url) return url;

        let buffer: Buffer;

        if (url.startsWith("data:")) {
            const match = url.match(/^data:[^;]+;base64,(.+)$/);
            if (!match) return url;
            buffer = Buffer.from(match[1], 'base64');
        } else if (url.startsWith("http")) {
            const res = await fetch(url);
            const arrayBuf = await res.arrayBuffer();
            buffer = Buffer.from(arrayBuf);
        } else {
            return url;
        }

        let pipeline = sharp(buffer);
        const metadata = await pipeline.metadata();

        if (!metadata.width || !metadata.height) return url;

        // Downscale if exceeding maxDimension
        if (maxDimension > 0 && Math.max(metadata.width, metadata.height) > maxDimension) {
            pipeline = pipeline.resize({
                width: metadata.width > metadata.height ? maxDimension : undefined,
                height: metadata.height >= metadata.width ? maxDimension : undefined,
                fit: 'inside'
            });
        }

        const pngBuffer = await pipeline.png().toBuffer();
        return `data:image/png;base64,${pngBuffer.toString('base64')}`;
    } catch {
        return url;
    }
}

export const generateAssetImage = async (
    asset: Asset,
    style: GlobalStyle,
    existingAssets: Asset[] = []
): Promise<{ imageUrl: string, prompt: string }> => {
    const workStyle = style.work?.custom || (style.work?.selected !== 'None' ? style.work?.selected : '') || '';
    const useOriginalCharacters = style.work?.useOriginalCharacters || false;
    const textureStyle = style.texture?.custom || (style.texture?.selected !== 'None' ? style.texture?.selected : 'Realistic') || 'Realistic';
    const visualDna = style.visualTags || "";

    const isStandardPrefix = visualDna.trim().startsWith("[") && visualDna.includes("]");

    const isRealistic =
        textureStyle.toLowerCase().includes('real') ||
        textureStyle.toLowerCase().includes('photo') ||
        workStyle.toLowerCase().includes('movie') ||
        workStyle.toLowerCase().includes('film') ||
        textureStyle.includes('写实') ||
        textureStyle.includes('摄影');

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

    if (asset.type === 'character') {
        const bgConstraint = "simple clean white background, no background elements, studio lighting";
        negativePrompt += ", multiple different characters, crowd, visual effects, glowing aura, magic spells, fire, lightning, particles, accessories floating";
        negativePrompt = negativePrompt.replace("split screen, ", "").replace("multiple panels, ", "");

        prompt = `(Best quality, masterpiece), ${stylePrefix}.
            Widescreen Split Screen Composition (16:9 landscape, horizontal):
            [LEFT THIRD]: Extreme Close-up Portrait of ${asset.name}'s face. High definition, detailed eyes, looking directly at camera.
            [RIGHT TWO-THIRDS]: Full Body Character Sheet of ${asset.name}. Three distinct views: Front, Side, Back. Standing pose.
            ${bgConstraint}, Subject: ${asset.description}. 
            NO TEXT. Exclude: ${negativePrompt}`;
    } else if (asset.type === 'item') {
        const bgConstraint = "pure white background (RGB 255,255,255), no background elements, shadowless studio lighting";
        negativePrompt += ", person, people, man, woman, child, character, hand, fingers, holding, mannequin";
        negativePrompt = negativePrompt.replace("split screen, ", "").replace("multiple panels, ", "");

        prompt = `(Best quality, masterpiece), ${stylePrefix}.
            Create a single flat layout image on a pure white background only. No scene, no room, no surfaces.
            Widescreen Split Screen Layout (16:9 landscape, horizontal):
            [LEFT AREA]: Item macro close-up in a perfect square (1:1). Emphasize material details and craftsmanship.
            [RIGHT AREA]: Three equal square views (1:1:1), aligned left-to-right: Front View, Side View, Top View.
            ${bgConstraint}. Subject: ${asset.name}. Description: ${asset.description}.
            Output PNG with alpha channel.
            NO SHADOWS. NO REFLECTIONS. NO TEXT.
            Exclude: ${negativePrompt}`;
    } else {
        prompt = `(Best quality, masterpiece), ${stylePrefix}, Establishing shot, Environment design, Scenery Only, Subject: ${asset.name}. Description: ${asset.description}. 
            NO TEXT. Exclude: ${negativePrompt}`;
    }

    const ar = style.aspectRatio || '16:9';

    const callModel = async (p: string) => {
        const parts: any[] = [{ text: p }];

        // Add reference image from existing assets if available
        if (asset.refImageUrl) {
            try {
                const matches = asset.refImageUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9\-.+]+);base64,(.+)$/);
                if (matches && matches.length === 3) {
                    parts.push({
                        inlineData: {
                            mimeType: matches[1],
                            data: matches[2]
                        }
                    });
                }
            } catch (e) {
                console.warn("Failed to parse reference image", e);
            }
        }

        const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
            model: MODELS.IMAGE_GEN,
            contents: { parts },
            config: { imageConfig: { aspectRatio: ar } }
        }), 1, 2000);

        if (!response.candidates || response.candidates.length === 0) {
            throw new Error("Safety Block: No candidates returned.");
        }

        const raw = extractImageFromResponse(response);
        return await ensurePngDataUrl(raw);
    };

    try {
        const imageUrl = await callModel(prompt);
        return { imageUrl, prompt };
    } catch (e: any) {
        console.warn("Asset Gen Attempt 1 Failed:", e.message);

        try {
            const simplePrompt = `(Best quality), ${stylePrefix}, ${asset.type === 'character' ? 'Character Sheet, Three Views, white background' : asset.type === 'item' ? 'Item views, white background' : 'Environment concept art, no humans, empty scenery'}, Subject: ${asset.description}. Exclude: ${commonNegative}`;
            const imageUrl = await callModel(simplePrompt);
            return { imageUrl, prompt: simplePrompt };
        } catch (e2) {
            throw e2;
        }
    }
};

export const generateSceneImage = async (
    scene: any,
    globalStyle?: GlobalStyle,
    assets: Asset[] = []
): Promise<any> => {
    const prompt = scene.np_prompt || scene.visual_desc || '';
    const sceneAssetIds = scene.assetIds || [];
    const ar = globalStyle?.aspectRatio || '16:9';
    const finalPrompt = prompt.substring(0, 1500);

    // 1. Identify Assets
    let usedAssets: Asset[] = [];

    if (sceneAssetIds && sceneAssetIds.length > 0) {
        usedAssets = assets.filter(a => sceneAssetIds.includes(a.id) && a.refImageUrl);
    } else {
        const tags = extractAssetTags(prompt).filter(t => !isStoryboardTag(t.name));
        const matchedAssets = new Map<string, Asset>();
        for (const tag of tags) {
            const asset = resolveTagToAsset(tag, assets);
            if (asset && asset.refImageUrl && !matchedAssets.has(asset.id)) {
                matchedAssets.set(asset.id, asset);
            }
        }
        for (const a of assets) {
            if (a.refImageUrl && a.name.length >= 2 && prompt.includes(a.name) && !matchedAssets.has(a.id)) {
                matchedAssets.set(a.id, a);
            }
        }
        usedAssets = [...matchedAssets.values()];
    }

    usedAssets = usedAssets.slice(0, 3);

    // 2. Build Multi-modal Request Parts
    const parts: any[] = [];
    let instructions = "";

    usedAssets.forEach((asset, index) => {
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

    // 3. Construct Final Prompt
    let fullText = stripAssetTags(finalPrompt);
    if (instructions) {
        fullText = `STRICTLY FOLLOW REFERENCES. ${instructions} ${fullText}. Use the exact visual appearance of Reference Images for consistency.`;
    }

    let negativePrompt = "comic panels, multiple panels, split screen, collage, grid, multiple views, frame, border, speech bubble, text, watermark, blurry";
    const styleStr = JSON.stringify(globalStyle || {}).toLowerCase();
    const isAncient = styleStr.includes('ancient') || styleStr.includes('wuxia') || styleStr.includes('period') || styleStr.includes('historical');

    if (isAncient) {
        negativePrompt += ", television, tv, phone, mobile, smartphone, computer, laptop, car, vehicle, modern building";
    }

    fullText = `${fullText}. --ar ${ar}`;
    fullText = `${fullText}. Exclude: ${negativePrompt}`;
    parts.push({ text: fullText });

    // 4. Call Model
    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
        model: MODELS.IMAGE_GEN,
        contents: { parts: parts },
        config: { imageConfig: { aspectRatio: ar } }
    }), 2, 2000);

    if (!response.candidates || response.candidates.length === 0) {
        throw new Error("Generation blocked by safety filters or no candidates returned.");
    }

    const raw = extractImageFromResponse(response);
    const imageUrl = await ensurePngDataUrl(raw);
    return { imageUrl };
};
