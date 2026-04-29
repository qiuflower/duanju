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

// Backend tag resolution removed. Handled by exact SSOT from frontend.

export const constructVideoPrompt = (scene: Scene, globalStyle?: GlobalStyle, optionId?: string): string => {
    const stylePrefix = globalStyle?.visualTags ? `${globalStyle.visualTags}. ` : "";
    let finalPrompt = "";
    
    const option = optionId && scene.prompt_options ? scene.prompt_options.find((o: any) => o.option_id === optionId) : null;
    const basePrompt = option ? (option.video_prompt || option.np_prompt || "") : (scene.video_prompt || scene.visual_desc || "");

    if (basePrompt) {
        if (stylePrefix && !basePrompt.startsWith(stylePrefix.trim())) {
            // Check if basePrompt starts with a duration tag like "0-8s:" or "0-4s:"
            const durationMatch = basePrompt.match(/^(\d+-\d+s:\s*)/i);
            if (durationMatch) {
                // Insert style prefix AFTER the duration tag
                finalPrompt = `${durationMatch[1]}${stylePrefix}${basePrompt.slice(durationMatch[0].length)}`;
            } else {
                finalPrompt = `${stylePrefix}${basePrompt}`;
            }
        } else {
            finalPrompt = basePrompt;
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
    allScenes: Scene[] = [], // Legacy parameter, kept for signature compatibility
    optionId?: string
): Promise<{ taskId: string; operation: any }> => {
    const fullPrompt = constructVideoPrompt(scene, globalStyle, optionId);
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
        // SSOT: Direct consumption of Frontend Pre-packaged payload
        if (assets && assets.length > 0) {
            assets.forEach(a => {
                if (a.refImageUrl || a.refImageAssetId) {
                    imagesToSend.push((a.refImageUrl || a.refImageAssetId) as string);
                }
            });
            console.log(`[VideoGen] Added ${assets.length} standard Asset references.`);
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
