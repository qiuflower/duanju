import { Scene, Asset, GlobalStyle, VisualReviewResult, GenerateContentResponse } from "@/shared/types";
import { PROMPTS } from "@/domain/generation/prompts";
import { retryWithBackoff, safeJsonParse, ai } from "../helpers";
import { constructVideoPrompt } from "../media/video";
import { MODELS } from "../model-manager";

export interface OptimizedVideoResult {
    prompt: string;
    specs: {
        duration?: string;
        camera?: string;
        lens?: string;
        vfx?: string;
    }
}

export const reviewVideoPrompt = async (
    scene: Scene,
    language: string = 'Chinese'
): Promise<VisualReviewResult> => {
    const promptToReview = constructVideoPrompt(scene);

    const sysPrompt = PROMPTS.VISUAL_MASTER_REVIEW(promptToReview, language);

    try {
        const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
            model: MODELS.TEXT_FAST,
            contents: { parts: [{ text: sysPrompt }] },
            config: {
                responseMimeType: "application/json"
            }
        }));

        const json = safeJsonParse<VisualReviewResult>(response.text, {
            passed: false,
            dimensions: [],
            risks: [],
            suggestions: []
        });
        return json;
    } catch (e) {
        console.error("Visual Master Review Failed", e);
        return {
            passed: false,
            dimensions: [],
            risks: ["Review failed"],
            suggestions: ["Retry review"]
        };
    }
};

export const regenerateVideoPromptOptimized = async (
    scene: Scene,
    reviewResult: VisualReviewResult,
    language: string = 'Chinese',
    assets: Asset[] = [],
    globalStyle?: GlobalStyle
): Promise<OptimizedVideoResult> => {
    const currentPrompt = constructVideoPrompt(scene, globalStyle);

    const activeAssets = assets.filter(a => scene.assetIds?.includes(a.id));
    const assetContext = activeAssets.length > 0
        ? `\n**Active Assets (Characters/Items):**\n${activeAssets.map(a => `- ${a.name} (${a.type}): ${a.description}`).join('\n')}`
        : "";

    const stylePrefix = globalStyle?.visualTags ? `${globalStyle.visualTags}. ` : "";

    const sysPrompt = PROMPTS.VIDEO_PROMPT_OPTIMIZER(currentPrompt, assetContext, stylePrefix, scene, reviewResult, language);

    try {
        const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
            model: MODELS.TEXT_FAST,
            contents: { parts: [{ text: sysPrompt }] },
            config: {
                responseMimeType: "application/json"
            }
        }));

        const json = safeJsonParse<OptimizedVideoResult>(response.text, {
            prompt: currentPrompt,
            specs: {}
        });

        if (stylePrefix && !json.prompt.startsWith(stylePrefix.trim())) {
            json.prompt = `${stylePrefix}${json.prompt}`;
        }

        const lensSpec = scene.video_lens || "";
        if (lensSpec) {
            const lensRegex = /(\d+)mm/gi;
            const targetLens = lensSpec.match(/(\d+)mm/i)?.[0];

            if (targetLens) {
                json.prompt = json.prompt.replace(lensRegex, (match) => {
                    if (match.toLowerCase() === targetLens.toLowerCase()) return match;
                    return targetLens;
                });
            }
        }

        return json;
    } catch (e) {
        console.error("Video Prompt Regeneration Failed", e);
        return { prompt: currentPrompt, specs: {} };
    }
};

export const regenerateScenePrompt = async (
    scene: Scene,
    assets: Asset[] = [],
    globalStyle?: GlobalStyle,
    language: string = 'Chinese'
): Promise<string> => {
    const baseDesc = scene.np_prompt || scene.visual_desc || "";

    const activeAssets = assets.filter(a => scene.assetIds?.includes(a.id));
    const assetContext = activeAssets.length > 0
        ? `\n**Active Assets (Characters/Items):**\n${activeAssets.map(a => `- ${a.name} (${a.type}): ${a.description}`).join('\n')}`
        : "";

    const stylePrefix = globalStyle?.visualTags ? `${globalStyle.visualTags}. ` : "";

    const sysPrompt = PROMPTS.IMAGE_PROMPT_OPTIMIZER(baseDesc, assetContext, stylePrefix, language, globalStyle?.aspectRatio || '16:9');

    try {
        const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
            model: MODELS.TEXT_FAST,
            contents: { parts: [{ text: sysPrompt }] },
            config: {
                responseMimeType: "application/json"
            }
        }));

        const json = safeJsonParse<{ prompt: string }>(response.text, {
            prompt: baseDesc
        });

        let finalPrompt = json.prompt;

        if (stylePrefix && !finalPrompt.startsWith(stylePrefix.trim())) {
            finalPrompt = `${stylePrefix}${finalPrompt}`;
        }

        return finalPrompt;
    } catch (e) {
        console.error("Image Prompt Regeneration Failed", e);
        return baseDesc;
    }
};

export const updateVideoPromptDirectly = async (
    scene: Scene,
    language: string = 'Chinese',
    assets: Asset[] = [],
    globalStyle?: GlobalStyle
): Promise<OptimizedVideoResult> => {
    const currentPrompt = constructVideoPrompt(scene, globalStyle);

    const activeAssets = assets.filter(a => scene.assetIds?.includes(a.id));
    const assetContext = activeAssets.length > 0
        ? `\n**Active Assets (Characters/Items):**\n${activeAssets.map(a => `- ${a.name} (${a.type}): ${a.description}`).join('\n')}`
        : "";

    const stylePrefix = globalStyle?.visualTags ? `${globalStyle.visualTags}. ` : "";

    const sysPrompt = PROMPTS.VIDEO_PROMPT_UPDATER(currentPrompt, assetContext, stylePrefix, scene, language);

    try {
        const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
            model: MODELS.TEXT_FAST,
            contents: { parts: [{ text: sysPrompt }] },
            config: {
                responseMimeType: "application/json"
            }
        }));

        const json = safeJsonParse<OptimizedVideoResult>(response.text, {
            prompt: currentPrompt,
            specs: {}
        });

        if (stylePrefix && !json.prompt.startsWith(stylePrefix.trim())) {
            json.prompt = `${stylePrefix}${json.prompt}`;
        }

        const lensSpec = scene.video_lens || "";
        if (lensSpec) {
            const lensRegex = /(\d+)mm/gi;
            const targetLens = lensSpec.match(/(\d+)mm/i)?.[0];
            if (targetLens) {
                json.prompt = json.prompt.replace(lensRegex, (match) => {
                    if (match.toLowerCase() === targetLens.toLowerCase()) return match;
                    return targetLens;
                });
            }
        }

        return json;
    } catch (e) {
        console.error("Video Prompt Direct Update Failed", e);
        return { prompt: currentPrompt, specs: {} };
    }
};
