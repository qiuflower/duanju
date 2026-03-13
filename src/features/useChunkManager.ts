import React, { useRef } from 'react';
import { AnalysisStatus, Scene, Asset, GlobalStyle, NovelChunk } from '@/shared/types';
import { extractAssets, extractVisualDna, analyzeNarrative, generateEpisodeScenes, generateBeatSheet, generatePromptsFromBeats } from '@/services/ai';
import { loadAssetUrl, saveAsset } from '@/services/storage';
import JSZip from 'jszip';

interface ChunkManagerDeps {
    chunks: NovelChunk[];
    setChunks: React.Dispatch<React.SetStateAction<NovelChunk[]>>;
    globalAssets: Asset[];
    setGlobalAssets: React.Dispatch<React.SetStateAction<Asset[]>>;
    globalAssetsRef: React.MutableRefObject<Asset[]>;
    globalStyle: GlobalStyle;
    setGlobalStyle: React.Dispatch<React.SetStateAction<GlobalStyle>>;
    language: string;
    setStatus: React.Dispatch<React.SetStateAction<AnalysisStatus>>;
    setAnalysisProgress: React.Dispatch<React.SetStateAction<string>>;
    filename: string;
    setFilename: React.Dispatch<React.SetStateAction<string>>;
    fullNovelText: string;
    setFullNovelText: React.Dispatch<React.SetStateAction<string>>;
}

export function useChunkManager(deps: ChunkManagerDeps) {
    const {
        chunks, setChunks, globalAssets, setGlobalAssets, globalAssetsRef,
        globalStyle, setGlobalStyle, language, setStatus, setAnalysisProgress,
        filename, setFilename, fullNovelText, setFullNovelText
    } = deps;

    const scriptingChunksRef = useRef<Set<string>>(new Set());
    const extractingChunksRef = useRef<Set<string>>(new Set());
    const isAnalyzingRef = useRef(false);

    const updateChunk = (id: string, updates: Partial<NovelChunk>) => {
        setChunks(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    };

    const fallbackChunking = (text: string) => {
        const newChunks: NovelChunk[] = [{
            id: `chunk_${Date.now()}_full`,
            index: 0,
            title: "Full Text (Fallback)",
            text,
            status: 'idle',
            assets: [],
            scenes: []
        }];
        setChunks(newChunks);
    };

    const handleLoadNovel = (text: string, fname: string, episodeCount?: number) => {
        if (!text) {
            setChunks([]);
            setFilename("");
            setFullNovelText("");
            return;
        }
        setFilename(fname);
        setFullNovelText(text);
    };

    const handleChunkExtract = async (chunk: NovelChunk) => {
        if (extractingChunksRef.current.has(chunk.id)) {
            console.warn(`Extraction for chunk ${chunk.id} already in progress.`);
            return;
        }
        extractingChunksRef.current.add(chunk.id);

        try {
            const workStyle = globalStyle.work.custom || (globalStyle.work.selected !== 'None' ? globalStyle.work.selected : '');
            const textureStyle = globalStyle.texture.custom || (globalStyle.texture.selected !== 'None' ? globalStyle.texture.selected : '');
            const useOriginalCharacters = globalStyle.work.useOriginalCharacters || false;
            const skipDna = !!textureStyle;

            const result = await extractAssets(chunk.text, language, globalAssetsRef.current, workStyle, textureStyle, useOriginalCharacters, skipDna);

            if (result.visualDna) {
                setGlobalStyle(prev => ({ ...prev, visualTags: result.visualDna }));
            }

            const currentAssets = globalAssetsRef.current;
            const newAssets = [...currentAssets];
            let hasChanges = false;

            result.assets.forEach(extractedAsset => {
                const existingIndex = newAssets.findIndex(ga => ga.id === extractedAsset.id);
                if (existingIndex === -1) {
                    newAssets.push(extractedAsset);
                    hasChanges = true;
                } else {
                    const existing = newAssets[existingIndex];
                    newAssets[existingIndex] = {
                        ...existing,
                        description: extractedAsset.description,
                        refImageUrl: existing.refImageUrl,
                        refImageAssetId: existing.refImageAssetId,
                        name: extractedAsset.name || existing.name,
                        type: extractedAsset.type || existing.type,
                        visualDna: extractedAsset.visualDna || existing.visualDna
                    };
                    hasChanges = true;
                }
            });

            if (hasChanges) setGlobalAssets(newAssets);

            const chunkAssets = result.assets.map(extracted => {
                return newAssets.find(ga => ga.id === extracted.id) || extracted;
            });

            updateChunk(chunk.id, { assets: chunkAssets });
            return chunkAssets;
        } catch (e) {
            console.error("Chunk extraction failed", e);
            throw e;
        } finally {
            extractingChunksRef.current.delete(chunk.id);
        }
    };

    const handleManualExtractAssets = async (text: string) => {
        setStatus(AnalysisStatus.EXTRACTING);
        try {
            const workStyle = globalStyle.work.custom || (globalStyle.work.selected !== 'None' ? globalStyle.work.selected : '');
            const textureStyle = globalStyle.texture.custom || (globalStyle.texture.selected !== 'None' ? globalStyle.texture.selected : '');
            const useOriginalCharacters = globalStyle.work.useOriginalCharacters || false;

            const result = await extractAssets(text, language, globalAssetsRef.current, workStyle, textureStyle, useOriginalCharacters);

            if (result.visualDna) {
                setGlobalStyle(prev => ({ ...prev, visualTags: result.visualDna }));
            }

            setGlobalAssets(prev => {
                const newAssets = [...prev];
                result.assets.forEach(extracted => {
                    if (!newAssets.some(ga => ga.id === extracted.id)) {
                        newAssets.push(extracted);
                    }
                });
                return newAssets;
            });

            setStatus(AnalysisStatus.COMPLETED);
        } catch (e) {
            console.error("Manual Extract Error", e);
            setStatus(AnalysisStatus.ERROR);
            setTimeout(() => setStatus(AnalysisStatus.IDLE), 3000);
        }
    };

    const handleChunkScript = async (chunk: NovelChunk) => {
        if (scriptingChunksRef.current.has(chunk.id)) {
            console.warn(`Script generation for chunk ${chunk.id} already in progress.`);
            throw new Error("Generation in progress");
        }
        scriptingChunksRef.current.add(chunk.id);

        try {
            if (chunk.episodeData) {
                const updatedEpisodeData = { ...chunk.episodeData };
                const scenes = await generateEpisodeScenes(
                    updatedEpisodeData,
                    chunk.batchMeta,
                    language,
                    globalAssets,
                    globalStyle,
                    chunk.text
                );
                return scenes;
            }

            // Fallback: no episodeData — analyze chunk text as a single episode
            const prevIndex = chunk.index - 1;
            let prevContext = "";
            if (prevIndex >= 0) {
                const prevChunk = chunks[prevIndex];
                if (prevChunk.scenes.length > 0) {
                    prevContext = prevChunk.scenes[prevChunk.scenes.length - 1].narration;
                }
            }

            const blueprint = await analyzeNarrative(chunk.text, language, prevContext);

            let allScenes: import('@/shared/types').Scene[] = [];
            for (const episode of blueprint.episodes) {
                const scenes = await generateEpisodeScenes(
                    episode, blueprint.batch_meta, language, globalAssets, globalStyle, chunk.text
                );
                allScenes.push(...scenes);
            }
            return allScenes;
        } finally {
            scriptingChunksRef.current.delete(chunk.id);
        }
    };

    // --- Step 1: Generate Beat Sheet + Extract Assets → storyboarded ---
    const handleGenerateBeats = async (chunk: NovelChunk) => {
        if (scriptingChunksRef.current.has(chunk.id)) {
            console.warn(`Beat generation for chunk ${chunk.id} already in progress.`);
            throw new Error("Generation in progress");
        }
        scriptingChunksRef.current.add(chunk.id);

        try {
            if (chunk.episodeData) {
                // Auto-generate Visual DNA (A1) if not already present
                if (!globalStyle.visualTags) {
                    const workStyle = globalStyle.work.custom || (globalStyle.work.selected !== 'None' ? globalStyle.work.selected : '');
                    const textureStyle = globalStyle.texture.custom || (globalStyle.texture.selected !== 'None' ? globalStyle.texture.selected : '');
                    const dna = await extractVisualDna(workStyle, textureStyle, language);
                    if (dna) {
                        setGlobalStyle(prev => ({ ...prev, visualTags: dna }));
                    }
                }

                const { beatSheet, assets, scenes } = await generateBeatSheet(
                    chunk.episodeData, chunk.batchMeta, language, globalStyle, globalAssetsRef.current, chunk.text
                );

                // Merge new assets into global state
                const currentAssets = globalAssetsRef.current;
                const newAssets = [...currentAssets];
                let hasChanges = false;
                assets.forEach(a => {
                    if (!newAssets.some(g => g.id === a.id)) {
                        newAssets.push(a);
                        hasChanges = true;
                    }
                });
                if (hasChanges) setGlobalAssets(newAssets);

                // Enrich A2 assets with existing ref images from globalAssets
                const enrichedAssets = assets.map(a => {
                    const existing = currentAssets.find(g => g.id === a.id);
                    return existing ? { ...a, refImageUrl: existing.refImageUrl, refImageAssetId: existing.refImageAssetId } : a;
                });

                updateChunk(chunk.id, {
                    status: 'storyboarded',
                    scenes,
                    beatSheet,
                    assets: enrichedAssets,
                });
                return scenes;
            }
            throw new Error("No episodeData available for beat generation");
        } finally {
            scriptingChunksRef.current.delete(chunk.id);
        }
    };

    // --- Step 2: Generate Prompts from cached BeatSheet → scripted ---
    const handleGeneratePrompts = async (chunk: NovelChunk) => {
        if (scriptingChunksRef.current.has(chunk.id)) {
            console.warn(`Prompt generation for chunk ${chunk.id} already in progress.`);
            throw new Error("Generation in progress");
        }
        scriptingChunksRef.current.add(chunk.id);

        try {
            if (!chunk.beatSheet) throw new Error("No beat sheet found. Please generate storyboard first.");
            const epNum = chunk.episodeData?.episode_number || 0;

            // 使用 chunk 级别资产（反映用户在分镜后的增删操作）
            // 同时保留全局借用资产（场景中引用但不在 chunk 资产列表中的资产）
            const chunkAssetIds = new Set(chunk.assets.map(a => a.id));
            const borrowedAssets = globalAssetsRef.current.filter(
                a => !chunkAssetIds.has(a.id) && chunk.scenes.some(s => s.assetIds?.includes(a.id))
            );
            const latestAssets = [...chunk.assets, ...borrowedAssets];

            // 同步 beatSheet：过滤掉用户已删除的分镜（场景ID格式: E{epNum}_{beat_id}）
            const livingSceneIds = new Set(chunk.scenes.map(s => s.id));
            const filteredBeats = (chunk.beatSheet.beats || []).filter((beat: any) => {
                const sceneId = `E${epNum}_${beat.beat_id}`;
                return livingSceneIds.has(sceneId);
            });

            // 将用户在 UI 中的手动编辑同步回 beat 数据，让 Agent 3 使用最新内容
            const sceneMap = new Map(chunk.scenes.map(s => [s.id, s]));
            const userSyncedBeats = filteredBeats.map((beat: any) => {
                const scene = sceneMap.get(`E${epNum}_${beat.beat_id}`);
                if (!scene) return beat;
                const updated = { ...beat };

                // visual_desc → visual_action (对比原始值，有变化才覆写)
                const originalDesc = `[${beat.shot_name || beat.shot_id || ''}] ${beat.visual_action || ''}`;
                if (scene.visual_desc && scene.visual_desc !== originalDesc) {
                    updated.visual_action = scene.visual_desc;
                }
                // video_camera → camera_movement
                if (scene.video_camera && scene.video_camera !== (beat.camera_movement || '')) {
                    updated.camera_movement = scene.video_camera;
                }
                // video_lens → shot_id
                if (scene.video_lens && scene.video_lens !== (beat.shot_id || '')) {
                    updated.shot_id = scene.video_lens;
                }
                // audio_sfx → audio_subtext
                if (scene.audio_sfx && scene.audio_sfx !== (beat.audio_subtext || '')) {
                    updated.audio_subtext = scene.audio_sfx;
                }
                return updated;
            });
            const syncedBeatSheet = { ...chunk.beatSheet, beats: userSyncedBeats };

            const { scenes: newScenes, visualDna } = await generatePromptsFromBeats(
                syncedBeatSheet, epNum, language, latestAssets, globalStyle
            );

            // 更新全局 Visual DNA
            if (visualDna) {
                setGlobalStyle(prev => ({ ...prev, visualTags: visualDna }));
            }

            // Preserve existing storyboard images/videos by merging media fields from old scenes
            const oldScenesMap = new Map(chunk.scenes.map(s => [s.id, s]));
            const mergedScenes = newScenes.map(ns => {
                const old = oldScenesMap.get(ns.id);
                if (!old) return ns;
                return {
                    ...ns,
                    // Carry over all media fields from the previous scene
                    imageUrl: old.imageUrl,
                    imageAssetId: old.imageAssetId,
                    videoUrl: old.videoUrl,
                    videoAssetId: old.videoAssetId,
                    startEndVideoUrl: old.startEndVideoUrl,
                    startEndVideoAssetId: old.startEndVideoAssetId,
                    narrationAudioUrl: old.narrationAudioUrl,
                    // 保留用户手动覆写的字段（用户填写 > Agent 3 生成）
                    video_duration: old.video_duration || ns.video_duration,
                    video_vfx: old.video_vfx || ns.video_vfx,
                };
            });

            updateChunk(chunk.id, { scenes: mergedScenes, status: 'scripted' });
            return mergedScenes;
        } finally {
            scriptingChunksRef.current.delete(chunk.id);
        }
    };

    const handleImportChunk = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const zip = await JSZip.loadAsync(file);
            const dataFile = zip.file("data.json");
            if (!dataFile) throw new Error("Invalid format: data.json missing");

            const jsonStr = await dataFile.async("string");
            const importedData = JSON.parse(jsonStr);
            if (!importedData.scenes || !importedData.text) throw new Error("Invalid chunk data");
            if (!Array.isArray(importedData.scenes)) throw new Error("Invalid scenes: must be array");
            if (typeof importedData.text !== 'string') throw new Error("Invalid text: must be string");
            if (importedData.assets && !Array.isArray(importedData.assets)) throw new Error("Invalid assets: must be array");

            const newChunk: NovelChunk = {
                ...importedData,
                id: `chunk_${Date.now()}_import`,
                status: 'scripted',
            };

            const restoredAssets: Asset[] = [];
            for (const asset of (importedData.assets || [])) {
                let refImageUrl = asset.refImageUrl;
                let refImageAssetId = asset.refImageAssetId;
                const imgFile = zip.file(`asset_refs/${asset.id}_${asset.name}.png`);
                if (imgFile) {
                    const blob = await imgFile.async("blob");
                    refImageAssetId = await saveAsset(blob);
                    const url = await loadAssetUrl(refImageAssetId);
                    if (url) refImageUrl = url;
                }
                restoredAssets.push({ ...asset, refImageUrl, refImageAssetId });
            }
            newChunk.assets = restoredAssets;

            setGlobalAssets(prev => {
                const next = [...prev];
                restoredAssets.forEach(a => {
                    if (!next.some(existing => existing.id === a.id)) next.push(a);
                });
                return next;
            });

            const restoredScenes: Scene[] = [];
            for (const scene of (importedData.scenes || [])) {
                let imageUrl = scene.imageUrl;
                let imageAssetId = scene.imageAssetId;
                let videoUrl = scene.videoUrl;
                let videoAssetId = scene.videoAssetId;
                let narrationAudioUrl = scene.narrationAudioUrl;

                const imgFile = zip.file(`images/${scene.id}.png`);
                if (imgFile) {
                    const blob = await imgFile.async("blob");
                    imageAssetId = await saveAsset(blob);
                    const url = await loadAssetUrl(imageAssetId);
                    if (url) imageUrl = url;
                }
                const vidFile = zip.file(`videos/${scene.id}.mp4`);
                if (vidFile) {
                    const blob = await vidFile.async("blob");
                    videoAssetId = await saveAsset(blob);
                    const url = await loadAssetUrl(videoAssetId);
                    if (url) videoUrl = url;
                }
                const audioFile = zip.file(`narration/${scene.id}_narration.wav`);
                if (audioFile) {
                    const blob = await audioFile.async("blob");
                    const audioAssetId = await saveAsset(blob);
                    const audioUrl = await loadAssetUrl(audioAssetId);
                    if (audioUrl) narrationAudioUrl = audioUrl;
                }

                restoredScenes.push({ ...scene, imageUrl, imageAssetId, videoUrl, videoAssetId, narrationAudioUrl });
            }
            newChunk.scenes = restoredScenes;

            if (newChunk.scenes.length > 0) {
                if (newChunk.scenes.every(s => !!s.videoUrl || !!s.videoAssetId)) newChunk.status = 'completed';
                else if (newChunk.scenes.every(s => !!s.imageUrl || !!s.imageAssetId)) newChunk.status = 'shooting';
            }

            setChunks(prev => [...prev, newChunk]);
        } catch (err: any) {
            console.error("Import failed", err);
            alert((language === 'Chinese' ? "导入失败: " : "Import Failed: ") + err.message);
        } finally {
            e.target.value = '';
        }
    };

    const handleAnalyze = async (manualText: string, episodeCount?: number) => {
        if (isAnalyzingRef.current) {
            console.warn('Analysis already in progress, skipping duplicate call.');
            return;
        }
        isAnalyzingRef.current = true;
        setStatus(AnalysisStatus.ANALYZING);
        setAnalysisProgress(language === 'Chinese' ? "准备分析..." : "Initializing...");

        const textToUse = fullNovelText || manualText;

        analyzeNarrative(textToUse, language, "", episodeCount,
            (msg) => setAnalysisProgress(msg),
            undefined
        )
            .then(blueprint => {
                if (blueprint && blueprint.episodes && blueprint.episodes.length > 0) {
                    const newChunks: NovelChunk[] = blueprint.episodes.map((ep, idx) => ({
                        id: `ep_${Date.now()}_${ep.episode_number}_${idx}`,
                        index: ep.episode_number - 1,
                        title: `Ep ${ep.episode_number}: ${ep.title}`,
                        text: `### Episode ${ep.episode_number}: ${ep.title}\n\n**Logline**: ${ep.logline}\n\n**Structure**: ${JSON.stringify(ep.structure_breakdown, null, 2)}`,
                        status: 'idle',
                        assets: [],
                        scenes: [],
                        episodeData: ep,
                        batchMeta: blueprint.batch_meta
                    }));

                    setChunks(prev => {
                        const existingEps = new Set(prev.map(c => c.episodeData?.episode_number));
                        const uniqueNewChunks = newChunks.filter(c => !existingEps.has(c.episodeData?.episode_number));
                        if (uniqueNewChunks.length === 0) return prev;
                        const merged = [...prev, ...uniqueNewChunks];
                        return merged.sort((a, b) => (a.episodeData?.episode_number || 0) - (b.episodeData?.episode_number || 0));
                    });
                }
            })
            .catch(e => {
                console.error("Agent 1 Failed, using fallback:", e);
                fallbackChunking(textToUse);
            })
            .finally(() => {
                isAnalyzingRef.current = false;
                setStatus(AnalysisStatus.IDLE);
                setAnalysisProgress("");
            });
    };

    return {
        updateChunk,
        handleLoadNovel,
        handleChunkExtract,
        handleManualExtractAssets,
        handleChunkScript,
        handleGenerateBeats,
        handleGeneratePrompts,
        handleImportChunk,
        handleAnalyze,
        extractingChunksRef,
        scriptingChunksRef
    };
}
