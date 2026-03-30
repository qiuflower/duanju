import { GenerateContentResponse } from "../../../shared/types";
import { PROMPTS } from "../../../domain/generation/prompt";
import { retryWithBackoff, safeJsonParse, wait, Type, ai } from "../helpers";
import { MODELS } from "../model-manager";
import { NarrativeBlueprint, MasterBeatSheet } from "./types";
import { ScriptSegment, formatSegmentsForAnnotation, countBeatSegments } from "./script-segmenter";

// --- AGENT 2: VISUAL DIRECTOR ---

const MAX_RETRIES = 3;

const agent2Schema = {
    type: Type.OBJECT,
    properties: {
        visual_strategy: {
            type: Type.OBJECT,
            properties: {
                core_atmosphere: { type: Type.STRING },
                key_lens_design: {
                    type: Type.OBJECT,
                    properties: {
                        opening_hook: { type: Type.STRING },
                        metaphor: { type: Type.STRING }
                    }
                }
            }
        },
        beats: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    beat_id: { type: Type.STRING },
                    shot_id: { type: Type.STRING },
                    shot_name: { type: Type.STRING },
                    visual_action: { type: Type.STRING },
                    camera_movement: { type: Type.STRING },
                    lighting: { type: Type.STRING },
                    audio_subtext: { type: Type.STRING },
                    asset_ids: { type: Type.ARRAY, items: { type: Type.STRING } },
                    narrative_function: { type: Type.STRING },
                    cause_from: { type: Type.STRING },
                    emotional_intensity: { type: Type.NUMBER },
                    duration: { type: Type.STRING }
                },
                required: ["beat_id", "shot_id", "visual_action", "camera_movement", "lighting", "audio_subtext", "narrative_function", "cause_from", "emotional_intensity"]
            }
        }
    },
    required: ["beats"]
};

/**
 * 解析并规范化 Agent2 的 AI 响应
 */
function parseAgent2Response(responseText: string | undefined): MasterBeatSheet {
    let result = safeJsonParse<MasterBeatSheet>(responseText, {
        visual_strategy: { core_atmosphere: "", key_lens_design: { opening_hook: "", metaphor: "" } },
        beats: []
    });

    if (Array.isArray(result) && result.length > 0) {
        if (result[0].beats) {
            result = result[0] as MasterBeatSheet;
        } else if (result.some((item: any) => item.beat_id !== undefined)) {
            const strategyItem = result.find((item: any) => item.visual_strategy) as any;
            result = {
                visual_strategy: strategyItem?.visual_strategy || { core_atmosphere: "", key_lens_design: { opening_hook: "", metaphor: "" } },
                beats: result.filter((item: any) => item.beat_id !== undefined)
            } as MasterBeatSheet;
        }
    }

    const beats = (result.beats && Array.isArray(result.beats)) ? result.beats : [];
    if (beats.length === 0) {
        throw new Error(`[Agent2] Validation failed: beats array is empty.`);
    }

    beats.sort((a, b) => {
        const numA = parseInt(a.beat_id.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.beat_id.replace(/\D/g, '')) || 0;
        return numA - numB;
    });

    return {
        visual_strategy: result.visual_strategy || { core_atmosphere: "", key_lens_design: { opening_hook: "", metaphor: "" } },
        beats
    };
}

/**
 * 标注模式：为预分段片段添加镜头标注 (1:1 剧本还原)
 */
export const runAgent2_Annotation = async (
    segments: ScriptSegment[],
    language: string,
    lensLibraryPrompt: string
): Promise<MasterBeatSheet> => {
    const beatCount = countBeatSegments(segments);
    const formattedSegments = formatSegmentsForAnnotation(segments);

    const sysPrompt = PROMPTS.AGENT_2_ANNOTATE(language, lensLibraryPrompt, beatCount);

    console.log(`[Agent2/Annotate] ${segments.length} segments → ${beatCount} beats expected`);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            if (attempt > 1) {
                console.warn(`[Agent2/Annotate][Retry ${attempt}/${MAX_RETRIES}] Retrying annotation...`);
            }

            const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
                model: MODELS.TEXT_FAST,
                contents: { parts: [{ text: `以下是已拆分好的 ${beatCount} 个剧本片段。请为每个片段标注镜头语言。\n⚠️ 必须输出恰好 ${beatCount} 个 beats，禁止合并或删除！\n\n${formattedSegments}` }] },
                config: {
                    systemInstruction: sysPrompt,
                    responseMimeType: "application/json",
                    responseSchema: agent2Schema
                }
            }));

            const result = parseAgent2Response(response.text);

            // 标注模式校验：输出 beat 数应接近预期
            if (result.beats.length < beatCount * 0.7) {
                console.warn(`[Agent2/Annotate] Expected ${beatCount} beats but got ${result.beats.length}. Retrying...`);
                throw new Error(`Beat count mismatch: expected ~${beatCount}, got ${result.beats.length}`);
            }

            // 【终极完美方案】：程序化硬接驳场景上下文
            // 无论大模型是否乖乖听话把场景写进了 visual_action，我们都在代码层将其强制合并！
            const beatSegments = segments.filter(s => s.type !== 'transition' && s.type !== 'scene_header');
            const segmentMap = new Map<string, ScriptSegment>();
            beatSegments.forEach((seg, idx) => {
                const sid = `S${String(idx + 1).padStart(2, '0')}`;
                segmentMap.set(sid, seg);
            });

            result.beats = result.beats.map(beat => {
                const seg = segmentMap.get(beat.beat_id);
                if (seg) {
                    const ctxString = seg.scene_context ? `【环境位置：${seg.scene_context.trim()}】\n` : '';
                    let addon = beat.visual_action || '';

                    // 防呆处理：去除大模型可能手欠带出的环境名或原文残留
                    // 评审修复：禁止将不受信的 scene_context 直接传入 new RegExp，防止包含()等字符导致死循环或崩溃
                    if (seg.scene_context) {
                        addon = addon.split(seg.scene_context.trim()).join('');
                        addon = addon.replace(/【环境位置.*?】/g, '');
                    }
                    addon = addon.split(seg.raw_text).join(''); // 安全全量替换原文纯文本
                    addon = addon.replace(/原文内容:|\[画面补充\]:|\[场景.*?\]|【场景.*?】/g, '').trim();

                    beat.visual_action = `${ctxString}原文内容：${seg.raw_text}\n[画面补充]：${addon || '无'}`;
                }
                return beat;
            });

            console.log(`[Agent2/Annotate] Success: ${result.beats.length} beats generated (expected ${beatCount}), applied deterministic scene context mapping.`);
            return result;
        } catch (e: any) {
            console.error(`[Agent2/Annotate][Retry ${attempt}/${MAX_RETRIES}] failed:`, e?.message || e);
            if (attempt >= MAX_RETRIES) {
                throw new Error(`[Agent2/Annotate] Failed after ${MAX_RETRIES} retries: ${e?.message || e}`);
            }
            await wait(Math.pow(2, attempt) * 2000);
        }
    }

    throw new Error(`[Agent2/Annotate] Exhausted all retries.`);
};

