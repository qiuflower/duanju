import { PoloProvider } from "./providers/polo";
import { T8StarProvider } from "./providers/t8star";
import { IAIProvider, AIProviderConfig } from "./providers/interfaces";

export type ModelType = "text" | "image" | "video";
export type ProviderType = "polo" | "t8star";

/** Centralized model name constants — use these instead of hardcoded strings */
export const MODELS = {
  TEXT_FAST: 'gemini-3-flash-preview',
  TEXT_AGENT: 'gemini-3-flash-preview',
  IMAGE_GEN: 'nano-banana-2-2k',
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

class ModelManager {
  private config: ModelConfig;
  private polo: PoloProvider;
  private t8star: T8StarProvider;

  constructor() {
    this.config = this.loadConfig();

    const poloConfig: AIProviderConfig = {
      baseUrl: "/api/polo"
    };

    // Use t8star for media as default if not specified otherwise
    const t8starConfig: AIProviderConfig = {
      baseUrl: "/api/t8star",
      mediaBaseUrl: "/api/t8star"
    };

    this.polo = new PoloProvider(poloConfig);
    this.t8star = new T8StarProvider(t8starConfig);
  }

  private loadConfig(): ModelConfig {
    if (typeof localStorage === "undefined") return DEFAULT_CONFIG;
    const stored = localStorage.getItem("model_config");
    if (!stored) return DEFAULT_CONFIG;
    try {
      const parsed = JSON.parse(stored);
      // Validate provider types to prevent injection
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
  }

  public getConfig(): ModelConfig {
    return { ...this.config };
  }

  private getProvider(type: ModelType): IAIProvider {
    const providerName = this.config[`${type}model` as keyof ModelConfig];
    return providerName === "polo" ? this.polo : this.t8star;
  }

  // Determine type based on args
  private getProviderForContent(args: { model: string; config?: any }) {
    const { model, config } = args;
    // Heuristic: Image models usually have specific names or config.imageConfig
    // Also check for "nano" (used for images in gemini.ts)
    if (config?.imageConfig || (model && (model.includes("nano") || model.includes("image")))) {
      return this.getProvider("image");
    }
    return this.getProvider("text");
  }

  // Expose the interface expected by gemini.ts
  public get models() {
    return {
      generateContent: (args: any) => {
        // Detect if this is an image generation request
        const isImageRequest = args.config?.imageConfig ||
          (args.model && (args.model.includes("nano") || args.model.includes("image")));

        if (isImageRequest && this.config.imagemodel === "polo") {
          // Override model name for Polo Image Generation
          args = { ...args, model: MODELS.IMAGE_POLO_OVERRIDE };
        }

        const provider = this.getProviderForContent(args);
        return provider.generateContent(args);
      },
      generateVideos: (args: any) => {
        const provider = this.getProvider("video");
        return provider.generateVideos(args);
      },
    };
  }

  public get operations() {
    return {
      getVideosOperation: (args: any) => {
        const provider = this.getProvider("video");
        return provider.getVideosOperation(args);
      }
    };
  }

  public get audio() {
    return {
      speech: (body: any) => {
        // Always use t8star for audio as polo doesn't support it in the current interface
        if (this.t8star.speech) {
          return this.t8star.speech(body);
        }
        throw new Error("Speech generation not supported by T8Star provider");
      }
    };
  }
}

export const modelManager = new ModelManager();
