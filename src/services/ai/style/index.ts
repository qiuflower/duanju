import { Asset, GenerateContentResponse } from "@/shared/types";
import { PROMPTS } from "@/domain/generation/prompts";
import { retryWithBackoff, safeJsonParse, Type, ai } from "../helpers";
import { MODELS } from "../model-manager";

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
            model: MODELS.TEXT_FAST,
            contents: "Generate list.",
            config: {
                systemInstruction: systemPrompt,
                responseMimeType: "application/json",
                responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } },
            }
        }));
        return safeJsonParse(response.text, []);
    } catch (e) { return []; }
};

// --- AGENT A1 & A2 ---

export const analyzeVisualStyleFromImages = async (
    images: string[],
    language: string = 'Chinese'
): Promise<string> => {
    if (!images || images.length === 0) return "";

    const parts: any[] = [];
    images.forEach(img => {
        const match = img.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
        if (match) {
            parts.push({
                inlineData: {
                    mimeType: match[1],
                    data: match[2]
                }
            });
        } else {
            parts.push({
                inlineData: {
                    mimeType: "image/png",
                    data: img
                }
            });
        }
    });

    parts.push({ text: "Analyze the common visual style of these images." });

    const prompt = PROMPTS.VISUAL_DNA_FROM_IMAGES(language);

    try {
        const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
            model: MODELS.TEXT_FAST,
            contents: { parts },
            config: {
                systemInstruction: prompt,
                responseMimeType: "application/json",
                responseSchema: { type: Type.OBJECT, properties: { visual_dna: { type: Type.STRING } } }
            }
        }));
        const json = safeJsonParse<{ visual_dna: string }>(response.text, { visual_dna: "" });
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
    textureStyle: string = '',
    useOriginalCharacters: boolean = false,
    skipDna: boolean = false
): Promise<{ visualDna: string; assets: Asset[] }> => {
    let visualDna = "";
    if (!skipDna) {
        try {
            const dnaResponse = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
                model: MODELS.TEXT_FAST,
                contents: { parts: [{ text: "Analyze the visual style based on the provided style and texture references." }] },
                config: {
                    systemInstruction: PROMPTS.AGENT_A_DNA(workStyle, textureStyle, language),
                    responseMimeType: "application/json",
                    responseSchema: { type: Type.OBJECT, properties: { visual_dna: { type: Type.STRING } } }
                }
            }));
            const dnaJson = safeJsonParse<{ visual_dna: string }>(dnaResponse.text, { visual_dna: "" });
            visualDna = dnaJson.visual_dna;
        } catch (e) { console.warn("Agent A1 failed:", e); }
    } else {
        //console.log("[extractAssets] Skipping A1 (Visual DNA) — visualTags already exists.");
    }

    let assets: Asset[] = [];
    try {
        const assetResponse = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
            model: MODELS.TEXT_FAST,
            contents: { parts: [{ text: text }] },
            config: {
                systemInstruction: PROMPTS.AGENT_A_ASSET(language, existingAssets, workStyle, useOriginalCharacters),
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

    } catch (e) { console.warn("Agent A2 failed:", e); }

    return { visualDna, assets };
};
