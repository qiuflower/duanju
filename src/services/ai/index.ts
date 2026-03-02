// Barrel re-export for backward compatibility
// All functions previously exported from gemini.ts are available here

export { wait, withTimeout, retryWithBackoff, safeJsonParse, VOICE_OPTIONS, Type, Modality } from './helpers';
export { base64ToArrayBuffer, arrayBufferToBase64, pcmToWav, generateSpeech } from './audio';
export { matchAssetsToPrompt, constructVideoPrompt, generateVideo } from './video';
export { extractImageFromResponse, ensurePngDataUrl, generateAssetImage, generateSceneImage } from './image';
export { generateStyleOptions, analyzeVisualStyleFromImages, extractAssets } from './style';
export { reviewVideoPrompt, regenerateVideoPromptOptimized, regenerateScenePrompt, updateVideoPromptDirectly } from './review';
export type { OptimizedVideoResult } from './review';
export { analyzeNovelText, analyzeNarrative, generateEpisodeScenes, executeWithRetryAndValidation } from './agents';
export type { NarrativeBlueprint, VisualBeat, MasterBeatSheet } from './agents';
