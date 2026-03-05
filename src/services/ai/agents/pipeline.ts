import { Scene, Asset, GlobalStyle } from "@/shared/types";
import { toCompactLensLibrary } from "@/domain/generation/core-lenses";
import { wait } from "../helpers";
import { NarrativeBlueprint, MasterBeatSheet } from "./types";
import { runAgent1_NarrativeAnalysis } from "./agent1-narrative";
import { runAgent2_VisualDirection } from "./agent2-visual";
import { runAgent3_AssetProduction } from "./agent3-asset";

// --- HELPER for Agent 2/3 Retry with Validation ---
export async function executeWithRetryAndValidation<T>(
    operation: () => Promise<T>,
    validator: (result: T) => boolean,
    agentName: string,
    contextInfo: any,
    maxRetries: number = 5
): Promise<T> {
    let lastError: any;
    for (let i = 0; i < maxRetries; i++) {
        try {
            const result = await operation();
            if (validator(result)) {
                if (i > 0) { /* recovered */ }
                return result;
            }
            throw new Error(`Validation failed: Result is empty or invalid.`);
        } catch (e) {
            lastError = e;
            const delay = Math.pow(2, i) * 1000;
            await wait(delay);
        }
    }


    throw new Error(`[${agentName}] Execution failed after ${maxRetries} retries: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

// --- NEW SPLIT SERVICES (Agent 1 vs Agent 2+3) ---

export const analyzeNarrative = async (
    text: string,
    language: string,
    prevContext: string,
    episodeCount?: number,
    onProgress?: (msg: string) => void,
    onBatchComplete?: (episodes: any[], meta: any) => void
): Promise<NarrativeBlueprint> => {
    // Agent1 already has internal retry logic (batch-level MAX_BATCH_RETRIES=3 + API-level retryWithBackoff),
    // so no outer executeWithRetryAndValidation wrapper is needed.
    return await runAgent1_NarrativeAnalysis(text, language, prevContext, episodeCount, onProgress, onBatchComplete);
};

export const generateEpisodeScenes = async (
    episode: any,
    batch_meta: any,
    language: string,
    assets: Asset[],
    style: GlobalStyle,
    overrideText?: string
): Promise<Scene[]> => {
    const useOriginalCharacters = style.work?.useOriginalCharacters || false;
    const workStyle = style.work?.custom || (style.work?.selected !== 'None' ? style.work?.selected : '') || '';

    let stylePrefix = style.visualTags || "";

    if (useOriginalCharacters && workStyle.trim()) {
        const normalizedWork = workStyle.trim();
        const hasChinese = /[\u4e00-\u9fa5]/.test(normalizedWork);
        const suffix = hasChinese ? "美术风格" : " Art Style";

        if (!normalizedWork.endsWith(suffix.trim())) {
            stylePrefix = `${normalizedWork}${suffix}`;
        } else {
            stylePrefix = normalizedWork;
        }
    }

    let singleEpBlueprint: any;

    if (overrideText) {
        singleEpBlueprint = {
            batch_meta: batch_meta,
            episodes: [{
                ...episode,
                _USER_EDITED_CONTENT_STRICT_: overrideText,
                _INSTRUCTION_TO_AGENT_2_: "CRITICAL: The user has MANUALLY EDITED the script content. IGNORE the 'structure_breakdown' fields below if they conflict. Generate beats based strictly on the '_USER_EDITED_CONTENT_STRICT_' field above."
            }]
        };
    } else {
        singleEpBlueprint = {
            batch_meta: batch_meta,
            episodes: [episode]
        };
    }

    const compactLensLibrary = toCompactLensLibrary();

    const beatSheet = await executeWithRetryAndValidation(
        () => runAgent2_VisualDirection(singleEpBlueprint, language, compactLensLibrary),
        (res) => res && Array.isArray(res.beats) && res.beats.length > 0,
        "Agent 2 (Visual Director)",
        { episode: episode.episode_number, language }
    );

    const scenes = await executeWithRetryAndValidation(
        () => runAgent3_AssetProduction(beatSheet, language, assets, stylePrefix, style.aspectRatio || '16:9'),
        (res) => res && Array.isArray(res) && res.length > 0,
        "Agent 3 (Asset Producer)",
        { episode: episode.episode_number, beatCount: beatSheet.beats.length }
    );

    const labeledScenes = scenes.map(scene => ({
        ...scene,
        id: `E${episode.episode_number}_${scene.id}`
    }));

    return labeledScenes;
};
