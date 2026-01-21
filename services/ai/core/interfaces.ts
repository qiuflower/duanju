import { GenerateContentResponse, VideosOperation } from "../../../types";

export interface GenerateContentArgs {
  model: string;
  contents: any;
  config?: any;
}

export interface GenerateVideosArgs {
  model: string;
  prompt: string;
  image?: { imageBytes: string; mimeType: string };
  config?: any;
}

export interface GetVideosOperationArgs {
  operation: VideosOperation;
}

export interface IAIProvider {
  /**
   * Generates content (text/image/multimodal) based on the provided arguments.
   */
  generateContent(args: GenerateContentArgs): Promise<GenerateContentResponse>;

  /**
   * Generates videos based on the provided arguments.
   */
  generateVideos(args: GenerateVideosArgs): Promise<VideosOperation>;

  /**
   * Gets the status/result of a video generation operation.
   */
  getVideosOperation(args: GetVideosOperationArgs): Promise<VideosOperation>;

  /**
   * Generates speech (TTS).
   */
  speech?(body: any): Promise<ArrayBuffer>;
}

export interface AIProviderConfig {
  baseUrl?: string;
  apiKey?: string;
  mediaBaseUrl?: string;
  mediaApiKey?: string;
  audioApiKey?: string;
}
