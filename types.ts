
export interface DialogueLine {
  speaker: string;
  text: string;
}

export interface Scene {
  id: string;
  narration: string;
  
  // Replaced simple visual_desc with detailed video specs
  visual_desc: string; // Keeps backward compatibility, but now acts as "Video Description"
  video_duration?: string; // e.g. "3s"
  video_camera?: string; // e.g. "Pan right", "Dolly in"
  video_lens?: string; // e.g. "35mm", "Wide angle"
  video_vfx?: string; // e.g. "Rain particles"
  
  np_prompt: string; // The Image Prompt
  
  // Multimodal Fields (Agent B)
  video_prompt?: string; // Full constructed video prompt
  audio_dialogue?: DialogueLine[];
  audio_sfx?: string;
  audio_bgm?: string;

  imageUrl?: string; 
  videoUrl?: string; // New: Generated Video URL
  narrationAudioUrl?: string; // New: Generated Narration Audio URL (Blob URL)
  
  assetIds?: string[]; // IDs of assets appearing in this scene (Image Mode)
  videoAssetIds?: string[]; // IDs of assets used specifically for Video Mode (Independent from Image Mode)
  startEndAssetIds?: string[]; // IDs for Start/End Frame Mode [StartID, EndID?]
  useAssets?: boolean; // Whether to use assets for video generation
  isStartEndFrameMode?: boolean; // Whether to use Start/End Frame Mode (veo3.1-pro-4k)
  video_prompt_backup?: string; // Backup of video prompt for Start/End Frame Mode undo
  visualReview?: VisualReviewResult; // New: Agent Visual Review Result
}

export interface VisualReviewResult {
  passed: boolean;
  dimensions: { name: string; score: number; comment: string }[];
  risks: string[];
  suggestions: string[];
}

export interface GeneratedImage {
  sceneId: string;
  imageUrl: string;
}

export interface Asset {
  id: string; // e.g. "hero_base"
  name: string;
  description: string;
  type: 'character' | 'location' | 'item';
  visualDna?: string; // Specific visual tags for this asset
  refImageUrl?: string; 
  prompt?: string; // The prompt used to generate the reference image
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
}

export interface GlobalStyle {
  director: StyleSetting;
  work: StyleSetting;
  texture: StyleSetting;
  aspectRatio: '16:9' | '9:16';
  visualTags: string; // Global Visual DNA (Agent A)
  narrationVoice: string; // New: Selected Voice ID
}

export interface NovelChunk {
  id: string;
  index: number;
  text: string;
  status: 'idle' | 'extracting' | 'extracted' | 'scripting' | 'scripted' | 'shooting' | 'completed';
  assets: Asset[];
  scenes: Scene[];
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

