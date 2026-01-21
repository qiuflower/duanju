//import { GoogleGenAI, Type, GenerateContentResponse, Modality } from "@google/genai";
import { Scene, Asset, GlobalStyle, ContentPart, GenerateContentResponse, VideosOperation, VisualReviewResult } from "../types";
import { modelManager as ai } from "./ai/model-manager";
// --- Lightweight shims to replace @google/genai types/enums ---



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
      model: "tts-1-hd-1106",
      input: text,
      voice: normalizeAudioVoice(voiceName),
      response_format: "pcm",
    };
    const audioBuffer = await retryWithBackoff<ArrayBuffer>(() => ai.audio.speech(body));
    return arrayBufferToBase64(audioBuffer);
};

// --- VIDEO GENERATION (VEO) ---

// Helper: Smart Asset Matching
export const matchAssetsToPrompt = (prompt: string, assets: Asset[], explicitIds: string[] = []): Asset[] => {
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

// ----------------------------------------------------
export const constructVideoPrompt = (scene: Scene, globalStyle?: GlobalStyle): string => {
  // Always ensure Global Style is prepended if available
  const stylePrefix = globalStyle?.visualTags ? `${globalStyle.visualTags}. ` : "";
  
  if (scene.video_prompt) {
      // If prompt already exists, check if it starts with style. If not, prepend it.
      if (stylePrefix && !scene.video_prompt.startsWith(stylePrefix.trim())) {
          return `${stylePrefix}${scene.video_prompt}`;
      }
      return scene.video_prompt;
  }

  const corePrompt = [
    `Cinematic Shot: ${scene.visual_desc}`,
    scene.video_camera ? `Camera Movement: ${scene.video_camera}` : "",
    scene.video_vfx ? `VFX: ${scene.video_vfx}` : "",
    scene.audio_bgm ? `Atmosphere: ${scene.audio_bgm}` : "",
    scene.audio_dialogue ? `Character Dialogue: ${scene.audio_dialogue?.map(d => d.text).join(' ') || ''}` : ""
  ].filter(Boolean).join('. ');

  return `${stylePrefix}${corePrompt}`;
};

export const generateVideo = async (
  imageBase64: string,
  scene: Scene,
  aspectRatio: '16:9' | '9:16' = '16:9',
  assets: Asset[] = [],
  globalStyle?: GlobalStyle
): Promise<string> => {
  // Use helper to get prompt (with style injection)
  const fullPrompt = constructVideoPrompt(scene, globalStyle);
  const safePrompt = fullPrompt.substring(0, 800);
  
  // veo 只支持英文：如果包含中文等非 ASCII，自动让后端帮你转英文
  const enhancePrompt = /[^\x00-\x7F]/.test(safePrompt);

  // Smart Asset Matching
  let topAssets: Asset[] = [];
  let imagesToSend: string[] = [];
  const currentSceneAssetId = `scene_img_${scene.id}`;

  if (scene.isStartEndFrameMode) {
      // --- START/END FRAME MODE ---
      // Requirement: Start Frame is Scene Image. End Frame is Optional.
      // We rely on startEndAssetIds to track the End Frame choice.
      // startEndAssetIds[0] -> Start Frame (Should be currentSceneAssetId)
      // startEndAssetIds[1] -> End Frame (Asset ID)
      
      // 1. Start Frame (Always Storyboard Image)
      imagesToSend.push(imageBase64);

      // 2. End Frame (If configured in startEndAssetIds)
      const endFrameId = scene.startEndAssetIds?.[1];
      if (endFrameId) {
          const endAsset = assets.find(a => a.id === endFrameId);
          if (endAsset && endAsset.refImageUrl) {
              imagesToSend.push(endAsset.refImageUrl);
          }
      }

  } else {
      // --- STANDARD MODE (Reference Assets) ---
      
      // Check if asset usage is disabled (Manual Override)
      const useAssets = scene.useAssets !== false;

      if (useAssets) {
          if (scene.videoAssetIds !== undefined) {
              // 1. Regular Assets
              topAssets = assets.filter(a => scene.videoAssetIds!.includes(a.id) && a.refImageUrl);
          } else {
              // FALLBACK MODE
              const targetAssetIds = scene.assetIds || [];
              const matchedAssets = matchAssetsToPrompt(scene.visual_desc, assets, targetAssetIds);
              topAssets = matchedAssets.slice(0, 3);
          }
      } else {
          topAssets = [];
      }
      
      if (topAssets.length > 0) {
          imagesToSend = topAssets.map(a => (a.refImageUrl || ""));
      }

      const shouldIncludeSceneImage = scene.videoAssetIds?.includes(currentSceneAssetId);

      // Logic for including Storyboard Image in Standard Mode
      if (shouldIncludeSceneImage || !useAssets) {
          imagesToSend.push(imageBase64);
      } else if (scene.videoAssetIds === undefined && imagesToSend.length < 3) {
          imagesToSend.push(imageBase64);
      }
      
      // Final check: Ensure we send at least one image
      if (imagesToSend.length === 0) {
          imagesToSend.push(imageBase64);
      }
  }

  // --- Auto-Normalize to Base64 (User Request) ---
  // Before strict validation, ensure all images are Base64.
  const isHttpUrl = (s: string) => /^https?:\/\//i.test(s);
  const isBase64 = (s: string) => /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(s);

  const normalizeToBase64 = async (urlOrB64: string): Promise<string> => {
      if (!urlOrB64) return "";
      if (isBase64(urlOrB64)) return urlOrB64;
      if (isHttpUrl(urlOrB64)) {
          // Use existing helper if available, or fetch manually
          return await ensurePngDataUrl(urlOrB64);
      }
      return urlOrB64; // Return as is if unknown format (validation will catch it)
  };

  // Parallel conversion for performance
  const normalizedImages = await Promise.all(
      imagesToSend.map(img => normalizeToBase64(img))
  );

  // Update imagesToSend with normalized versions
  imagesToSend = normalizedImages;

  // --- Strict Image Format Validation (User Request) ---
  const validImages = imagesToSend.filter(img => img && img.trim().length > 0);
  if (validImages.length > 0) {
      // Re-define checks for the new normalized list
      const isHttpUrlValid = (s: string) => /^https?:\/\//i.test(s);
      const isBase64Valid = (s: string) => /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(s);

      const hasUrl = validImages.some(isHttpUrlValid);
      const hasBase64 = validImages.some(isBase64Valid);


      // 3. Mixed formats check
      if (hasUrl && hasBase64) {
          throw new Error("Image Format Error: Mixed formats (URL and Base64) are not allowed. Please ensure all images are consistent.");
      }

      if (hasUrl) {
          // 1. URL Validation
          const invalidUrls = validImages.filter(url => !isHttpUrlValid(url));
          if (invalidUrls.length > 0) {
              throw new Error("Image Format Error: Invalid URL format. All URLs must start with http:// or https://.");
          }
      } else if (hasBase64) {
          // 2. Base64 Validation
          const invalidBase64 = validImages.filter(b64 => !isBase64Valid(b64));
          if (invalidBase64.length > 0) {
              throw new Error("Image Format Error: Invalid Base64 format. Must start with 'data:image/...;base64,'.");
          }

          // Check for consistent MIME type in Base64
          const getMime = (b64: string) => {
              const match = b64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/i);
              return match ? match[1].toLowerCase() : null;
          };

          const firstMime = getMime(validImages[0]);
          const inconsistent = validImages.some(img => getMime(img) !== firstMime);
          if (inconsistent) {
               throw new Error(`Image Format Error: Inconsistent Base64 image types. All images must be of the same type (e.g. all ${firstMime}).`);
          }
      } else {
          // Fallback for unknown formats (e.g. local file paths if any, or malformed strings)
          throw new Error("Image Format Error: Invalid image format detected. Please use valid URLs or Base64 strings.");
      }
  }
  // ----------------------------------------------------

  const model = scene.isStartEndFrameMode ? "veo3.1" : "veo3.1-components";

  try {
    // 1) 提交任务 (Call AI Provider)
    // Use retryWithBackoff to handle transient 429s during submission
    const operationResult = await retryWithBackoff(async () => {
        return await ai.models.generateVideos({
            model,
            prompt: safePrompt,
            config: {
                enhance_prompt: enhancePrompt,
                images: validImages,
                aspectRatio: aspectRatio,
                seconds: 8
            }
        });
    }, 3, 2000, 60000); // 3 retries, start at 2s, 60s timeout for submission

    const taskId = operationResult.operation?.id;
    if (!taskId) throw new Error("Video generation failed to start (no task ID).");

    // 2) 轮询任务
    let retries = 0;
    const maxRetries = 60; // 60 * 5s = 5 mins
    
    while (retries < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 5000));

      const statusResult = await ai.operations.getVideosOperation({ operation: operationResult });
      
      if (statusResult.error) {
          throw new Error(String(statusResult.error));
      }

      if (statusResult.done) {
          const outputUrl = statusResult.response?.generatedVideos?.[0]?.video?.uri;
          if (!outputUrl) throw new Error("Video generation marked done but no output URL found.");

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

      // IN_PROGRESS
      retries++;
    }

    throw new Error("Video generation timed out");
  } catch (e: any) {
    console.error("Veo Generation Error:", e);
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
    
    // Check if visualDna follows the standard prefix format [Medium][Era][Color][Lighting][Texture]
    const isStandardPrefix = visualDna.trim().startsWith("[") && visualDna.includes("]");

    // Strict Style Check
    const isRealistic = 
        textureStyle.toLowerCase().includes('real') || 
        textureStyle.toLowerCase().includes('photo') || 
        workStyle.toLowerCase().includes('movie') || 
        workStyle.toLowerCase().includes('film') ||
        textureStyle.includes('写实') ||
        textureStyle.includes('摄影');

    const realismPrompt = isRealistic ? "photorealistic, 8k, raw photo, highly detailed, cinematic lighting" : "";
    
    // Construct the Unified Style Prefix
    let stylePrefix = "";
    if (isStandardPrefix) {
        stylePrefix = visualDna;
    } else {
        // Fallback: Construct a best-effort prefix if analysis hasn't been run
        // We map the available info to the slots: [Medium][Era][Color][Lighting][Texture]
        // This is a rough approximation to ensure the format is followed even without AI analysis
        const medium = workStyle || "Cinematic";
        const era = "Modern"; // Generic fallback
        const color = "Cinematic Color";
        const lighting = "Volumetric Lighting";
        const texture = textureStyle || "High Quality";
        
        // If we don't have analysis, we also keep the old keywords for safety
        stylePrefix = `[${medium}][${era}][${color}][${lighting}][${texture}], ((Art Style: ${workStyle})), ((Texture: ${textureStyle}))`;
    }

    
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
            prompt = `(Best quality, masterpiece), ${stylePrefix}.
            Widescreen Split Screen Composition (16:9 landscape, horizontal):
            [LEFT THIRD]: Extreme Close-up Portrait of ${asset.name}'s face. High definition, detailed eyes, looking directly at camera.
            [RIGHT TWO-THIRDS]: Full Body Character Sheet of ${asset.name}. Three distinct views: Front, Side, Back. Standing pose.
            ${bgConstraint}, Subject: ${asset.description}. 
            ${userNotes ? `Additional constraints: ${userNotes}` : ""}
            ${refInstruction}
            NO TEXT. Exclude: ${negativePrompt}`;
    } else if (asset.type === 'item') {
            const bgConstraint = "pure white background (RGB 255,255,255), no background elements, shadowless studio lighting, no ambient occlusion, no reflections, no environment";
            negativePrompt += ", person, people, man, woman, child, character, hand, fingers, holding, mannequin, stand, table, floor, surface, room, bedroom, kitchen, studio set, desk, environment, scenery, background scene, perspective scene, shadow, drop shadow, cast shadow, contact shadow, reflection, reflective, glare, glossy highlights, mirror";

            negativePrompt = negativePrompt.replace("split screen, ", "").replace("multiple panels, ", "");

            const refInstruction = referenceImageUrl ? "Match the attached reference image's lighting direction and rendering style exactly." : "";

            prompt = `(Best quality, masterpiece), ${stylePrefix}.
            Create a single flat layout image on a pure white background only. No scene, no room, no surfaces.
            Widescreen Split Screen Layout (16:9 landscape, horizontal):
            [LEFT AREA]: Item macro close-up in a perfect square (1:1). Emphasize material details and craftsmanship. Crisp silhouette with clear edge separation from background.
            [RIGHT AREA]: Three equal square views (1:1:1), aligned left-to-right: Front View, Side View, Top View. Orthographic views, no perspective distortion. Same scale, strict proportional correspondence, perfect alignment.
            ${bgConstraint}. Subject: ${asset.name}. Description: ${asset.description}.
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

            prompt = `(Best quality, masterpiece), ${stylePrefix}, Establishing shot, Environment design, Scenery Only, Subject: ${asset.name}. Description: ${asset.description}. 
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

**CRITICAL INSTRUCTION**: The output must be a standard style prefix string in the exact format:
"[Art Medium][Era Style][Color Scheme][Lighting Features][Texture Details], "

**REQUIREMENTS**:
1. Analyze the input styles to extract these 5 core visual features.
2. **Format**: Strictly use the brackets [] for each category.
3. **Content**:
   - [Art Medium]: e.g., [Digital Art], [Oil Painting], [Photography], [Anime]
   - [Era Style]: e.g., [Cyberpunk], [Victorian], [Modern], [1990s]
   - [Color Scheme]: e.g., [Neon & Dark], [Pastel], [High Contrast], [Desaturated]
   - [Lighting Features]: e.g., [Volumetric Lighting], [Soft Studio Light], [Cinematic Lighting]
   - [Texture Details]: e.g., [Octane Render], [Rough Sketch], [8k Photorealistic]
4. **Language**: The content inside brackets MUST be in ${language}.
5. **Forbidden**: Do NOT include any specific character names or story details.

Output **strictly** a valid JSON object. No markdown.
Example: { "visual_dna": "[Digital Art][Cyberpunk][Neon & Dark][Volumetric Lighting][Octane Render], " }
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

export const analyzeVisualStyleFromImages = async (
    images: string[], 
    language: string = 'Chinese'
): Promise<string> => {
    if (!images || images.length === 0) return "";

    const parts: any[] = [];
    images.forEach(img => {
        // Extract MIME type if present, otherwise default to image/png
        const match = img.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
        if (match) {
             parts.push({
                inlineData: {
                    mimeType: match[1],
                    data: match[2]
                }
            });
        } else {
            // Assume raw base64 is png if no header (fallback)
             parts.push({
                inlineData: {
                    mimeType: "image/png",
                    data: img
                }
            });
        }
    });

    parts.push({ text: "Analyze the common visual style of these images." });

    const prompt = `
You are **Agent A1: The Visual Director**.
Goal: Define a Global Visual DNA string based on the provided reference images.

**CRITICAL INSTRUCTION**: The output must be a standard style prefix string in the exact format:
"[Art Medium][Era Style][Color Scheme][Lighting Features][Texture Details], "

**REQUIREMENTS**:
1. Analyze the uploaded images to extract the common core visual features.
2. **Format**: Strictly use the brackets [] for each category.
3. **Content**:
   - [Art Medium]: e.g., [Digital Art], [Oil Painting], [Photography], [Anime]
   - [Era Style]: e.g., [Cyberpunk], [Victorian], [Modern], [1990s]
   - [Color Scheme]: e.g., [Neon & Dark], [Pastel], [High Contrast], [Desaturated]
   - [Lighting Features]: e.g., [Volumetric Lighting], [Soft Studio Light], [Cinematic Lighting]
   - [Texture Details]: e.g., [Octane Render], [Rough Sketch], [8k Photorealistic]
4. **Language**: The content inside brackets MUST be in ${language}.
5. **Forbidden**: Do NOT include any specific character names or story details.

Output **strictly** a valid JSON object. No markdown.
Example: { "visual_dna": "[Digital Art][Cyberpunk][Neon & Dark][Volumetric Lighting][Octane Render], " }
`;

    try {
        const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts },
            config: {
                systemInstruction: prompt,
                responseMimeType: "application/json",
                responseSchema: { type: Type.OBJECT, properties: { visual_dna: { type: Type.STRING } } }
            }
        }));
        const json = safeJsonParse<{visual_dna: string}>(response.text, { visual_dna: "" });
        return json.visual_dna;
    } catch (e) {
        console.error("Visual DNA from Images failed:", e);
        return "";
    }
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
You are the **Veo Cinematography Architect (VCA)**. You are an expert Director of Photography (DP) and Visual Engineer specialized in Google Veo.
**Objective:** Transmute literary narrative text (novels/scripts) into precise, physically descriptive video generation prompts (Shot Lists).
**Output Format:** Strict JSON Array (wrapped in a "scenes" object).

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

---

## 1. THE VEO FORMULA (Strict Syntax) 
Veo operates on pixel-level instructions, not narrative flow. For every shot, you must assemble the \`video_prompt\` using this prioritized sequence (The "Pyramid"): 

\`[CAMERA MOVEMENT & LENS] + [LIGHTING & PALETTE] + [SUBJECT VISUALS & ACTION] + [ENVIRONMENT & ATMOSPHERE] + [TECH SPECS]\`

---

## 2. TRANSLATION RULES (The "Director's Cut" Protocols) 
You must apply these rules to filter every line of input text: 

### Rule A: The "Unfilmable" Protocol (Psychology -> Physics) 
* **Trigger:** Text describes feelings, thoughts, smells, or abstract concepts (e.g., "He felt a wave of nostalgia," "She realized the truth"). 
* **Action:** You MUST convert these into visible physical manifestations or micro-expressions. 
* **Example:** "He felt anxious" -> *Prompt:* "Close-up, sweat beading on forehead, eyes darting left and right, biting lip." 

### Rule B: The "Dialogue" Protocol (Speech -> Reaction) 
* **Trigger:** Dialogue or spoken lines. 
* **Action:** Veo cannot generate synchronized speech. **DO NOT transcribe dialogue.** Instead, visualize the *emotion* of the speaker or the *reaction* of the listener. 
* **Example:** 
    * *Input:* John shouted, "Get out!" 
    * *Prompt:* "Medium shot. John pointing aggressively at the door, mouth open in a scream, veins on neck visible, face red with anger." (Focus on the physical act of shouting, not the words). 

### Rule C: Visual Anchor Locking (Consistency Enforcement) 
* **Trigger:** A character name from the GLOBAL CONTEXT appears. 
* **Action:** You MUST inject their specific \`[Visual Tags]\` (or refer to them by ID) into every single prompt where they appear. 
* **Prohibition:** Never allow a character to change clothes, hair, or features unless the script explicitly describes a costume change. If the Context says "G-One is white," he is white in every single frame. 

### Rule D: Style & Lighting Enforcement 
* **Action:** Apply the user-defined **Art Style/Lighting** to every shot to ensure continuity. If the style is "Cyberpunk," every prompt must include specific keywords like "neon," "volumetric fog," or "wet pavement." 

---

## 3. PROFESSIONAL VOCABULARY (Use These Terms) 
* **Camera:** Static, Pan (Left/Right), Tilt (Up/Down), Dolly (In/Out), Truck (Left/Right), Crane, Handheld (Shaky/Stabilized), FPV Drone, Orbit/Arc. 
* **Lens:** Wide (14mm/24mm), Standard (35mm/50mm), Telephoto (85mm/100mm), Anamorphic (Cinematic aspect ratio), Macro. 
* **Lighting:** Softbox, Hard Light, Rim Light (Backlight), Volumetric (God Rays), Practical Lights, Bioluminescent, Silhouette, Chiaroscuro (High Contrast). 

---

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
      "video_prompt": "(Strictly in ${language}).Example:Standard(35mm), Static Camera. [Lighting details]. [Character Visuals] + [Specific Action]. [Environment]. 4k, highly detailed.",
      "audio_dialogue": [{ "speaker": "Hero", "text": "(Tone) Line in ${language}" }],
      "audio_bgm": "Atmosphere and music description in ${language}",
      "audio_sfx": "Sound effects description in ${language}",
      "assetIds": ["hero_base", "loc_house"] 
    }
  ]
}
`;
};

export const regenerateScenePrompt = async (
    scene: Scene,
    assets: Asset[],
    style: GlobalStyle,
    language: string = 'Chinese'
): Promise<string> => {
    const activeAssets = assets.filter(a => scene.assetIds?.includes(a.id));
    
    const assetContext = activeAssets.map(a => 
        `Asset "${a.name}" (${a.type}): ${a.description}. Visual DNA: ${a.visualDna || ''}`
    ).join('\n');

    // Extract Style Prefix
    const visualDna = style.visualTags || "";
    const isStandardPrefix = visualDna.trim().startsWith("[") && visualDna.includes("]");
    // Use standard prefix if available, otherwise fallback to director/style name
    const stylePrefix = isStandardPrefix ? visualDna : `(Best quality, masterpiece, ${style.director?.selected || 'Cinematic'})`;

    const sysPrompt = `
    You are an AI Visual Prompt Engineer.
    Goal: Rewrite the Image Generation Prompt for a storyboard scene.
    
    Current Scene Visual Description: "${scene.visual_desc}"
    
    Selected Assets to Include (CRITICAL: You must explicitly describe these characters/items in the scene):
    ${assetContext}
    
    Global Style Prefix: ${stylePrefix}
    Target Aspect Ratio: ${style.aspectRatio || "16:9"}
    
    Instructions:
    1. Output ONLY the new prompt text. No explanations.
    2. The prompt should be comma-separated, high quality, suitable for Stable Diffusion / Midjourney.
    3. **MANDATORY**: Start the prompt with the Global Style Prefix exactly: "${stylePrefix}".
    4. Integrate the asset descriptions naturally into the scene action.
    5. Ensure the scene composition fits the target aspect ratio (${style.aspectRatio || "16:9"}).
    6. Do NOT include negative prompts.
    7. Language Requirement: The prompt MUST be written in ${language}.
    `;
    
    try {
        const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts: [{ text: sysPrompt }] }
        }));
        
        const text = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || "";
        return text.trim();
    } catch (e) {
        console.error("Failed to regenerate prompt", e);
        return scene.np_prompt;
    }
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
    // Format: [Standard Prefix] OR (Style: [Name], [Features])
    let stylePrefix = "";
    let generatedDna = "";

    // Helper to build prefix consistent with or without workStyle
    const buildPrefix = (visuals: string) => {
        // Standard Prefix Check: If it matches [Medium][Era]... return as is
        if (visuals && visuals.trim().startsWith("[") && visuals.includes("]")) {
            return visuals;
        }

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
        // Check if we already have a valid Standard Style Prefix
        // If so, reuse it to ensure consistency across chapters/batches
        const currentDna = style.visualTags || "";
        const isStandard = currentDna.trim().startsWith("[") && currentDna.includes("]");

        if (isStandard && (workStyle || textureStyle)) {
             generatedDna = currentDna;
             console.log("[Gemini] Reusing existing Visual DNA:", generatedDna);
        } else if (workStyle || textureStyle) {
             // Only regenerate if missing or non-standard
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
      let finalNpPrompt = scene.np_prompt;
      let finalVideoPrompt = scene.video_prompt;

      if (assets.length > 0) {
        assets.forEach(asset => {
            const regex = new RegExp(`\\{\\{?${asset.id}\\}?\\}`, 'gi');
            // Avoid duplicating global style if it's already in asset.visualDna (legacy) or empty
            const assetDna = (asset.visualDna && asset.visualDna !== style.visualTags) ? asset.visualDna : "";
            const injection = `(${asset.name}, ${asset.description}${assetDna ? `, ${assetDna}` : ""})`;
            finalNpPrompt = finalNpPrompt.replace(regex, injection);
            
            // For video prompt, if it contains the asset ID (optional but possible), we replace it too.
            // But mostly video_prompt relies on visual description.
            if (finalVideoPrompt && finalVideoPrompt.includes(asset.id)) {
                 finalVideoPrompt = finalVideoPrompt.replace(regex, injection);
            }
        });
      }
      console.log(`[Gemini] Merging prompt: ${stylePrefix} + ${finalNpPrompt}`);
      
      // New format: Style Prefix + Content
      finalNpPrompt = `${stylePrefix}, ${finalNpPrompt}`;
      
      // Also splice style prefix into video_prompt if it exists
      if (finalVideoPrompt) {
          // Check if stylePrefix is already there to avoid double prefixing (e.g. if LLM followed instruction perfectly)
          if (!finalVideoPrompt.startsWith(stylePrefix)) {
               finalVideoPrompt = `${stylePrefix}, ${finalVideoPrompt}`;
          }
      }

      return { ...scene, np_prompt: finalNpPrompt, video_prompt: finalVideoPrompt };
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

    // Force Aspect Ratio in Prompt for models that ignore config
    fullText = `${fullText}. --ar ${ar}`;

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

// --- VISUAL MASTER AGENT (Video Review) ---

export const reviewVideoPrompt = async (
    scene: Scene,
    language: string = 'Chinese'
): Promise<VisualReviewResult> => {
    const promptToReview = constructVideoPrompt(scene);
    
    const sysPrompt = `
You are the **Visual Master (Agent Visual Reviewer)**, acting as a Netflix Director.
Your Goal: Review the Video Generation Prompt for a short drama scene.

**Input Prompt:**
"${promptToReview}"

**CRITICAL CHECK: Veo3 Language Requirement**
Veo3 is an English-native model. 
If the Input Prompt contains non-English text (e.g., Chinese, Japanese), you MUST:
1. Mark it as a **Risk**: "Prompt is not in English (Veo3 optimal language)."
2. Suggest: "Translate to professional English cinematic prompt."
3. **STRONGLY CONSIDER** failing the review (passed: false) or giving a low score on "AI Tech Advantage" unless the prompt is extremely simple.

**Review Dimensions (10 Fixed Dimensions):**
1. **AI Logic/Consistency** (AI 生成内容是否存在穿帮问题): Check for logical inconsistencies or "hallucinations".
2. **Script Alignment** (镜头是否匹配剧本核心需求): Does it match the visual description?
3. **AI Tech Advantage** (是否充分发挥 AI 视觉创作的技术特长): Is it visually impressive?
4. **Audio-Visual Language** (视听语言设计是否合理): Composition, lighting, atmosphere.
5. **Scene Scheduling** (场景调度是否流畅自然): Action flow.
6. **Art Style Consistency** (美术风格是否统一且贴合主题): Consistency.
7. **Editing Rhythm** (剪辑节奏是否符合叙事逻辑): Pacing implied by prompt.
8. **Camera Language** (摄影与镜头语言运用是否恰当): Camera moves/angles.
9. **VFX & Production** (特效与美术制作是否达标): Quality of described elements.
10. **Sound Design Match** (拟音与声音设计是否适配画面): Audio/Visual sync.

**Output Requirements:**
- Provide a score (1-10) and brief comment for EACH dimension.
- List **Key Production Risks**.
- List **Actionable Suggestions**.
- **Final Verdict**: Pass (true) or Fail (false).
- **Language**: Output in ${language}.

**Response Format (JSON Only):**
{
  "passed": boolean,
  "dimensions": [
    { "name": "Dimension Name", "score": number, "comment": "string" }
  ],
  "risks": ["string"],
  "suggestions": ["string"]
}
`;

    try {
        const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts: [{ text: sysPrompt }] },
            config: {
                responseMimeType: "application/json"
            }
        }));
        
        const json = safeJsonParse<VisualReviewResult>(response.text, {
            passed: false,
            dimensions: [],
            risks: [],
            suggestions: []
        });
        return json;
    } catch (e) {
        console.error("Visual Master Review Failed", e);
        return {
            passed: false,
            dimensions: [],
            risks: ["Review failed"],
            suggestions: ["Retry review"]
        };
    }
};

export interface OptimizedVideoResult {
    prompt: string;
    specs: {
        duration?: string;
        camera?: string;
        lens?: string;
        vfx?: string;
    }
}

export const regenerateVideoPromptOptimized = async (
    scene: Scene,
    reviewResult: VisualReviewResult,
    language: string = 'Chinese',
    assets: Asset[] = [],
    globalStyle?: GlobalStyle
): Promise<OptimizedVideoResult> => {
    // Pass globalStyle to ensure the input prompt has the style prefix
    const currentPrompt = constructVideoPrompt(scene, globalStyle);
    
    // Build Asset Context
    const activeAssets = assets.filter(a => scene.assetIds?.includes(a.id));
    const assetContext = activeAssets.length > 0 
        ? `\n**Active Assets (Characters/Items):**\n${activeAssets.map(a => `- ${a.name} (${a.type}): ${a.description}`).join('\n')}`
        : "";

    // Extract Style Prefix for explicit instruction
    const stylePrefix = globalStyle?.visualTags ? `${globalStyle.visualTags}. ` : "";

    const sysPrompt = `
    You are a **Veo3 Video Prompt Expert**.
    Goal: Rewrite the video prompt based on the Visual Master's review to make it perfect for Veo3 video generation.
    Also, update the structured video specifications (duration, camera, lens, vfx) to match the optimized prompt.
    
    **Original Prompt:**
    "${currentPrompt}"
    ${assetContext}
    
    **Global Style Context:**
    ${stylePrefix}
    
    **Current Specs (USER DEFINED - STRICT):**
    Duration: ${scene.video_duration || '3s'}
    Camera: ${scene.video_camera || 'Static'}
    Lens: ${scene.video_lens || 'Standard'}
    VFX: ${scene.video_vfx || 'None'}
    
    **Review Feedback:**
    Risks: ${reviewResult.risks.join('; ')}
    Suggestions: ${reviewResult.suggestions.join('; ')}
    
    **Instructions:**
    1. Fix all issues mentioned in the review.
    2. Optimize for Veo3 (${language} text, cinematic keywords, specific camera moves).
    3. Ensure the prompt is under 800 characters.
    4. Maintain the original core meaning of the scene.
    5. **CRITICAL**: Integrate the visual descriptions of the Active Assets into the prompt naturally.
    6. **CRITICAL**: If an asset was previously described but is NOT listed in **Active Assets** above, you MUST REMOVE its specific visual description from the prompt. The prompt must ONLY describe the assets listed in Active Assets (plus the general scene environment).
    7. **STRICT FORMAT ENFORCEMENT**: The prompt MUST follow this exact structure:
       \`[Style Prefix], [Camera & Lens], [Lighting & Atmosphere], [Subject & Action], [Environment], [Tech Specs]\`
    8. **MANDATORY**: Start the prompt with the Global Style Prefix exactly: "${stylePrefix}".
    9. **MANDATORY**: The [Camera & Lens] section MUST explicitly use the values from "Current Specs". If the spec says "28mm", the prompt MUST contain "28mm" or equivalent visual description. If there is a conflict between the original prompt and the specs, THE SPECS WIN.
    10. **CRITICAL**: Update the video specs (duration, camera, lens, vfx) to be consistent with your new prompt.
    
    **Response Format (JSON Only):**
    {
      "prompt": "The optimized Veo3 prompt in ${language}...",
      "specs": {
        "duration": "e.g. 4s",
        "camera": "e.g. Dolly In, Pan Right",
        "lens": "e.g. 35mm, Macro",
        "vfx": "e.g. Slow Motion, Particles"
      }
    }
    `;
    
    try {
        const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts: [{ text: sysPrompt }] },
            config: {
                responseMimeType: "application/json"
            }
        }));
        
        const json = safeJsonParse<OptimizedVideoResult>(response.text, {
            prompt: currentPrompt,
            specs: {}
        });

        // Force prepend style prefix if missing (Double Safety)
        if (stylePrefix && !json.prompt.startsWith(stylePrefix.trim())) {
             // Check if it's already there but slightly different?
             // Simple check: just prepend if not starts with.
             json.prompt = `${stylePrefix}${json.prompt}`;
        }

        // --- FINAL SAFEGUARD: Force Override Specs in Prompt ---
        // If the prompt still says "35mm" but spec says "32mm", we must fix it.
        const lensSpec = scene.video_lens || "";
        if (lensSpec) {
             // Regex to find things like "35mm", "85mm lens", "50mm prime"
             // We replace any "XXmm" that is NOT the spec with the spec
             const lensRegex = /(\d+)mm/gi;
             const targetLens = lensSpec.match(/(\d+)mm/i)?.[0]; // e.g. "32mm"

             if (targetLens) {
                 json.prompt = json.prompt.replace(lensRegex, (match) => {
                     // If match is exactly what we want, keep it.
                     if (match.toLowerCase() === targetLens.toLowerCase()) return match;
                     // Otherwise replace
                     return targetLens;
                 });
                 
                 // If not found at all, append it? Maybe safer not to blindly append, 
                 // but "Cinematic Shot: ..." usually works well with lens at the end or near "Cinematic".
                 // Let's just trust the regex replacement for now to fix conflicts.
             }
        }

        return json;
    } catch (e) {
        console.error("Video Prompt Regeneration Failed", e);
        return { prompt: currentPrompt, specs: {} };
    }
};

export const updateVideoPromptDirectly = async (
    scene: Scene,
    language: string = 'Chinese',
    assets: Asset[] = [],
    globalStyle?: GlobalStyle
): Promise<OptimizedVideoResult> => {
    // Pass globalStyle to ensure the input prompt has the style prefix
    const currentPrompt = constructVideoPrompt(scene, globalStyle);
    
    // Build Asset Context
    const activeAssets = assets.filter(a => scene.assetIds?.includes(a.id));
    const assetContext = activeAssets.length > 0 
        ? `\n**Active Assets (Characters/Items):**\n${activeAssets.map(a => `- ${a.name} (${a.type}): ${a.description}`).join('\n')}`
        : "";

    // Extract Style Prefix for explicit instruction
    const stylePrefix = globalStyle?.visualTags ? `${globalStyle.visualTags}. ` : "";

    const sysPrompt = `
    You are a **Veo3 Video Prompt Expert**.
    Goal: Update the video prompt to incorporate new assets or specifications.
    
    **Original Prompt:**
    "${currentPrompt}"
    ${assetContext}
    
    **Global Style Context:**
    ${stylePrefix}
    
    **Current Specs (USER DEFINED - STRICT):**
    Duration: ${scene.video_duration || '3s'}
    Camera: ${scene.video_camera || 'Static'}
    Lens: ${scene.video_lens || 'Standard'}
    VFX: ${scene.video_vfx || 'None'}
    
    **Instructions:**
    1. Update the prompt to reflect the Current Specs and Active Assets.
    2. Optimize for Veo3 (${language} text, cinematic keywords, specific camera moves).
    3. Ensure the prompt is under 800 characters.
    4. Maintain the original core meaning of the scene.
    5. **CRITICAL**: Integrate the visual descriptions of the Active Assets into the prompt naturally.
    6. **CRITICAL**: If an asset was previously described but is NOT listed in **Active Assets** above, you MUST REMOVE its specific visual description from the prompt.
    7. **STRICT FORMAT ENFORCEMENT**: The prompt MUST follow this exact structure:
       \`[Style Prefix], [Camera & Lens], [Lighting & Atmosphere], [Subject & Action], [Environment], [Tech Specs]\`
    8. **MANDATORY**: Start the prompt with the Global Style Prefix exactly: "${stylePrefix}".
    9. **MANDATORY**: The [Camera & Lens] section MUST explicitly use the values from "Current Specs".
    
    **Response Format (JSON Only):**
    {
      "prompt": "The optimized Veo3 prompt in ${language}...",
      "specs": {
        "duration": "e.g. 4s",
        "camera": "e.g. Dolly In, Pan Right",
        "lens": "e.g. 35mm, Macro",
        "vfx": "e.g. Slow Motion, Particles"
      }
    }
    `;
    
    try {
        const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts: [{ text: sysPrompt }] },
            config: {
                responseMimeType: "application/json"
            }
        }));
        
        const json = safeJsonParse<OptimizedVideoResult>(response.text, {
            prompt: currentPrompt,
            specs: {}
        });

        if (stylePrefix && !json.prompt.startsWith(stylePrefix.trim())) {
             json.prompt = `${stylePrefix}${json.prompt}`;
        }
        
        // Fix Lens Spec Conflicts
        const lensSpec = scene.video_lens || "";
        if (lensSpec) {
             const lensRegex = /(\d+)mm/gi;
             const targetLens = lensSpec.match(/(\d+)mm/i)?.[0];
             if (targetLens) {
                 json.prompt = json.prompt.replace(lensRegex, (match) => {
                     if (match.toLowerCase() === targetLens.toLowerCase()) return match;
                     return targetLens;
                 });
             }
        }

        return json;
    } catch (e) {
        console.error("Video Prompt Direct Update Failed", e);
        return { prompt: currentPrompt, specs: {} };
    }
};
