import { Scene, Asset, GenerateContentResponse } from "@/shared/types";
import { PROMPTS } from "@/domain/generation/prompts";
import { toDetailedLensLibrary } from "@/domain/generation/core-lenses";
import { retryWithBackoff, safeJsonParse, wait, Type, ai } from "../helpers";
import { MODELS } from "../model-manager";
import { MasterBeatSheet } from "./types";

// --- AGENT 3: ASSET PRODUCER ---

export const runAgent3_AssetProduction = async (
    beatSheet: MasterBeatSheet,
    language: string,
    assets: Asset[],
    stylePrefix: string,
    aspectRatio: string = '16:9',
    onProgress?: (msg: string) => void
): Promise<Scene[]> => {
    const assetMap = assets.map(a => `ID: ${a.id}, Name: ${a.name}, DNA: ${a.visualDna || ''}, Desc: ${a.description}`).join('\n');

    // Use only the lenses that Agent 2 selected (via shot_id in beats)
    const usedShotIds = [...new Set((beatSheet.beats || []).map(b => b.shot_id).filter(Boolean))];
    const filteredLensLibrary = toDetailedLensLibrary(usedShotIds);

    const sysPrompt = PROMPTS.AGENT_3_ASSET_PRODUCER(filteredLensLibrary, language, stylePrefix, assetMap, aspectRatio);

    const allBeats = beatSheet.beats || [];
    if (allBeats.length === 0) return [];

    const totalBeats = allBeats.length;
    const MAX_BEATS_PER_BATCH = 8;
    const batchCount = Math.max(1, Math.ceil(totalBeats / MAX_BEATS_PER_BATCH));
    const batchSize = Math.ceil(totalBeats / batchCount);

    let allScenes: Scene[] = [];

    for (let i = 0; i < batchCount; i++) {
        const start = i * batchSize;
        const end = Math.min(start + batchSize, totalBeats);
        if (start >= totalBeats) break;

        const batchBeats = allBeats.slice(start, end);

        const beatsStr = JSON.stringify(batchBeats);

        const agent3Schema = {
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
                            video_duration: { type: Type.STRING },
                            video_camera: { type: Type.STRING },
                            video_lens: { type: Type.STRING },
                            video_vfx: { type: Type.STRING },
                            np_prompt: { type: Type.STRING },
                            video_prompt: { type: Type.STRING },
                            audio_dialogue: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        speaker: { type: Type.STRING },
                                        text: { type: Type.STRING }
                                    },
                                    required: ["speaker", "text"]
                                }
                            },
                            audio_sfx: { type: Type.STRING },
                            audio_bgm: { type: Type.STRING },
                            assetIds: { type: Type.ARRAY, items: { type: Type.STRING } }
                        },
                        required: ["id", "narration", "visual_desc", "np_prompt"]
                    }
                }
            },
            required: ["scenes"]
        };

        const MAX_BATCH_RETRIES = 2;
        let batchSuccess = false;

        for (let attempt = 1; attempt <= MAX_BATCH_RETRIES; attempt++) {
            try {
                if (onProgress) {
                    onProgress(`Asset Production: Batch ${i + 1}/${batchCount}${attempt > 1 ? ` (retry ${attempt})` : ''}...`);
                }

                const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
                    model: MODELS.TEXT_FAST,
                    contents: { parts: [{ text: `Translate these beats (Batch ${i + 1}/${batchCount}) into Scenes:\n${beatsStr}` }] },
                    config: {
                        systemInstruction: sysPrompt,
                        responseMimeType: "application/json",
                        responseSchema: agent3Schema
                    }
                }));

                const parsed = safeJsonParse<any>(response.text, { scenes: [] });
                const batchScenes: Scene[] = Array.isArray(parsed) ? parsed : (parsed.scenes || []);

                if (batchScenes.length === 0) {
                    throw new Error(`Batch returned 0 scenes (expected ${batchBeats.length})`);
                }

                const validatedScenes = batchScenes.map(scene => {
                    let np = scene.np_prompt || "";
                    if (!np.includes(`--ar ${aspectRatio} --v 6.0`)) {
                        // Remove any existing --ar tag first
                        np = np.replace(/--ar\s+\S+/g, '').trim();
                        np = `${np} --ar ${aspectRatio} --v 6.0`;
                    }
                    return { ...scene, np_prompt: np };
                });

                allScenes.push(...validatedScenes);
                batchSuccess = true;
                break;
            } catch (batchError: any) {
                console.error(`[Agent3] Batch ${i + 1}/${batchCount} attempt ${attempt}/${MAX_BATCH_RETRIES} failed (beats ${start}-${end}):`, batchError?.message || batchError);
                if (attempt < MAX_BATCH_RETRIES) {
                    await wait(Math.pow(2, attempt) * 2000);
                }
            }
        }

        if (!batchSuccess) {
            console.error(`[Agent3] Batch ${i + 1}/${batchCount} (beats ${start}-${end}) permanently failed after ${MAX_BATCH_RETRIES} retries.`);
            if (onProgress) {
                onProgress(`⚠ Batch ${i + 1}/${batchCount} failed after ${MAX_BATCH_RETRIES} retries, ${end - start} scenes skipped.`);
            }
        }
    }

    return allScenes;
};
