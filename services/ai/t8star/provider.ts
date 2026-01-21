import { GenerateContentResponse, VideosOperation } from "../../../types";
import { IAIProvider, GenerateContentArgs, GenerateVideosArgs, GetVideosOperationArgs, AIProviderConfig } from "../core/interfaces";
import { 
  isHttpUrl, 
  normalizeImageToDataUrl, 
  parseDataUrl, 
  base64ByteSize, 
  compressDataUrlToJpegBase64,
  findFirstHttpUrlDeep 
} from "./utils";

export class T8StarProvider implements IAIProvider {
  private config: AIProviderConfig;
  private textBaseUrl: string;
  private mediaBaseUrl: string;
  
  private textAuth: string;
  private imageAuth: string;
  private videoAuth: string;
  private audioAuth: string;

  constructor(config?: AIProviderConfig) {
    this.config = config || {};
    this.textBaseUrl = this.config.baseUrl || "/api/t8star";
    this.mediaBaseUrl = this.config.mediaBaseUrl || ""; // No default dependency on other modules

    const textKey = this.config.apiKey || process.env.T8_TEXT_API_KEY || process.env.TEXT_API_KEY;
    const imageKey = this.config.mediaApiKey || process.env.T8_IMAGE_API_KEY || process.env.IMAGE_API_KEY;
    const videoKey = this.config.mediaApiKey || process.env.T8_VIDEO_API_KEY || process.env.VIDEO_API_KEY;
    
    const audioKey = this.config.audioApiKey || process.env.T8_AUDIO_API_KEY || process.env.AUDIO_API_KEY || textKey;

    this.textAuth = this.toBearer(textKey);
    this.imageAuth = this.toBearer(imageKey);
    this.videoAuth = this.toBearer(videoKey);
    this.audioAuth = this.toBearer(audioKey);
  }

  private toBearer(k?: string) {
    const kk = (k || "").trim();
    if (!kk) return "";
    return kk.toLowerCase().startsWith("bearer ") ? kk : `Bearer ${kk}`;
  }

  private isT8starModel(model?: string) {
    if (!model) return false;
    return (
      model === "gemini-3-flash-preview" ||
      model === "nano-banana-2-2k"
    );
  }

  private extractDataUrlFromText(text: string): { mimeType: string; b64: string } | null {
    if (!text) return null;
    const m = text.match(
      /data:((?:image|audio)\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/
    );
    if (!m) return null;
    return { mimeType: m[1], b64: m[2] };
  }

  private extractInlineB64(messageContent: any): { mimeType: string; b64: string } | null {
    if (typeof messageContent === "string") {
      const hit = this.extractDataUrlFromText(messageContent);
      if (hit) return hit;

      try {
        const obj = JSON.parse(messageContent);
        const b64 =
          obj?.b64_json ||
          obj?.data?.[0]?.b64_json ||
          obj?.image?.b64 ||
          obj?.image_base64 ||
          obj?.audio?.b64 ||
          obj?.audio_base64 ||
          obj?.base64 ||
          obj?.image?.base64;
        const mimeType =
          obj?.mimeType || obj?.mime_type || obj?.audio?.mimeType || "image/png";
        if (typeof b64 === "string" && b64.length > 0) return { mimeType, b64 };
      } catch {}

      return null;
    }

    if (Array.isArray(messageContent)) {
      for (const part of messageContent) {
        if (!part || typeof part !== "object") continue;

        if (part.type === "image_url" && typeof part.image_url?.url === "string") {
          const hit = this.extractDataUrlFromText(part.image_url.url);
          if (hit) return hit;
        }
        if (part.type === "audio_url" && typeof part.audio_url?.url === "string") {
          const hit = this.extractDataUrlFromText(part.audio_url.url);
          if (hit) return hit;
        }
        if (part.type === "text" && typeof part.text === "string") {
          const hit = this.extractDataUrlFromText(part.text);
          if (hit) return hit;
        }

        const b64 =
          part?.b64_json || part?.image_base64 || part?.audio_base64 || part?.base64 || part?.data;
        if (typeof b64 === "string" && b64.length > 100) {
          const mimeType = part?.mimeType || part?.mime_type || "image/png";
          return { mimeType, b64 };
        }
      }
    }

    return null;
  }

  private async postJson(baseUrl: string, path: string, body: any, auth: string) {
    const url = `${baseUrl.replace(/\/+$/, "")}${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(auth ? { Authorization: auth } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP Error: ${res.status} ${text}`);
    }
    return res.json();
  }

  private async postChatCompletionsT8star(body: any, auth: string, stream: boolean) {
    const url = `${this.textBaseUrl.replace(/\/+$/, "")}/v1/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: stream ? "text/event-stream" : "application/json",
        "Content-Type": "application/json",
        ...(auth ? { Authorization: auth } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP Error: ${res.status} ${text}`);
    }

    if (!stream) return res.json();

    const reader = res.body?.getReader();
    if (!reader) throw new Error("Streaming not supported: missing response body reader");

    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let fullText = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith("data:")) continue;

        const data = line.slice(5).trim();
        if (!data) continue;

        if (data === "[DONE]") {
          return { _stream: true, fullText };
        }

        try {
          const json = JSON.parse(data);
          const delta = json?.choices?.[0]?.delta?.content;
          if (typeof delta === "string") fullText += delta;
        } catch {
        }
      }
    }

    return { _stream: true, fullText };
  }

  private async fetchImageAsBase64(url: string): Promise<string | null> {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.error("Failed to fetch image for base64 conversion:", url, e);
      return null;
    }
  }

  // --- T8Star Specific Video Helpers ---


  private async prepareVideoImageForApi(
    input: string,
    options: { maxBytes: number }
  ): Promise<{ value: string; bytes: number }> {
    if (!input) return { value: "", bytes: 0 };
    if (isHttpUrl(input)) return { value: input, bytes: 0 };

    const dataUrl = normalizeImageToDataUrl(input);
    const parsed = parseDataUrl(dataUrl);
    const base64 = (parsed?.base64 || "").trim().replace(/\s+/g, "");
    const bytes = base64ByteSize(base64);

    if (bytes <= options.maxBytes) {
      return { value: dataUrl, bytes };
    }

    const attempt1 = await compressDataUrlToJpegBase64(dataUrl, 1024, 0.82);
    if (attempt1 && base64ByteSize(attempt1) <= options.maxBytes) {
      return { value: `data:image/jpeg;base64,${attempt1}`, bytes: base64ByteSize(attempt1) };
    }

    const attempt2 = await compressDataUrlToJpegBase64(dataUrl, 768, 0.76);
    if (attempt2 && base64ByteSize(attempt2) <= options.maxBytes) {
      return { value: `data:image/jpeg;base64,${attempt2}`, bytes: base64ByteSize(attempt2) };
    }

    const attempt3 = await compressDataUrlToJpegBase64(dataUrl, 512, 0.7);
    if (attempt3) return { value: `data:image/jpeg;base64,${attempt3}`, bytes: base64ByteSize(attempt3) };

    return { value: dataUrl, bytes };
  }

  // -------------------------------------

  async generateContent(args: GenerateContentArgs): Promise<GenerateContentResponse> {
    const { model, contents, config } = args;

    const messages: any[] = [];

    if (config?.systemInstruction) {
      messages.push({ role: "system", content: String(config.systemInstruction) });
    }

    if (typeof contents === "string") {
      messages.push({ role: "user", content: contents });
    } else if (contents?.parts && Array.isArray(contents.parts)) {
      const parts = contents.parts;
      const contentParts: any[] = [];
      for (const p of parts) {
        if (typeof p?.text === "string") {
          contentParts.push({ type: "text", text: p.text });
        } else if (p?.inlineData?.mimeType && p?.inlineData?.data) {
          const rawData = p.inlineData.data;
          let url = "";
          
          if (rawData.startsWith("http")) {
              const b64 = await this.fetchImageAsBase64(rawData);
              if (b64) url = b64;
              else url = rawData;
          } else if (rawData.startsWith("data:")) {
              url = rawData;
          } else {
              url = `data:${p.inlineData.mimeType};base64,${rawData}`;
          }

          contentParts.push({
            type: "image_url",
            image_url: { url },
          });
        }
      }
      messages.push({ role: "user", content: contentParts.length ? contentParts : "" });
    } else if (Array.isArray(contents)) {
      const contentParts: any[] = [];
      for (const c of contents) {
        if (typeof c?.text === "string") contentParts.push({ type: "text", text: c.text });
        else if (c?.inlineData?.mimeType && c?.inlineData?.data) {
          const rawData = c.inlineData.data;
          let url = "";

          if (rawData.startsWith("http")) {
              const b64 = await this.fetchImageAsBase64(rawData);
              if (b64) url = b64;
              else url = rawData;
          } else if (rawData.startsWith("data:")) {
              url = rawData;
          } else {
              url = `data:${c.inlineData.mimeType};base64,${rawData}`;
          }

          contentParts.push({
            type: "image_url",
            image_url: { url },
          });
        }
      }
      messages.push({ role: "user", content: contentParts.length ? contentParts : "" });
    } else {
      messages.push({ role: "user", content: "" });
    }

    if (this.isT8starModel(model)) {
      const stream = !!config?.stream;

      const body: any = {
        model, 
        stream,
        messages,
      };

      if (config?.responseMimeType === "application/json" || config?.responseSchema) {
        body.response_format = { type: "json_object" };
      }

      if (typeof config?.temperature === "number") body.temperature = config.temperature;
      if (typeof config?.top_p === "number") body.top_p = config.top_p;
      if (typeof config?.max_tokens === "number") body.max_tokens = config.max_tokens;

      const googleExtra: any = {};
      if (config?.imageConfig) {
        const imageConfig = { ...config.imageConfig };
        if (imageConfig.aspectRatio && !imageConfig.aspect_ratio) {
          imageConfig.aspect_ratio = imageConfig.aspectRatio;
        }
        delete imageConfig.aspectRatio;
        googleExtra.image_config = imageConfig;
      }
      if (config?.speechConfig) googleExtra.speech_config = config.speechConfig;
      if (config?.responseModalities) googleExtra.response_modalities = config.responseModalities;
      if (config?.responseSchema) googleExtra.response_schema = config.responseSchema;

      if (Object.keys(googleExtra).length) {
        body.extra_body = { ...(body.extra_body || {}), google: googleExtra };
      }

      const data = await this.postChatCompletionsT8star(body, this.textAuth, stream);

      if (data?._stream) {
        const text = data.fullText || "";
        return { text, candidates: [{ content: { parts: [{ text }] } }] };
      }

      const msg = data?.choices?.[0]?.message;

      const inline = this.extractInlineB64(msg?.content);
      if (inline) {
        return {
          text: "",
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: inline.mimeType,
                      data: inline.b64,
                    },
                  },
                ],
              },
            },
          ],
        };
      }

      const text = typeof msg?.content === "string" ? msg.content : "";
      return { text, candidates: [{ content: { parts: [{ text }] } }] };
    }

    // Use mediaBaseUrl for other models (e.g. image generation fallback)
    const body: any = { model, stream: false, messages };

    const googleExtra: any = {};
    if (config?.imageConfig) {
      const imageConfig = { ...config.imageConfig };
      if (imageConfig.aspectRatio && !imageConfig.aspect_ratio) {
        imageConfig.aspect_ratio = imageConfig.aspectRatio;
      }
      delete imageConfig.aspectRatio;
      googleExtra.image_config = imageConfig;
    }
    if (config?.speechConfig) googleExtra.speech_config = config.speechConfig;
    if (config?.responseModalities) googleExtra.response_modalities = config.responseModalities;
    if (config?.responseSchema) googleExtra.response_schema = config.responseSchema;
    if (Object.keys(googleExtra).length) {
      body.extra_body = { ...(body.extra_body || {}), google: googleExtra };
    }

    const data = await this.postJson(this.mediaBaseUrl, "/v1/chat/completions", body, this.imageAuth);
    const message = data?.choices?.[0]?.message;

    const inline = this.extractInlineB64(message?.content);
    if (inline) {
      return {
        text: "",
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: inline.mimeType,
                    data: inline.b64,
                  },
                },
              ],
            },
          },
        ],
      };
    }

    let text = "";
    if (typeof message?.content === "string") text = message.content;
    else if (Array.isArray(message?.content)) {
      text = message.content
        .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
        .join("");
    }

    return { text, candidates: [{ content: { parts: [{ text }] } }] };
  }

  async generateVideos(args: GenerateVideosArgs): Promise<VideosOperation> {
    const { model, prompt, image, config } = args;

    // Detect if this is a T8Star/Veo model request that requires T8Star specific handling
    const isVeo = model.includes("veo");

    if (!isVeo) {
        // Fallback to simple form post for other models (e.g. Polo/Luma)
        const form = new FormData();
        form.append("model", model);
        form.append("prompt", prompt);
        form.append("seconds", String(config?.seconds ?? 8));

        const ar = config?.aspectRatio;
        let size = "1280x720";
        if (ar === "9:16") size = "720x1280";
        if (config?.size) size = config.size;
        form.append("size", size);

        if (config?.input_reference) {
        form.append("input_reference", String(config.input_reference));
        } else if (image?.imageBytes) {
        const bin = Uint8Array.from(atob(image.imageBytes), (c) => c.charCodeAt(0));
        const blob = new Blob([bin], { type: image.mimeType || "image/png" });
        form.append("input_reference", blob, "input.png");
        }

        const data = await this.postForm("/v1/videos", form);
        const id = data?.id;
        return { done: false, operation: { id }, response: undefined, error: undefined };
    }

    // --- T8Star Veo Logic ---
    
    // 1. Prepare Images
    // Support multiple images via config.images or single image fallback
    let imagesToSend: string[] = config?.images || [];
    if (imagesToSend.length === 0 && image?.imageBytes) {
        imagesToSend.push(`data:${image.mimeType || 'image/png'};base64,${image.imageBytes}`);
    }

    const maxTotalBytes = 6 * 1024 * 1024;
    const maxSingleBytes = 3 * 1024 * 1024;

    // Upload images to Discord/Proxy if they are data URLs
    // const uploadedImages = await Promise.all(
    //     imagesToSend
    //     .filter(Boolean)
    //     .map(async (img) => (await this.uploadImageToHttpsUrl(img)) || img)
    // );
    const uploadedImages = imagesToSend;

    // Compress/Prepare images
    const prepared = (await Promise.all(
        uploadedImages
        .map((img) => this.prepareVideoImageForApi(img, { maxBytes: maxSingleBytes }))
    )).filter((x) => !!x.value);

    // Limit total size
    const payloadBytes = (items: Array<{ value: string; bytes: number }>) =>
        items.reduce((sum, it) => sum + (isHttpUrl(it.value) ? 0 : it.bytes), 0);

    let finalImages = prepared;
    while (payloadBytes(finalImages) > maxTotalBytes && finalImages.length > 1) {
        finalImages = finalImages.slice(1);
    }

    if (payloadBytes(finalImages) > maxTotalBytes && finalImages.length === 1 && !isHttpUrl(finalImages[0].value)) {
        const more = await this.prepareVideoImageForApi(finalImages[0].value, { maxBytes: maxTotalBytes });
        finalImages = [{ value: more.value, bytes: more.bytes }];
    }

    const enhancePrompt = !!config?.enhance_prompt;
    const aspectRatio = config?.aspectRatio || '16:9';

    // 2. Submit Task
    // Use mediaBaseUrl + /v2/videos/generations
    // Note: If mediaBaseUrl is /api/t8star, then url is /api/t8star/v2/videos/generations
    const url = `${this.mediaBaseUrl.replace(/\/+$/, "")}/v2/videos/generations`;
    
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(this.videoAuth ? { "Authorization": this.videoAuth } : {}),
        },
        body: JSON.stringify({
            prompt: prompt,
            model,
            enhance_prompt: enhancePrompt,
            images: finalImages.map((x) => x.value),
            aspect_ratio: aspectRatio,
        }),
    });

    if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Submit failed (${res.status}): ${errText || res.statusText}`);
    }

    const submitData: any = await res.json().catch(() => ({}));
    const taskId =
        submitData?.task_id ||
        submitData?.taskId ||
        submitData?.id ||
        submitData?.data?.task_id ||
        submitData?.data?.taskId ||
        submitData?.data?.id;

    if (!taskId) throw new Error(`No task_id returned: ${JSON.stringify(submitData)}`);

    return { 
        done: false, 
        operation: { id: taskId, status: 'SUBMITTED' }, 
        response: undefined, 
        error: undefined 
    };
  }

  private async postForm(path: string, form: FormData) {
    const url = `${this.mediaBaseUrl.replace(/\/+$/, "")}${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", ...(this.videoAuth ? { Authorization: this.videoAuth } : {}) },
      body: form,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP Error: ${res.status} ${text}`);
    }
    return res.json();
  }

  private async getJson(path: string) {
    const url = `${this.mediaBaseUrl.replace(/\/+$/, "")}${path}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", ...(this.videoAuth ? { Authorization: this.videoAuth } : {}) },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP Error: ${res.status} ${text}`);
    }
    return res.json();
  }

  async getVideosOperation(args: GetVideosOperationArgs): Promise<VideosOperation> {
    const id = args?.operation?.operation?.id;
    if (!id) return args.operation;

    // Check if it's a legacy/other ID (simple check: if it looks like a UUID or just numbers? T8 IDs are usually strings)
    // We try the Veo endpoint first if it's likely a Veo ID, or just try both?
    // Actually, T8StarProvider now handles Veo.
    // The path for Veo status is /v2/videos/generations/:id
    
    try {
        const url = `${this.mediaBaseUrl.replace(/\/+$/, "")}/v2/videos/generations/${encodeURIComponent(id)}`;
        const res = await fetch(url, {
            method: "GET",
            headers: {
                ...(this.videoAuth ? { "Authorization": this.videoAuth } : {}),
            },
        });

        if (res.ok) {
            const statusData: any = await res.json().catch(() => ({}));
            const status = statusData?.status; // SUCCESS, FAILURE, IN_PROGRESS

            if (status === "FAILURE") {
                return {
                    done: true,
                    operation: { id, status },
                    error: statusData?.fail_reason || "Video generation failed"
                };
            }

            if (status === "SUCCESS") {
                const outputUrl = statusData?.data?.output || statusData?.output;
                return {
                    done: true,
                    operation: { id, status },
                    response: { generatedVideos: [{ video: { uri: outputUrl } }] }
                };
            }

            return {
                done: false,
                operation: { id, status: status || 'IN_PROGRESS' }
            };
        }
    } catch (e) {
        // Fallback to legacy endpoint if Veo endpoint fails? 
        // Or assume it's legacy if the ID format is different.
    }

    // Fallback to legacy behavior (Polo-like API)
    const data = await this.getJson(`/v1/videos/${encodeURIComponent(id)}`);
    const status = data?.status;

    let uri = data?.video_url || data?.url || "";
    if (uri && !uri.includes("?")) uri = `${uri}?`;

    const done = status === "completed" && !!uri;

    return {
      done,
      operation: { id, status },
      response: done ? { generatedVideos: [{ video: { uri } }] } : undefined,
      error: data?.error,
    };
  }

  async speech(body: any): Promise<ArrayBuffer> {
    const url = `${this.textBaseUrl.replace(/\/+$/, "")}/v1/audio/speech`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/octet-stream",
        "Content-Type": "application/json",
        ...(this.audioAuth ? { Authorization: this.audioAuth } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP Error: ${res.status} ${text}`);
    }

    return res.arrayBuffer();
  }
}
