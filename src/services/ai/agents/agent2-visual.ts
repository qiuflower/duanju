import { GenerateContentResponse } from "@/shared/types";
import { PROMPTS } from "@/domain/generation/prompts";
import { retryWithBackoff, safeJsonParse, Type, ai } from "../helpers";
import { MODELS } from "../model-manager";
import { NarrativeBlueprint, MasterBeatSheet } from "./types";

// --- AGENT 2: VISUAL DIRECTOR ---

export const runAgent2_VisualDirection = async (
    blueprint: NarrativeBlueprint,
    language: string,
    lensLibraryPrompt: string
): Promise<MasterBeatSheet> => {
    const blueprintStr = JSON.stringify(blueprint);

    const sysPrompt = PROMPTS.AGENT_2_VISUAL(language, lensLibraryPrompt);

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
                        asset_ids: { type: Type.ARRAY, items: { type: Type.STRING } }
                    },
                    required: ["beat_id", "shot_id", "visual_action", "camera_movement", "lighting", "audio_subtext"]
                }
            }
        },
        required: ["beats"]
    };

    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
        model: MODELS.TEXT_FAST,
        contents: { parts: [{ text: `Generate the complete Visual Beat Sheet (ALL beats from S01 to End) for the following Blueprint:\n${blueprintStr}` }] },
        config: {
            systemInstruction: sysPrompt,
            responseMimeType: "application/json",
            responseSchema: agent2Schema
        }
    }));

    let result = safeJsonParse<MasterBeatSheet>(response.text, {
        visual_strategy: { core_atmosphere: "", key_lens_design: { opening_hook: "", metaphor: "" } },
        beats: []
    });

    // AI sometimes returns non-standard array formats — normalize
    if (Array.isArray(result) && result.length > 0) {
        if (result[0].beats) {
            console.warn(`[Agent2] Response wrapped in array, unwrapping.`);
            result = result[0] as MasterBeatSheet;
        } else if (result.some((item: any) => item.beat_id !== undefined)) {
            console.warn(`[Agent2] Response is a flat array of beats, reassembling.`);
            const strategyItem = result.find((item: any) => item.visual_strategy) as any;
            result = {
                visual_strategy: strategyItem?.visual_strategy || { core_atmosphere: "", key_lens_design: { opening_hook: "", metaphor: "" } },
                beats: result.filter((item: any) => item.beat_id !== undefined)
            } as MasterBeatSheet;
        }
    }

    const beats = (result.beats && Array.isArray(result.beats)) ? result.beats : [];

    beats.sort((a, b) => {
        const numA = parseInt(a.beat_id.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.beat_id.replace(/\D/g, '')) || 0;
        return numA - numB;
    });

    return {
        visual_strategy: result.visual_strategy || { core_atmosphere: "", key_lens_design: { opening_hook: "", metaphor: "" } },
        beats
    };
};
