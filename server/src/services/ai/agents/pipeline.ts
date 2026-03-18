import { Scene, Asset, GlobalStyle } from "../../../shared/types";
import { toCompactLensLibrary } from "../../../domain/generation/core-lenses";
import { wait } from "../helpers";
import { NarrativeBlueprint, MasterBeatSheet } from "./types";
import { runAgent1_NarrativeAnalysis } from "./agent1-narrative";
import { runAgent2_VisualDirection } from "./agent2-visual";
import { runAgent3_AssetProduction } from "./agent3-asset";
import { extractAssetsFromBeats, extractVisualDna } from "../style/index";

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

// --- Narrative Analysis (Agent 1) ---
export const analyzeNarrative = async (
    text: string,
    language: string,
    prevContext: string,
    episodeCount?: number,
    onProgress?: (msg: string) => void,
    onBatchComplete?: (episodes: any[], meta: any) => void
): Promise<NarrativeBlueprint> => {
    return await runAgent1_NarrativeAnalysis(text, language, prevContext, episodeCount, onProgress, onBatchComplete);
};

// --- Helper: compute stylePrefix from GlobalStyle ---
export function computeStylePrefix(style: GlobalStyle): string {
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
    return stylePrefix;
}

// --- Step 1: Generate Beat Sheet + Extract Assets ---
export const generateBeatSheet = async (
    episode: any,
    batch_meta: any,
    language: string,
    style: GlobalStyle,
    existingAssets: Asset[] = [],
    overrideText?: string
): Promise<{ beatSheet: MasterBeatSheet; assets: Asset[]; scenes: Scene[] }> => {
    const workStyle = style.work?.custom || (style.work?.selected !== 'None' ? style.work?.selected : '') || '';
    const useOriginalCharacters = style.work?.useOriginalCharacters || false;

    let singleEpBlueprint: any;
    if (overrideText) {
        singleEpBlueprint = {
            batch_meta: batch_meta,
            episodes: [{
                ...episode,
                _USER_EDITED_CONTENT_STRICT_: overrideText,
                _INSTRUCTION_TO_AGENT_2_: "CRITICAL: The user has MANUALLY EDITED the script content. IGNORE the 'script' field below if it conflicts. Generate beats based strictly on the '_USER_EDITED_CONTENT_STRICT_' field above."
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
        () => runAgent2_VisualDirection(singleEpBlueprint, language, compactLensLibrary, overrideText || ""),
        (res) => res && Array.isArray(res.beats) && res.beats.length > 0,
        "Agent 2 (Visual Director)",
        { episode: episode.episode_number, language },
        1 // Agent 2 handles retries internally
    );

    let beatAssets = await extractAssetsFromBeats(beatSheet, language, existingAssets, workStyle, useOriginalCharacters);
    for (let attempt = 1; beatAssets.length === 0 && attempt <= 3; attempt++) {
        console.warn(`[generateBeatSheet] Asset extraction returned empty, retry ${attempt}/3...`);
        beatAssets = await extractAssetsFromBeats(beatSheet, language, existingAssets, workStyle, useOriginalCharacters);
    }
    if (beatAssets.length === 0) {
        throw new Error('Asset extraction failed after 3 retries — no assets extracted from beats. Please try again.');
    }

    const epNum = episode.episode_number || 0;
    const emptyScenes: Scene[] = beatSheet.beats.map((beat: any) => ({
        id: `E${epNum}_${beat.beat_id}`,
        narration: beat.visual_action || '',
        visual_desc: `[${beat.shot_name || beat.shot_id || ''}] ${beat.visual_action || ''}`,
        np_prompt: '',
        video_prompt: '',
        video_duration: '',
        video_camera: beat.camera_movement || '',
        video_lens: beat.shot_id || '',
        video_vfx: '',
        audio_sfx: beat.audio_subtext || '',
        audio_dialogue: [],
        assetIds: [],
    }));

    return { beatSheet, assets: beatAssets, scenes: emptyScenes };
};

// --- Step 2: Generate Prompts from cached BeatSheet ---
export const generatePromptsFromBeats = async (
    beatSheet: MasterBeatSheet,
    episodeNumber: number,
    language: string,
    assets: Asset[],
    style: GlobalStyle
): Promise<{ scenes: Scene[]; visualDna: string }> => {
    // Visual DNA 优先级（高→低）：
    // 1. 1:1 还原 + 参考作品 → 跳过 DNA，stylePrefix 由 computeStylePrefix 处理为 "{作品名}美术风格"
    // 2. 参考作品 + 画面质感 → AI 融合两者
    // 3. 画面质感单独 → 直接使用原文
    // 4. 已有 visualTags（来自图片分析） → 直接使用
    // 5. 参考作品单独 → 通过 AI 推断
    const workStyle = style.work?.custom || (style.work?.selected !== 'None' ? style.work?.selected : '') || '';
    const textureStyle = style.texture?.custom || (style.texture?.selected !== 'None' ? style.texture?.selected : '') || '';
    const useOriginalCharacters = style.work?.useOriginalCharacters || false;

    let visualDna = '';
    if (useOriginalCharacters && workStyle.trim()) {
        // #1: 1:1 还原 = 最高优先级，跳过所有 DNA 计算
        // computeStylePrefix 会将 stylePrefix 设为 "{作品名}美术风格"
        visualDna = '';
    } else if (workStyle && textureStyle) {
        // #2: 两者同时存在 → AI 融合
        const fused = await extractVisualDna(workStyle, textureStyle, language);
        visualDna = fused || textureStyle; // fallback to texture if fusion fails
    } else if (textureStyle) {
        // #3: 画面质感单独 → 原文直传
        visualDna = textureStyle;
    } else if (style.visualTags) {
        // #4: 缓存（来自图片分析等）
        visualDna = style.visualTags;
    } else if (workStyle) {
        // #5: 参考作品单独 → AI 推断
        const freshDna = await extractVisualDna(workStyle, '', language);
        if (freshDna) visualDna = freshDna;
    }
    style = { ...style, visualTags: visualDna };

    const stylePrefix = computeStylePrefix(style);

    const scenes = await executeWithRetryAndValidation(
        () => runAgent3_AssetProduction(beatSheet, language, assets, stylePrefix, style.aspectRatio || '16:9'),
        (res) => res && Array.isArray(res) && res.length > 0,
        "Agent 3 (Asset Producer)",
        { beatCount: beatSheet.beats.length },
        1 // Agent 3 handles retries internally
    );

    const labeledScenes = scenes.map(scene => ({
        ...scene,
        id: `E${episodeNumber}_${scene.id}`
    }));

    return { scenes: labeledScenes, visualDna };
};

// --- Legacy: Combined function ---
export const generateEpisodeScenes = async (
    episode: any,
    batch_meta: any,
    language: string,
    assets: Asset[],
    style: GlobalStyle,
    overrideText?: string
): Promise<Scene[]> => {
    const { beatSheet } = await generateBeatSheet(episode, batch_meta, language, style, assets, overrideText);
    const result = await generatePromptsFromBeats(beatSheet, episode.episode_number, language, assets, style);
    return result.scenes;
};
