import { GenerateContentResponse, VideosOperation } from "../../../types";

export function createPoloProvider() {
  const baseUrl = "https://work.poloapi.com";

  // Split keys (fallback to legacy)
  const legacy = process.env.GEMINI_API_KEY || process.env.API_KEY; // keep compatibility
  
  const textKey = process.env.POLO_TEXT_API_KEY || process.env.GEMINI_TEXT_API_KEY || legacy;
  const imageKey = process.env.POLO_IMAGE_API_KEY || process.env.GEMINI_IMAGE_API_KEY || legacy;
  const videoKey = process.env.POLO_VIDEO_API_KEY || process.env.VIDEO_API_KEY || legacy;

  const toAuth = (k?: string) => (k?.startsWith("Bearer ") ? k : `${k || ""}`);
  const textAuth = toAuth(textKey);
  const imageAuth = toAuth(imageKey);
  const videoAuth = toAuth(videoKey);

  const isImageModel = (model?: string) => {
    if (!model) return false;
    if (/image/i.test(model)) return true;
    if (/imagen/i.test(model)) return true;
    return false;
  };

  const extractDataUrlFromText = (
    text: string
  ): { mimeType: string; b64: string } | null => {
    if (!text) return null;
    const m = text.match(
      /data:((?:image|audio)\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/
    );
    if (!m) return null;
    return { mimeType: m[1], b64: m[2] };
  };

  const extractInlineB64 = (
    messageContent: any
  ): { mimeType: string; b64: string } | null => {
    if (typeof messageContent === "string") {
      const hit = extractDataUrlFromText(messageContent);
      if (hit) return hit;

      // some gateways pack JSON as string
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
          const hit = extractDataUrlFromText(part.image_url.url);
          if (hit) return hit;
        }
        if (part.type === "audio_url" && typeof part.audio_url?.url === "string") {
          const hit = extractDataUrlFromText(part.audio_url.url);
          if (hit) return hit;
        }
        if (part.type === "text" && typeof part.text === "string") {
          const hit = extractDataUrlFromText(part.text);
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
  };

  const postJson = async (path: string, body: any, auth: string) => {
    const url = `${baseUrl.replace(/\/+$/, "")}${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP Error: ${res.status} ${text}`);
    }
    return res.json();
  };

  const getJson = async (path: string) => {
    const url = `${baseUrl.replace(/\/+$/, "")}${path}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: videoAuth },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP Error: ${res.status} ${text}`);
    }
    return res.json();
  };

  const postForm = async (path: string, form: FormData) => {
    const url = `${baseUrl.replace(/\/+$/, "")}${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", Authorization: videoAuth },
      body: form,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP Error: ${res.status} ${text}`);
    }
    return res.json();
  };

  const generateContent = async (args: {
    model: string;
    contents: any;
    config?: any;
  }): Promise<GenerateContentResponse> => {
    const { model, contents, config } = args;

    const messages: any[] = [];

    // systemInstruction -> system message (keeps behavior w/o SDK)
    if (config?.systemInstruction) {
      messages.push({ role: "system", content: String(config.systemInstruction) });
    }

    // Build user message (supports your { parts: [...] } format)
    if (typeof contents === "string") {
      messages.push({ role: "user", content: contents });
    } else if (contents?.parts && Array.isArray(contents.parts)) {
      const parts = contents.parts;
      const contentParts: any[] = [];
      for (const p of parts) {
        if (typeof p?.text === "string") {
          contentParts.push({ type: "text", text: p.text });
        } else if (p?.inlineData?.mimeType && p?.inlineData?.data) {
          contentParts.push({
            type: "image_url",
            image_url: {
              url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`,
            },
          });
        }
      }
      messages.push({ role: "user", content: contentParts.length ? contentParts : "" });
    } else if (Array.isArray(contents)) {
      // your old compat array: [{text},{inlineData}]
      const contentParts: any[] = [];
      for (const c of contents) {
        if (typeof c?.text === "string") contentParts.push({ type: "text", text: c.text });
        else if (c?.inlineData?.mimeType && c?.inlineData?.data) {
          contentParts.push({
            type: "image_url",
            image_url: {
              url: `data:${c.inlineData.mimeType};base64,${c.inlineData.data}`,
            },
          });
        }
      }
      messages.push({ role: "user", content: contentParts.length ? contentParts : "" });
    } else {
      messages.push({ role: "user", content: "" });
    }

    const body: any = { model, stream: false, messages };

    // Pass through image/tts configs for your gateway (best-effort)
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

    const auth = isImageModel(model) ? imageAuth : textAuth;
    const data = await postJson("/v1/chat/completions", body, auth);
    const message = data?.choices?.[0]?.message;

    // Try extract inline (image/audio) first
    const inline = extractInlineB64(message?.content);
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

    // Otherwise extract text
    let text = "";
    if (typeof message?.content === "string") text = message.content;
    else if (Array.isArray(message?.content)) {
      text = message.content
        .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
        .join("");
    }

    return {
      text,
      candidates: [{ content: { parts: [{ text }] } }],
    };
  };

  const generateVideos = async (args: {
    model: string;
    prompt: string;
    image?: { imageBytes: string; mimeType: string };
    config?: any;
  }): Promise<VideosOperation> => {
    const { model, prompt, image, config } = args;

    const form = new FormData();
    form.append("model", model);
    form.append("prompt", prompt);

    // keep compatible defaults
    form.append("seconds", String(config?.seconds ?? 8));

    // map aspectRatio/resolution -> size (best-effort)
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

    const data = await postForm("/v1/videos", form);
    const id = data?.id;
    return { done: false, operation: { id }, response: undefined, error: undefined };
  };

  const getVideosOperation = async (args: { operation: VideosOperation }): Promise<VideosOperation> => {
    const id = args?.operation?.operation?.id;
    if (!id) return args.operation;

    const data = await getJson(`/v1/videos/${encodeURIComponent(id)}`);
    const status = data?.status;

    let uri = data?.video_url || data?.url || "";
    // Make sure caller's `${videoUri}&key=...` won't break when uri has no "?"
    if (uri && !uri.includes("?")) uri = `${uri}?`;

    const done = status === "completed" && !!uri;

    return {
      done,
      operation: { id, status },
      response: done ? { generatedVideos: [{ video: { uri } }] } : undefined,
      error: data?.error,
    };
  };

  return {
    models: { generateContent, generateVideos },
    operations: { getVideosOperation },
  };
}
// Initialize PoloAI Gateway Client
