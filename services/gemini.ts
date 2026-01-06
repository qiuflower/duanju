//import { GoogleGenAI, Type, GenerateContentResponse, Modality } from "@google/genai";
import { Scene, Asset, GlobalStyle } from "../types";
// --- Lightweight shims to replace @google/genai types/enums ---
type ContentPart = {
  text?: string;
  inlineData?: { mimeType: string; data: string };
};

type GenerateContentResponse = {
  text?: string;
  candidates?: Array<{
    content?: {
      parts?: ContentPart[];
    };
  }>;
};


const Type = {
  OBJECT: "OBJECT",
  ARRAY: "ARRAY",
  STRING: "STRING",
  NUMBER: "NUMBER",
  INTEGER: "INTEGER",
  BOOLEAN: "BOOLEAN",
} as const;

const Modality = {
  AUDIO: "AUDIO",
} as const;

type VideosOperation = {
  done: boolean;
  operation?: { id?: string; status?: string };
  response?: { generatedVideos?: Array<{ video?: { uri?: string } }> };
  error?: any;
};


function createPoloAI() {

  const textBaseUrl = "/api/t8star";
  const mediaBaseUrl = "/api/polo";

  // Split keys (fallback to legacy)
  const textKey = process.env.TEXT_API_KEY;
  const imageKey = process.env.IMAGE_API_KEY;
  const videoKey = process.env.VIDEO_API_KEY;
  const audioKey = process.env.AUDIO_API_KEY || process.env.TEXT_API_KEY;

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
//nitialize PoloAI Gateway Client
const ai = createPoloAI();


const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to timeout a promise
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Request timed out after ${ms / 1000}s`)), ms);
        promise
            .then(res => { clearTimeout(timer); resolve(res); })
            .catch(err => { clearTimeout(timer); reject(err); });
    });
};

// Known Voices for Gemini TTS
export const VOICE_OPTIONS = [
    { id: "Puck", name: "Puck (Male, Low)" },
    { id: "Charon", name: "Charon (Male, Deep)" },
    { id: "Kore", name: "Kore (Female, Soft)" },
    { id: "Fenrir", name: "Fenrir (Male, Intense)" },
    { id: "Zephyr", name: "Zephyr (Female, Calm)" },
    { id: "Aoede", name: "Aoede (Female, Elegant)" }
];

async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 2000,
  timeoutMs: number = 1200000 // Default 20m timeout per attempt
): Promise<T> {
  let retries = 0;
  while (true) {
    try {
      return await withTimeout(operation(), timeoutMs);
    } catch (error: any) {
      const status = error?.status || error?.code || error?.response?.status;
      const message = error?.message || JSON.stringify(error);
      const isRetryable = status === 429 || status === 503 || status === 500 || message.includes("429") || message.includes("quota") || message.includes("timed out");

      if (isRetryable && retries < maxRetries) {
        const delay = initialDelay * Math.pow(2, retries);
        console.warn(`Retry ${retries + 1}/${maxRetries} (${delay}ms) - Error: ${message}`);
        await wait(delay);
        retries++;
        continue;
      }
      throw error;
    }
  }
}

// Robust JSON Parsing Helper
const safeJsonParse = <T>(text: string | undefined, fallback: T): T => {
  if (!text) return fallback;
  try {
    // 1. Try extracting from markdown code blocks
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch && jsonMatch[1]) {
        return JSON.parse(jsonMatch[1].trim());
    }

    // 2. Try finding the first '{' or '[' and the last '}' or ']' to handle chatter
    const firstOpen = text.indexOf('{');
    const firstArray = text.indexOf('[');
    
    let start = -1;
    let end = -1;

    if (firstOpen !== -1 && (firstArray === -1 || firstOpen < firstArray)) {
        start = firstOpen;
        end = text.lastIndexOf('}');
    } else if (firstArray !== -1) {
        start = firstArray;
        end = text.lastIndexOf(']');
    }

    if (start !== -1 && end !== -1 && end > start) {
        const potentialJson = text.substring(start, end + 1);
        return JSON.parse(potentialJson);
    }

    // 3. Fallback to original cleanup
    const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    console.warn("JSON Parse Warning. Raw Text:", text?.substring(0, 200));
    return fallback;
  }
};

// --- AUDIO / TTS HELPERS ---

function base64ToArrayBuffer(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, bytes.length);
    let chunk = "";
    for (let j = i; j < end; j++) chunk += String.fromCharCode(bytes[j]);
    binary += chunk;
  }
  return btoa(binary);
}

function normalizeAudioVoice(voiceName: string) {
  const v = (voiceName || "").trim();
  const lower = v.toLowerCase();
  if (
    lower === "alloy" ||
    lower === "echo" ||
    lower === "fable" ||
    lower === "onyx" ||
    lower === "nova" ||
    lower === "shimmer"
  ) {
    return lower;
  }

  const mapping: Record<string, string> = {
    Puck: "onyx",
    Charon: "echo",
    Kore: "nova",
    Fenrir: "onyx",
    Zephyr: "alloy",
    Aoede: "shimmer",
  };

  return mapping[v] || "alloy";
}

export const pcmToWav = (pcmData: ArrayBuffer, sampleRate: number = 24000, numChannels: number = 1): Blob => {
    const buffer = new ArrayBuffer(44 + pcmData.byteLength);
    const view = new DataView(buffer);

    // RIFF identifier
    writeString(view, 0, 'RIFF');
    // file length
    view.setUint32(4, 36 + pcmData.byteLength, true);
    // RIFF type
    writeString(view, 8, 'WAVE');
    // format chunk identifier
    writeString(view, 12, 'fmt ');
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format (raw)
    view.setUint16(20, 1, true);
    // channel count
    view.setUint16(22, numChannels, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate (sampleRate * blockAlign)
    view.setUint32(28, sampleRate * numChannels * 2, true);
    // block align (channel count * bytes per sample)
    view.setUint16(32, numChannels * 2, true);
    // bits per sample
    view.setUint16(34, 16, true);
    // data chunk identifier
    writeString(view, 36, 'data');
    // data chunk length
    view.setUint32(40, pcmData.byteLength, true);

    // Write PCM data
    const pcmBytes = new Uint8Array(pcmData);
    const wavBytes = new Uint8Array(buffer, 44);
    wavBytes.set(pcmBytes);

    return new Blob([buffer], { type: 'audio/wav' });
};

function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

export const generateSpeech = async (text: string, voiceName: string = 'Kore'): Promise<string> => {
    if (!text.trim()) return "";
    const body = {
      model: "tts-1-1106",
      input: text,
      voice: normalizeAudioVoice(voiceName),
      response_format: "pcm",
    };
    const audioBuffer = await retryWithBackoff<ArrayBuffer>(() => ai.audio.speech(body));
    return arrayBufferToBase64(audioBuffer);
};

// --- VIDEO GENERATION (VEO) ---

// Helper: Smart Asset Matching
const matchAssetsToPrompt = (prompt: string, assets: Asset[], explicitIds: string[] = []): Asset[] => {
  // 1. Filter assets that have reference images
  const availableAssets = assets.filter(a => !!a.refImageUrl);
  
  // 2. Score assets
  const scored = availableAssets.map(asset => {
      let score = 0;
      // Priority 1: Explicit ID match (from Agent B analysis)
      if (explicitIds.includes(asset.id)) score += 100;
      
      // Priority 2: Name match in prompt
      if (prompt.includes(asset.name)) score += 50;
      
      // Priority 3: Semantic/Keyword match in description
      const assetTokens = (asset.description || "").toLowerCase().split(/\W+/).filter(t => t.length > 2);
      const promptTokens = prompt.toLowerCase().split(/\W+/).filter(t => t.length > 2);
      
      let overlap = 0;
      // Check for token overlap
      assetTokens.forEach(token => {
          if (promptTokens.includes(token)) overlap++;
      });
      score += overlap * 5;
      
      return { asset, score };
  });
  
  // 3. Sort by score (High to Low) and return
  return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(s => s.asset);
};

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

const parseDataUrl = (value: string): { mimeType: string; base64: string } | null => {
  const m = value.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  return { mimeType: m[1], base64: m[2] };
};

const base64ByteSize = (base64: string) => Math.floor((base64.length * 3) / 4);

const normalizeImageToDataUrl = (value: string): string => {
  if (!value) return "";
  if (/^data:/i.test(value)) return value;
  if (isHttpUrl(value)) return value;
  const b64 = value.trim().replace(/\s+/g, "");
  return `data:image/png;base64,${b64}`;
};

const findFirstHttpUrlDeep = (input: unknown): string | null => {
  const seen = new Set<unknown>();

  const walk = (v: unknown): string | null => {
    if (typeof v === "string") {
      const s = v.trim();
      if (isHttpUrl(s)) return s;
      return null;
    }

    if (!v || typeof v !== "object") return null;
    if (seen.has(v)) return null;
    seen.add(v);

    if (Array.isArray(v)) {
      for (const item of v) {
        const hit = walk(item);
        if (hit) return hit;
      }
      return null;
    }

    for (const key of Object.keys(v as any)) {
      const hit = walk((v as any)[key]);
      if (hit) return hit;
    }
    return null;
  };

  return walk(input);
};

const uploadImageToHttpsUrl = async (input: string): Promise<string | null> => {
  if (!input) return null;
  if (isHttpUrl(input)) return input;

  const keys = [
    String(process.env.VIDEO_API_KEY || "").trim(),
    String(process.env.TEXT_API_KEY || "").trim(),
    String(process.env.IMAGE_API_KEY || "").trim(),
  ].filter(Boolean);
  if (!keys.length) return null;

  const dataUrl = normalizeImageToDataUrl(input);
  if (!dataUrl || isHttpUrl(dataUrl)) return null;

  const body = {
    base64Array: [dataUrl],
    sourceBase64: dataUrl,
    targetBase64: dataUrl,
    mode: "RELAX",
  };

  const postOnce = async (authorization: string) => {
    const res = await fetch(`/api/t8star/mj/submit/upload-discord-images`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: JSON.stringify(body),
    });

    const text = await res.text().catch(() => "");
    if (!res.ok) {
      const err = new Error(`Upload failed (${res.status}): ${text || res.statusText}`);
      (err as any).status = res.status;
      throw err;
    }

    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  };

  let lastErr: any;
  for (const key of keys) {
    const authCandidates = (() => {
      const k = key.trim();
      if (!k) return [];
      if (k.toLowerCase().startsWith("bearer ")) return [k, k.slice("bearer ".length)];
      return [k, `Bearer ${k}`];
    })();

    for (const auth of authCandidates) {
      try {
        const data = await postOnce(auth);
        const url = findFirstHttpUrlDeep(data);
        if (url) return url;
      } catch (e: any) {
        lastErr = e;
        const status = e?.status;
        if (!status) break;
        if (status !== 401 && status !== 403 && status !== 404) break;
      }
    }
  }

  void lastErr;
  return null;
};

const compressDataUrlToJpegBase64 = async (
  dataUrl: string,
  maxDim: number,
  quality: number
): Promise<string | null> => {
  if (typeof document === "undefined") return null;

  const img = new Image();
  img.decoding = "async";
  img.crossOrigin = "anonymous";

  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load image for compression"));
  });

  img.src = dataUrl;
  await loaded;

  const width = img.naturalWidth || img.width || 0;
  const height = img.naturalHeight || img.height || 0;
  if (!width || !height) return null;

  const scale = Math.min(1, maxDim / Math.max(width, height));
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const out = canvas.toDataURL("image/jpeg", quality);
  const parsed = parseDataUrl(out);
  if (!parsed) return null;
  return parsed.base64;
};

const prepareVideoImageForApi = async (
  input: string,
  options: { maxBytes: number }
): Promise<{ value: string; bytes: number }> => {
  if (!input) return { value: "", bytes: 0 };
  if (isHttpUrl(input)) return { value: input, bytes: 0 };

  const parsed = parseDataUrl(input);
  const mimeType = parsed?.mimeType || "image/png";
  let base64 = parsed?.base64 || input;

  if (base64ByteSize(base64) <= options.maxBytes) {
    return { value: base64, bytes: base64ByteSize(base64) };
  }

  const dataUrl = parsed ? input : `data:${mimeType};base64,${base64}`;
  const attempt1 = await compressDataUrlToJpegBase64(dataUrl, 1024, 0.82);
  if (attempt1 && base64ByteSize(attempt1) <= options.maxBytes) {
    return { value: attempt1, bytes: base64ByteSize(attempt1) };
  }

  const attempt2 = await compressDataUrlToJpegBase64(dataUrl, 768, 0.76);
  if (attempt2 && base64ByteSize(attempt2) <= options.maxBytes) {
    return { value: attempt2, bytes: base64ByteSize(attempt2) };
  }

  const attempt3 = await compressDataUrlToJpegBase64(dataUrl, 512, 0.7);
  if (attempt3) return { value: attempt3, bytes: base64ByteSize(attempt3) };

  return { value: base64, bytes: base64ByteSize(base64) };
};

export const generateVideo = async (
  imageBase64: string,
  scene: Scene,
  aspectRatio: '16:9' | '9:16' = '16:9',
  assets: Asset[] = []
): Promise<string> => {
  // 拼 prompt（尽量短一些）
  const promptParts = [
    `Cinematic Shot: ${scene.visual_desc}`,
    scene.video_camera ? `Camera Movement: ${scene.video_camera}` : "",
    scene.video_vfx ? `VFX: ${scene.video_vfx}` : "",
    scene.audio_bgm ? `Atmosphere: ${scene.audio_bgm}` : "",
    scene.audio_dialogue ? `Character Dialogue: ${scene.audio_dialogue.map(d => d.text).join(' ')}` : ""
  ].filter(Boolean).join('. ');

  const safePrompt = promptParts.substring(0, 800);
  // veo 只支持英文：如果包含中文等非 ASCII，自动让后端帮你转英文
  const enhancePrompt = /[^\x00-\x7F]/.test(safePrompt);

  // Smart Asset Matching
  const matchedAssets = matchAssetsToPrompt(scene.visual_desc, assets, scene.assetIds || []);
  
  // Selection Logic: Top 3 Assets
  const topAssets = matchedAssets.slice(0, 3);
  
  // Prepare Images Array
  let imagesToSend: string[] = [];
  
  if (topAssets.length > 0) {
      imagesToSend = topAssets.map(a => (a.refImageUrl || ""));
  }
  
  // Fill with storyboard if we have fewer than 3 images
  // Requirement: "Select top 3 matching resources... If < 3, use storyboard to fill"
  if (imagesToSend.length < 3) {
      imagesToSend.push(imageBase64);
  }
  
  // Final check: Ensure we send at least one image (Storyboard backup)
  if (imagesToSend.length === 0) {
      imagesToSend.push(imageBase64);
  }

  const baseUrl = "https://ai.t8star.cn";
  const model = "veo3.1-components";

  // key：必须使用 VIDEO_API_KEY
  const key = (process.env.VIDEO_API_KEY || "").trim();

  if (!key) {
    console.error("VIDEO_API_KEY is missing");
    throw new Error("VIDEO_API_KEY is required for video generation");
  }

  const authHeader = key
    ? (key.toLowerCase().startsWith("bearer ") ? key : `Bearer ${key}`)
    : "";

  try {
    const maxTotalBytes = 6 * 1024 * 1024;
    const maxSingleBytes = 3 * 1024 * 1024;

    const uploadedImages = await Promise.all(
      imagesToSend
        .filter(Boolean)
        .map(async (img) => (await uploadImageToHttpsUrl(img)) || img)
    );

    const prepared = (await Promise.all(
      uploadedImages
        .map((img) => prepareVideoImageForApi(img, { maxBytes: maxSingleBytes }))
    )).filter((x) => !!x.value);

    const payloadBytes = (items: Array<{ value: string; bytes: number }>) =>
      items.reduce((sum, it) => sum + (isHttpUrl(it.value) ? 0 : it.bytes), 0);

    let finalImages = prepared;
    while (payloadBytes(finalImages) > maxTotalBytes && finalImages.length > 1) {
      finalImages = finalImages.slice(1);
    }

    if (payloadBytes(finalImages) > maxTotalBytes && finalImages.length === 1 && !isHttpUrl(finalImages[0].value)) {
      const more = await prepareVideoImageForApi(`data:image/png;base64,${finalImages[0].value}`, { maxBytes: maxTotalBytes });
      finalImages = [{ value: more.value, bytes: more.bytes }];
    }

    // 1) 提交任务
    const submitResp = await fetch(`${baseUrl}/v2/videos/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { "Authorization": authHeader } : {}),
      },
      body: JSON.stringify({
        prompt: safePrompt,
        model,
        enhance_prompt: enhancePrompt,
        // Send multiple images (Assets + Storyboard)
        images: finalImages.map((x) => x.value),
        aspect_ratio: aspectRatio,
      }),
    });

    if (!submitResp.ok) {
      const errText = await submitResp.text().catch(() => "");
      throw new Error(`Submit failed (${submitResp.status}): ${errText || submitResp.statusText}`);
    }

    const submitData: any = await submitResp.json().catch(() => ({}));
    const taskId =
      submitData?.task_id ||
      submitData?.taskId ||
      submitData?.id ||
      submitData?.data?.task_id ||
      submitData?.data?.taskId ||
      submitData?.data?.id;

    if (!taskId) throw new Error(`No task_id returned: ${JSON.stringify(submitData)}`);

    // 2) 轮询任务
    let retries = 0;
    const maxRetries = 60; // 60 * 5s = 5 mins
    while (retries < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 5000));

      const statusResp = await fetch(`${baseUrl}/v2/videos/generations/${encodeURIComponent(taskId)}`, {
        method: "GET",
        headers: {
          ...(authHeader ? { "Authorization": authHeader } : {}),
        },
      });

      if (!statusResp.ok) {
        const errText = await statusResp.text().catch(() => "");
        throw new Error(`Status query failed (${statusResp.status}): ${errText || statusResp.statusText}`);
      }

      const statusData: any = await statusResp.json().catch(() => ({}));
      const status = statusData?.status;

      if (status === "FAILURE") {
        throw new Error(statusData?.fail_reason || "Video generation failed");
      }

      if (status === "SUCCESS") {
        const outputUrl = statusData?.data?.output || statusData?.output;
        if (!outputUrl) throw new Error(`SUCCESS but no output url: ${JSON.stringify(statusData)}`);

        // 3) 下载 mp4
        const videoResponse = await fetch(outputUrl);
        if (!videoResponse.ok) throw new Error(`Failed to download video: ${videoResponse.statusText}`);

        const videoBlob = await videoResponse.blob();
        // Convert to Base64 Data URL for persistence
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                if (typeof reader.result === 'string') {
                    resolve(reader.result);
                } else {
                    reject(new Error("Failed to convert video to base64"));
                }
            };
            reader.onerror = reject;
            reader.readAsDataURL(videoBlob);
        });
      }

      // NOT_START / IN_PROGRESS
      retries++;
    }

    throw new Error("Video generation timed out");
  } catch (e: any) {
    console.error("Veo Generation Error (t8star):", e);
    throw new Error(`Video Generation Failed: ${e?.message || String(e)}`);
  }
};


// --- GENERATION FUNCTIONS ---

export const generateStyleOptions = async (
  type: 'director' | 'work' | 'texture', 
  seed: string, 
  language: string = 'Chinese'
): Promise<string[]> => {
  const seedDigits = seed.split('').map(Number);
  const [d1] = seedDigits.length === 4 ? seedDigits : [5];
  let systemPrompt = "";
  if (type === 'director') systemPrompt = `Generate 20 film directors in ${language}. Diversity ${d1}/9.`;
  else if (type === 'work') systemPrompt = `Generate 20 visual works in ${language}. Art Style ${d1}/9.`;
  else if (type === 'texture') systemPrompt = `Generate 20 rendering styles in ${language}.`;

  try {
    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: "Generate list.",
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } },
        // Removed thinkingConfig to avoid timeouts
      }
    }));
    return safeJsonParse(response.text, []);
  } catch (e) { return []; }
};

async function ensurePngDataUrl(url: string): Promise<string> {
  try {
    if (!url) return url;
    if (url.startsWith("data:image/png")) return url;

    const toDataUrl = async (blob: Blob) => {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Failed to read image blob"));
        reader.readAsDataURL(blob);
      });
    };

    let dataUrl = url;
    if (!url.startsWith("data:")) {
      const res = await fetch(url);
      const blob = await res.blob();
      const rawDataUrl = await toDataUrl(blob);
      if (rawDataUrl.startsWith("data:image/png")) return rawDataUrl;
      dataUrl = rawDataUrl;
    }

    if (dataUrl.startsWith("data:image/png")) return dataUrl;

    const img = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load image for PNG conversion"));
    });
    img.src = dataUrl;
    await loaded;

    const width = img.naturalWidth || img.width || 0;
    const height = img.naturalHeight || img.height || 0;
    if (!width || !height) return url;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return url;
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return url;
  }
}

export const generateAssetImage = async (
  asset: Asset, 
  style: GlobalStyle, 
  overridePrompt?: string,
  referenceImageUrl?: string
): Promise<{ imageUrl: string, prompt: string }> => {
    // 1. Force Style Consistency
    const workStyle = style.work.custom || (style.work.selected !== 'None' ? style.work.selected : '');
    const textureStyle = style.texture.custom || (style.texture.selected !== 'None' ? style.texture.selected : 'Realistic');
    const visualDna = style.visualTags || "";
    
    // Strict Style Check
    const isRealistic = 
        textureStyle.toLowerCase().includes('real') || 
        textureStyle.toLowerCase().includes('photo') || 
        workStyle.toLowerCase().includes('movie') || 
        workStyle.toLowerCase().includes('film') ||
        textureStyle.includes('写实') ||
        textureStyle.includes('摄影');

    const realismPrompt = isRealistic ? "photorealistic, 8k, raw photo, highly detailed, cinematic lighting" : "";
    const stylePrefix = `((Art Style: ${workStyle})), ((Texture: ${textureStyle})), ((World Setting: ${workStyle}))`;
    
    // Strict Negative Prompts for Assets
    // Rule: No multi-panels, no split screens, no text, no effects on characters
    const commonNegative = "text, watermark, signature, blurry, low quality, messy, comic panels, multiple panels, split screen, collage, grid, frame, border, speech bubble";
    
    let negativePrompt = commonNegative;
    let prompt = "";

    const userNotes = (overridePrompt || "").trim();

    if (asset.type === 'character') {
            const bgConstraint = "simple clean white background, no background elements, studio lighting";
            // Rule: Single character identity, no effects. 
            negativePrompt += ", multiple different characters, crowd, visual effects, glowing aura, magic spells, fire, lightning, particles, accessories floating";
            
            // Allow split screen for character sheet
            negativePrompt = negativePrompt.replace("split screen, ", "").replace("multiple panels, ", "");

            // Reference instruction
            const refInstruction = referenceImageUrl ? "Use the attached image as the primary reference for the character's appearance (face, hair, features)." : "";

            // Prompt for Split View (Face + Three Views)
            prompt = `(Best quality, masterpiece), ${stylePrefix}, ${textureStyle} style, ${realismPrompt}.
            Widescreen Split Screen Composition (16:9 landscape, horizontal):
            [LEFT THIRD]: Extreme Close-up Portrait of ${asset.name}'s face. High definition, detailed eyes, looking directly at camera.
            [RIGHT TWO-THIRDS]: Full Body Character Sheet of ${asset.name}. Three distinct views: Front, Side, Back. Standing pose.
            ${bgConstraint}, Subject: ${asset.description}, ${asset.visualDna || ""}, ${visualDna}. 
            ${userNotes ? `Additional constraints: ${userNotes}` : ""}
            ${refInstruction}
            NO TEXT. Exclude: ${negativePrompt}`;
    } else if (asset.type === 'item') {
            const bgConstraint = "pure white background (RGB 255,255,255), no background elements, shadowless studio lighting, no ambient occlusion, no reflections, no environment";
            negativePrompt += ", person, people, man, woman, child, character, hand, fingers, holding, mannequin, stand, table, floor, surface, room, bedroom, kitchen, studio set, desk, environment, scenery, background scene, perspective scene, shadow, drop shadow, cast shadow, contact shadow, reflection, reflective, glare, glossy highlights, mirror";

            negativePrompt = negativePrompt.replace("split screen, ", "").replace("multiple panels, ", "");

            const refInstruction = referenceImageUrl ? "Match the attached reference image's lighting direction and rendering style exactly." : "";

            prompt = `(Best quality, masterpiece), ${stylePrefix}, ${textureStyle} style, ${realismPrompt}.
            Create a single flat layout image on a pure white background only. No scene, no room, no surfaces.
            Widescreen Split Screen Layout (16:9 landscape, horizontal):
            [LEFT AREA]: Item macro close-up in a perfect square (1:1). Emphasize material details and craftsmanship. Crisp silhouette with clear edge separation from background.
            [RIGHT AREA]: Three equal square views (1:1:1), aligned left-to-right: Front View, Side View, Top View. Orthographic views, no perspective distortion. Same scale, strict proportional correspondence, perfect alignment.
            ${bgConstraint}. Subject: ${asset.name}. Description: ${asset.description}, ${asset.visualDna || ""}, ${visualDna}.
            ${userNotes ? `Additional constraints: ${userNotes}` : ""}
            Output PNG with alpha channel.
            NO SHADOWS. NO REFLECTIONS. NO TEXT.
            ${refInstruction}
            Exclude: ${negativePrompt}`;
    } else {
            // Strict Location Constraints
            // For locations, avoid multiple views
            // negativePrompt += ", multiple views, people, person, man, woman, child, character, crowd, face, human";
            
            // Reference instruction for location
            const refInstruction = referenceImageUrl ? "Use the attached image as the reference for the location's style and elements." : "";

            prompt = `(Best quality, masterpiece), ${stylePrefix}, ${textureStyle} style, ${realismPrompt}, Establishing shot, Environment design, Scenery Only, Subject: ${asset.name}. Description: ${asset.description}, ${asset.visualDna || ""}, ${visualDna}. 
            ${userNotes ? `Additional constraints: ${userNotes}` : ""}
            ${refInstruction}
            NO TEXT. Exclude: ${negativePrompt}`;
    }

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

  const ensureAspectRatio16x9 = async (url: string): Promise<string> => {
      try {
          if (!url || !url.startsWith("data:image/")) return url;

          const img = new Image();
          const loaded = new Promise<void>((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = () => reject(new Error("Failed to load image for aspect ratio conversion"));
          });
          img.src = url;
          await loaded;

          const srcW = img.naturalWidth || img.width || 0;
          const srcH = img.naturalHeight || img.height || 0;
          if (!srcW || !srcH) return url;

          const targetRatio = 16 / 9;
          const srcRatio = srcW / srcH;
          if (Math.abs(srcRatio - targetRatio) < 0.01) return url;

          let canvasW = srcW;
          let canvasH = srcH;

          if (srcRatio > targetRatio) {
              canvasW = srcW;
              canvasH = Math.max(1, Math.round(canvasW / targetRatio));
          } else {
              canvasH = srcH;
              canvasW = Math.max(1, Math.round(canvasH * targetRatio));
          }

          const canvas = document.createElement("canvas");
          canvas.width = canvasW;
          canvas.height = canvasH;
          const ctx = canvas.getContext("2d");
          if (!ctx) return url;

          ctx.clearRect(0, 0, canvasW, canvasH);

          const scale = Math.min(canvasW / srcW, canvasH / srcH);
          const drawW = Math.max(1, Math.round(srcW * scale));
          const drawH = Math.max(1, Math.round(srcH * scale));
          const dx = Math.round((canvasW - drawW) / 2);
          const dy = Math.round((canvasH - drawH) / 2);

          ctx.drawImage(img, dx, dy, drawW, drawH);
          return canvas.toDataURL("image/png");
      } catch {
          return url;
      }
  };
  
  const callModel = async (p: string) => {
        const parts: any[] = [{ text: p }];
        
        // Add Reference Image if available
        if (referenceImageUrl) {
            try {
                // Handle data URL (data:image/png;base64,...)
                const matches = referenceImageUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
                if (matches && matches.length === 3) {
                     parts.push({
                        inlineData: {
                            mimeType: matches[1],
                            data: matches[2]
                        }
                    });
                } else if (referenceImageUrl.startsWith("http")) {
                     // Convert to Base64 first for assets too!
                     const b64 = await fetchImageAsBase64(referenceImageUrl);
                     if (b64) {
                        const m = b64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
                        if (m) {
                            parts.push({
                                inlineData: { mimeType: m[1], data: m[2] }
                            });
                        }
                     } else {
                         // Fallback to URL if fetch fails
                         parts.push({
                             inlineData: { mimeType: "image/png", data: referenceImageUrl }
                         });
                     }
               }
            } catch (e) {
                console.warn("Failed to parse reference image", e);
            }
        }

        const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'nano-banana-2-2k',
            contents: { parts },
            // CHANGED: Default aspect ratio for assets is now 16:9 to accommodate character sheets and wide shots better
            config: { imageConfig: { aspectRatio: '16:9' } }
        }), 1, 2000, 600000); // 1 retry, 10m timeout
        
        if (!response.candidates || response.candidates.length === 0) {
             throw new Error("Safety Block: No candidates returned.");
        }
        
        const raw = extractImageFromResponse(response);
        const png = await ensurePngDataUrl(raw);
        return await ensureAspectRatio16x9(png);
    };

    try {
        const imageUrl = await callModel(prompt);
        return { imageUrl, prompt };
    } catch (e: any) {
        console.warn("Asset Gen Attempt 1 Failed:", e.message);
        
        // If override prompt provided, do not fallback
        if (overridePrompt) throw e;

        try {
             // Fallback prompt also updated for consistency
             const simplePrompt = `(Best quality), ${stylePrefix}, ${asset.type === 'character' ? 'Widescreen (16:9) landscape, horizontal, Character Sheet, Three Views (Front, Side, Back), white background' : asset.type === 'item' ? 'Widescreen (16:9) landscape, horizontal, split layout: left square macro close-up, right three equal squares (front, side, top), pure white background (RGB 255,255,255), no shadows, no reflections, PNG with alpha channel' : 'Environment concept art, no humans, empty scenery'}, Subject: ${asset.description}. Exclude: ${commonNegative}`;
             const imageUrl = await callModel(simplePrompt);
             return { imageUrl, prompt: simplePrompt };
        } catch (e2) {
             throw e2;
        }
    }
};

// --- AGENT A1 & A2 ---

const AGENT_A_DNA_PROMPT = (workStyle: string, textureStyle: string, language: string) => `
You are **Agent A1: The Visual Director**.
Goal: Define a Global Visual DNA string based on the Style Reference: "${workStyle}" and Texture Reference: "${textureStyle}".
**CRITICAL INSTRUCTION**: The output must describe the **Visual Style** (lighting, atmosphere, art style, film grain, color palette) ONLY.
**FORBIDDEN**: Do NOT include any specific character names, plot events, actions, or story details from the provided text.
Output **strictly** a valid JSON object. No markdown.
Language: ${language}.
Example: { "visual_dna": "cinematic lighting, volumetric fog, 35mm film grain, cyberpunk neon, wet pavement" }
`;

const AGENT_A_ASSET_PROMPT = (language: string, existingAssets: Asset[]) => {
  const existingList = JSON.stringify(existingAssets.map(a => ({ id: a.id, name: a.name })));
  return `
You are **Agent A2: The Casting Director**.
Goal: List ALL characters/locations found in the text.
**REFERENCE ASSETS (ID MAP):** ${existingList}
**RULES:**
1. **MATCHING:** If a character matches a Reference Asset ID, USE THAT ID.
2. **VARIANTS:** If a character appears in a different timeline, age, or costume, create a NEW ID (parent_id + suffix).
3. **MOUNTS/PETS/VEHICLES (CRITICAL):** If a character has a significant mount, pet, or vehicle, create a **SEPARATE** asset for it.
4. **DESCRIPTION:** **MUST BE IN ${language}**. Describe visuals (appearance, clothes, age).
5. **OUTPUT:** Return strictly valid JSON.
**Response Format (JSON):**
{ "assets": [ { "id": "hero_base", "name": "Hero Name", "description": "Visual description...", "type": "character", "parentId": "optional_parent_id" } ] }
`;
};

export const extractAssets = async (
  text: string,
  language: string = 'Chinese',
  existingAssets: Asset[] = [],
  workStyle: string = '',
  textureStyle: string = ''
): Promise<{ visualDna: string; assets: Asset[] }> => {
    let visualDna = "";
    try {
        const dnaResponse = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts: [{ text: "Analyze the visual style based on the provided style and texture references." }] },
            config: {
                systemInstruction: AGENT_A_DNA_PROMPT(workStyle, textureStyle, language),
                responseMimeType: "application/json",
                responseSchema: { type: Type.OBJECT, properties: { visual_dna: { type: Type.STRING } } }
            }
        }));
        const dnaJson = safeJsonParse<{visual_dna: string}>(dnaResponse.text, { visual_dna: "" });
        visualDna = dnaJson.visual_dna;
    } catch (e) { console.warn("Agent A1 failed:", e); }

    let assets: Asset[] = [];
    try {
         const assetResponse = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts: [{ text: text }] },
            config: {
                systemInstruction: AGENT_A_ASSET_PROMPT(language, existingAssets),
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                         assets: {
                             type: Type.ARRAY,
                             items: {
                                 type: Type.OBJECT,
                                 properties: {
                                     id: { type: Type.STRING },
                                     name: { type: Type.STRING },
                                     description: { type: Type.STRING },
                                     type: { type: Type.STRING, enum: ['character', 'location'] },
                                     parentId: { type: Type.STRING }
                                 },
                                 required: ["id", "name", "description", "type"]
                             }
                         }
                    }
                },
                 // Removed thinkingConfig
            }
        }));
        const assetJson = safeJsonParse<any>(assetResponse.text, { assets: [] });
        if (Array.isArray(assetJson)) {
            assets = assetJson;
        } else if (assetJson && Array.isArray(assetJson.assets)) {
            assets = assetJson.assets;
        } else {
            assets = [];
        }
        
        // Ensure we don't accidentally filter out assets that were returned
        // The previous logic was correct in returning all assets found by the AI.
        // The issue might be in how App.tsx merges them.
        
    } catch (e) { console.warn("Agent A2 failed:", e); }

    return { visualDna, assets };
};

// --- AGENT B: STORYBOARD DIRECTOR ---

const AGENT_B_PROMPT = (language: string, assets: Asset[], style: GlobalStyle, prevContext: string) => {
  const assetMap = assets.map(a => `${a.id}: ${a.name} (${a.description})`).join('\n');
  const director = style.director.custom || style.director.selected;
  const work = style.work.custom || style.work.selected;
  
  return `
You are **Agent B: The Netflix Master Showrunner**.
Your Goal: Adapt the provided novel text into a **high-retention, fast-paced Short Drama storyboard**.

**IMPORTANT: STRICT LANGUAGE ENFORCEMENT**
ALL generated text (narration, visual_desc, dialogue, etc.) **MUST BE IN ${language}**.
Do NOT output English unless ${language} is 'English'.

**STORYBOARD BREAKDOWN REQUIREMENTS (STRICT):**
You MUST provide a COMPLETE and DETAILED breakdown for every scene. 
- **CRITICAL: You MUST cover 100% of the input text. Do not skip ANY sentence, action, or dialogue.**
- **ZERO OMISSION POLICY**: Every single sentence in the source text must map to at least one scene.
- If the input text describes a sequence of actions, create a separate shot for EACH action.
- If the input text contains minor details, include them in the visual description.
- NO simplification, summarization, or omission is allowed. Every word of the source text must be visually represented or spoken.
- Do not worry about the output length. If the text requires many scenes, generate many scenes.
- Do not merge distinct actions into one shot.

For EACH scene, you must specify:
1. **Shot Composition**: Full details on framing, angle, and lighting.
2. **Character Actions**: Precise movement, expressions, and acting instructions. For continuous actions, break them down into minimal action units.
3. **Scene Transitions**: How the scene begins and ends (cuts, fades, wipes, etc.).
4. **Timing/Rhythm**: Precise duration and pacing instructions.
5. **Dialogue**: Full dialogue text with emotional tone.
6. **VFX/Effects**: Detailed description of any visual effects, particles, or atmosphere.
7. **Camera Movement**: Specific camera moves (Push, Pull, Pan, Tilt, Dolly, Truck, etc.) and lens choices.
8. **Keyframes**: Describe the key visual elements that must be present.
9. **Originality**: Preserve ALL original creative concepts from the source text.

**Core Philosophy:**
1. Hook (Golden 3s).
2. Conflict.
3. Reversal.
4. **Fidelity**: Every line of the original novel must be represented in the storyboard. Do not cut content for brevity.

**ASSET HANDLING (CRITICAL):**
- Identify which Assets (Characters/Locations) appear in each scene.
- Return their IDs in the \`assetIds\` array.
- In \`np_prompt\`, ALWAYS use the format: "{{asset_id}} performing action...".

**Context:**
- Style: ${director}, ${work}
- Prev: ${prevContext}

**Available Assets:**
${assetMap}

**Response Format (JSON):**
{
  "scenes": [
    {
      "id": "001-1",
      "narration": "(Emotion) Narrative text in ${language}...",
      "visual_desc": "EXTREMELY DETAILED video description in ${language}. Include composition, keyframes, lighting, and specific action details...",
      "video_lens": "Lens choice (e.g., Wide, Telephoto, Macro) in ${language}",
      "video_camera": "Specific movement (e.g., Dolly In, Pan Right, Handheld) in ${language}",
      "video_duration": "3s",
      "video_vfx": "Detailed VFX instructions in ${language}",
      "np_prompt": "{{asset_id}} detailed action description for video generation in ${language}...",
      "audio_dialogue": [{ "speaker": "Hero", "text": "(Tone) Line in ${language}" }],
      "audio_bgm": "Atmosphere and music description in ${language}",
      "audio_sfx": "Sound effects description in ${language}",
      "assetIds": ["hero_base", "loc_house"] 
    }
  ]
}
`;
};

export const analyzeNovelText = async (
    text: string, 
    language: string = 'Chinese', 
    assets: Asset[] = [], 
    style: GlobalStyle,
    prevContext: string = ""
): Promise<{ scenes: Scene[]; visualDna?: string }> => {
  if (!text.trim()) return { scenes: [] };

  try {
    // Increased timeout for this specific call as generation can be long
    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: text,
      config: {
        systemInstruction: AGENT_B_PROMPT(language, assets, style, prevContext),
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            scenes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  narration: { type: Type.STRING },
                  visual_desc: { type: Type.STRING },
                  video_lens: { type: Type.STRING },
                  video_camera: { type: Type.STRING },
                  video_duration: { type: Type.STRING },
                  video_vfx: { type: Type.STRING },
                  np_prompt: { type: Type.STRING },
                  video_prompt: { type: Type.STRING },
                  audio_dialogue: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { speaker: {type: Type.STRING}, text: {type: Type.STRING} } } },
                  audio_sfx: { type: Type.STRING },
                  audio_bgm: { type: Type.STRING },
                  assetIds: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ["id", "narration", "visual_desc", "np_prompt"]
              }
            }
          }
        },
        // Removed thinkingConfig to prevent potential hangs
      }
    }), 3, 2000, 600000); // 10m timeout

    const json = safeJsonParse<any>(response.text, { scenes: [] });
    let scenes: Scene[] = [];
    if (Array.isArray(json)) {
        scenes = json;
    } else if (json && Array.isArray(json.scenes)) {
        scenes = json.scenes;
    }
    
    if (scenes.length === 0) {
        console.warn("Received empty scenes list from model. Raw text:", response.text);
    }

    const workStyle = style.work.custom || (style.work.selected !== 'None' ? style.work.selected : '');
    const textureStyle = style.texture.custom || (style.texture.selected !== 'None' ? style.texture.selected : '');
    
    // Construct style prefix using Global Visual DNA if available, otherwise fallback to basic style selection
    // Format: (Style: [Name], [Features])
    let stylePrefix = "";
    let generatedDna = "";

    // Helper to build prefix consistent with or without workStyle
    const buildPrefix = (visuals: string) => {
        const parts = [];
        // ALWAYS include workStyle if selected, even if visualTags are present
        if (workStyle) parts.push(`Style: ${workStyle}`);
        
        // Only add visuals if they are different from workStyle (avoid redundancy if user typed style into custom DNA)
        if (visuals && visuals !== workStyle) {
             parts.push(visuals);
        }
        
        return parts.length > 0 ? `(${parts.join(', ')})` : "";
    };

    if (workStyle || textureStyle) {
        if (style.visualTags) {
             stylePrefix = buildPrefix(style.visualTags);
        } else {
             stylePrefix = buildPrefix(textureStyle);
        }
    }

    try {
        // ALWAYS regenerate DNA to ensure it matches the current style selection and excludes previous story details
        if (workStyle || textureStyle) {
             // 1. First check if workStyle itself can be the DNA (if it's detailed enough)
             // or if we need to expand it. For consistency, if no visualTags, we try to generate once.
             
            const visualResponse = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: { parts: [{ text: "Analyze the visual style based on the provided style and texture references." }] },
                config: {
                    systemInstruction: AGENT_A_DNA_PROMPT(workStyle, textureStyle, language),
                    responseMimeType: "application/json",
                    responseSchema: { type: Type.OBJECT, properties: { visual_dna: { type: Type.STRING } } }
                }
            }));
            const visualJson = safeJsonParse<{visual_dna: string}>(visualResponse.text, { visual_dna: "" });
            if (visualJson.visual_dna) {
                 generatedDna = visualJson.visual_dna;
                 // RE-BUILD prefix with the newly generated DNA so it matches exactly what will be saved
                 stylePrefix = buildPrefix(generatedDna);
            }
        }
    } catch (e) {
        console.warn("Real-time Visual DNA generation failed, falling back to cached/default style.", e);
    }
    
    scenes = scenes.map(scene => {
      let finalPrompt = scene.np_prompt;
      if (assets.length > 0) {
        assets.forEach(asset => {
            const regex = new RegExp(`\\{\\{?${asset.id}\\}?\\}`, 'gi');
            // Avoid duplicating global style if it's already in asset.visualDna (legacy) or empty
            const assetDna = (asset.visualDna && asset.visualDna !== style.visualTags) ? asset.visualDna : "";
            const injection = `(${asset.name}, ${asset.description}${assetDna ? `, ${assetDna}` : ""})`;
            finalPrompt = finalPrompt.replace(regex, injection);
        });
      }
      console.log(`[Gemini] Merging prompt: ${stylePrefix} + ${finalPrompt}`);
      
      // New format: Style Prefix + Content
      finalPrompt = `${stylePrefix}, ${finalPrompt}`;
      
      return { ...scene, np_prompt: finalPrompt };
    });
    
    return { scenes, visualDna: generatedDna };
  } catch (error) {
    console.error("Agent B Error:", error);
    throw error;
  }
};

// --- HELPER: Extract Image (Base64 or URL) from Response ---
const extractImageFromResponse = (response: GenerateContentResponse): string => {
  const candidate = response.candidates?.[0];
  if (!candidate) throw new Error("No candidates returned.");

  // 1. Inline Base64
  const imagePart = candidate.content?.parts?.find((p) => p.inlineData);
  if (imagePart?.inlineData) {
    return `data:${imagePart.inlineData.mimeType || "image/png"};base64,${imagePart.inlineData.data}`;
  }

  // 2. Text containing URL (T8Star / Proxy often returns URL)
  const textPart = candidate.content?.parts?.find((p) => p.text);
  if (textPart?.text) {
    let text = textPart.text.trim();
    
    // Handle Markdown image: ![alt](url)
    const mdMatch = text.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
    if (mdMatch) return mdMatch[1];

    // Handle "! url" format (common in some proxies)
    if (text.startsWith("! ")) text = text.substring(2).trim();

    // Check if it's a valid URL
    const urlMatch = text.match(/(https?:\/\/[^\s]+)/);
    if (urlMatch) {
        return urlMatch[1];
    }
    
    throw new Error(`Model Refusal: ${text}`);
  }

  throw new Error("No image data returned.");
};

export const generateSceneImage = async (
    prompt: string, 
    characterDesc: string = "", 
    style?: GlobalStyle,
    assets: Asset[] = [],
    sceneAssetIds: string[] = []
): Promise<string> => {
    const ar = style?.aspectRatio || '16:9'; 
    const finalPrompt = prompt.substring(0, 1500);

    // 1. Identify Assets to Use
    // Priority: Explicit IDs from Agent B > Name Match in Prompt
    let usedAssets: Asset[] = [];
    
    if (sceneAssetIds && sceneAssetIds.length > 0) {
        usedAssets = assets.filter(a => sceneAssetIds.includes(a.id) && a.refImageUrl);
    } else {
        // Fallback: Name matching
        usedAssets = assets.filter(a => a.refImageUrl && prompt.includes(a.name));
    }

    // Limit to 3 to avoid token/complexity issues
    usedAssets = usedAssets.slice(0, 3);

    // 2. Build Multi-modal Request Parts
    const parts: any[] = [];
    let instructions = "";

    usedAssets.forEach((asset, index) => {
        if (asset.refImageUrl) {
            const cleanBase64 = asset.refImageUrl.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
            parts.push({
                inlineData: {
                    mimeType: "image/png",
                    data: cleanBase64
                }
            });
            instructions += ` Reference Image ${index + 1} is ${asset.name} (${asset.type}).`;
        }
    });

    // 3. Construct Final Prompt with strict reference enforcement
    let fullText = finalPrompt;
    if (instructions) {
        fullText = `STRICTLY FOLLOW REFERENCES. ${instructions} ${fullText}. Use the exact visual appearance of Reference Images for consistency.`;
    }

    // 4. Style & Anachronism Negative Prompts
    let negativePrompt = "comic panels, multiple panels, split screen, collage, grid, multiple views, frame, border, speech bubble, text, watermark, blurry";
    const styleStr = JSON.stringify(style || {}).toLowerCase();
    const isAncient = styleStr.includes('ancient') || styleStr.includes('wuxia') || styleStr.includes('period') || styleStr.includes('tang') || styleStr.includes('ming') || styleStr.includes('qing') || styleStr.includes('han') || styleStr.includes('historical');
    
    if (isAncient) {
        negativePrompt += ", television, tv, phone, mobile, smartphone, computer, laptop, car, vehicle, modern building, skyscraper, electric light, modern clothing, suit, tie, jeans, plastic, electronic device";
    }

    fullText = `${fullText}. Exclude: ${negativePrompt}`;
    parts.push({ text: fullText });

    // 5. Call Model
    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'nano-banana-2-2k',
      contents: { parts: parts },
      config: { imageConfig: { aspectRatio: ar } }
    }), 2, 2000, 600000); // 2 retries, 10m timeout for images

    if (!response.candidates || response.candidates.length === 0) {
        throw new Error("Generation blocked by safety filters or no candidates returned.");
    }

    const raw = extractImageFromResponse(response);
    return await ensurePngDataUrl(raw);
};
