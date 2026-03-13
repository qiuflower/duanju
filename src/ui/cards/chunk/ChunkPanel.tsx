import React, { useEffect } from 'react';
import { NovelChunk, Asset, GlobalStyle, Scene } from '@/shared/types';
import { Translation } from '@/services/i18n/translations';
import { ChevronDown, ChevronRight, Wand2, FileText, Video, Download, CheckCircle, Loader2, Film, AlertTriangle, AlertCircle, Trash2, X, Save } from 'lucide-react';
import SceneCard from '@/ui/cards/scene/SceneCard';
import { useChunkActions } from './useChunkActions';

interface ChunkPanelProps {
    chunk: NovelChunk;
    globalAssets: Asset[];
    styleState: GlobalStyle;
    labels: Translation;
    onUpdateChunk: (id: string, updates: Partial<NovelChunk>) => void;
    onDeleteChunk: (id: string) => void;
    onSceneUpdate: (chunkId: string, sceneId: string, updates: Partial<Scene>) => void;
    onDuplicateScene: (chunkId: string, sceneId: string) => void;
    onExtract: (chunk: NovelChunk) => Promise<Asset[]>;
    onGenerateScript: (chunk: NovelChunk) => Promise<Scene[]>;
    onGenerateBeats: (chunk: NovelChunk) => Promise<Scene[]>;
    onGeneratePrompts: (chunk: NovelChunk) => Promise<Scene[]>;
    onGenerateImage: (scene: Scene, chunkAssets?: Asset[]) => Promise<string>;
    language: string;
    isActive: boolean;
    onToggle: () => void;
    autoShoot?: boolean;
    isLocked?: boolean;
    flashSceneId?: string;
}

const ChunkPanel: React.FC<ChunkPanelProps> = ({
    chunk, globalAssets, styleState, labels,
    onUpdateChunk, onDeleteChunk, onSceneUpdate, onDuplicateScene,
    onExtract, onGenerateScript, onGenerateBeats, onGeneratePrompts, onGenerateImage,
    language, isActive, onToggle,
    autoShoot = false, isLocked = false, flashSceneId
}) => {
    const {
        loadingStep, scriptError, exportProgress,
        generatingSceneIds, getSceneAssetsReady, getVideoAssetsReady, anyAssetPending,
        showTextModal, setShowTextModal, editingText, setEditingText,
        handleAddChunkAssets, handleExtract, handleScript,
        handleStoryboard, handleGeneratePromptsAction,
        handleDeleteScene, handleDuplicateScene,
        handleShoot, handleMakeFilm,
        handleSceneUpdateWrapper, handleImageGenerated,
        handleGenerateImageInternal, handleVideoGenerated,
        handleDownload,
    } = useChunkActions({
        chunk, styleState, language, isActive,
        onUpdateChunk, onSceneUpdate, onDuplicateScene,
        onExtract, onGenerateScript, onGenerateBeats, onGeneratePrompts, onGenerateImage, onToggle
    });

    // Auto-Shoot mechanism
    useEffect(() => {
        if (autoShoot) {
            const t = setTimeout(() => {
                handleShoot();
            }, 500);
            return () => clearTimeout(t);
        }
    }, [autoShoot]);

    return (
        <>
            <div className={`bg-dark-800 rounded-xl border overflow-hidden shadow-lg transition-all duration-300 ease-in-out w-[75%] ${isActive ? 'border-banana-500/30 ring-1 ring-banana-500/20' : 'border-white/10'}`}>

                {/* Header */}
                <div className={`p-4 flex items-center justify-between bg-white/5 cursor-pointer hover:bg-white/10 ${isLocked ? 'opacity-75' : ''}`} onClick={onToggle}>
                    <div className="flex items-center gap-4">
                        <button className="text-gray-400">
                            {isActive ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                        </button>
                        <div className="flex-1" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={chunk.title || `${labels.chunkLabel} ${chunk.index + 1}`}
                                    onChange={(e) => onUpdateChunk(chunk.id, { title: e.target.value })}
                                    className="bg-transparent text-sm font-bold text-white focus:outline-none focus:ring-1 focus:ring-banana-500/50 rounded px-1 -ml-1 hover:bg-white/5 transition-colors w-full"
                                />
                                {isLocked && <span className="text-[10px] bg-banana-500/20 text-banana-400 px-2 py-0.5 rounded-full border border-banana-500/30 whitespace-nowrap">Auto-Focus</span>}
                            </div>
                            <p
                                className="text-xs text-gray-500 font-mono mt-1 cursor-pointer hover:text-banana-400 transition-colors flex items-center gap-1 group"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingText(chunk.text);
                                    setShowTextModal(true);
                                }}
                                title="点击查看完整内容"
                            >
                                <span className="group-hover:underline decoration-banana-400/50 underline-offset-2">{chunk.text.substring(0, 60)}...</span>
                                <FileText className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-banana-400" />
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={(e) => { e.stopPropagation(); onDeleteChunk(chunk.id); }}
                            className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-white/10 rounded transition-colors"
                            title={labels.btnDelete}
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>

                        {/* Asset Status Indicator */}
                        {anyAssetPending && (
                            <div className="text-yellow-500 text-xs flex items-center gap-1" title="Please generate asset images in the Assets tab first">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span className="hidden md:inline">Assets Pending</span>
                            </div>
                        )}

                        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${chunk.status === 'completed' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                            chunk.status === 'shooting' ? 'bg-banana-500/20 text-banana-400 border border-banana-500/30 animate-pulse' :
                                chunk.status === 'storyboarded' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                                    'bg-gray-700 text-gray-400'
                            }`}>
                            {chunk.status === 'completed' && <CheckCircle className="w-3 h-3" />}
                            {chunk.status}
                        </div>
                    </div>
                </div>

                {/* Workflow Toolbar */}
                <div className="border-t border-white/10 p-2 bg-black/20 flex flex-wrap gap-2 justify-end items-center">

                    {scriptError && (
                        <div className="mr-auto text-red-400 text-xs flex items-center gap-2 px-2">
                            <AlertCircle className="w-3.5 h-3.5" />
                            {scriptError}
                        </div>
                    )}

                    {(chunk.status === 'completed' || chunk.scenes.length > 0) && (
                        <button onClick={handleDownload} disabled={exportProgress !== null} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded text-xs font-bold text-white flex items-center gap-2">
                            {exportProgress !== null ? (
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 border-2 border-white/50 border-t-transparent rounded-full animate-spin" />
                                    {Math.round(exportProgress)}%
                                </div>
                            ) : (
                                <>
                                    <Download className="w-4 h-4" /> {labels.btnDownload}
                                </>
                            )}
                        </button>
                    )}

                    <div className="group relative">
                        <button
                            onClick={(e) => { e.stopPropagation(); handleStoryboard(); }}
                            disabled={loadingStep !== 'none'}
                            className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-2 ${loadingStep === 'none'
                                ? 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-400'
                                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                }`}
                        >
                            {loadingStep === 'storyboarding' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                            {labels.btnStoryboard || (language === 'Chinese' ? '生成分镜' : 'Storyboard')}
                        </button>
                    </div>

                    <div className="group relative">
                        <button
                            onClick={(e) => { e.stopPropagation(); handleGeneratePromptsAction(); }}
                            disabled={loadingStep !== 'none' || chunk.scenes.length === 0}
                            className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-2 ${loadingStep === 'none' && chunk.scenes.length > 0
                                ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400'
                                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                }`}
                        >
                            {loadingStep === 'scripting' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                            {labels.btnGeneratePrompts || (language === 'Chinese' ? '生成提示词' : 'Gen Prompts')}
                        </button>
                        {chunk.scenes.length === 0 && (
                            <div className="absolute bottom-full right-0 mb-2 w-48 bg-black/90 text-white text-[10px] p-2 rounded pointer-events-none hidden group-hover:block z-50 text-center">
                                {language === 'English' ? 'Generate Storyboard first' : '请先生成分镜'}
                            </div>
                        )}
                    </div>

                    <div className="group relative">
                        <button
                            onClick={(e) => { e.stopPropagation(); handleShoot(); }}
                            disabled={chunk.scenes.length === 0}
                            className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-2 shadow-lg ${chunk.scenes.length > 0
                                ? 'bg-banana-500 text-black hover:bg-banana-400 shadow-banana-500/20'
                                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                }`}
                        >
                            <Video className="w-4 h-4" />
                            {labels.btnShoot}
                        </button>
                    </div>

                    <button
                        onClick={(e) => { e.stopPropagation(); handleMakeFilm(); }}
                        disabled={chunk.scenes.length === 0 || loadingStep === 'filming'}
                        className="px-3 py-1.5 bg-red-500 text-white hover:bg-red-400 rounded text-xs font-bold flex items-center gap-2 shadow-lg shadow-red-500/20"
                    >
                        {loadingStep === 'filming' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
                        {labels.btnFilm}
                    </button>
                </div>

                {/* Content Body */}
                {isActive && (
                    <div className="p-4 border-t border-white/10 space-y-4">
                        {chunk.scenes.length === 0 ? (
                            <div className="text-center py-8 text-gray-600 italic text-sm">
                                {labels.statusReady}. Generate Script to begin.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {chunk.scenes.map(scene => (
                                    <SceneCard
                                        key={scene.id}
                                        scene={scene}
                                        characterDesc=""
                                        labels={labels}
                                        onUpdate={handleSceneUpdateWrapper}
                                        onDelete={handleDeleteScene}
                                        onDuplicate={handleDuplicateScene}
                                        isGeneratingExternal={generatingSceneIds.includes(scene.id)}
                                        onGenerateImageOverride={handleGenerateImageInternal}
                                        onImageGenerated={handleImageGenerated}
                                        onVideoGenerated={handleVideoGenerated}
                                        globalStyle={styleState}
                                        areAssetsReady={getSceneAssetsReady(scene)}
                                        videoAssetsReady={getVideoAssetsReady(scene)}
                                        assets={chunk.assets}
                                        onAddAsset={handleAddChunkAssets}
                                        language={language}
                                        flash={flashSceneId === scene.id}
                                        chapterScenes={chunk.scenes}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Full Text Modal */}
            {showTextModal && (
                <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-8 backdrop-blur-sm" onClick={() => setShowTextModal(false)}>
                    <div className="bg-dark-900 rounded-xl max-w-6xl w-full h-[85vh] flex flex-col border border-white/10 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                        {/* Modal Header */}
                        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <FileText className="w-5 h-5 text-banana-400" />
                                {chunk.title || `Episode ${chunk.index + 1}`}
                                <span className="text-xs font-normal text-gray-500 ml-2">(Edit to update script generation)</span>
                            </h3>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        onUpdateChunk(chunk.id, { text: editingText });
                                        setShowTextModal(false);
                                    }}
                                    className="px-3 py-1.5 bg-banana-500 hover:bg-banana-400 text-black text-sm font-bold rounded flex items-center gap-2 transition-colors"
                                >
                                    <Save className="w-4 h-4" />
                                    Save
                                </button>
                                <button
                                    onClick={() => setShowTextModal(false)}
                                    className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Modal Content */}
                        <div className="p-0 overflow-hidden flex-1 flex flex-col bg-dark-950/50 h-full">
                            <textarea
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                className="w-full h-full p-6 bg-transparent text-gray-300 font-mono text-sm leading-relaxed focus:outline-none resize-none"
                                spellCheck={false}
                            />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default ChunkPanel;
