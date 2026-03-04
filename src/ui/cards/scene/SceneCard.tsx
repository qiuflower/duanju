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
                    onGenerateImage={state.handleGenerateImage}
                    onGenerateVideo={state.handleGenerateVideo}
                    onUploadClick={state.handleUploadClick}
                    onRefresh={state.handleRefresh}
                    onSaveImage={state.saveImage}
                    fileInputRef={state.fileInputRef}
                    onFileChange={state.handleFileChange}
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
                            videoPromptUpdating={state.videoPromptUpdating}
                            assets={state.assets}
                            chapterScenes={state.chapterScenes}
                            onRemoveAsset={state.handleRemoveAsset}
                            onOpenAssetSelector={() => state.setActiveAssetSelector('video')}
                            onSpecCommit={state.handleSpecCommit}
                            onLocalSpecChange={state.handleLocalSpecChange}
                        />

                        {/* RIGHT PANE: IMAGE + DIALOGUE */}
                        <div className="flex flex-col h-full divide-y divide-white/5">
                            {/* Top: Image Prompt */}
                            <SceneImagePane
                                scene={state.scene}
                                labels={state.labels}
                                onUpdate={state.onUpdate}
                                promptGenLoading={state.promptGenLoading}
                                assets={state.assets}
                                chapterScenes={state.chapterScenes}
                                onRemoveAsset={state.handleRemoveAsset}
                                onOpenAssetSelector={() => state.setActiveAssetSelector('image')}
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
                    selectedIds={state.activeAssetSelector === 'video' ? (state.scene.videoAssetIds || []) : (state.scene.assetIds || [])}
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

export default SceneCard;
