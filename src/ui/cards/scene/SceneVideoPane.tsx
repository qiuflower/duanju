import React from 'react';
import { Scene, Asset } from '@/shared/types';
import { Translation } from '@/services/i18n/translations';
import { Video, Clock, Camera, Zap, Image as ImageIcon, Link as LinkIcon, Plus, X } from 'lucide-react';

interface SceneVideoPaneProps {
    scene: Scene;
    labels: Translation;
    onUpdate: (id: string, field: keyof Scene, value: any) => void;
    hasImage: boolean;
    useAssets: boolean;
    setUseAssets: (v: boolean) => void;
    videoPromptUpdating: boolean;
    assets: Asset[];
    chapterScenes: Scene[];
    onRemoveAsset: (assetId: string, mode: 'image' | 'video') => void;
    onOpenAssetSelector: (mode: 'video') => void;
    onSpecCommit: (field: keyof Scene, value: string) => void;
    onLocalSpecChange: (field: keyof Scene, value: string) => void;
}

const SceneVideoPane: React.FC<SceneVideoPaneProps> = ({
    scene,
    labels,
    onUpdate,
    hasImage,
    useAssets,
    setUseAssets,
    videoPromptUpdating,
    assets,
    chapterScenes,
    onRemoveAsset,
    onOpenAssetSelector,
    onSpecCommit,
    onLocalSpecChange,
}) => {
    return (
        <div className="p-3 flex flex-col gap-2 bg-black/10 h-full">
            <div className="flex justify-between items-center">
                <h4 className="text-[10px] uppercase tracking-widest text-blue-400 font-bold flex items-center gap-2">
                    <Video className="w-3 h-3" />
                    {labels.videoPromptLabel}
                </h4>
                <div className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        id={`useAssets-${scene.id}`}
                        checked={useAssets}
                        onChange={(e) => {
                            setUseAssets(e.target.checked);
                            onUpdate(scene.id, 'useAssets', e.target.checked);
                        }}
                        className="w-3 h-3 rounded border-gray-600 text-banana-500 focus:ring-banana-500/50 bg-gray-700"
                    />
                    <label htmlFor={`useAssets-${scene.id}`} className="text-[10px] text-gray-400 cursor-pointer select-none">
                        Use Assets
                    </label>
                </div>
            </div>

            {/* Video Params Grid */}
            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono mb-1">
                <div className="bg-blue-500/10 p-1.5 rounded flex items-center gap-2 text-blue-200">
                    <Clock className="w-3 h-3 text-blue-400" />
                    <span className="opacity-50">{labels.durationLabel}:</span>
                    <input
                        value={scene.video_duration || ''}
                        onChange={e => onLocalSpecChange('video_duration', e.target.value)}
                        onBlur={e => onSpecCommit('video_duration', e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
                        className="bg-transparent w-full outline-none"
                        placeholder="3s"
                    />
                </div>
                <div className="bg-blue-500/10 p-1.5 rounded flex items-center gap-2 text-blue-200">
                    <Camera className="w-3 h-3 text-blue-400" />
                    <span className="opacity-50">{labels.lensLabel}:</span>
                    <input
                        value={scene.video_lens || ''}
                        onChange={e => onLocalSpecChange('video_lens', e.target.value)}
                        onBlur={e => onSpecCommit('video_lens', e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
                        className="bg-transparent w-full outline-none"
                        placeholder="35mm"
                    />
                </div>
                <div className="bg-blue-500/10 p-1.5 rounded flex items-center gap-2 text-blue-200">
                    <Video className="w-3 h-3 text-blue-400" />
                    <span className="opacity-50">{labels.cameraLabel}:</span>
                    <input
                        value={scene.video_camera || ''}
                        onChange={e => onLocalSpecChange('video_camera', e.target.value)}
                        onBlur={e => onSpecCommit('video_camera', e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
                        className="bg-transparent w-full outline-none"
                        placeholder="Pan"
                    />
                </div>
                <div className="bg-blue-500/10 p-1.5 rounded flex items-center gap-2 text-blue-200">
                    <Zap className="w-3 h-3 text-blue-400" />
                    <span className="opacity-50">{labels.vfxLabel}:</span>
                    <input
                        value={scene.video_vfx || ''}
                        onChange={e => onLocalSpecChange('video_vfx', e.target.value)}
                        onBlur={e => onSpecCommit('video_vfx', e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
                        className="bg-transparent w-full outline-none"
                        placeholder="-"
                    />
                </div>
            </div>

            {/* Reference Image IDs List (Video) */}
            {hasImage ? (
                <div className="flex flex-col gap-2 mb-1">
                    {scene.isStartEndFrameMode ? (
                        /* --- START/END FRAME MODE UI --- */
                        <div className="flex flex-col gap-1.5 p-2 bg-banana-500/5 border border-banana-500/20 rounded-lg">
                            <div className="text-[10px] text-banana-500/70 font-bold uppercase tracking-wider mb-0.5">Start/End Frames</div>

                            {/* 1. Start Frame (Fixed) */}
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono text-gray-500 w-8 text-right">START</span>
                                <div className="flex items-center gap-1 bg-green-500/10 border border-green-500/20 rounded px-1.5 py-1 text-[10px] text-green-200 flex-1">
                                    <ImageIcon className="w-3 h-3 opacity-70" />
                                    <span className="font-medium">Storyboard Image</span>
                                </div>
                            </div>

                            {/* 2. End Frame (Optional) */}
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono text-gray-500 w-8 text-right">END</span>

                                {(() => {
                                    const endFrameId = scene.startEndAssetIds?.[1];
                                    if (endFrameId) {
                                        const asset = assets.find(a => a.id === endFrameId);
                                        return (
                                            <div className="flex items-center gap-1 bg-blue-500/10 border border-blue-500/20 rounded px-1.5 py-1 text-[10px] text-blue-200 flex-1 animate-fadeIn justify-between group/end">
                                                <div className="flex items-center gap-1 overflow-hidden">
                                                    <LinkIcon className="w-3 h-3 opacity-70 flex-shrink-0" />
                                                    <span className="truncate" title={asset?.name || endFrameId}>{asset?.name || endFrameId}</span>
                                                </div>
                                                <button
                                                    onClick={() => onRemoveAsset(endFrameId, 'video')}
                                                    className="hover:text-white transition-colors p-0.5 rounded hover:bg-white/10"
                                                    title="Remove End Frame"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        );
                                    } else {
                                        return (
                                            <button
                                                onClick={() => onOpenAssetSelector('video')}
                                                className="flex items-center gap-1 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 rounded px-1.5 py-1 text-[10px] text-gray-400 hover:text-white transition-all flex-1 border-dashed"
                                                title="Add End Frame Asset"
                                            >
                                                <Plus className="w-3 h-3" />
                                                <span>Add End Frame</span>
                                            </button>
                                        );
                                    }
                                })()}
                            </div>
                        </div>
                    ) : (
                        /* --- STANDARD MODE UI --- */
                        <div className="flex flex-wrap gap-2">
                            {(() => {
                                const displayIds = scene.videoAssetIds || [];
                                return (
                                    <>
                                        {displayIds.length === 0 && (
                                            <span className="text-[10px] text-gray-600 italic py-0.5 self-center">No references</span>
                                        )}
                                        {displayIds.map(assetId => {
                                            if (assetId === `scene_img_${scene.id}`) {
                                                return (
                                                    <div key={assetId} className="flex items-center gap-1 bg-green-500/10 border border-green-500/20 rounded px-1.5 py-0.5 text-[10px] text-green-200 animate-fadeIn">
                                                        <ImageIcon className="w-2.5 h-2.5 opacity-70" />
                                                        <span className="max-w-[80px] truncate" title="Current Scene">Current Scene</span>
                                                        <button
                                                            onClick={() => onRemoveAsset(assetId, 'video')}
                                                            className="hover:text-white ml-1 transition-colors"
                                                            title="Remove Reference"
                                                        >
                                                            <X className="w-2.5 h-2.5" />
                                                        </button>
                                                    </div>
                                                );
                                            }

                                            const asset = assets.find(a => a.id === assetId);

                                            if (!asset && assetId.startsWith('scene_img_')) {
                                                const refId = assetId.replace('scene_img_', '');
                                                const refScene = chapterScenes.find(s => s.id === refId);
                                                if (refScene) {
                                                    return (
                                                        <div key={assetId} className="flex items-center gap-1 bg-indigo-500/10 border border-indigo-500/20 rounded px-1.5 py-0.5 text-[10px] text-indigo-200 animate-fadeIn">
                                                            <ImageIcon className="w-2.5 h-2.5 opacity-70" />
                                                            <span className="max-w-[80px] truncate" title={`Scene ${refId}`}>Scene {refId}</span>
                                                            <button
                                                                onClick={() => onRemoveAsset(assetId, 'video')}
                                                                className="hover:text-white ml-1 transition-colors"
                                                                title="Remove Reference"
                                                            >
                                                                <X className="w-2.5 h-2.5" />
                                                            </button>
                                                        </div>
                                                    );
                                                }
                                            }

                                            if (!asset) return null;

                                            return (
                                                <div key={assetId} className="flex items-center gap-1 bg-blue-500/10 border border-blue-500/20 rounded px-1.5 py-0.5 text-[10px] text-blue-200 animate-fadeIn">
                                                    <LinkIcon className="w-2.5 h-2.5 opacity-70" />
                                                    <span className="max-w-[80px] truncate" title={asset?.name || assetId}>{asset?.name || assetId}</span>
                                                    <button
                                                        onClick={() => onRemoveAsset(assetId, 'video')}
                                                        className="hover:text-white ml-1 transition-colors"
                                                        title="Remove Reference"
                                                    >
                                                        <X className="w-2.5 h-2.5" />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                        <button
                                            onClick={() => onOpenAssetSelector('video')}
                                            className={`flex items-center gap-1 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 rounded px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-white transition-all ${(displayIds.length >= 3) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            title={(displayIds.length >= 3) ? "Max 3 assets for video" : "Add Reference Image"}
                                            disabled={displayIds.length >= 3}
                                        >
                                            <Plus className="w-2.5 h-2.5" />
                                            <span>Ref</span>
                                        </button>
                                    </>
                                );
                            })()}
                        </div>
                    )}
                </div>
            ) : (
                <div className="text-[10px] text-gray-500 italic mb-1 flex items-center gap-1">
                    <ImageIcon className="w-3 h-3" />
                    Generate Storyboard Image first to enable video references.
                </div>
            )}

            <textarea
                value={scene.video_prompt || scene.visual_desc}
                onChange={(e) => {
                    if (scene.video_prompt) {
                        onUpdate(scene.id, 'video_prompt', e.target.value);
                    } else {
                        onUpdate(scene.id, 'visual_desc', e.target.value);
                    }
                }}
                className={`flex-1 w-full p-2 rounded border border-white/5 text-xs resize-none outline-none focus:border-blue-500/30 min-h-[10rem] transition-colors ${scene.video_prompt ? 'bg-green-900/10 text-green-100 border-green-500/20' : 'bg-black/20 text-gray-300'
                    } ${videoPromptUpdating ? 'opacity-50 animate-pulse cursor-wait' : ''}`}
                placeholder={labels.visualDesc}
                disabled={videoPromptUpdating}
            />
        </div>
    );
};

export default SceneVideoPane;
