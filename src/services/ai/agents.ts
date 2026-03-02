import { Scene, Asset, GlobalStyle, GenerateContentResponse } from "@/shared/types";
import { PROMPTS } from "@/domain/generation/prompts";
import { CORE_LENSES } from "@/domain/generation/core-lenses";
import { retryWithBackoff, safeJsonParse, wait, Type, ai } from "./helpers";

// --- AGENT PIPELINE INTERFACES ---

export interface NarrativeBlueprint {
    batch_meta: {
        narrative_state: { current_tension: string; open_loops: string[] }
    };
    episodes: {
        episode_number: number;
        title: string;
        logline: string;
        structure_breakdown: {
            hook_0_15s: { narrative_action: string; visual_intent: string; connection_to_prev?: string };
            incident_15_60s: { narrative_action: string; pacing?: string };
            rising_action_60_180s: { key_beats: string[] };
            climax_spectacle_180_240s: { narrative_action: string; visual_spectacle_requirement: string; emotional_tone?: string };
            cliffhanger_last_15s: { narrative_action: string; question_posed: string };
        };
        character_instructions: Record<string, string>;
    }[];
}

export interface VisualBeat {
    beat_id: string;
    shot_id: string;
    shot_name?: string;
    visual_action: string;
    camera_movement: string;
    lighting: string;
    audio_subtext: string;
    asset_ids?: string[];
}

export interface MasterBeatSheet {
    visual_strategy: {
        core_atmosphere: string;
        key_lens_design: { opening_hook: string; metaphor: string };
    };
    beats: VisualBeat[];
}

// --- AGENT 1: NARRATIVE ARCHITECT ---

const runAgent1_NarrativeAnalysis = async (
    text: string,
    language: string,
    prevContext: string,
    episodeCount?: number,
    onProgress?: (msg: string) => void,
    onBatchComplete?: (episodes: any[], meta: any) => void
): Promise<NarrativeBlueprint> => {
    if (onProgress) {
        onProgress(`Generating Narrative Blueprint...`);
    }

    let batches: { start: number, end: number }[] = [{ start: 1, end: -1 }];
    let isSplitMode = false;
    const MAX_EPISODES_PER_BATCH = 20;

    if (episodeCount && episodeCount > 0) {
        if (episodeCount > MAX_EPISODES_PER_BATCH) {
            isSplitMode = true;
            batches = [];
            for (let i = 1; i <= episodeCount; i += MAX_EPISODES_PER_BATCH) {
                const end = Math.min(i + MAX_EPISODES_PER_BATCH - 1, episodeCount);
                batches.push({ start: i, end: end });
            }
        } else {
            batches = [{ start: 1, end: episodeCount }];
        }
    } else {
        if (text.length > 20000) {
            const estimatedCount = Math.min(Math.max(Math.ceil(text.length / 5000), 30), 60);

            isSplitMode = true;
            batches = [];
            for (let i = 1; i <= estimatedCount; i += MAX_EPISODES_PER_BATCH) {
                const end = Math.min(i + MAX_EPISODES_PER_BATCH - 1, estimatedCount);
                batches.push({ start: i, end: end });
            }
            episodeCount = estimatedCount;
        }
    }

    let allEpisodes: any[] = [];
    let finalBatchMeta: any = { narrative_state: { current_tension: "Low", open_loops: [] } };
    let currentContext = prevContext;

    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const currentBatchNum = i + 1;
        const totalBatches = batches.length;
        const episodeRange = isSplitMode ? `Episodes ${batch.start}-${batch.end}` : "Auto-Distribution";

        if (onProgress) onProgress(`Generating Narrative Blueprint...`);

        let episodeInstruction = "";
        if (isSplitMode) {
            episodeInstruction = `- **强制分集 (Batch ${currentBatchNum}/${totalBatches})**: 
            本批次任务是生成 **第 ${batch.start} 集 到 第 ${batch.end} 集** (共 ${batch.end - batch.start + 1} 集)。
            
            **CRITICAL NARRATIVE SCOPE (叙事范围约束)**:
            ${i === 0
                    ? "1. **YOU MUST NOT FINISH THE STORY**. \n2. Cover ONLY the initial setup and inciting incidents for these episodes. \n3. STOP exactly at the designated end episode. \n4. The last episode MUST end on a CLIFFHANGER."
                    : (i === totalBatches - 1
                        ? "1. **FINAL STRETCH**: Drive the story to its Conclusion. \n2. Resolve all major conflicts. \n3. Provide a satisfying ending in the final episode."
                        : "1. **MIDDLE ACT**: Continue the story from the previous batch. \n2. Develop the conflicts and rising action. \n3. Do NOT finish the story yet. \n4. Maintain narrative continuity.")
                }
            
            必须严格按照编号生成，不得跳号，不得重复。确保每一集都有独立的核心冲突。`;
        } else if (episodeCount && episodeCount > 0) {
            episodeInstruction = `- **强制分集**: 用户指定了生成 **${episodeCount} 集**。你必须严格将输入内容划分为 ${episodeCount} 集。`;
        } else {
            episodeInstruction = "- **智能分集**: 根据输入文本的体量和剧情起伏，将其自动划分为 N 集（每集 3-5 分钟）。";
        }

        let batchContext = currentContext;
        if (i > 0 && allEpisodes.length > 0) {
            const lastEp = allEpisodes[allEpisodes.length - 1];
            batchContext += `\n\n[Previous Batch Summary]: Ended at Episode ${lastEp.episode_number}. \nLast Cliffhanger: "${lastEp.structure_breakdown?.cliffhanger_last_15s?.narrative_action || "Unknown"}". \n\n**INSTRUCTION**: You MUST start Episode ${lastEp.episode_number + 1} by resolving or escalating this exact cliffhanger. Maintain seamless narrative continuity. Do NOT restart the story.`;
        }

        const sysPrompt = PROMPTS.AGENT_1_NARRATIVE(
            episodeInstruction,
            language,
            text,
            batchContext,
            isSplitMode,
            episodeRange,
            currentBatchNum,
            totalBatches
        );

        const narrativeSchema = {
            type: Type.OBJECT,
            properties: {
                batch_meta: {
                    type: Type.OBJECT,
                    properties: {
                        narrative_state: {
                            type: Type.OBJECT,
                            properties: {
                                current_tension: { type: Type.STRING },
                                open_loops: { type: Type.ARRAY, items: { type: Type.STRING } }
                            }
                        },
                        batch_info: {
                            type: Type.OBJECT,
                            properties: {
                                batch_index: { type: Type.NUMBER },
                                total_batches: { type: Type.NUMBER },
                                episode_range: { type: Type.STRING },
                                timestamp: { type: Type.STRING }
                            }
                        }
                    }
                },
                episodes: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            episode_number: { type: Type.NUMBER },
                            title: { type: Type.STRING },
                            logline: { type: Type.STRING },
                            structure_breakdown: {
                                type: Type.OBJECT,
                                properties: {
                                    hook_0_15s: {
                                        type: Type.OBJECT,
                                        properties: {
                                            narrative_action: { type: Type.STRING },
                                            visual_intent: { type: Type.STRING },
                                            connection_to_prev: { type: Type.STRING }
                                        }
                                    },
                                    incident_15_60s: {
                                        type: Type.OBJECT,
                                        properties: {
                                            narrative_action: { type: Type.STRING },
                                            pacing: { type: Type.STRING }
                                        }
                                    },
                                    rising_action_60_180s: {
                                        type: Type.OBJECT,
                                        properties: {
                                            key_beats: { type: Type.ARRAY, items: { type: Type.STRING } }
                                        }
                                    },
                                    climax_spectacle_180_240s: {
                                        type: Type.OBJECT,
                                        properties: {
                                            narrative_action: { type: Type.STRING },
                                            visual_spectacle_requirement: { type: Type.STRING },
                                            emotional_tone: { type: Type.STRING }
                                        }
                                    },
                                    cliffhanger_last_15s: {
                                        type: Type.OBJECT,
                                        properties: {
                                            narrative_action: { type: Type.STRING },
                                            question_posed: { type: Type.STRING }
                                        }
                                    }
                                }
                            },
                            character_instructions: { type: Type.OBJECT }
                        },
                        required: ["episode_number", "title", "structure_breakdown"]
                    }
                }
            },
            required: ["episodes"]
        };

        let batchSuccess = false;
        let retryCount = 0;
        const MAX_RETRIES = 3;

        while (!batchSuccess && retryCount <= MAX_RETRIES) {
            try {
                const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
                    model: 'gemini-3-flash-preview',
                    contents: { parts: [{ text: `Analyze the text and generate the blueprint for ${episodeRange}.` }] },
                    config: {
                        systemInstruction: sysPrompt,
                        responseMimeType: "application/json",
                        responseSchema: narrativeSchema
                    }
                }), 3, 5000);

                let cleanText = response.text.trim();
                if (cleanText.startsWith("```json")) {
                    cleanText = cleanText.replace(/^```json\s*/, "").replace(/\s*```\s*$/, "").trim();
                } else if (cleanText.startsWith("```")) {
                    cleanText = cleanText.replace(/^```\s*/, "").replace(/\s*```\s*$/, "").trim();
                }

                const result = safeJsonParse<NarrativeBlueprint>(cleanText, {
                    batch_meta: { narrative_state: { current_tension: "Low", open_loops: [] } },
                    episodes: []
                });

                if (result.episodes && result.episodes.length > 0) {
                    if (isSplitMode) {
                        result.episodes.forEach((ep, idx) => {
                            const expectedNum = batch.start + idx;
                            if (ep.episode_number !== expectedNum) {
                                ep.episode_number = expectedNum;
                            }
                        });
                    }

                    const validEpisodes = result.episodes.filter(ep => {
                        if (!isSplitMode) return true;
                        return ep.episode_number >= batch.start && ep.episode_number <= batch.end;
                    });

                    if (validEpisodes.length > 0) {
                        allEpisodes.push(...validEpisodes);
                        finalBatchMeta = result.batch_meta;

                        if (onBatchComplete) {
                            onBatchComplete(validEpisodes, finalBatchMeta);
                        }

                        batchSuccess = true;
                    } else {
                        throw new Error(`Batch returned 0 valid episodes (Filtered from ${result.episodes.length} raw).`);
                    }
                } else {
                    throw new Error("Batch returned 0 raw episodes.");
                }

            } catch (e) {
                retryCount++;
                if (retryCount <= MAX_RETRIES) {
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
        }
    }

    return {
        batch_meta: finalBatchMeta,
        episodes: allEpisodes
    };
};

// --- AGENT 2: VISUAL DIRECTOR ---

const runAgent2_VisualDirection = async (
    blueprint: NarrativeBlueprint,
    language: string,
    lensLibraryPrompt: string
): Promise<MasterBeatSheet> => {
    const blueprintStr = JSON.stringify(blueprint, null, 2);

    const sysPrompt = PROMPTS.AGENT_2_VISUAL(language, lensLibraryPrompt);

    let allBeats: VisualBeat[] = [];
    let visualStrategy: any = { core_atmosphere: "", key_lens_design: { opening_hook: "", metaphor: "" } };

    const batchInstructions = [
        "TASK: Generate Part 1 of the Beat Sheet (Beats S01 to S15). Focus on the Hook, Inciting Incident, and initial Rising Action.",
        "TASK: Generate Part 2 of the Beat Sheet (Beats S16 to End). Focus on the Climax, Spectacle, and Cliffhanger. Ensure beat IDs continue from S16."
    ];

    for (let i = 0; i < 2; i++) {
        let batchSuccess = false;
        let retryCount = 0;
        const maxRetries = 2;

        while (!batchSuccess && retryCount <= maxRetries) {
            try {
                const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
                    model: 'gemini-3-flash-preview',
                    contents: { parts: [{ text: `Generate Visual Beats for the following Blueprint:\n${blueprintStr}\n\n${batchInstructions[i]}` }] },
                    config: {
                        systemInstruction: sysPrompt,
                        responseMimeType: "application/json"
                    }
                }));

                const result = safeJsonParse<MasterBeatSheet>(response.text, {
                    visual_strategy: { core_atmosphere: "", key_lens_design: { opening_hook: "", metaphor: "" } },
                    beats: []
                });

                if (i === 0 && result.visual_strategy && result.visual_strategy.core_atmosphere) {
                    visualStrategy = result.visual_strategy;
                }

                if (result.beats && Array.isArray(result.beats) && result.beats.length > 0) {
                    allBeats.push(...result.beats);
                    batchSuccess = true;
                } else {
                    retryCount++;
                }

            } catch (e) {
                retryCount++;
            }

            if (!batchSuccess && retryCount <= maxRetries) {
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    }

    const uniqueBeats = Array.from(new Map(allBeats.map(item => [item.beat_id, item])).values());

    uniqueBeats.sort((a, b) => {
        const numA = parseInt(a.beat_id.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.beat_id.replace(/\D/g, '')) || 0;
        return numA - numB;
    });

    return {
        visual_strategy: visualStrategy,
        beats: uniqueBeats
    };
};

// --- AGENT 3: ASSET PRODUCER ---

const runAgent3_AssetProduction = async (
    beatSheet: MasterBeatSheet,
    language: string,
    assets: Asset[],
    stylePrefix: string
): Promise<Scene[]> => {
    const assetMap = assets.map(a => `ID: ${a.id}, Name: ${a.name}, DNA: ${a.visualDna || ''}, Desc: ${a.description}`).join('\n');

    const fullLensLibrary = CORE_LENSES.map(l => `[${l.id}] ${l.name}: ${l.description} (Keywords: ${l.keywords})`).join('\n');

    const sysPrompt = PROMPTS.AGENT_3_ASSET_PRODUCER(fullLensLibrary, language, stylePrefix, assetMap);

    const allBeats = beatSheet.beats || [];
    if (allBeats.length === 0) return [];

    const totalBeats = allBeats.length;
    const batchCount = 4;
    const batchSize = Math.ceil(totalBeats / batchCount);

    let allScenes: Scene[] = [];

    for (let i = 0; i < batchCount; i++) {
        const start = i * batchSize;
        const end = Math.min(start + batchSize, totalBeats);
        if (start >= totalBeats) break;

        const batchBeats = allBeats.slice(start, end);

        const beatsStr = JSON.stringify(batchBeats, null, 2);

        try {
            const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: { parts: [{ text: `Translate these beats (Batch ${i + 1}/${batchCount}) into Scenes:\n${beatsStr}` }] },
                config: {
                    systemInstruction: sysPrompt,
                    responseMimeType: "application/json"
                }
            }));

            const batchScenes = safeJsonParse<Scene[]>(response.text, []);

            const validatedScenes = batchScenes.map(scene => {
                let np = scene.np_prompt || "";
                if (!np.includes("--ar 16:9 --v 6.0")) {
                    np = `${np.trim()} --ar 16:9 --v 6.0`;
                }
                return { ...scene, np_prompt: np };
            });

            allScenes.push(...validatedScenes);

        } catch (e) {
            // Continue to next batch
        }
    }

    return allScenes;
};

// --- MAIN ENTRY POINT ---

export const analyzeNovelText = async (
    text: string,
    language: string = 'Chinese',
    assets: Asset[] = [],
    style: GlobalStyle,
    prevContext: string = ""
): Promise<{ scenes: Scene[]; visualDna?: string }> => {
    if (!text.trim()) return { scenes: [] };

    const workStyle = style.work.custom || (style.work.selected !== 'None' ? style.work.selected : '');
    const useOriginalCharacters = style.work.useOriginalCharacters || false;
    const textureStyle = style.texture.custom || (style.texture.selected !== 'None' ? style.texture.selected : '');

    let stylePrefix = "";
    let generatedDna = "";

    const buildPrefix = (visuals: string) => {
        if (visuals && visuals.trim().startsWith("[") && visuals.includes("]")) return visuals;
        const parts = [];
        if (workStyle) parts.push(`Style: ${workStyle}`);
        if (visuals && visuals !== workStyle) parts.push(visuals);
        return parts.length > 0 ? `(${parts.join(', ')})` : "";
    };

    if (useOriginalCharacters) {
        if (!workStyle || !workStyle.trim()) throw new Error("1:1 Restoration Mode requires a valid Work Name.");
        const normalizedWork = workStyle.trim();
        const hasChinese = /[\u4e00-\u9fa5]/.test(normalizedWork);
        const suffix = hasChinese ? "美术风格" : " Art Style";
        generatedDna = !normalizedWork.endsWith(suffix.trim()) ? `${normalizedWork}${suffix}` : normalizedWork;
        stylePrefix = generatedDna;
    } else if (workStyle || textureStyle) {
        stylePrefix = style.visualTags ? buildPrefix(style.visualTags) : buildPrefix(textureStyle);
    }

    try {
        const currentDna = style.visualTags || "";
        const isStandard = currentDna.trim().startsWith("[") && currentDna.includes("]");

        if (!useOriginalCharacters && !isStandard && (workStyle || textureStyle)) {
        }
    } catch (e) {
        console.warn("Visual DNA logic error", e);
    }

    try {
        const blueprint = await runAgent1_NarrativeAnalysis(text, language, prevContext);

        let allScenes: Scene[] = [];

        if (blueprint.episodes && blueprint.episodes.length > 0) {
            for (const episode of blueprint.episodes) {
                const singleEpBlueprint: NarrativeBlueprint = {
                    batch_meta: blueprint.batch_meta,
                    episodes: [episode]
                };

                const fullLensLibrary = CORE_LENSES.map(l => `[${l.id}] ${l.name}: ${l.description} (Keywords: ${l.keywords})`).join('\n');
                const beatSheet = await runAgent2_VisualDirection(singleEpBlueprint, language, fullLensLibrary);

                const scenes = await runAgent3_AssetProduction(beatSheet, language, assets, stylePrefix);

                const labeledScenes = scenes.map(scene => ({
                    ...scene,
                    id: `E${episode.episode_number}_${scene.id}`,
                }));

                allScenes.push(...labeledScenes);
            }
        } else {
            console.warn("Agent 1 returned no episodes.");
        }

        return { scenes: allScenes, visualDna: generatedDna || undefined };

    } catch (e) {
        console.error("Pipeline Failed:", e);
        throw e;
    }
};

// --- HELPER for Agent 2/3 Retry with Validation ---
export async function executeWithRetryAndValidation<T>(
    operation: () => Promise<T>,
    validator: (result: T) => boolean,
    agentName: string,
    contextInfo: any,
    maxRetries: number = 5
): Promise<T> {
    let lastError: any;
    for (let i = 0; i < maxRetries; i++) {
        try {
            const result = await operation();
            if (validator(result)) {
                if (i > 0) console.log(`[${agentName}] Recovered after ${i} retries.`);
                return result;
            }
            throw new Error(`Validation failed: Result is empty or invalid.`);
        } catch (e) {
            lastError = e;
            const delay = Math.pow(2, i) * 1000;
            console.warn(`[${agentName}] Attempt ${i + 1}/${maxRetries} failed: ${e instanceof Error ? e.message : String(e)}. Retrying in ${delay}ms...`, contextInfo);
            await wait(delay);
        }
    }

    console.error(`[${agentName}] FATAL: Failed after ${maxRetries} retries.`, {
        context: contextInfo,
        error: lastError,
        timestamp: new Date().toISOString()
    });

    throw new Error(`[${agentName}] Execution failed after ${maxRetries} retries: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

// --- NEW SPLIT SERVICES (Agent 1 vs Agent 2+3) ---

export const analyzeNarrative = async (
    text: string,
    language: string,
    prevContext: string,
    episodeCount?: number,
    onProgress?: (msg: string) => void,
    onBatchComplete?: (episodes: any[], meta: any) => void
): Promise<NarrativeBlueprint> => {
    return await executeWithRetryAndValidation(
        () => runAgent1_NarrativeAnalysis(text, language, prevContext, episodeCount, onProgress, onBatchComplete),
        (res) => res && Array.isArray(res.episodes) && res.episodes.length > 0,
        "Agent 1 (Narrative Architect)",
        { textLength: text.length, episodeCount }
    );
};

export const generateEpisodeScenes = async (
    episode: any,
    batch_meta: any,
    language: string,
    assets: Asset[],
    style: GlobalStyle,
    overrideText?: string
): Promise<Scene[]> => {
    const stylePrefix = style.visualTags || "";

    let singleEpBlueprint: any;

    if (overrideText) {
        singleEpBlueprint = {
            batch_meta: batch_meta,
            episodes: [{
                ...episode,
                _USER_EDITED_CONTENT_STRICT_: overrideText,
                _INSTRUCTION_TO_AGENT_2_: "CRITICAL: The user has MANUALLY EDITED the script content. IGNORE the 'structure_breakdown' fields below if they conflict. Generate beats based strictly on the '_USER_EDITED_CONTENT_STRICT_' field above."
            }]
        };
    } else {
        singleEpBlueprint = {
            batch_meta: batch_meta,
            episodes: [episode]
        };
    }

    const fullLensLibrary = CORE_LENSES.map(l => `[${l.id}] ${l.name}: ${l.description} (Keywords: ${l.keywords})`).join('\n');

    const beatSheet = await executeWithRetryAndValidation(
        () => runAgent2_VisualDirection(singleEpBlueprint, language, fullLensLibrary),
        (res) => res && Array.isArray(res.beats) && res.beats.length > 0,
        "Agent 2 (Visual Director)",
        { episode: episode.episode_number, language }
    );

    const scenes = await executeWithRetryAndValidation(
        () => runAgent3_AssetProduction(beatSheet, language, assets, stylePrefix),
        (res) => res && Array.isArray(res) && res.length > 0,
        "Agent 3 (Asset Producer)",
        { episode: episode.episode_number, beatCount: beatSheet.beats.length }
    );

    const labeledScenes = scenes.map(scene => ({
        ...scene,
        id: `E${episode.episode_number}_${scene.id}`
    }));

    return labeledScenes;
};
