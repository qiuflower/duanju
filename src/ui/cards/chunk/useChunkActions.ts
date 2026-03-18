import { useState } from 'react';
import { NovelChunk, Asset, GlobalStyle, Scene } from '@/shared/types';
import { generateVideo, pollVideoUntilDone } from '@/services/ai';
import { loadAssetUrl } from '@/services/storage';
import { extractAssetTags, resolveTagToAsset, isStoryboardTag } from '@/shared/asset-tags';
import JSZip from 'jszip';
import { buildExportData } from '@/app/chunkUtils';
import saveAs from 'file-saver';

export interface UseChunkActionsProps {
    chunk: NovelChunk;
    styleState: GlobalStyle;
    language: string;
    isActive: boolean;
    onUpdateChunk: (id: string, updates: Partial<NovelChunk>) => void;
    onSceneUpdate: (chunkId: string, sceneId: string, updates: Partial<Scene>) => void;
    onDuplicateScene: (chunkId: string, sceneId: string) => void;
    onExtract: (chunk: NovelChunk) => Promise<Asset[]>;
    onGenerateScript: (chunk: NovelChunk) => Promise<Scene[]>;
    onGenerateBeats: (chunk: NovelChunk) => Promise<Scene[]>;
    onGeneratePrompts: (chunk: NovelChunk) => Promise<Scene[]>;
    onGenerateImage: (scene: Scene, chunkAssets?: Asset[]) => Promise<string>;
    onToggle: () => void;
}

export function useChunkActions({
    chunk, styleState, language, isActive,
    onUpdateChunk, onSceneUpdate, onDuplicateScene,
    onExtract, onGenerateScript, onGenerateBeats, onGeneratePrompts, onGenerateImage, onToggle
}: UseChunkActionsProps) {
    const [loadingStep, setLoadingStep] = useState<'none' | 'extracting' | 'storyboarding' | 'scripting' | 'filming'>('none');
    const [generatingSceneIds, setGeneratingSceneIds] = useState<string[]>([]);
    const [scriptError, setScriptError] = useState<string | null>(null);
    const [exportProgress, setExportProgress] = useState<number | null>(null);
    const [showTextModal, setShowTextModal] = useState(false);
    const [editingText, setEditingText] = useState('');

    // Per-scene asset readiness: checks only assets referenced by a scene's np_prompt
    const getSceneAssetsReady = (scene: Scene): boolean => {
        // No prompt generated yet → not ready
        if (!scene.np_prompt?.trim()) return false;
        if (chunk.assets.length === 0) return true;
        const tags = extractAssetTags(scene.np_prompt || '').filter(t => !isStoryboardTag(t.name));
        if (tags.length === 0) return true;
        const referencedAssets: Asset[] = [];
        for (const tag of tags) {
            const asset = resolveTagToAsset(tag, chunk.assets);
            if (asset && !referencedAssets.some(a => a.id === asset.id)) {
                referencedAssets.push(asset);
            }
        }
        if (referencedAssets.length === 0) return true;
        return referencedAssets.every(a => !!a.refImageUrl || !!a.refImageAssetId);
    };

    // Chunk-level check for header warning only (not blocking)
    const anyAssetPending = chunk.assets.length > 0 && chunk.assets.some(a => !a.refImageUrl && !a.refImageAssetId);

    // Per-scene VIDEO asset readiness: checks video_prompt @图像 tags
    const MAX_VIDEO_REFS = 3;
    const getVideoAssetsReady = (scene: Scene): boolean => {
        // No video prompt generated yet → not ready
        if (!scene.video_prompt?.trim()) return false;
        const tags = extractAssetTags(scene.video_prompt || '');
        if (tags.length === 0) return true;

        // Count unique references — block if exceeding limit
        const uniqueRefs = new Set(tags.map(t => t.id || t.name));
        if (uniqueRefs.size > MAX_VIDEO_REFS) return false;

        for (const tag of tags) {
            if (isStoryboardTag(tag.name)) {
                // 分镜标签 → check corresponding scene's imageUrl
                const idPart = tag.name.replace('分镜', '');
                const target = chunk.scenes.find(s => s.id === idPart || s.id.endsWith(`_${idPart}`));
                if (target && !target.imageUrl && !target.imageAssetId) return false;
            } else {
                // 资产标签 → check chunk.assets refImageUrl
                const asset = resolveTagToAsset(tag, chunk.assets);
                if (asset && !asset.refImageUrl && !asset.refImageAssetId) return false;
            }
        }
        return true;
    };

    const handleAddChunkAssets = (newAssets: Asset | Asset[]) => {
        const assetsToAdd = Array.isArray(newAssets) ? newAssets : [newAssets];
        onUpdateChunk(chunk.id, { assets: [...chunk.assets, ...assetsToAdd] });
    };

    const handleExtract = async () => {
        setLoadingStep('extracting');
        setScriptError(null);
        try {
            const newAssets = await onExtract(chunk);
            onUpdateChunk(chunk.id, { status: 'extracted' });
            if (!isActive) onToggle();
        } catch (e: any) {
            console.error(e);
            setScriptError(e.message || "Failed to extract assets");
        } finally {
            setLoadingStep('none');
        }
    };

    const handleScript = async () => {
        setLoadingStep('scripting');
        setScriptError(null);
        try {
            const scenes = await onGenerateScript(chunk);
            if (!scenes || scenes.length === 0) throw new Error("Received empty script from AI");
            onUpdateChunk(chunk.id, { scenes, status: 'scripted' });
            if (!isActive) onToggle();
        } catch (e: any) {
            console.error("Script generation failed", e);
            setScriptError(e.message || "Failed to generate script. Please try again.");
        } finally {
            setLoadingStep('none');
        }
    };

    const handleStoryboard = async () => {
        setLoadingStep('storyboarding');
        setScriptError(null);
        try {
            const scenes = await onGenerateBeats(chunk);
            if (!scenes || scenes.length === 0) throw new Error("Empty beat sheet from AI");
            // onGenerateBeats already calls updateChunk with storyboarded status
            if (!isActive) onToggle();
        } catch (e: any) {
            console.error("Storyboard generation failed", e);
            setScriptError(e.message || "Failed to generate storyboard. Please try again.");
        } finally {
            setLoadingStep('none');
        }
    };

    const handleGeneratePromptsAction = async () => {
        setLoadingStep('scripting');
        setScriptError(null);
        try {
            const scenes = await onGeneratePrompts(chunk);
            if (!scenes || scenes.length === 0) throw new Error("Empty prompts from AI");
            // onGeneratePrompts already calls updateChunk with scripted status
            if (!isActive) onToggle();
        } catch (e: any) {
            console.error("Prompt generation failed", e);
            setScriptError(e.message || "Failed to generate prompts. Please try again.");
        } finally {
            setLoadingStep('none');
        }
    };

    const handleDeleteScene = (sceneId: string) => {
        const newScenes = chunk.scenes.filter(s => s.id !== sceneId);
        onUpdateChunk(chunk.id, { scenes: newScenes });
    };

    const handleDuplicateScene = (sceneId: string) => {
        onDuplicateScene(chunk.id, sceneId);
    };

    const handleShoot = async () => {
        if (chunk.status === 'shooting' && generatingSceneIds.length > 0) return;
        onUpdateChunk(chunk.id, { status: 'shooting' });

        const scenesToProcess = chunk.scenes.filter(s => !s.imageUrl && !s.imageAssetId && !!s.np_prompt?.trim());
        const CONCURRENCY = 10;

        const processScene = async (scene: Scene) => {
            setGeneratingSceneIds(prev => [...prev, scene.id]);
            try {
                const url = await onGenerateImage(scene, chunk.assets);
                onSceneUpdate(chunk.id, scene.id, { imageUrl: url });
            } catch (e) {
                console.error(`Failed to gen image for scene ${scene.id}`, e);
            } finally {
                setGeneratingSceneIds(prev => prev.filter(id => id !== scene.id));
            }
        };

        try {
            const executing: Promise<void>[] = [];
            for (const scene of scenesToProcess) {
                const p = processScene(scene).then(() => {
                    const idx = executing.indexOf(p);
                    if (idx > -1) executing.splice(idx, 1);
                });
                executing.push(p);
                if (executing.length >= CONCURRENCY) {
                    await Promise.race(executing);
                }
            }
            await Promise.all(executing);
        } catch (e) {
            console.error("Batch shoot failed", e);
        }
    };

    const handleMakeFilm = async () => {
        setLoadingStep('filming');
        const scenesToProcess = chunk.scenes.filter(s => {
            if (s.isStartEndFrameMode) {
                return (s.imageUrl || s.imageAssetId) && !s.startEndVideoUrl && !s.startEndVideoAssetId;
            }
            return (s.imageUrl || s.imageAssetId) && !s.videoUrl && !s.videoAssetId;
        });

        const MAX_RETRIES = 5;
        const CONCURRENCY = 3;

        const processSceneWithRetry = async (scene: Scene) => {
            let imageToUse = scene.imageUrl;
            if (!imageToUse && scene.imageAssetId) {
                try {
                    imageToUse = await loadAssetUrl(scene.imageAssetId) || undefined;
                } catch (e) { console.error("Dynamic load failed", e); }
            }
            if (!imageToUse) return;

            let lastError;
            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    // Step 1: Submit (returns immediately)
                    const { operation } = await generateVideo(imageToUse, scene, styleState.aspectRatio, (scene.useAssets !== false) ? chunk.assets : [], undefined, chunk.scenes);
                    // Step 2: Poll until done
                    const { url } = await pollVideoUntilDone(operation);

                    if (scene.isStartEndFrameMode) {
                        onSceneUpdate(chunk.id, scene.id, { startEndVideoUrl: url });
                    } else {
                        onSceneUpdate(chunk.id, scene.id, { videoUrl: url });
                    }
                    return;
                } catch (e: any) {
                    const errorMsg = e?.message || String(e);
                    console.warn(`Video Gen failed for scene ${scene.id} (Attempt ${attempt}/${MAX_RETRIES})`, errorMsg);
                    lastError = e;
                    const isRateLimit = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota");
                    if (attempt < MAX_RETRIES) {
                        const baseDelay = 2000 * Math.pow(2, attempt - 1);
                        const actualDelay = isRateLimit ? baseDelay * 2 : baseDelay;
                        console.log(`Waiting ${actualDelay}ms before retry for scene ${scene.id}...`);
                        await new Promise(resolve => setTimeout(resolve, actualDelay));
                    }
                }
            }
            console.error(`Final failure for scene ${scene.id} after ${MAX_RETRIES} attempts`, lastError);
        };

        try {
            const executing: Promise<void>[] = [];
            for (const scene of scenesToProcess) {
                const p = processSceneWithRetry(scene).then(() => {
                    const idx = executing.indexOf(p);
                    if (idx > -1) executing.splice(idx, 1);
                });
                executing.push(p);
                if (executing.length >= CONCURRENCY) {
                    await Promise.race(executing);
                }
            }
            await Promise.all(executing);
        } finally {
            setLoadingStep('none');
        }
    };

    const handleSceneUpdateWrapper = (sceneId: string, field: keyof Scene, value: any) => {
        onSceneUpdate(chunk.id, sceneId, { [field]: value });
    };

    const handleImageGenerated = (sceneId: string, url: string) => {
        onSceneUpdate(chunk.id, sceneId, { imageUrl: url });
    };

    const handleGenerateImageInternal = (scene: Scene) => {
        return onGenerateImage(scene, chunk.assets);
    };

    const handleVideoGenerated = (sceneId: string, url: string, assetId?: string) => {
        const scene = chunk.scenes.find(s => s.id === sceneId);
        if (scene?.isStartEndFrameMode) {
            onSceneUpdate(chunk.id, sceneId, { startEndVideoUrl: url, startEndVideoAssetId: assetId });
        } else {
            onSceneUpdate(chunk.id, sceneId, { videoUrl: url, videoAssetId: assetId });
        }
    };

    const handleDownload = async () => {
        setExportProgress(0);
        try {
            const zip = new JSZip();

            const assetText = chunk.assets.map(a => `ID: ${a.id}\nName: ${a.name}\nDesc: ${a.description}\nDNA: ${a.visualDna || ''}`).join('\n---\n');
            zip.file("assets.txt", assetText);

            const chunkData = buildExportData(chunk);
            zip.file("data.json", JSON.stringify(chunkData, null, 2));

            const imgFolder = zip.folder("images");
            const vidFolder = zip.folder("videos");
            const audioFolder = zip.folder("narration");

            const getBlob = async (url?: string, id?: string) => {
                if (url) {
                    const res = await fetch(url);
                    return res.blob();
                }
                if (id) {
                    const tempUrl = await loadAssetUrl(id);
                    if (tempUrl) {
                        const res = await fetch(tempUrl);
                        const b = await res.blob();
                        URL.revokeObjectURL(tempUrl);
                        return b;
                    }
                }
                return null;
            };

            for (const scene of chunk.scenes) {
                const imgBlob = await getBlob(scene.imageUrl, scene.imageAssetId);
                if (imgBlob) imgFolder?.file(`${scene.id}.png`, imgBlob);

                const vidBlob = await getBlob(scene.videoUrl, scene.videoAssetId);
                if (vidBlob) vidFolder?.file(`${scene.id}.mp4`, vidBlob);

                const seVidBlob = await getBlob(scene.startEndVideoUrl, scene.startEndVideoAssetId);
                if (seVidBlob) vidFolder?.file(`${scene.id}_startend.mp4`, seVidBlob);

                if (scene.narrationAudioUrl) {
                    const response = await fetch(scene.narrationAudioUrl);
                    const blob = await response.blob();
                    audioFolder?.file(`${scene.id}_narration.wav`, blob);
                }
            }

            const assetFolder = zip.folder("asset_refs");
            for (const asset of chunk.assets) {
                const assetBlob = await getBlob(asset.refImageUrl, asset.refImageAssetId);
                if (assetBlob) {
                    assetFolder?.file(`${asset.id}_${asset.name}.png`, assetBlob);
                }
            }

            const content = await zip.generateAsync({ type: "blob" }, (metadata) => {
                setExportProgress(metadata.percent);
            });
            saveAs(content, `nano_banana_chapter_${chunk.index + 1}.zip`);
        } catch (e: any) {
            console.error("Export failed", e);
            alert((language === 'Chinese' ? "导出失败: " : "Export Failed: ") + e.message);
        } finally {
            setExportProgress(null);
        }
    };

    return {
        // State
        loadingStep, scriptError, exportProgress,
        generatingSceneIds, getSceneAssetsReady, getVideoAssetsReady, anyAssetPending,
        showTextModal, setShowTextModal, editingText, setEditingText,

        // Handlers
        handleAddChunkAssets, handleExtract, handleScript,
        handleStoryboard, handleGeneratePromptsAction,
        handleDeleteScene, handleDuplicateScene,
        handleShoot, handleMakeFilm,
        handleSceneUpdateWrapper, handleImageGenerated,
        handleGenerateImageInternal, handleVideoGenerated,
        handleDownload,
    };
}
