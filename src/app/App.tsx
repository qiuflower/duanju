import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AnalysisStatus, Scene, Asset, GlobalStyle, NovelChunk } from '@/shared/types';
import { generateSceneImage } from '@/services/ai';
import { translations } from '@/services/i18n/translations';
import { clearState } from '@/services/storage';
import InputPanel from '@/ui/panels/InputPanel';
import ChunkPanel from '@/ui/cards/ChunkPanel';
import ModelSelector from '@/ui/panels/ModelSelector';
import { AssetSelector } from '@/ui/common/AssetSelector';
import { Film, Globe, Book, Trash2, PlayCircle, PauseCircle, Upload } from 'lucide-react';

import { STATE_KEY } from '@/shared/constants/defaults';
import { useSessionRestore } from '@/features/useSessionRestore';
import { useSceneManager } from '@/features/useSceneManager';
import { useAutomation } from '@/features/useAutomation';
import { useChunkManager } from '@/features/useChunkManager';

const App: React.FC = () => {
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
        handleChunkScript, handleImportChunk, handleAnalyze, extractingChunksRef
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
        return await generateSceneImage(scene.np_prompt, "", globalStyle, assetsToUse, scene.assetIds);
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

    // ── Render ───────────────────────────────────────
    return (
        <div className="min-h-screen bg-dark-900 text-gray-100 flex flex-col font-sans selection:bg-banana-500/30">

            {/* Header */}
            <header className="bg-dark-800 border-b border-white/5 sticky top-0 z-50 backdrop-blur-md bg-opacity-80">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-banana-400 to-banana-600 rounded-lg flex items-center justify-center shadow-lg shadow-banana-500/20">
                            <Film className="w-5 h-5 text-dark-900" />
                        </div>
                        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 hidden sm:block">
                            {t.appTitle} <span className="font-light text-banana-400">Pro</span>
                        </h1>
                    </div>

                    <div className="flex items-center gap-3 text-xs md:text-sm">
                        <button
                            onClick={() => {
                                const nextMode = !isAutoMode;
                                setIsAutoMode(nextMode);
                                if (nextMode && chunks.length > 0) {
                                    let target = activeChunkId ? chunks.find(c => c.id === activeChunkId) : null;
                                    if (!target) {
                                        target = chunks.find(c => c.status !== 'completed') || chunks[0];
                                        setActiveChunkId(target.id);
                                    }
                                    if (target) {
                                        if (target.status === 'idle') {
                                            handleChunkExtract(target).then(() => updateChunk(target.id, { status: 'extracted' }));
                                        } else if (target.status === 'scripted') {
                                            const needsAssets = target.assets.some(a => !a.refImageUrl);
                                            if (needsAssets) {
                                                setAutoAssetTrigger(true);
                                                setTimeout(() => setAutoAssetTrigger(false), 1000);
                                            }
                                        }
                                    }
                                }
                            }}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${isAutoMode
                                ? 'bg-banana-500 text-black border-banana-400 shadow-lg shadow-banana-500/20 animate-pulse'
                                : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'
                                }`}
                            title={isAutoMode ? "Turn Off Automation" : "Turn On Automation"}
                        >
                            {isAutoMode ? <PauseCircle className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
                            <span className="font-bold">{isAutoMode ? "AUTO ON" : "AUTO OFF"}</span>
                        </button>

                        <button
                            onClick={async () => {
                                if (confirm(language === 'Chinese' ? "确定要清除所有缓存并重置吗？这将丢失当前所有进度。" : "Are you sure you want to clear cache? All progress will be lost.")) {
                                    await clearState(STATE_KEY);
                                    window.location.reload();
                                }
                            }}
                            className="p-2 text-gray-400 hover:text-red-400 transition-colors rounded-full hover:bg-white/5"
                            title={language === 'Chinese' ? "清除缓存并重置" : "Clear Cache & Reset"}
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>

                        <ModelSelector />

                        <div className="flex items-center gap-2 bg-black/20 px-3 py-1.5 rounded-full border border-white/5 hover:border-banana-500/30 transition-colors">
                            <label className="cursor-pointer flex items-center gap-2 text-gray-400 hover:text-banana-400 transition-colors" title={language === 'Chinese' ? "导入章节片段 (ZIP)" : "Import Chunk (ZIP)"}>
                                <Upload className="w-4 h-4" />
                                <input type="file" accept=".zip" className="hidden" onChange={handleImportChunk} />
                            </label>
                        </div>

                        <div className="flex items-center gap-2 bg-black/20 px-3 py-1.5 rounded-full border border-white/5 hover:border-banana-500/30 transition-colors">
                            <Globe className="w-3.5 h-3.5 text-banana-400" />
                            <select
                                value={language}
                                onChange={(e) => setLanguage(e.target.value)}
                                className="bg-transparent border-none focus:outline-none text-gray-300 font-medium cursor-pointer appearance-none pr-1 text-center"
                                style={{ textAlignLast: 'center' }}
                            >
                                <option value="Chinese" className="bg-dark-800 text-white">中文</option>
                                <option value="English" className="bg-dark-800 text-white">English</option>
                                <option value="Japanese" className="bg-dark-800 text-white">日本語</option>
                                <option value="Korean" className="bg-dark-800 text-white">한국어</option>
                                <option value="Spanish" className="bg-dark-800 text-white">Español</option>
                                <option value="French" className="bg-dark-800 text-white">Français</option>
                            </select>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 max-w-screen-2xl w-full mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-4rem)]">

                {/* Left: Settings Panel */}
                <div className="lg:col-span-3 h-full lg:sticky lg:top-24 flex flex-col gap-4">
                    <InputPanel
                        onAnalyze={handleAnalyze}
                        onLoadNovel={handleLoadNovel}
                        novelStatus={{
                            hasNovel: chunks.length > 0,
                            filename: filename,
                            progress: `${chunks.filter(c => c.status === 'completed').length} / ${chunks.length}`
                        }}
                        status={status}
                        labels={t}
                        assets={displayedAssets}
                        onUpdateAsset={handleUpdateAsset}
                        onAddAsset={handleAddAsset}
                        onDeleteAsset={handleDeleteAsset}
                        onExtractAssets={handleManualExtractAssets}
                        styleState={globalStyle}
                        onStyleChange={setGlobalStyle}
                        language={language}
                        autoAssetTrigger={autoAssetTrigger}
                        onAssetBatchComplete={handleAssetBatchComplete}
                        onImportFromGlobal={targetChunkId ? () => setShowGlobalSelector(true) : undefined}
                        progressMessage={analysisProgress}
                    />
                </div>

                {/* Right: Chunk Workflow Stream */}
                <div className="lg:col-span-9 flex flex-col gap-4 pb-20 relative">

                    {chunks.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full opacity-30 text-center p-8 border-2 border-dashed border-white/10 rounded-xl mt-10">
                            <Book className="w-16 h-16 mb-4" />
                            <h3 className="text-xl font-bold">{t.readyTitle}</h3>
                            <p className="max-w-md">{t.readyDesc}</p>
                        </div>
                    )}

                    {chunks.map((chunk) => (
                        <ChunkPanel
                            key={chunk.id}
                            chunk={chunk}
                            globalAssets={globalAssets}
                            styleState={globalStyle}
                            labels={t}
                            onUpdateChunk={updateChunk}
                            onDeleteChunk={handleDeleteChunk}
                            onSceneUpdate={handleSceneUpdate}
                            onDuplicateScene={handleDuplicateScene}
                            onExtract={handleChunkExtract}
                            onGenerateScript={handleChunkScript}
                            onGenerateImage={handleGenerateImageWrapper}
                            language={language}
                            isActive={expandedId === chunk.id}
                            flashSceneId={flashScene?.chunkId === chunk.id ? flashScene.sceneId : undefined}
                            onToggle={() => {
                                setExpandedId(expandedId === chunk.id ? null : chunk.id);
                                if (!isAutoMode) {
                                    setActiveChunkId(activeChunkId === chunk.id ? null : chunk.id);
                                }
                            }}
                            autoShoot={activeChunkId === chunk.id ? autoShootTrigger : false}
                            isLocked={isAutoMode && activeChunkId !== chunk.id}
                        />
                    ))}

                </div>
            </main>

            {showGlobalSelector && (
                <AssetSelector
                    assets={globalAssets}
                    onClose={() => setShowGlobalSelector(false)}
                    onSelect={() => { }}
                    allowMultiple={true}
                    selectedIds={targetChunk?.assets.map(a => a.id) || []}
                    onConfirm={(selectedIds) => {
                        if (targetChunkId && targetChunk) {
                            const newAssets = globalAssets.filter(a => selectedIds.includes(a.id));
                            const existingIds = new Set(targetChunk.assets.map(a => a.id));
                            const uniqueNew = newAssets.filter(a => !existingIds.has(a.id));
                            if (uniqueNew.length > 0) {
                                updateChunk(targetChunkId, { assets: [...targetChunk.assets, ...uniqueNew] });
                            }
                        }
                        setShowGlobalSelector(false);
                    }}
                />
            )}
        </div>
    );
};

export default App;
