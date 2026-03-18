/**
 * Frontend API client — All calls to the backend business logic routes.
 * Replaces direct AI service imports (which now live on the backend).
 */

const API_BASE = '/api';

async function post<T = any>(path: string, body: any): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err?.error || `API Error: ${res.status}`);
    }
    return res.json();
}

async function get<T = any>(path: string): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err?.error || `API Error: ${res.status}`);
    }
    return res.json();
}

// =================== PIPELINE =====================

import { Scene, Asset, GlobalStyle } from '@/shared/types';

interface NarrativeBlueprint {
    batch_meta: any;
    episodes: any[];
}

interface MasterBeatSheet {
    visual_strategy: any;
    beats: any[];
}

/** Agent 1: Narrative Analysis */
export const analyzeNarrative = async (
    text: string,
    language: string,
    prevContext: string,
    episodeCount?: number,
    _onProgress?: (msg: string) => void,
    _onBatchComplete?: (episodes: any[], meta: any) => void
): Promise<NarrativeBlueprint> => {
    return post('/pipeline/analyze', { text, language, prevContext, episodeCount });
};

/** Agent 2 + A2: Generate BeatSheet + Extract Assets */
export const generateBeatSheet = async (
    episode: any,
    batch_meta: any,
    language: string,
    style: GlobalStyle,
    existingAssets: Asset[] = [],
    overrideText?: string
): Promise<{ beatSheet: MasterBeatSheet; assets: Asset[]; scenes: Scene[] }> => {
    return post('/pipeline/beat-sheet', { episode, batch_meta, language, style, existingAssets, overrideText });
};

/** Agent 3: Generate Prompts from cached BeatSheet */
export const generatePromptsFromBeats = async (
    beatSheet: MasterBeatSheet,
    episodeNumber: number,
    language: string,
    assets: Asset[],
    style: GlobalStyle
): Promise<{ scenes: Scene[]; visualDna: string }> => {
    const result = await post<{ scenes: Scene[]; visualDna: string }>('/pipeline/prompts', {
        beatSheet, episodeNumber, language, assets, style
    });
    return result;
};

/** Legacy: Combined endpoint */
export const generateEpisodeScenes = async (
    episode: any,
    batch_meta: any,
    language: string,
    assets: Asset[],
    style: GlobalStyle,
    overrideText?: string
): Promise<Scene[]> => {
    const result = await post<{ scenes: Scene[] }>('/pipeline/episode-scenes', {
        episode, batch_meta, language, assets, style, overrideText
    });
    return result.scenes;
};

// =================== MEDIA =====================

/** Generate an asset reference image */
export const generateAssetImage = async (
    asset: Asset,
    globalStyle?: GlobalStyle,
    overridePrompt?: string,
    referenceImage?: string
): Promise<any> => {
    return post('/media/asset-image', { asset, globalStyle, overridePrompt, referenceImage });
};

/** Pre-generate prompts for assets (pure computation, no AI call) */
export const buildAssetPrompts = async (
    assets: Asset[],
    globalStyle: GlobalStyle
): Promise<{ assets: Asset[] }> => {
    return post('/media/build-asset-prompts', { assets, globalStyle });
};

/** Generate a scene image (storyboard) */
export const generateSceneImage = async (
    scene: Scene,
    globalStyle?: GlobalStyle,
    assets: Asset[] = []
): Promise<any> => {
    return post('/media/scene-image', { scene, globalStyle, assets });
};

/** Submit a video generation task (returns immediately) */
export const generateVideo = async (
    imageBase64: string,
    scene: Scene,
    aspectRatio: '16:9' | '9:16' = '16:9',
    assets: Asset[] = [],
    globalStyle?: GlobalStyle,
    allScenes: Scene[] = []
): Promise<{ taskId: string; operation: any }> => {
    return post('/media/video', { imageBase64, scene, aspectRatio, assets, globalStyle, allScenes });
};

/** Poll video generation status (single check) */
export const getVideoStatus = async (operation: any): Promise<{ done: boolean; url?: string; error?: string }> => {
    return post('/media/video-status', { operation });
};

/** Poll until video is done (frontend-side polling loop) */
export const pollVideoUntilDone = async (
    operation: any,
    intervalMs: number = 5000,
    maxRetries: number = 60,
    onPoll?: (attempt: number) => void
): Promise<{ url: string }> => {
    for (let i = 0; i < maxRetries; i++) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
        if (onPoll) onPoll(i + 1);

        const status = await getVideoStatus(operation);

        if (status.error) {
            throw new Error(status.error);
        }

        if (status.done && status.url) {
            return { url: status.url };
        }
    }
    throw new Error("Video generation timed out after polling.");
};

/** Generate speech (TTS) */
export const generateSpeech = async (
    text: string,
    voice?: string,
    scene?: Scene
): Promise<any> => {
    return post('/media/speech', { text, voice, scene });
};

// =================== STYLE =====================

/** Extract assets from text (Agent A) */
export const extractAssets = async (
    text: string,
    language: string,
    existingAssets: Asset[] = [],
    workStyle: string = '',
    textureStyle: string = '',
    useOriginalCharacters: boolean = false,
    skipDna: boolean = false
): Promise<{ visualDna: string; assets: Asset[] }> => {
    return post<{ visualDna: string; assets: Asset[] }>('/style/extract-assets', {
        text, language, existingAssets, workStyle, textureStyle, useOriginalCharacters, skipDna
    });
};

/** Extract Visual DNA */
export const extractVisualDna = async (
    workStyle: string,
    textureStyle: string,
    language: string
): Promise<any> => {
    return post('/style/visual-dna', { workStyle, textureStyle, language });
};

/** Analyze visual style from reference images */
export const analyzeVisualStyleFromImages = async (
    images: string[],
    language: string
): Promise<any> => {
    return post('/style/analyze-images', { images, language });
};

/** Extract assets from beat sheet */
export const extractAssetsFromBeats = async (
    beatSheet: any,
    language: string,
    existingAssets: Asset[] = [],
    workStyle: string = '',
    useOriginalCharacters: boolean = false
): Promise<Asset[]> => {
    const result = await post<{ assets: Asset[] }>('/style/extract-assets-from-beats', {
        beatSheet, language, existingAssets, workStyle, useOriginalCharacters
    });
    return result.assets;
};

// =================== REVIEW =====================

/** Review a video prompt */
export const reviewVideoPrompt = async (
    prompt: string,
    language: string
): Promise<any> => {
    return post('/review/video-prompt', { prompt, language });
};

/** Optimize a video prompt after review */
export const regenerateVideoPromptOptimized = async (
    scene: Scene,
    assets: Asset[] = [],
    stylePrefix: string = '',
    language: string = '',
    reviewResult?: any
): Promise<any> => {
    return post('/review/optimize', { scene, assets, stylePrefix, language, reviewResult });
};

// =================== CONFIG =====================

/** Get current model config */
export const getModelConfig = async (): Promise<any> => {
    return get('/config');
};

/** Set model config */
export const setModelConfig = async (config: {
    textmodel?: string;
    imagemodel?: string;
    videomodel?: string;
}): Promise<any> => {
    return post('/config', config);
};

// =================== UTILITY (constructVideoPrompt stays frontend-side) =====================
export { constructVideoPrompt } from '@/services/ai/media/video';
