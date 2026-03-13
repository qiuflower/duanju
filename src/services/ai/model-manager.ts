// Frontend model-manager — config only (AI logic moved to backend)

export type ModelType = "text" | "image" | "video";
export type ProviderType = "polo" | "t8star";

/** Centralized model name constants */
export const MODELS = {
  TEXT_FAST: 'gemini-3.1-flash-lite-preview-thinking-high',
  TEXT_AGENT: 'gemini-3.1-flash-lite-preview-thinking-high',
  IMAGE_GEN: 'gemini-3.1-flash-image-preview-2k',
  IMAGE_POLO_OVERRIDE: 'gemini-3-pro-image-preview',
  TTS: 'tts-1-hd-1106',
} as const;

export interface ModelConfig {
  textmodel: ProviderType;
  imagemodel: ProviderType;
  videomodel: ProviderType;
}

const DEFAULT_CONFIG: ModelConfig = {
  textmodel: "t8star",
  imagemodel: "t8star",
  videomodel: "t8star",
};

const VALID_PROVIDERS: ProviderType[] = ["polo", "t8star"];

/**
 * Frontend ModelManager — config only.
 * Stores/reads provider selection from localStorage for UI (ModelSelector).
 * Actual AI calls go through the backend API.
 */
class ModelManager {
  private config: ModelConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): ModelConfig {
    if (typeof localStorage === "undefined") return DEFAULT_CONFIG;
    const stored = localStorage.getItem("model_config");
    if (!stored) return DEFAULT_CONFIG;
    try {
      const parsed = JSON.parse(stored);
      const validated: ModelConfig = { ...DEFAULT_CONFIG };
      for (const key of ["textmodel", "imagemodel", "videomodel"] as const) {
        if (parsed[key] && VALID_PROVIDERS.includes(parsed[key])) {
          validated[key] = parsed[key];
        }
      }
      return validated;
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  public setConfig(config: Partial<ModelConfig>) {
    this.config = { ...this.config, ...config };
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("model_config", JSON.stringify(this.config));
    }
    // Also sync to backend
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.config),
    }).catch(e => console.warn('Failed to sync config to backend:', e));
  }

  public getConfig(): ModelConfig {
    return { ...this.config };
  }
}

export const modelManager = new ModelManager();
