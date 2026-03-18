import React from 'react';
import { Scene, GlobalStyle, Asset } from '@/shared/types';
import { Translation } from '@/services/i18n/translations';
import { AssetSelector } from '@/ui/panels/asset-library/AssetSelector';

import { useSceneCard, UseSceneCardProps } from './useSceneCard';
import SceneHeader from './SceneHeader';
import SceneMediaViewer from './SceneMediaViewer';
import SceneVideoPane from './SceneVideoPane';
import SceneImagePane from './SceneImagePane';
import SceneDialoguePane from './SceneDialoguePane';

interface SceneCardProps {
    scene: Scene;
    characterDesc: string;
    labels: Translation;
    onUpdate: (id: string, field: keyof Scene, value: any) => void;
    onDelete?: (id: string) => void;
    onDuplicate?: (id: string) => void;
    isGeneratingExternal?: boolean;
    onGenerateImageOverride?: (scene: Scene) => Promise<string>;
    onImageGenerated?: (id: string, url: string) => void;
    onVideoGenerated?: (id: string, url: string, assetId?: string) => void;
    globalStyle: GlobalStyle;
    areAssetsReady?: boolean;
    videoAssetsReady?: boolean;
    assets?: Asset[];
    onAddAsset?: (asset: Asset | Asset[]) => void;
    language?: string;
    isOptimizing?: boolean;
    flash?: boolean;
    chapterScenes?: Scene[];
}

const SceneCard: React.FC<SceneCardProps> = (props) => {
    const state = useSceneCard(props as UseSceneCardProps);

    return (
        <div className={`rounded-xl border overflow-hidden bg-dark-900 shadow-lg transition-all duration-300 ${state.flash ? 'ring-2 ring-banana-500 animate-pulse' : 'border-white/5'}`}>
            <div className="flex flex-col md:flex-row">
                {/* LEFT COLUMN: MEDIA */}
                <SceneMediaViewer
                    scene={state.scene}
                    labels={state.labels}
                    onUpdate={state.onUpdate}
                    genStatus={state.genStatus}
                    videoStatus={state.videoStatus}
                    viewMode={state.viewMode}
                    setViewMode={state.setViewMode}
                    hasImage={state.hasImage}
                    hasVideo={state.hasVideo}
                    isGeneratingExternal={state.isGeneratingExternal}
                    areAssetsReady={state.areAssetsReady}
                    videoAssetsReady={state.videoAssetsReady}
                    onGenerateImage={state.handleGenerateImage}
                    onGenerateVideo={state.handleGenerateVideo}
                    onUploadClick={state.handleUploadClick}
                    onRefresh={state.handleRefresh}
                    onDeleteImage={state.handleDeleteImage}
                    onDeleteVideo={state.handleDeleteVideo}
                    onVideoUploadClick={state.handleVideoUploadClick}
                    onSaveImage={state.saveImage}
                    fileInputRef={state.fileInputRef}
                    onFileChange={state.handleFileChange}
                    videoFileInputRef={state.videoFileInputRef}
                    onVideoFileChange={state.handleVideoFileChange}
                />

                {/* RIGHT COLUMN: CONTENT */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Header: Scene ID & Narration */}
                    <SceneHeader
                        scene={state.scene}
                        labels={state.labels}
                        onUpdate={state.onUpdate}
                        onDelete={state.onDelete}
                        onDuplicate={state.onDuplicate}
                        ttsLoading={state.ttsLoading}
                        audioUrl={state.audioUrl}
                        audioRef={state.audioRef}
                        onNarrationTTS={state.handleNarrationTTS}
                        onDownloadAudio={state.handleDownloadAudio}
                    />

                    {/* Middle: Split Content (Video Left, Image/Dialogue Right) */}
                    <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-white/5">
                        {/* LEFT PANE: VIDEO PROMPT */}
                        <SceneVideoPane
                            scene={state.scene}
                            labels={state.labels}
                            onUpdate={state.onUpdate}
                            hasImage={state.hasImage}
                            useAssets={state.useAssets}
                            setUseAssets={state.setUseAssets}
                            assets={state.assets}
                            chapterScenes={state.chapterScenes}
                            onRemoveAsset={state.handleRemoveAsset}
                            onOpenAssetSelector={() => state.setActiveAssetSelector('video')}
                            onMentionAsset={state.handleMentionVideo}
                            onUnmentionAsset={state.handleUnmentionVideo}
                            sceneImages={state.sceneImages}
                            onSpecCommit={state.handleSpecCommit}
                            onLocalSpecChange={state.handleLocalSpecChange}
                            isStartEndFrameMode={state.scene.isStartEndFrameMode}
                            startEndAssetIds={state.scene.startEndAssetIds}
                            onOpenEndFrameSelector={() => state.setActiveAssetSelector('video')}
                            onRemoveEndFrame={() => state.handleRemoveAsset(state.scene.startEndAssetIds?.[1] || '', 'video')}
                        />

                        {/* RIGHT PANE: IMAGE + DIALOGUE */}
                        <div className="flex flex-col h-full divide-y divide-white/5">
                            {/* Top: Image Prompt */}
                            <SceneImagePane
                                scene={state.scene}
                                labels={state.labels}
                                onUpdate={state.onUpdate}
                                assets={state.assets}
                                chapterScenes={state.chapterScenes}
                                onRemoveAsset={state.handleRemoveAsset}
                                onOpenAssetSelector={() => state.setActiveAssetSelector('image')}
                                onMentionAsset={state.handleMentionImage}
                                onUnmentionAsset={state.handleUnmentionImage}
                                sceneImages={state.sceneImages}
                            />

                            {/* Bottom: Dialogue & Audio Section */}
                            <SceneDialoguePane
                                scene={state.scene}
                                labels={state.labels}
                                onUpdate={state.onUpdate}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {state.activeAssetSelector !== 'none' && (
                <AssetSelector
                    assets={state.assets}
                    selectedIds={state.activeAssetSelector === 'video' ? (state.scene.isStartEndFrameMode ? (state.scene.startEndAssetIds || []) : (state.scene.videoAssetIds || [])) : (state.scene.assetIds || [])}
                    onSelect={state.handleAddAsset}
                    onClose={() => state.setActiveAssetSelector('none')}
                    onAssetCreated={state.onAddAsset}
                    maxSelections={state.activeAssetSelector === 'video' && !state.scene.isStartEndFrameMode ? 3 : undefined}
                    extraAssets={state.scene.imageUrl ? [{
                        id: `scene_img_${state.scene.id}`,
                        name: "Current Scene",
                        description: "The current generated storyboard image for this scene.",
                        type: "item",
                        refImageUrl: state.scene.imageUrl
                    }] : []}
                    sceneImages={state.sceneImages}
                />
            )}
        </div>
    );
};

export default React.memo(SceneCard, (prev, next) => {
    return prev.scene === next.scene
        && prev.isGeneratingExternal === next.isGeneratingExternal
        && prev.areAssetsReady === next.areAssetsReady
        && prev.videoAssetsReady === next.videoAssetsReady
        && prev.flash === next.flash
        && prev.assets === next.assets
        && prev.globalStyle === next.globalStyle
        && prev.language === next.language;
});
