import { Scene, Asset, GenerateContentResponse } from "../../../shared/types";
import { PROMPTS } from "../../../domain/generation/prompt";
import { toDetailedLensLibrary } from "../../../domain/generation/core-lenses";
import { retryWithBackoff, safeJsonParse, wait, Type, ai } from "../helpers";
import { MODELS } from "../model-manager";
import { MasterBeatSheet } from "./types";
import { ASSET_TAG_REGEX, resolveTagToAsset, injectTagIds, isStoryboardTag } from "../../../shared/asset-tags";

// --- AGENT 3: ASSET PRODUCER ---

export const runAgent3_AssetProduction = async (
    beatSheet: MasterBeatSheet,
    language: string,
    assets: Asset[],
    stylePrefix: string,
    aspectRatio: string = '16:9',
    onProgress?: (msg: string) => void
): Promise<Scene[]> => {
    const assetMap = assets.map(a => `[@图像_${a.name}#${a.id}] → DNA: ${a.visualDna || ''}, Desc: ${a.description}`).join('\n');

    const usedShotIds = [...new Set((beatSheet.beats || []).map(b => b.shot_id).filter(Boolean))];
    const filteredLensLibrary = toDetailedLensLibrary(usedShotIds);

    const sysPrompt = PROMPTS.AGENT_3_ASSET_PRODUCER(filteredLensLibrary, language, stylePrefix, assetMap, aspectRatio);

    const allBeats = beatSheet.beats || [];
    if (allBeats.length === 0) return [];

    const MIN_TOTAL_BEATS = 25;
    const MAX_TOTAL_BEATS = 32;
    const FIXED_BATCH_COUNT = 4;
    const clampedBeats = allBeats.slice(0, MAX_TOTAL_BEATS);
    if (clampedBeats.length < MIN_TOTAL_BEATS) {
        // Below minimum beats threshold — proceed silently with available beats
    }
    const totalBeats = clampedBeats.length;
    const batchCount = FIXED_BATCH_COUNT;
    const batchSize = Math.ceil(totalBeats / batchCount);

    let allScenes: Scene[] = [];
    let prevBatchEndContext = '';

    for (let i = 0; i < batchCount; i++) {
        const start = i * batchSize;
        const end = Math.min(start + batchSize, totalBeats);
        if (start >= totalBeats) break;

        const batchBeats = clampedBeats.slice(start, end);
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
                        required: ["id", "narration", "visual_desc", "np_prompt", "assetIds"]
                    }
                }
            },
            required: ["scenes"]
        };

        const MAX_BATCH_RETRIES = 3;
        let batchSuccess = false;

        const prevBatchLastBeatId = i > 0 ? clampedBeats[start - 1]?.beat_id : null;
        const continuityHint = prevBatchEndContext && prevBatchLastBeatId
            ? `\n⚠️ 衔接锚点: 上一个片段结束镜头为 [@图像_分镜${prevBatchLastBeatId}]，画面内容: "${prevBatchEndContext}"\n本批次第一个 beat（${batchBeats[0]?.beat_id || 'S??'}）的 video_prompt 0-2秒 必须引用 [@图像_分镜${prevBatchLastBeatId}] 作为首帧衔接锚点，从该画面自然过渡，禁止跳切。\n\n`
            : '';

        for (let attempt = 1; attempt <= MAX_BATCH_RETRIES; attempt++) {
            try {
                if (onProgress) {
                    onProgress(`Asset Production: Batch ${i + 1}/${batchCount}${attempt > 1 ? ` [Retry ${attempt}/${MAX_BATCH_RETRIES}]` : ''}...`);
                }

                const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
                    model: MODELS.TEXT_FAST,
                    contents: { parts: [{ text: `${continuityHint}Translate these beats (Batch ${i + 1}/${batchCount}) into Scenes:\n${beatsStr}` }] },
                    config: {
                        systemInstruction: sysPrompt,
                        responseMimeType: "application/json",
                        responseSchema: agent3Schema
                    }
                }));

                const parsed = safeJsonParse<any>(response.text, { scenes: [] });

                let batchScenes: Scene[];
                if (Array.isArray(parsed) && parsed.length > 0) {
                    if (parsed[0].scenes) {
                        batchScenes = parsed[0].scenes;
                    } else if (parsed.some((item: any) => item.id !== undefined && item.np_prompt !== undefined)) {
                        batchScenes = parsed.filter((item: any) => item.id !== undefined && item.np_prompt !== undefined);
                    } else {
                        batchScenes = parsed;
                    }
                } else {
                    batchScenes = parsed.scenes || [];
                }

                if (batchScenes.length === 0) {
                    throw new Error(`Batch returned 0 scenes (expected ${batchBeats.length})`);
                }

                const validatedScenes = batchScenes.map(scene => {
                    let np = scene.np_prompt || "";
                    if (!np.includes(`--ar ${aspectRatio} --v 6.0`)) {
                        np = np.replace(/--ar\s+\S+/g, '').trim();
                        np = `${np} --ar ${aspectRatio} --v 6.0`;
                    }

                    const allPromptText = `${scene.video_prompt || ''} ${np}`;
                    const tagMatches = [...allPromptText.matchAll(ASSET_TAG_REGEX)];
                    const matchedIds = new Set<string>();

                    for (const m of tagMatches) {
                        const tagName = m[1];
                        const anchoredId = m[2];
                        if (isStoryboardTag(tagName)) continue;

                        const resolved = resolveTagToAsset(
                            { name: tagName, id: anchoredId },
                            assets
                        );
                        if (resolved) matchedIds.add(resolved.id);
                    }

                    const validAssetIdSet = new Set(assets.map(a => a.id));
                    for (const id of (scene.assetIds || [])) {
                        if (validAssetIdSet.has(id)) {
                            matchedIds.add(id);
                        }
                    }

                    const videoPrompt = injectTagIds(scene.video_prompt || '', assets);
                    const npPrompt = injectTagIds(np, assets);

                    return { ...scene, video_prompt: videoPrompt, np_prompt: npPrompt, assetIds: [...matchedIds] };
                });

                allScenes.push(...validatedScenes);

                if (validatedScenes.length > 0) {
                    const lastScene = validatedScenes[validatedScenes.length - 1];
                    prevBatchEndContext = (lastScene.visual_desc || '') + ' | ' + (lastScene.video_prompt || '').slice(-100);
                }

                batchSuccess = true;
                break;
            } catch (batchError: any) {
                console.error(`[Agent3][Batch ${i + 1}/${batchCount}][Retry ${attempt}/${MAX_BATCH_RETRIES}] failed (beats ${start}-${end}):`, batchError?.message || batchError);
                if (attempt < MAX_BATCH_RETRIES) {
                    await wait(Math.pow(2, attempt) * 2000);
                }
            }
        }

        if (!batchSuccess) {
            const msg = `[Agent3][Batch ${i + 1}/${batchCount}] beats ${start}-${end} failed after ${MAX_BATCH_RETRIES} retries.`;
            console.error(msg);
            if (onProgress) {
                onProgress(`⚠ Batch ${i + 1}/${batchCount} failed after ${MAX_BATCH_RETRIES} retries.`);
            }
            throw new Error(msg);
        }
    }

    return allScenes;
};
