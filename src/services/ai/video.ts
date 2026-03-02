import { Scene, Asset, GlobalStyle, GenerateContentResponse, VideosOperation } from "@/shared/types";
import { saveAsset, loadAssetBase64 } from "@/services/storage";
import { retryWithBackoff, ai } from "./helpers";
import { ensurePngDataUrl } from "./image";

// Helper: Smart Asset Matching
export const matchAssetsToPrompt = (prompt: string, assets: Asset[], explicitIds: string[] = []): Asset[] => {
    // 1. Filter assets that have reference images
    const availableAssets = assets.filter(a => !!a.refImageUrl);

    // 2. Score assets
    const scored = availableAssets.map(asset => {
        let score = 0;
        // Priority 1: Explicit ID match (from Agent B analysis)
        if (explicitIds.includes(asset.id)) score += 100;

        // Priority 2: Name match in prompt
        if (prompt.includes(asset.name)) score += 50;

        // Priority 3: Semantic/Keyword match in description
        const assetTokens = (asset.description || "").toLowerCase().split(/\W+/).filter(t => t.length > 2);
        const promptTokens = prompt.toLowerCase().split(/\W+/).filter(t => t.length > 2);

        let overlap = 0;
        // Check for token overlap
        assetTokens.forEach(token => {
            if (promptTokens.includes(token)) overlap++;
        });
        score += overlap * 5;

        return { asset, score };
    });

    // 3. Sort by score (High to Low) and return
    return scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(s => s.asset);
};

// ----------------------------------------------------
export const constructVideoPrompt = (scene: Scene, globalStyle?: GlobalStyle): string => {
    // Always ensure Global Style is prepended if available
    const stylePrefix = globalStyle?.visualTags ? `${globalStyle.visualTags}. ` : "";

    let finalPrompt = "";

    if (scene.video_prompt) {
        // If prompt already exists, check if it starts with style. If not, prepend it.
        if (stylePrefix && !scene.video_prompt.startsWith(stylePrefix.trim())) {
            finalPrompt = `${stylePrefix}${scene.video_prompt}`;
        } else {
            finalPrompt = scene.video_prompt;
        }
    } else {
        finalPrompt = [
            `Cinematic Shot: ${scene.visual_desc}`,
            scene.video_camera ? `Camera Movement: ${scene.video_camera}` : "",
            scene.video_vfx ? `VFX: ${scene.video_vfx}` : "",
        ].filter(Boolean).join('. ');

        if (stylePrefix) {
            finalPrompt = `${stylePrefix}${finalPrompt}`;
        }
    }

    // Append Dialogue, SFX, BGM (User Request)
    const audioPrompts: string[] = [];

    if (scene.audio_dialogue && scene.audio_dialogue.length > 0) {
        const dialogueText = scene.audio_dialogue.map(d => {
            return d.speaker ? `${d.speaker}: ${d.text}` : d.text;
        }).join(' ');
        audioPrompts.push(`Character Dialogue: ${dialogueText}`);
    }

    if (scene.audio_sfx) {
        audioPrompts.push(`Sound Effect: ${scene.audio_sfx}`);
    }

    if (scene.audio_bgm) {
        audioPrompts.push(`Background Music: ${scene.audio_bgm}`);
    }

    if (audioPrompts.length > 0) {
        const separator = /[.!?]$/.test(finalPrompt.trim()) ? " " : ". ";
        finalPrompt = `${finalPrompt}${separator}${audioPrompts.join('. ')}`;
    }

    return finalPrompt;
};

export const generateVideo = async (
    imageBase64: string,
    scene: Scene,
    aspectRatio: '16:9' | '9:16' = '16:9',
    assets: Asset[] = [],
    globalStyle?: GlobalStyle
): Promise<{ url: string; assetId: string }> => {
    // Use helper to get prompt (with style injection)
    const fullPrompt = constructVideoPrompt(scene, globalStyle);
    const safePrompt = fullPrompt.substring(0, 800);

    // veo 只支持英文：如果包含中文等非 ASCII，自动让后端帮你转英文
    const enhancePrompt = /[^\x00-\x7F]/.test(safePrompt);

    // Smart Asset Matching
    let topAssets: Asset[] = [];
    let imagesToSend: string[] = [];
    const currentSceneAssetId = `scene_img_${scene.id}`;

    if (scene.isStartEndFrameMode) {
        // --- START/END FRAME MODE ---
        imagesToSend.push(imageBase64);

        const endFrameId = scene.startEndAssetIds?.[1];
        if (endFrameId) {
            const endAsset = assets.find(a => a.id === endFrameId);
            if (endAsset) {
                let url = endAsset.refImageUrl;
                if (!url && endAsset.refImageAssetId) {
                    url = await loadAssetBase64(endAsset.refImageAssetId) || undefined;
                }
                if (url) imagesToSend.push(url);
            }
        }

    } else {
        // --- STANDARD MODE (Reference Assets) ---
        const useAssets = scene.useAssets !== false;

        if (useAssets) {
            if (scene.videoAssetIds !== undefined) {
                topAssets = assets.filter(a => scene.videoAssetIds!.includes(a.id) && a.refImageUrl);
            } else {
                const targetAssetIds = scene.assetIds || [];
                const matchedAssets = matchAssetsToPrompt(scene.visual_desc, assets, targetAssetIds);
                topAssets = matchedAssets.slice(0, 3);
            }
        } else {
            topAssets = [];
        }

        if (topAssets.length > 0) {
            imagesToSend = topAssets.map(a => (a.refImageUrl || ""));
        }

        const shouldIncludeSceneImage = scene.videoAssetIds?.includes(currentSceneAssetId);

        if (shouldIncludeSceneImage || !useAssets) {
            imagesToSend.push(imageBase64);
        } else if (scene.videoAssetIds === undefined && imagesToSend.length < 3) {
            imagesToSend.push(imageBase64);
        }

        if (imagesToSend.length === 0) {
            imagesToSend.push(imageBase64);
        }
    }

    // --- Auto-Normalize to Base64 (User Request) ---
    const normalizeToBase64 = async (urlOrB64: string): Promise<string> => {
        if (!urlOrB64) return "";
        return await ensurePngDataUrl(urlOrB64);
    };

    // Parallel conversion for performance
    const normalizedImages = await Promise.all(
        imagesToSend.map(img => normalizeToBase64(img))
    );

    imagesToSend = normalizedImages;

    // --- Strict Image Format Validation ---
    const validImages = imagesToSend.filter(img => img && img.trim().length > 0);
    if (validImages.length > 0) {
        const isHttpUrlValid = (s: string) => /^https?:\/\//i.test(s);
        const isBase64Valid = (s: string) => /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(s);

        const hasUrl = validImages.some(isHttpUrlValid);
        const hasBase64 = validImages.some(isBase64Valid);

        if (hasUrl && hasBase64) {
            throw new Error("Image Format Error: Mixed formats (URL and Base64) are not allowed. Please ensure all images are consistent.");
        }

        if (hasUrl) {
            const invalidUrls = validImages.filter(url => !isHttpUrlValid(url));
            if (invalidUrls.length > 0) {
                throw new Error("Image Format Error: Invalid URL format. All URLs must start with http:// or https://.");
            }
        } else if (hasBase64) {
            const invalidBase64 = validImages.filter(b64 => !isBase64Valid(b64));
            if (invalidBase64.length > 0) {
                throw new Error("Image Format Error: Invalid Base64 format. Must start with 'data:image/...;base64,'.");
            }

            const getMime = (b64: string) => {
                const match = b64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/i);
                return match ? match[1].toLowerCase() : null;
            };

            const firstMime = getMime(validImages[0]);
            const inconsistent = validImages.some(img => getMime(img) !== firstMime);
            if (inconsistent) {
                throw new Error(`Image Format Error: Inconsistent Base64 image types. All images must be of the same type (e.g. all ${firstMime}).`);
            }
        } else {
            throw new Error("Image Format Error: Invalid image format detected. Please use valid URLs or Base64 strings.");
        }
    }

    const model = scene.isStartEndFrameMode ? "veo3.1" : "veo3.1-components";

    try {
        const operationResult = await retryWithBackoff(async () => {
            return await ai.models.generateVideos({
                model,
                prompt: safePrompt,
                config: {
                    enhance_prompt: enhancePrompt,
                    images: validImages,
                    aspectRatio: aspectRatio,
                    seconds: 8
                }
            });
        }, 3, 2000, 60000);

        const taskId = operationResult.operation?.id;
        if (!taskId) throw new Error("Video generation failed to start (no task ID).");

        let retries = 0;
        const maxRetries = 60;

        while (retries < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 5000));

            const statusResult = await ai.operations.getVideosOperation({ operation: operationResult });

            if (statusResult.error) {
                throw new Error(String(statusResult.error));
            }

            if (statusResult.done) {
                const outputUrl = statusResult.response?.generatedVideos?.[0]?.video?.uri;
                if (!outputUrl) throw new Error("Video generation marked done but no output URL found.");

                const videoResponse = await fetch(outputUrl);
                if (!videoResponse.ok) throw new Error(`Failed to download video: ${videoResponse.statusText}`);

                const videoBlob = await videoResponse.blob();

                const assetId = await saveAsset(videoBlob);
                const url = URL.createObjectURL(videoBlob);
                return { url, assetId };
            }

            retries++;
        }

        throw new Error("Video generation timed out");
    } catch (e: any) {
        console.error("Veo Generation Error:", e);
        throw new Error(`Video Generation Failed: ${e?.message || String(e)}`);
    }
};
