import React from 'react';
import { Scene, Asset } from '@/shared/types';
import { Translation } from '@/services/i18n/translations';
import { Video, Clock, Camera, Zap, Plus, X, Image as ImageIcon } from 'lucide-react';
import MentionTextarea from '@/ui/components/MentionTextarea';

interface SceneVideoPaneProps {
    scene: Scene;
    labels: Translation;
    onUpdate: (id: string, field: keyof Scene, value: any) => void;
    hasImage: boolean;
    assets: Asset[];
    chapterScenes: Scene[];
    onRemoveAsset: (assetId: string, mode: 'image' | 'video') => void;
    onOpenAssetSelector: (mode: 'video') => void;
    onMentionAsset: (assetId: string) => void;
    onUnmentionAsset: (assetId: string) => void;
    sceneImages?: { id: string; name: string; refImageUrl?: string }[];
    onSpecCommit: (field: keyof Scene, value: string) => void;
    onLocalSpecChange: (field: keyof Scene, value: string) => void;
    isStartEndFrameMode?: boolean;
    startEndAssetIds?: string[];
    onOpenEndFrameSelector: () => void;
    onRemoveEndFrame: () => void;
}

const SceneVideoPane: React.FC<SceneVideoPaneProps> = ({
    scene,
    labels,
    onUpdate,
    hasImage,
    assets,
    chapterScenes,
    onRemoveAsset,
    onOpenAssetSelector,
    onMentionAsset,
    onUnmentionAsset,
    sceneImages,
    onSpecCommit,
    onLocalSpecChange,
    isStartEndFrameMode,
    startEndAssetIds,
    onOpenEndFrameSelector,
    onRemoveEndFrame,
}) => {
    // Resolve end frame asset name
    const endFrameId = startEndAssetIds?.[1];
    const endFrameAsset = endFrameId ? assets.find(a => a.id === endFrameId) : null;
    // Also check sceneImages for scene_img_ type IDs
    const endFrameSceneImg = endFrameId && !endFrameAsset ? sceneImages?.find(s => s.id === endFrameId) : null;
    const endFrameName = endFrameAsset?.name || endFrameSceneImg?.name || endFrameId;
    return (
        <div className="p-3 flex flex-col gap-2 bg-black/10 h-full">
            <div className="flex justify-between items-center">
                <h4 className="text-[10px] uppercase tracking-widest text-blue-400 font-bold flex items-center gap-2">
                    <Video className="w-3 h-3" />
                    {labels.videoPromptLabel}
                </h4>
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

            {/* Start/End Frame Panel */}
            {isStartEndFrameMode && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 overflow-hidden mb-1">
                    {/* START row */}
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-500/10">
                        <span className="text-[9px] uppercase tracking-widest text-gray-500 font-bold w-10 shrink-0">START</span>
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/15 border border-green-500/20">
                            <ImageIcon className="w-3 h-3 text-green-400" />
                            <span className="text-[10px] text-green-300 font-medium">Storyboard Image</span>
                        </div>
                    </div>
                    {/* END row */}
                    <div className="flex items-center gap-2 px-3 py-2">
                        <span className="text-[9px] uppercase tracking-widest text-gray-500 font-bold w-10 shrink-0">END</span>
                        {endFrameId ? (
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/20">
                                <ImageIcon className="w-3 h-3 text-blue-400" />
                                <span className="text-[10px] text-blue-300 font-medium">{endFrameName}</span>
                                <button
                                    onClick={onRemoveEndFrame}
                                    className="ml-0.5 p-0.5 rounded-full hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors"
                                    title="Remove End Frame"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={onOpenEndFrameSelector}
                                className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-white/15 text-[10px] text-gray-400 hover:text-banana-400 hover:border-banana-500/30 transition-colors"
                            >
                                <Plus className="w-3 h-3" />
                                Add End Frame
                            </button>
                        )}
                    </div>
                </div>
            )}



            <MentionTextarea
                value={scene.video_prompt !== undefined ? scene.video_prompt : (scene.visual_desc || '')}
                onChange={(val) => {
                    if (scene.video_prompt !== undefined) {
                        onUpdate(scene.id, 'video_prompt', val);
                    } else {
                        onUpdate(scene.id, 'visual_desc', val);
                    }
                }}
                assets={assets}
                sceneImages={sceneImages}
                referencedAssetIds={isStartEndFrameMode ? (startEndAssetIds || []) : (scene.videoAssetIds || [])}
                onMention={onMentionAsset}
                onUnmention={onUnmentionAsset}
                maxMentions={isStartEndFrameMode ? undefined : 3}
                mode="video"
                className={`flex-1 w-full p-2 rounded border border-white/5 text-xs resize-none outline-none focus:border-blue-500/30 min-h-[10rem] transition-colors ${scene.video_prompt ? 'bg-green-900/10 text-green-100 border-green-500/20' : 'bg-black/20 text-gray-300'
                    }`}
                placeholder={labels.visualDesc}
            />
        </div >
    );
};

export default SceneVideoPane;
