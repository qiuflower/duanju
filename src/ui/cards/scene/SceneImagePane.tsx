import React from 'react';
import { Scene, Asset } from '@/shared/types';
import { Translation } from '@/services/i18n/translations';
import { Image as ImageIcon, Link as LinkIcon, Plus, X } from 'lucide-react';

interface SceneImagePaneProps {
    scene: Scene;
    labels: Translation;
    onUpdate: (id: string, field: keyof Scene, value: any) => void;
    promptGenLoading: boolean;
    assets: Asset[];
    chapterScenes: Scene[];
    onRemoveAsset: (assetId: string, mode: 'image' | 'video') => void;
    onOpenAssetSelector: (mode: 'image') => void;
}

const SceneImagePane: React.FC<SceneImagePaneProps> = ({
    scene,
    labels,
    onUpdate,
    promptGenLoading,
    assets,
    chapterScenes,
    onRemoveAsset,
    onOpenAssetSelector,
}) => {
    return (
        <div className="p-3 flex flex-col gap-2 relative group flex-1">
            <h4 className="text-[10px] uppercase tracking-widest text-purple-400 font-bold flex justify-between items-center">
                <span className="flex items-center gap-2"><ImageIcon className="w-3 h-3" /> {labels.imagePromptLabel}</span>
            </h4>

            {/* Reference Image IDs List */}
            <div className="flex flex-wrap gap-2">
                {(scene.assetIds || []).length === 0 && (
                    <span className="text-[10px] text-gray-600 italic py-0.5 self-center">No references</span>
                )}
                {(scene.assetIds || []).map(assetId => {
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
                                        onClick={() => onRemoveAsset(assetId, 'image')}
                                        className="hover:text-white ml-1 transition-colors"
                                        title="Remove Reference"
                                    >
                                        <X className="w-2.5 h-2.5" />
                                    </button>
                                </div>
                            );
                        }
                    }

                    return (
                        <div key={assetId} className="flex items-center gap-1 bg-purple-500/10 border border-purple-500/20 rounded px-1.5 py-0.5 text-[10px] text-purple-200 animate-fadeIn">
                            <LinkIcon className="w-2.5 h-2.5 opacity-70" />
                            <span className="max-w-[80px] truncate" title={asset?.name || assetId}>{asset?.name || assetId}</span>
                            <button
                                onClick={() => onRemoveAsset(assetId, 'image')}
                                className="hover:text-white ml-1 transition-colors"
                                title="Remove Reference"
                            >
                                <X className="w-2.5 h-2.5" />
                            </button>
                        </div>
                    );
                })}
                <button
                    onClick={() => onOpenAssetSelector('image')}
                    className="flex items-center gap-1 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 rounded px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-white transition-all"
                    title="Add Reference Image"
                >
                    <Plus className="w-2.5 h-2.5" />
                    <span>Ref</span>
                </button>
            </div>

            <textarea
                value={scene.np_prompt}
                onChange={(e) => onUpdate(scene.id, 'np_prompt', e.target.value)}
                className={`flex-1 w-full bg-black/20 p-2 rounded border border-white/5 font-mono text-xs text-gray-400 resize-none outline-none focus:border-banana-500/30 min-h-[6rem] transition-all ${promptGenLoading ? 'opacity-50 animate-pulse cursor-wait' : ''}`}
                disabled={promptGenLoading}
            />
        </div>
    );
};

export default SceneImagePane;
