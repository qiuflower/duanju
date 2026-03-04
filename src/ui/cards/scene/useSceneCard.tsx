import { useEffect, useRef } from 'react';
import { Scene, ImageGenStatus, GlobalStyle, Asset } from '@/shared/types';
import { Translation } from '@/services/i18n/translations';
import { useSceneAssets } from './useSceneAssets';
import { useSceneMedia } from './useSceneMedia';

export interface UseSceneCardProps {
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

export function useSceneCard(props: UseSceneCardProps) {
    const {
        scene, characterDesc, labels, onUpdate,
        onDelete, onDuplicate,
        isGeneratingExternal = false,
        onGenerateImageOverride, onImageGenerated, onVideoGenerated,
        globalStyle,
        areAssetsReady = true,
        assets = [],
        onAddAsset,
        language = 'Chinese',
        isOptimizing = false,
        flash = false,
        chapterScenes = []
    } = props;

    // ── Sub-hooks ──
    const assetState = useSceneAssets({
        scene, assets, globalStyle, language, chapterScenes, onUpdate
    });

    const mediaState = useSceneMedia({
        scene, characterDesc, globalStyle, assets,
        useAssets: assetState.useAssets,
        areAssetsReady, language, onUpdate,
        onGenerateImageOverride, onImageGenerated, onVideoGenerated
    });

    // ── Sync prop changes ──
    useEffect(() => {
        if (scene.useAssets !== undefined) {
            assetState.setUseAssets(scene.useAssets);
        }
    }, [scene.useAssets]);

    // ── Sync prop image/video url with local status ──
    useEffect(() => {
        mediaState.syncMediaStatus();

        if (scene.imageUrl) {
            if (scene.isStartEndFrameMode) {
                const currentSceneImgId = `scene_img_${scene.id}`;
                onUpdate(scene.id, 'startEndAssetIds', [currentSceneImgId]);
            } else {
                assetState.initializeVideoAssetIds();
            }
        }
    }, [scene.imageUrl, scene.videoUrl, scene.narrationAudioUrl]);

    // ── Reload video element on source change ──
    useEffect(() => {
        if (mediaState.viewMode !== 'video') return;
        if (!scene.videoUrl) return;
        const el = mediaState.videoRef.current;
        if (!el) return;
        try {
            el.pause();
            el.load();
            el.currentTime = 0;
        } catch { }
    }, [scene.videoUrl, mediaState.viewMode]);

    return {
        // State from media
        genStatus: mediaState.genStatus,
        videoStatus: mediaState.videoStatus,
        viewMode: mediaState.viewMode,
        setViewMode: mediaState.setViewMode,
        ttsLoading: mediaState.ttsLoading,
        audioUrl: mediaState.audioUrl,
        audioRef: mediaState.audioRef,
        videoRef: mediaState.videoRef,
        hasImage: mediaState.hasImage,
        hasVideo: mediaState.hasVideo,
        fileInputRef: mediaState.fileInputRef,

        // State from assets
        useAssets: assetState.useAssets,
        setUseAssets: assetState.setUseAssets,
        activeAssetSelector: assetState.activeAssetSelector,
        setActiveAssetSelector: assetState.setActiveAssetSelector,
        promptGenLoading: assetState.promptGenLoading,
        videoPromptUpdating: assetState.videoPromptUpdating,
        sceneImages: assetState.sceneImages,

        // Props pass-through
        scene, labels, onUpdate, onDelete, onDuplicate,
        globalStyle, assets, onAddAsset, language, chapterScenes,
        flash, isGeneratingExternal, areAssetsReady,

        // Handlers from media
        handleGenerateImage: mediaState.handleGenerateImage,
        handleGenerateVideo: mediaState.handleGenerateVideo,
        handleNarrationTTS: mediaState.handleNarrationTTS,
        handleDownloadAudio: mediaState.handleDownloadAudio,
        handleUploadClick: mediaState.handleUploadClick,
        handleFileChange: mediaState.handleFileChange,
        handleRefresh: mediaState.handleRefresh,
        saveImage: mediaState.saveImage,

        // Handlers from assets
        handleAddAsset: assetState.handleAddAsset,
        handleRemoveAsset: assetState.handleRemoveAsset,
        handleSpecCommit: assetState.handleSpecCommit,
        handleLocalSpecChange: assetState.handleLocalSpecChange,
    };
}

export type SceneCardState = ReturnType<typeof useSceneCard>;
