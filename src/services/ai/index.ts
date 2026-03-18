// --- AI Service Barrel Exports ---
// Business logic functions re-exported from @/services/api (backend)
// Pure utility functions stay client-side

// --- Pure utilities ---
export { wait, withTimeout, retryWithBackoff, safeJsonParse, Type, Modality } from './helpers';
export { VOICE_OPTIONS, base64ToArrayBuffer, arrayBufferToBase64, pcmToWav } from './media/audio';
export { matchAssetsToPrompt, constructVideoPrompt } from './media/video';
export { extractImageFromResponse, ensurePngDataUrl } from './media/image';

// --- Model Manager (frontend config UI) ---
export { MODELS, modelManager, type ModelType, type ProviderType, type ModelConfig } from './model-manager';

// --- Backend-bound functions (re-exported from API client) ---
export {
    analyzeNarrative,
    generateBeatSheet,
    generatePromptsFromBeats,
    generateEpisodeScenes,
    generateAssetImage,
    buildAssetPrompts,
    generateSceneImage,
    generateVideo,
    pollVideoUntilDone,
    generateSpeech,
    extractAssets,
    extractVisualDna,
    analyzeVisualStyleFromImages,
    extractAssetsFromBeats,
    reviewVideoPrompt,
    regenerateVideoPromptOptimized,
} from '@/services/api';
