import { useState, useEffect, useRef, useMemo } from 'react';
import { AnalysisStatus, Scene, Asset, GlobalStyle, NovelChunk } from '@/shared/types';
import { generateSceneImage } from '@/services/ai';
import { translations, Translation } from '@/services/i18n/translations';
import { STATE_KEY } from '@/shared/constants/defaults';
import { useSessionRestore } from '@/features/useSessionRestore';
import { useSceneManager } from '@/features/useSceneManager';
import { useAutomation } from '@/features/useAutomation';
import { useChunkManager } from '@/features/useChunkManager';

export function useAppState() {
    // ── Core State ──────────────────────────────────
    const [globalAssets, setGlobalAssets] = useState<Asset[]>([]);
    const [chunks, setChunks] = useState<NovelChunk[]>([]);
    const [activeChunkId, setActiveChunkId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [showGlobalSelector, setShowGlobalSelector] = useState(false);
    const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
    const [analysisProgress, setAnalysisProgress] = useState("");
    const [language, setLanguage] = useState<string>("Chinese");
    const [globalStyle, setGlobalStyle] = useState<GlobalStyle>({
        director: { selected: 'None', strength: 5, seed: '5555', options: [] },
        work: { selected: 'None', strength: 5, seed: '5555', options: [] },
        texture: { selected: 'None', strength: 5, seed: '5555', options: [] },
        aspectRatio: '16:9',
        visualTags: '',
        narrationVoice: 'Kore'
    });
    const [filename, setFilename] = useState("");
    const [fullNovelText, setFullNovelText] = useState("");

    const globalAssetsRef = useRef(globalAssets);
    useEffect(() => { globalAssetsRef.current = globalAssets; }, [globalAssets]);

    // Sync expanded chunk with active chunk
    useEffect(() => {
        if (activeChunkId) setExpandedId(activeChunkId);
    }, [activeChunkId]);

    const t = translations[language] || translations["Chinese"];

    // ── Hooks ────────────────────────────────────────
    useSessionRestore({
        globalAssets, setGlobalAssets, chunks, setChunks,
        globalStyle, setGlobalStyle, language, setLanguage,
        filename, setFilename
    });

    const { flashScene, handleSceneUpdate, handleDuplicateScene } = useSceneManager(chunks, setChunks);

    const {
        updateChunk, handleLoadNovel, handleChunkExtract, handleManualExtractAssets,
        handleChunkScript, handleGenerateBeats, handleGeneratePrompts,
        handleImportChunk, handleAnalyze, extractingChunksRef
    } = useChunkManager({
        chunks, setChunks, globalAssets, setGlobalAssets, globalAssetsRef,
        globalStyle, setGlobalStyle, language, setStatus, setAnalysisProgress,
        filename, setFilename, fullNovelText, setFullNovelText
    });

    const {
        isAutoMode, setIsAutoMode, autoAssetTrigger, setAutoAssetTrigger,
        autoShootTrigger, handleAssetBatchComplete
    } = useAutomation({
        chunks, activeChunkId, setActiveChunkId, updateChunk,
        handleChunkExtract, handleChunkScript, extractingChunksRef, t
    });

    // ── Derived State ───────────────────────────────
    const targetChunkId = expandedId || activeChunkId;
    const targetChunk = targetChunkId ? chunks.find(c => c.id === targetChunkId) : null;

    const displayedAssets = useMemo(() => {
        if (!targetChunk) return globalAssets;
        const chunkAssets = targetChunk.assets;
        const chunkAssetIds = new Set(chunkAssets.map(a => a.id));
        const usedAssetIds = new Set<string>();
        targetChunk.scenes.forEach(scene => {
            if (scene.assetIds) scene.assetIds.forEach(id => usedAssetIds.add(id));
            if (scene.videoAssetIds) scene.videoAssetIds.forEach(id => usedAssetIds.add(id));
            if (scene.imageAssetId) usedAssetIds.add(scene.imageAssetId);
            if (scene.videoAssetId) usedAssetIds.add(scene.videoAssetId);
        });
        const borrowedAssets: Asset[] = [];
        usedAssetIds.forEach(id => {
            if (!id || id.startsWith('scene_img_')) return;
            if (!chunkAssetIds.has(id)) {
                const found = globalAssets.find(ga => ga.id === id);
                if (found) borrowedAssets.push(found);
            }
        });
        return [...chunkAssets, ...borrowedAssets];
    }, [targetChunk, globalAssets]);

    // ── Handlers ────────────────────────────────────
    const handleGenerateImageWrapper = async (scene: Scene, chunkAssets?: Asset[]) => {
        const assetsToUse = chunkAssets || displayedAssets;
        const result = await generateSceneImage(scene, globalStyle, assetsToUse);
        return result.imageUrl || result;
    };

    const handleUpdateAsset = (updatedAsset: Asset) => {
        setGlobalAssets(prev => prev.map(a => a.id === updatedAsset.id ? updatedAsset : a));
        setChunks(prev => prev.map(chunk => {
            const exists = chunk.assets.some(a => a.id === updatedAsset.id);
            if (exists) return { ...chunk, assets: chunk.assets.map(a => a.id === updatedAsset.id ? updatedAsset : a) };
            else if (chunk.id === targetChunkId) return { ...chunk, assets: [...chunk.assets, updatedAsset] };
            return chunk;
        }));
    };

    const handleAddAsset = (newAsset: Asset) => {
        if (targetChunkId) {
            setChunks(prev => prev.map(c => {
                if (c.id !== targetChunkId) return c;
                if (c.assets.some(a => a.id === newAsset.id)) return c;
                return { ...c, assets: [...c.assets, newAsset] };
            }));
            setGlobalAssets(prev => {
                if (prev.some(a => a.id === newAsset.id)) return prev;
                return [...prev, newAsset];
            });
        } else {
            setGlobalAssets(prev => [...prev, newAsset]);
        }
    };

    const handleDeleteAsset = (id: string) => {
        if (targetChunkId) {
            setChunks(prev => prev.map(chunk => {
                if (chunk.id !== targetChunkId) return chunk;
                return { ...chunk, assets: chunk.assets.filter(a => a.id !== id) };
            }));
        } else {
            setGlobalAssets(prev => prev.filter(a => a.id !== id));
            setChunks(prev => prev.map(chunk => ({
                ...chunk, assets: chunk.assets.filter(a => a.id !== id)
            })));
        }
    };

    const handleDeleteChunk = (chunkId: string) => {
        if (confirm(t.confirmDeleteChunk)) {
            setChunks(prev => prev.filter(c => c.id !== chunkId));
            if (activeChunkId === chunkId) setActiveChunkId(null);
            if (expandedId === chunkId) setExpandedId(null);
        }
    };

    return {
        // State
        chunks, globalAssets, globalStyle, setGlobalStyle,
        language, setLanguage, status, analysisProgress,
        expandedId, setExpandedId, activeChunkId, setActiveChunkId,
        showGlobalSelector, setShowGlobalSelector,
        filename,
        t, targetChunkId, targetChunk, displayedAssets,

        // Auto mode
        isAutoMode, setIsAutoMode, autoAssetTrigger, setAutoAssetTrigger,
        autoShootTrigger, handleAssetBatchComplete,

        // Chunk actions
        updateChunk, handleLoadNovel, handleAnalyze,
        handleChunkExtract, handleChunkScript, handleGenerateBeats, handleGeneratePrompts, handleImportChunk,
        handleManualExtractAssets, extractingChunksRef,

        // Scene actions
        flashScene, handleSceneUpdate, handleDuplicateScene,

        // Asset actions
        handleGenerateImageWrapper, handleUpdateAsset, handleAddAsset, handleDeleteAsset,

        // Chunk delete
        handleDeleteChunk,
    };
}
