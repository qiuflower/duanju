import { PoloProvider } from "./providers/polo";
import { T8StarProvider } from "./providers/t8star";
import { IAIProvider, AIProviderConfig } from "./providers/interfaces";
import { GenerateContentResponse } from "../../shared/types";

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

class ModelManager {
    private config: ModelConfig;
    private polo: PoloProvider;
    private t8star: T8StarProvider;

    constructor() {
        this.config = { ...DEFAULT_CONFIG };

        // Backend mode: use direct URLs with API keys from env
        const poloConfig: AIProviderConfig = {
            baseUrl: process.env.POLO_BASE_URL || "https://work.poloapi.com",
            apiKey: process.env.POLO_TEXT_API_KEY || "",
            mediaApiKey: process.env.POLO_IMAGE_API_KEY || "",
        };

        const t8starConfig: AIProviderConfig = {
            baseUrl: process.env.T8_BASE_URL || "https://ai.t8star.cn",
            mediaBaseUrl: process.env.T8_MEDIA_BASE_URL || "https://ai.t8star.cn",
            apiKey: process.env.T8_TEXT_API_KEY || "",
            mediaApiKey: process.env.T8_IMAGE_API_KEY || "",
            audioApiKey: process.env.T8_AUDIO_API_KEY || "",
        };

        this.polo = new PoloProvider(poloConfig);
        this.t8star = new T8StarProvider(t8starConfig);
    }

    public setConfig(config: Partial<ModelConfig>) {
        for (const key of ["textmodel", "imagemodel", "videomodel"] as const) {
            if (config[key] && VALID_PROVIDERS.includes(config[key] as ProviderType)) {
                this.config[key] = config[key] as ProviderType;
            }
        }
    }

    public getConfig(): ModelConfig {
        return { ...this.config };
    }

    private getProvider(type: ModelType): IAIProvider {
        const providerName = this.config[`${type}model` as keyof ModelConfig];
        return providerName === "polo" ? this.polo : this.t8star;
    }

    public async generateContent(args: { model: string; contents: any; config?: any }): Promise<GenerateContentResponse> {
        const isImageRequest = args.config?.imageConfig ||
            (args.model && (args.model.includes("nano") || args.model.includes("flash-image") || args.model.includes("image")));

        let finalArgs = args;
        if (isImageRequest && this.config.imagemodel === "polo") {
            finalArgs = { ...args, model: MODELS.IMAGE_POLO_OVERRIDE };
        }

        const provider = isImageRequest ? this.getProvider("image") : this.getProvider("text");
        return provider.generateContent(finalArgs);
    }

    public async generateVideos(args: any) {
        const provider = this.getProvider("video");
        return provider.generateVideos(args);
    }

    public async getVideosOperation(args: any) {
        const provider = this.getProvider("video");
        return provider.getVideosOperation(args);
    }

    public async speech(body: any): Promise<ArrayBuffer> {
        if (this.t8star.speech) {
            return this.t8star.speech(body);
        }
        throw new Error("Speech generation not supported");
    }
}

// Singleton
let _instance: ModelManager | null = null;

export function getModelManager(): ModelManager {
    if (!_instance) {
        _instance = new ModelManager();
    }
    return _instance;
}
