import { Scene, Asset, GlobalStyle, GenerateContentResponse, VideosOperation } from "../../../shared/types";
import { retryWithBackoff, ai } from "../helpers";
import { ensurePngDataUrl } from "./image";
import { validateImageFormats } from "./validators";
import { extractAssetTags, resolveTagToAsset, isStoryboardTag, stripAssetTags } from "../../../shared/asset-tags";

// Helper: Smart Asset Matching
export const matchAssetsToPrompt = (prompt: string, assets: Asset[], explicitIds: string[] = []): Asset[] => {
    const availableAssets = assets.filter(a => !!a.refImageUrl);
    const scored = availableAssets.map(asset => {
        let score = 0;
        if (explicitIds.includes(asset.id)) score += 100;
        if (prompt.includes(asset.name)) score += 50;
        const assetTokens = (asset.description || "").toLowerCase().split(/\W+/).filter(t => t.length > 2);
        const promptTokens = prompt.toLowerCase().split(/\W+/).filter(t => t.length > 2);
        let overlap = 0;
        assetTokens.forEach(token => {
            if (promptTokens.includes(token)) overlap++;
        });
        score += overlap * 5;
        return { asset, score };
    });
    return scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(s => s.asset);
};

// Build image list from @图像 tags in prompt
// Backend version: uses passed-in scene data instead of storage loading
const buildImageListFromTags = async (
    prompt: string, sceneImage: string, assets: Asset[], allScenes: Scene[] = []
): Promise<string[]> => {
    const tags = extractAssetTags(prompt);
    const seen = new Set<string>();
    const unique = tags.filter(t => {
        const key = t.id || t.name;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    if (unique.length === 0) return [];

    const results: string[] = [];
    const resolvedSceneIds = new Set<string>();
    for (const tag of unique) {
        if (isStoryboardTag(tag.name)) {
            const idPart = tag.name.replace('分镜', '');
            const targetScene = allScenes.find(s => s.id === idPart)
                || allScenes.find(s => s.id.endsWith(`_${idPart}`) || s.id === idPart);
            if (targetScene) {
                if (resolvedSceneIds.has(targetScene.id)) continue;
                resolvedSceneIds.add(targetScene.id);
                // Backend: use imageUrl directly (no IndexedDB loading)
                if (targetScene.imageUrl) {
                    results.push(targetScene.imageUrl);
                    continue;
                }
            }
            console.warn(`[VideoGen] Storyboard tag @图像_${tag.name} could not resolve to an image`);
            continue;
        }
        const asset = resolveTagToAsset(tag, assets);
        if (asset?.refImageUrl) {
            results.push(asset.refImageUrl);
        }
    }
    return results;
};

export const constructVideoPrompt = (scene: Scene, globalStyle?: GlobalStyle): string => {
    const stylePrefix = globalStyle?.visualTags ? `${globalStyle.visualTags}. ` : "";
    let finalPrompt = "";

    if (scene.video_prompt) {
        if (stylePrefix && !scene.video_prompt.startsWith(stylePrefix.trim())) {
            finalPrompt = `${stylePrefix}${scene.video_prompt}`;
        } else {
            finalPrompt = scene.video_prompt;
        }
    } else {
        finalPrompt = scene.visual_desc || "";
        if (stylePrefix) {
            finalPrompt = `${stylePrefix}${finalPrompt}`;
        }
    }

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

/**
 * Submit a video generation task and return immediately with the operation handle.
 * The frontend is responsible for polling via pollVideoStatus().
 */
export const submitVideoGeneration = async (
    imageBase64: string,
    scene: Scene,
    aspectRatio: '16:9' | '9:16' = '16:9',
    assets: Asset[] = [],
    globalStyle?: GlobalStyle,
    allScenes: Scene[] = []
): Promise<{ taskId: string; operation: any }> => {
    const fullPrompt = constructVideoPrompt(scene, globalStyle);
    const safePrompt = stripAssetTags(fullPrompt).substring(0, 800);
    const enhancePrompt = /[^\x00-\x7F]/.test(safePrompt);

    let imagesToSend: string[] = [];

    if (scene.isStartEndFrameMode) {
        imagesToSend.push(imageBase64);
        // End frame handling with passed data
        const endFrameId = scene.startEndAssetIds?.[1];
        if (endFrameId) {
            const endAsset = assets.find(a => a.id === endFrameId);
            if (endAsset?.refImageUrl) {
                imagesToSend.push(endAsset.refImageUrl);
            }
        }
    } else {
        const tagImages = await buildImageListFromTags(fullPrompt, imageBase64, assets, allScenes);
        console.log('[VideoGen] Tier 1 @图像 tags found:', tagImages.length);

        if (tagImages.length > 0) {
            imagesToSend = tagImages;
        } else {
            const useAssets = scene.useAssets !== false;
            if (useAssets && scene.videoAssetIds !== undefined) {
                const selectedAssets = assets.filter(a => scene.videoAssetIds!.includes(a.id) && a.refImageUrl);
                if (selectedAssets.length > 0) {
                    imagesToSend = selectedAssets.map(a => a.refImageUrl || "");
                }
                const currentSceneAssetId = `scene_img_${scene.id}`;
                if (imageBase64) {
                    const currentSceneSelected = scene.videoAssetIds.includes(currentSceneAssetId);
                    if (currentSceneSelected || imagesToSend.length < 3) {
                        imagesToSend.push(imageBase64);
                    }
                }
            }

            if (imagesToSend.length === 0 && imageBase64) {
                imagesToSend.push(imageBase64);
            }
        }
    }

    // Normalize images to base64
    const normalizedImages = await Promise.all(
        imagesToSend.map(img => ensurePngDataUrl(img))
    );
    imagesToSend = normalizedImages;

    const validImages = imagesToSend.filter(img => img && img.trim().length > 0);
    validateImageFormats(validImages);

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
        }, 3, 2000);

        const taskId = operationResult.operation?.id;
        if (!taskId) throw new Error("Video generation failed to start (no task ID).");

        console.log(`[VideoGen] Task submitted: ${taskId}`);
        return { taskId, operation: operationResult };
    } catch (e: any) {
        console.error("Veo Submission Error:", e);
        throw new Error(`Video Submission Failed: ${e?.message || String(e)}`);
    }
};

/**
 * Poll the status of a single video generation task.
 * Returns { done, url?, error? }.
 */
export const pollVideoStatus = async (
    operation: any
): Promise<{ done: boolean; url?: string; error?: string }> => {
    try {
        const statusResult = await ai.operations.getVideosOperation({ operation });

        if (statusResult.error) {
            return { done: true, error: String(statusResult.error) };
        }

        if (statusResult.done) {
            const outputUrl = statusResult.response?.generatedVideos?.[0]?.video?.uri;
            if (!outputUrl) {
                return { done: true, error: "Video generation completed but no output URL found." };
            }
            return { done: true, url: outputUrl };
        }

        return { done: false };
    } catch (e: any) {
        return { done: true, error: `Poll error: ${e?.message || String(e)}` };
    }
};
