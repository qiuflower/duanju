import { GenerateContentResponse, VideosOperation } from "../../../types";

export function createT8StarProvider() {

  const textBaseUrl = "/api/t8star";
  const mediaBaseUrl = "/api/polo";

  // Split keys (fallback to legacy)
  const textKey = process.env.T8_TEXT_API_KEY || process.env.TEXT_API_KEY;
  const imageKey = process.env.T8_IMAGE_API_KEY || process.env.IMAGE_API_KEY;
  const videoKey = process.env.T8_VIDEO_API_KEY || process.env.VIDEO_API_KEY;
  const audioKey = process.env.T8_AUDIO_API_KEY || process.env.POLO_TEXT_API_KEY || process.env.AUDIO_API_KEY || textKey;

  const toBearer = (k?: string) => {
    const kk = (k || "").trim();
    if (!kk) return "";
    return kk.toLowerCase().startsWith("bearer ") ? kk : `Bearer ${kk}`;
  };

  const textAuth = toBearer(textKey);
  const imageAuth = toBearer(imageKey);
  const videoAuth = toBearer(videoKey);
  const audioAuth = toBearer(audioKey);

  const isT8starModel = (model?: string) => {
    if (!model) return false;
    return (
      model === "gemini-3-flash-preview" ||
      model === "nano-banana-2-2k"
    );
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

  const postJson = async (baseUrl: string, path: string, body: any, auth: string) => {
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
  };

  const postChatCompletionsT8star = async (body: any, auth: string, stream: boolean) => {
    const url = `${textBaseUrl.replace(/\/+$/, "")}/v1/chat/completions`;
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
  };

  const postAudioSpeechT8star = async (body: any, auth: string) => {
    const url = `${textBaseUrl.replace(/\/+$/, "")}/v1/audio/speech`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/octet-stream",
        "Content-Type": "application/json",
        ...(auth ? { Authorization: auth } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP Error: ${res.status} ${text}`);
    }

    return res.arrayBuffer();
  };

  const fetchImageAsBase64 = async (url: string): Promise<string | null> => {
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
  };
  
  const generateContent = async (args: {
    model: string;
    contents: any;
    config?: any;
  }): Promise<GenerateContentResponse> => {
    const { model, contents, config } = args;

    const messages: any[] = [];

    // systemInstruction -> system message
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
          const rawData = p.inlineData.data;
          let url = "";
          
          if (rawData.startsWith("http")) {
              // Fetch and convert to base64 to avoid server-side fetch errors
              const b64 = await fetchImageAsBase64(rawData);
              if (b64) url = b64;
              else url = rawData; // Fallback to URL if fetch fails
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
              // Fetch and convert to base64 to avoid server-side fetch errors
              const b64 = await fetchImageAsBase64(rawData);
              if (b64) url = b64;
              else url = rawData; // Fallback to URL if fetch fails
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

    if (isT8starModel(model)) {
      const stream = !!config?.stream;

      const body: any = {
        model, 
        stream,
        messages,
      };

      // Map your "json mode" intention to response_format
      if (config?.responseMimeType === "application/json" || config?.responseSchema) {
        body.response_format = { type: "json_object" };
      }

      if (typeof config?.temperature === "number") body.temperature = config.temperature;
      if (typeof config?.top_p === "number") body.top_p = config.top_p;
      if (typeof config?.max_tokens === "number") body.max_tokens = config.max_tokens;

      // [NEW] Support Google Extra Params (Image/Speech Config) for T8Star
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

      const data = await postChatCompletionsT8star(body, textAuth, stream);

      if (data?._stream) {
        const text = data.fullText || "";
        return { text, candidates: [{ content: { parts: [{ text }] } }] };
      }

      const msg = data?.choices?.[0]?.message;

      // [NEW] Try extract inline image/audio from T8Star response
      const inline = extractInlineB64(msg?.content);
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


    const body: any = { model, stream: false, messages };

    // keep your gateway extra_body passthrough (image/tts configs)
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

    // IMPORTANT: use imageAuth for media route (same as your old logic)
    const data = await postJson(mediaBaseUrl, "/v1/chat/completions", body, imageAuth);
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

    return { text, candidates: [{ content: { parts: [{ text }] } }] };
  };

  // --- videos keep your existing logic (unchanged) ---
  const postForm = async (path: string, form: FormData) => {
    const url = `${mediaBaseUrl.replace(/\/+$/, "")}${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", ...(videoAuth ? { Authorization: videoAuth } : {}) },
      body: form,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP Error: ${res.status} ${text}`);
    }
    return res.json();
  };

  const getJson = async (path: string) => {
    const url = `${mediaBaseUrl.replace(/\/+$/, "")}${path}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", ...(videoAuth ? { Authorization: videoAuth } : {}) },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP Error: ${res.status} ${text}`);
    }
    return res.json();
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
    audio: {
      speech: (body: any) => postAudioSpeechT8star(body, audioAuth),
    },
  };
}
// Initialize PoloAI Gateway Client