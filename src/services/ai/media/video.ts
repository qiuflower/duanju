// Frontend video utilities — generateVideo moved to backend
import { Scene, Asset, GlobalStyle } from "@/shared/types";

// Helper: Smart Asset Matching (pure data function, used by UI for initializeVideoAssetIds)
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

// Pure data transformation — constructs the text prompt from scene data
export const constructVideoPrompt = (scene: Scene, globalStyle?: GlobalStyle): string => {
    // Always ensure Global Style is prepended if available
    const stylePrefix = globalStyle?.visualTags ? `${globalStyle.visualTags}. ` : "";

    let finalPrompt = "";

    if (scene.video_prompt) {
        // Seedance format: Agent 3 provides complete prompt, just ensure style prefix
        if (stylePrefix && !scene.video_prompt.startsWith(stylePrefix.trim())) {
            const durationMatch = scene.video_prompt.match(/^(\d+-\d+s:\s*)/i);
            if (durationMatch) {
                finalPrompt = `${durationMatch[1]}${stylePrefix}${scene.video_prompt.slice(durationMatch[0].length)}`;
            } else {
                finalPrompt = `${stylePrefix}${scene.video_prompt}`;
            }
        } else {
            finalPrompt = scene.video_prompt;
        }
    } else {
        // Fallback: construct from visual_desc (legacy or manual scenes)
        finalPrompt = scene.visual_desc || "";
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
