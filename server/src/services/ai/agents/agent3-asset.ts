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

    const usedShotIds = [...new Set((beatSheet.beats || []).map(b => b.shot_id).filter(Boolean))] as string[];
    const filteredLensLibrary = toDetailedLensLibrary(usedShotIds);

    const sysPrompt = PROMPTS.AGENT_3_ASSET_PRODUCER(filteredLensLibrary, language, stylePrefix, assetMap, aspectRatio);

    const allBeats = beatSheet.beats || [];
    if (allBeats.length === 0) return [];

    // 动态批处理：按 beat 数量自适应分批，每批最多 MAX_BEATS_PER_BATCH 个
    const MAX_BEATS_PER_BATCH = 10;
    const totalBeats = allBeats.length;
    const batchCount = Math.max(1, Math.ceil(totalBeats / MAX_BEATS_PER_BATCH));
    const batchSize = Math.ceil(totalBeats / batchCount);

    let allScenes: Scene[] = [];
    let prevBatchEndContext = '';

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
                        required: ["id", "narration", "visual_desc", "np_prompt", "assetIds"]
                    }
                }
            },
            required: ["scenes"]
        };

        const MAX_BATCH_RETRIES = 3;
        let batchSuccess = false;

        const prevBatchLastBeatId = i > 0 ? allBeats[start - 1]?.beat_id : null;
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
                    // 结构化上下文：含运镜、音效，提升跨批次连贯性
                    prevBatchEndContext = [
                        lastScene.visual_desc || '',
                        `video_prompt 尾段: ${(lastScene.video_prompt || '').slice(-200)}`,
                        lastScene.video_camera ? `运镜: ${lastScene.video_camera}` : '',
                        lastScene.audio_sfx ? `音效: ${lastScene.audio_sfx}` : ''
                    ].filter(Boolean).join(' | ');
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

    // ── LLM 二次审查：语义匹配资产 ──
    // 纯字符串匹配无法解决"车厢内" ≈ "中巴车内部"这类语义同义问题
    // 用一次轻量 LLM 调用进行语义级别的资产-场景匹配
    if (allScenes.length > 0 && assets.length > 0) {
        try {
            if (onProgress) onProgress('Asset Matching: Semantic review...');
            const enrichedScenes = await semanticAssetMatch(allScenes, assets);
            allScenes = enrichedScenes;
        } catch (e: any) {
            console.warn('[Agent3] Semantic asset match failed (non-fatal, keeping regex results):', e?.message || e);
        }
    }

    return allScenes;
};

/**
 * LLM 语义资产匹配器 — 二次审查
 * 将所有场景的 visual_desc 和完整资产清单发给 LLM，
 * 让它基于语义理解返回每个场景应该关联的 asset_id 列表。
 */
async function semanticAssetMatch(scenes: Scene[], assets: Asset[]): Promise<Scene[]> {
    const assetCatalog = assets.map(a => `${a.id} | ${a.name} | ${a.type || 'unknown'}`).join('\n');
    const sceneList = scenes.map(s => `${s.id} | ${s.visual_desc || s.narration || ''}`).join('\n');

    const matchSchema = {
        type: Type.OBJECT,
        properties: {
            matches: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        scene_id: { type: Type.STRING },
                        asset_ids: { type: Type.ARRAY, items: { type: Type.STRING } }
                    },
                    required: ["scene_id", "asset_ids"]
                }
            }
        },
        required: ["matches"]
    };

    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
        model: MODELS.TEXT_FAST,
        contents: {
            parts: [{
                text: `请为以下每个场景匹配所有相关的资产ID。

## 资产清单 (id | name | type)
${assetCatalog}

## 场景列表 (scene_id | visual_desc)
${sceneList}

规则：
1. 基于语义理解匹配。例如场景提到"车厢内"，应匹配到"中巴车内部"资产。场景提到某角色，应匹配该角色的资产ID。
2. 每个场景至少匹配1个location类型资产（如果有的话）和所有出现的character资产。
3. 只返回资产清单中存在的ID，禁止编造。` }]
        },
        config: {
            systemInstruction: '你是资产匹配专家。根据场景描述内容，精准匹配所有语义相关的资产。输出JSON格式。',
            responseMimeType: "application/json",
            responseSchema: matchSchema
        }
    }));

    const parsed = safeJsonParse<any>(response.text, { matches: [] });
    const matchMap = new Map<string, string[]>();

    const validIds = new Set(assets.map(a => a.id));
    for (const m of (parsed.matches || [])) {
        if (m.scene_id && Array.isArray(m.asset_ids)) {
            // 只保留有效的资产 ID
            const validMatches = m.asset_ids.filter((id: string) => validIds.has(id));
            matchMap.set(m.scene_id, validMatches);
        }
    }

    // 合并：将 LLM 语义匹配结果与已有的 regex 匹配结果取并集
    return scenes.map(scene => {
        const llmIds = matchMap.get(scene.id) || [];
        const existingIds = new Set(scene.assetIds || []);
        for (const id of llmIds) {
            existingIds.add(id);
        }
        return { ...scene, assetIds: [...existingIds] };
    });
}
