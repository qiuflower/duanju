import React from 'react';
import { clearState } from '@/services/storage';
import InputPanel from '@/ui/panels/InputPanel';
import ChunkPanel from '@/ui/cards/chunk/ChunkPanel';
import ModelSelector from '@/ui/panels/ModelSelector';
import { AssetSelector } from '@/ui/panels/asset-library/AssetSelector';
import { Film, Globe, Book, Trash2, PlayCircle, PauseCircle, Upload } from 'lucide-react';
import { STATE_KEY } from '@/shared/constants/defaults';
import { useAppState } from './useAppState';

const App: React.FC = () => {
    const {
        chunks, globalAssets, globalStyle, setGlobalStyle,
        language, setLanguage, status, analysisProgress,
        expandedId, setExpandedId, activeChunkId, setActiveChunkId,
        showGlobalSelector, setShowGlobalSelector,
        filename, t, targetChunkId, targetChunk, displayedAssets,
        isAutoMode, setIsAutoMode, autoAssetTrigger, setAutoAssetTrigger,
        autoShootTrigger, handleAssetBatchComplete,
        updateChunk, handleLoadNovel, handleAnalyze,
        handleChunkExtract, handleChunkScript, handleGenerateBeats, handleGeneratePrompts, handleImportChunk,
        handleManualExtractAssets,
        flashScene, handleSceneUpdate, handleDuplicateScene,
        handleGenerateImageWrapper, handleUpdateAsset, handleAddAsset, handleDeleteAsset,
        handleDeleteChunk,
        handleCopyChunk,
    } = useAppState();


    return (
        <div className="min-h-screen bg-dark-900 text-gray-100 flex flex-col font-sans selection:bg-primary-500/30">

            {/* Header */}
            <header className="bg-dark-800 border-b border-white/5 sticky top-0 z-50 backdrop-blur-md bg-opacity-80">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-primary-400 to-primary-600 rounded-lg flex items-center justify-center shadow-lg shadow-primary-500/20">
                            <Film className="w-5 h-5 text-dark-900" />
                        </div>
                        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 hidden sm:block">
                            {t.appTitle} <span className="font-light text-primary-400">Pro</span>
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
                                ? 'bg-primary-500 text-black border-primary-400 shadow-lg shadow-primary-500/20 animate-pulse'
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

                        <div className="flex items-center gap-2 bg-black/20 px-3 py-1.5 rounded-full border border-white/5 hover:border-primary-500/30 transition-colors">
                            <label className="cursor-pointer flex items-center gap-2 text-gray-400 hover:text-primary-400 transition-colors" title={language === 'Chinese' ? "导入章节片段 (ZIP)" : "Import Chunk (ZIP)"}>
                                <Upload className="w-4 h-4" />
                                <input type="file" accept=".zip" className="hidden" onChange={handleImportChunk} />
                            </label>
                        </div>

                        <div className="flex items-center gap-2 bg-black/20 px-3 py-1.5 rounded-full border border-white/5 hover:border-primary-500/30 transition-colors">
                            <Globe className="w-3.5 h-3.5 text-primary-400" />
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
                            onCopyChunk={handleCopyChunk}
                            onSceneUpdate={handleSceneUpdate}
                            onDuplicateScene={handleDuplicateScene}
                            onExtract={handleChunkExtract}
                            onGenerateScript={handleChunkScript}
                            onGenerateBeats={handleGenerateBeats}
                            onGeneratePrompts={handleGeneratePrompts}
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
