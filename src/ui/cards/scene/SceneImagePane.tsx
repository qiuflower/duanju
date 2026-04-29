import React from 'react';
import { Scene, Asset } from '@/shared/types';
import { Translation } from '@/services/i18n/translations';
import { Image as ImageIcon } from 'lucide-react';
import MentionTextarea from '@/ui/components/MentionTextarea';

interface SceneImagePaneProps {
    scene: Scene;
    labels: Translation;
    onUpdate: (id: string, field: keyof Scene, value: any) => void;
    assets: Asset[];
    chapterScenes: Scene[];
    onRemoveAsset: (assetId: string, mode: 'image' | 'video') => void;
    onOpenAssetSelector: (mode: 'image') => void;
    onMentionAsset: (assetId: string) => void;
    onUnmentionAsset: (assetId: string) => void;
    sceneImages?: { id: string; name: string; refImageUrl?: string }[];
}

const SceneImagePane: React.FC<SceneImagePaneProps> = ({
    scene,
    labels,
    onUpdate,
    assets,
    chapterScenes,
    onRemoveAsset,
    onOpenAssetSelector,
    onMentionAsset,
    onUnmentionAsset,
    sceneImages,
}) => {
    return (
        <div className="p-3 flex flex-col gap-2 relative group flex-1">
            <h4 className="text-[10px] uppercase tracking-widest text-purple-400 font-bold flex justify-between items-center">
                <span className="flex items-center gap-2"><ImageIcon className="w-3 h-3" /> {labels.imagePromptLabel}</span>
            </h4>



            <MentionTextarea
                value={scene.np_prompt !== undefined ? scene.np_prompt : (scene.visual_desc || '')}
                onChange={(val) => {
                    if (scene.np_prompt !== undefined) {
                        onUpdate(scene.id, 'np_prompt', val);
                    } else {
                        onUpdate(scene.id, 'visual_desc', val);
                    }
                }}
                assets={assets}
                sceneImages={sceneImages}
                referencedAssetIds={scene.assetIds || []}
                onMention={onMentionAsset}
                onUnmention={onUnmentionAsset}
                mode="image"
                className={`flex-1 w-full bg-black/20 p-2 rounded border border-white/5 font-mono text-xs text-gray-400 resize-none outline-none focus:border-banana-500/30 min-h-[6rem] transition-all`}
            />
        </div>
    );
};

export default SceneImagePane;
