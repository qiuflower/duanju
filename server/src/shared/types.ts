
export interface DialogueLine {
    speaker: string;
    text: string;
}

export interface Scene {
    id: string;
    narration: string;
    visual_desc: string;
    video_duration?: string;
    video_camera?: string;
    video_lens?: string;
    video_vfx?: string;
    np_prompt: string;
    video_prompt?: string;
    audio_dialogue?: DialogueLine[];
    audio_sfx?: string;
    audio_bgm?: string;
    imageUrl?: string;
    imageAssetId?: string;
    videoUrl?: string;
    videoAssetId?: string;
    startEndVideoUrl?: string;
    startEndVideoAssetId?: string;
    narrationAudioUrl?: string;
    assetIds?: string[];
    videoAssetIds?: string[];
    startEndAssetIds?: string[];
    useAssets?: boolean;
    isStartEndFrameMode?: boolean;
    video_prompt_backup?: string;
}



export interface GeneratedImage {
    sceneId: string;
    imageUrl: string;
}

export interface Asset {
    id: string;
    name: string;
    description: string;
    type: 'character' | 'location' | 'item';
    visualDna?: string;
    refImageUrl?: string;
    refImageAssetId?: string;
    prompt?: string;
    parentId?: string;
    variantName?: string;
}

export enum AnalysisStatus {
    IDLE = 'IDLE',
    ANALYZING = 'ANALYZING',
    EXTRACTING = 'EXTRACTING',
    COMPLETED = 'COMPLETED',
    ERROR = 'ERROR'
}

export enum ImageGenStatus {
    IDLE = 'IDLE',
    GENERATING = 'GENERATING',
    COMPLETED = 'COMPLETED',
    ERROR = 'ERROR'
}

export interface StyleSetting {
    selected: string;
    custom?: string;
    strength: number;
    seed: string;
    options: string[];
    useOriginalCharacters?: boolean;
}

export interface GlobalStyle {
    director: StyleSetting;
    work: StyleSetting;
    texture: StyleSetting;
    aspectRatio: '16:9' | '9:16';
    visualTags: string;
    narrationVoice: string;
}

export interface EpisodePlan {
    episode_number: number;
    title: string;
    logline: string;
    structure_breakdown?: any;
    script?: string;
    character_instructions?: Record<string, string>;
}

export interface NovelChunk {
    id: string;
    index: number;
    title?: string;
    text: string;
    status: 'idle' | 'extracting' | 'extracted' | 'scripting' | 'storyboarded' | 'scripted' | 'shooting' | 'completed';
    assets: Asset[];
    scenes: Scene[];
    episodeData?: EpisodePlan;
    batchMeta?: any;
    beatSheet?: any;
}

export type ContentPart = {
    text?: string;
    inlineData?: { mimeType: string; data: string };
    fileData?: { mimeType: string; fileUri: string };
};

export type GenerateContentResponse = {
    text?: string;
    candidates?: Array<{
        content?: {
            parts?: ContentPart[];
        };
    }>;
};

export type VideosOperation = {
    done: boolean;
    operation?: { id?: string; status?: string };
    response?: { generatedVideos?: Array<{ video?: { uri?: string } }> };
    error?: any;
};
