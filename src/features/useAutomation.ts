import React, { useState, useEffect } from 'react';
import { NovelChunk } from '@/shared/types';

interface AutomationDeps {
    chunks: NovelChunk[];
    activeChunkId: string | null;
    setActiveChunkId: React.Dispatch<React.SetStateAction<string | null>>;
    updateChunk: (id: string, updates: Partial<NovelChunk>) => void;
    handleChunkExtract: (chunk: NovelChunk) => Promise<any>;
    handleChunkScript: (chunk: NovelChunk) => Promise<any>;
    extractingChunksRef: React.MutableRefObject<Set<string>>;
    t: any;
}

export function useAutomation(deps: AutomationDeps) {
    const { chunks, activeChunkId, setActiveChunkId, updateChunk, handleChunkExtract, handleChunkScript, extractingChunksRef, t } = deps;

    const [isAutoMode, setIsAutoMode] = useState(false);
    const [autoAssetTrigger, setAutoAssetTrigger] = useState(false);
    const [autoShootTrigger, setAutoShootTrigger] = useState(false);

    // Derived state for automation effects
    const activeChunkObj = activeChunkId ? chunks.find(c => c.id === activeChunkId) : null;
    const activeChunkStatus = activeChunkObj?.status;
    const activeChunkSceneCount = activeChunkObj?.scenes.length ?? 0;
    const activeChunkNeedsAssets = activeChunkObj?.assets.some(a => !a.refImageUrl) ?? false;

    const handleAssetBatchComplete = () => {
        if (!isAutoMode || !activeChunkId) return;
        const currentIndex = chunks.findIndex(c => c.id === activeChunkId);
        if (currentIndex === -1 || currentIndex === chunks.length - 1) return;
        const nextChunk = chunks[currentIndex + 1];
        if (nextChunk.status === 'idle' && !extractingChunksRef.current.has(nextChunk.id)) {
            handleChunkExtract(nextChunk).then(() => {
                updateChunk(nextChunk.id, { status: 'extracted' });
            }).catch(e => console.warn("Pre-load extraction failed", e));
        }
    };

    // 1. Parallel Trigger on 'extracted'
    useEffect(() => {
        if (!isAutoMode || !activeChunkId || !activeChunkObj) return;

        if (activeChunkStatus === 'idle') {
            if (!extractingChunksRef.current.has(activeChunkObj.id)) {
                handleChunkExtract(activeChunkObj).then(() => {
                    updateChunk(activeChunkObj.id, { status: 'extracted' });
                }).catch(e => console.warn("Auto-recover extraction failed", e));
            }
            return;
        }

        if (activeChunkStatus !== 'extracted') return;

        const autoScript = async () => {
            try {
                if (activeChunkSceneCount > 0) return;
                const scenes = await handleChunkScript(activeChunkObj);
                if (scenes && scenes.length > 0) {
                    updateChunk(activeChunkObj.id, { scenes, status: 'scripted' });
                }
            } catch (e: any) {
                if (e.message === "Generation in progress") return;
                console.error("Auto script failed", e);
                setIsAutoMode(false);
            }
        };
        autoScript();

        if (activeChunkNeedsAssets) {
            setAutoAssetTrigger(true);
            setTimeout(() => setAutoAssetTrigger(false), 1000);
        } else {
            handleAssetBatchComplete();
        }
    }, [isAutoMode, activeChunkId, activeChunkStatus, activeChunkSceneCount, activeChunkNeedsAssets]);

    // 2. Convergence Trigger for 'Shoot'
    const activeChunkAssetsReady = activeChunkObj
        ? (activeChunkObj.assets.length === 0 || activeChunkObj.assets.every(a => !!a.refImageUrl))
        : false;

    useEffect(() => {
        if (!isAutoMode || !activeChunkId) return;
        const isScriptReady = activeChunkStatus === 'scripted' && activeChunkSceneCount > 0;
        if (isScriptReady && activeChunkAssetsReady && !autoShootTrigger) {
            setAutoShootTrigger(true);
            setTimeout(() => setAutoShootTrigger(false), 1000);
        }
    }, [isAutoMode, activeChunkId, activeChunkStatus, activeChunkSceneCount, activeChunkAssetsReady, autoShootTrigger]);

    // 3. Auto-Advance when done
    useEffect(() => {
        if (!isAutoMode || !activeChunkId || activeChunkStatus !== 'completed') return;
        const currentIndex = chunks.findIndex(c => c.id === activeChunkId);
        if (currentIndex < chunks.length - 1) {
            const nextChunk = chunks[currentIndex + 1];
            setActiveChunkId(nextChunk.id);
            if (nextChunk.status === 'idle' && !extractingChunksRef.current.has(nextChunk.id)) {
                handleChunkExtract(nextChunk).then(() => {
                    updateChunk(nextChunk.id, { status: 'extracted' });
                }).catch(e => console.warn("Fallback extraction failed", e));
            }
        } else {
            setIsAutoMode(false);
            alert(t.allChaptersDone || "All chapters completed!");
        }
    }, [isAutoMode, activeChunkId, activeChunkStatus]);

    return {
        isAutoMode,
        setIsAutoMode,
        autoAssetTrigger,
        setAutoAssetTrigger,
        autoShootTrigger,
        handleAssetBatchComplete
    };
}
