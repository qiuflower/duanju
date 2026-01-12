import { createPoloProvider } from "./providers/polo";
import { createT8StarProvider } from "./providers/t8star";

export type ModelType = "text" | "image" | "video";
export type ProviderType = "polo" | "t8star";

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

class ModelManager {
  private config: ModelConfig;
  private polo: ReturnType<typeof createPoloProvider>;
  private t8star: ReturnType<typeof createT8StarProvider>;

  constructor() {
    this.config = this.loadConfig();
    this.polo = createPoloProvider();
    this.t8star = createT8StarProvider();
  }

  private loadConfig(): ModelConfig {
    if (typeof localStorage === "undefined") return DEFAULT_CONFIG;
    const stored = localStorage.getItem("model_config");
    if (!stored) return DEFAULT_CONFIG;
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
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

  private getProvider(type: ModelType) {
    const providerName = this.config[`${type}model` as keyof ModelConfig];
    // Cast to any to handle slightly different interfaces (e.g. audio missing in polo)
    return providerName === "polo" ? (this.polo as any) : (this.t8star as any);
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
             args = { ...args, model: "gemini-3-pro-image-preview" };
        }

        const provider = this.getProviderForContent(args);
        return provider.models.generateContent(args);
      },
      generateVideos: (args: any) => {
        const provider = this.getProvider("video");
        return provider.models.generateVideos(args);
      },
    };
  }

  public get operations() {
    return {
      getVideosOperation: (args: any) => {
         const provider = this.getProvider("video");
         return provider.operations.getVideosOperation(args);
      }
    };
  }

  public get audio() {
    return {
      speech: (body: any) => {
        // Always use t8star for audio as polo doesn't support it in the current interface
        return this.t8star.audio.speech(body);
      }
    };
  }
}

export const modelManager = new ModelManager();
