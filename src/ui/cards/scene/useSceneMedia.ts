import React, { useState, useRef } from 'react';
import { Scene, ImageGenStatus, GlobalStyle, Asset } from '@/shared/types';
import { generateSceneImage, generateSpeech, pcmToWav, generateVideo, pollVideoUntilDone } from '@/services/ai';
import { loadAssetUrl } from '@/services/storage';

export interface UseSceneMediaProps {
    scene: Scene;
    characterDesc: string;
    globalStyle: GlobalStyle;
    assets: Asset[];
    useAssets: boolean;
    areAssetsReady: boolean;
    language: string;
    chapterScenes?: Scene[];
    onUpdate: (id: string, field: keyof Scene, value: any) => void;
    onGenerateImageOverride?: (scene: Scene) => Promise<string>;
    onImageGenerated?: (id: string, url: string) => void;
    onVideoGenerated?: (id: string, url: string, assetId?: string) => void;
}

export function useSceneMedia(props: UseSceneMediaProps) {
    const {
        scene, characterDesc, globalStyle, assets, useAssets,
        areAssetsReady, language, chapterScenes, onUpdate,
        onGenerateImageOverride, onImageGenerated, onVideoGenerated
    } = props;

    const [genStatus, setGenStatus] = useState<ImageGenStatus>(ImageGenStatus.IDLE);
    const [videoStatus, setVideoStatus] = useState<ImageGenStatus>(ImageGenStatus.IDLE);
    const [viewMode, setViewMode] = useState<'image' | 'video'>('image');
    const [ttsLoading, setTtsLoading] = useState(false);
    const [audioUrl, setAudioUrl] = useState<string | null>(scene.narrationAudioUrl || null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const isGeneratingRef = useRef(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoFileInputRef = useRef<HTMLInputElement>(null);
    const latestImageRef = useRef<string | null>(scene.imageUrl || null);

    const hasImage = !!scene.imageUrl || !!scene.imageAssetId;
    const hasVideo = scene.isStartEndFrameMode
        ? (!!scene.startEndVideoUrl || !!scene.startEndVideoAssetId)
        : (!!scene.videoUrl || !!scene.videoAssetId);

    // Reset latestImageRef when scene ID changes
    const lastSceneIdRef = useRef(scene.id);
    if (lastSceneIdRef.current !== scene.id) {
        lastSceneIdRef.current = scene.id;
        latestImageRef.current = null;
    }

    // ── File upload ──
    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const result = e.target?.result as string;
                if (result) {
                    latestImageRef.current = result;
                    onUpdate(scene.id, 'imageUrl', result);
                    setGenStatus(ImageGenStatus.COMPLETED);
                    if (scene.isStartEndFrameMode) {
                        const currentSceneImgId = `scene_img_${scene.id}`;
                        onUpdate(scene.id, 'startEndAssetIds', [currentSceneImgId]);
                    }
                }
            };
            reader.readAsDataURL(file);
        }
    };

    // ── Generate Image ──
    const handleGenerateImage = async (force: boolean = false) => {
        if (isGeneratingRef.current) return;
        if (!areAssetsReady) return;
        if (!force && hasImage) return;

        isGeneratingRef.current = true;
        setGenStatus(ImageGenStatus.GENERATING);
        try {
            let url = "";
            if (onGenerateImageOverride) {
                url = await onGenerateImageOverride(scene);
            } else {
                const result = await generateSceneImage(scene, globalStyle, assets);
                url = result.imageUrl || result;
            }
            setGenStatus(ImageGenStatus.COMPLETED);
            if (onImageGenerated) {
                onImageGenerated(scene.id, url);
            }
        } catch (error) {
            console.error(error);
            setGenStatus(ImageGenStatus.ERROR);
        } finally {
            isGeneratingRef.current = false;
        }
    };

    // ── Generate Video (async submit + poll) ──
    const handleGenerateVideo = async () => {
        let imageToUse = latestImageRef.current || scene.imageUrl;
        if (!imageToUse && scene.imageAssetId) {
            try {
                const loaded = await loadAssetUrl(scene.imageAssetId);
                if (loaded) imageToUse = loaded;
            } catch (e) {
                console.error("Failed to load image for video gen", e);
            }
        }
        // Allow video gen without scene image (reference mode: @图像 tags provide refs)
        setVideoStatus(ImageGenStatus.GENERATING);
        try {
            // Step 1: Submit (returns immediately)
            const { operation } = await generateVideo(imageToUse || '', scene, globalStyle.aspectRatio, useAssets ? assets : [], undefined, chapterScenes);
            // Step 2: Poll until done
            const { url } = await pollVideoUntilDone(operation);

            setVideoStatus(ImageGenStatus.COMPLETED);
            if (onVideoGenerated) {
                onVideoGenerated(scene.id, url);
            }
            // Auto-switch to video view
            setViewMode('video');
        } catch (error) {
            console.error(error);
            setVideoStatus(ImageGenStatus.ERROR);
        }
    };

    // ── TTS ──
    const handleNarrationTTS = async () => {
        if (!scene.narration) return;
        setTtsLoading(true);
        try {
            const voiceId = globalStyle.narrationVoice || "Kore";
            const base64Data = await generateSpeech(scene.narration, voiceId);
            const binaryString = atob(base64Data);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const wavBlob = pcmToWav(bytes.buffer, 24000, 1);
            const reader = new FileReader();
            reader.readAsDataURL(wavBlob);
            reader.onloadend = () => {
                const url = reader.result as string;
                setAudioUrl(url);
                onUpdate(scene.id, 'narrationAudioUrl', url);
                setTimeout(() => {
                    if (audioRef.current) {
                        audioRef.current.src = url;
                        audioRef.current.play();
                    }
                }, 100);
            };
        } catch (e) {
            console.error("Narration TTS Failed", e);
        } finally {
            setTtsLoading(false);
        }
    };

    const handleDownloadAudio = () => {
        if (audioUrl) {
            const link = document.createElement('a');
            link.href = audioUrl;
            link.download = `narration_${scene.id}.wav`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    // ── Save / Download Image ──
    const saveImage = async () => {
        let imageToSave = latestImageRef.current || scene.imageUrl;
        if (!imageToSave && scene.imageAssetId) {
            try {
                imageToSave = await loadAssetUrl(scene.imageAssetId) || undefined;
            } catch (e) {
                console.error("Failed to load image for save", e);
            }
        }
        if (imageToSave) {
            try {
                let href = imageToSave;
                if (!imageToSave.startsWith('data:')) {
                    const response = await fetch(imageToSave);
                    const blob = await response.blob();
                    href = URL.createObjectURL(blob);
                }
                const link = document.createElement('a');
                link.href = href;
                link.download = `scene_${scene.id}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                if (href !== imageToSave) {
                    URL.revokeObjectURL(href);
                }
            } catch (e) {
                console.error("Failed to download image", e);
                const link = document.createElement('a');
                link.href = imageToSave;
                link.download = `scene_${scene.id}.png`;
                link.target = "_blank";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        }
    };

    const handleRefresh = () => {
        if (viewMode === 'video') {
            handleGenerateVideo();
        } else {
            handleGenerateImage(true);
        }
    };

    // ── Delete Image ──
    const handleDeleteImage = () => {
        latestImageRef.current = null;
        onUpdate(scene.id, 'imageUrl', undefined);
        onUpdate(scene.id, 'imageAssetId', undefined);
        setGenStatus(ImageGenStatus.IDLE);
    };

    // ── Delete Video ──
    const handleDeleteVideo = () => {
        if (scene.isStartEndFrameMode) {
            onUpdate(scene.id, 'startEndVideoUrl', undefined);
            onUpdate(scene.id, 'startEndVideoAssetId', undefined);
        } else {
            onUpdate(scene.id, 'videoUrl', undefined);
            onUpdate(scene.id, 'videoAssetId', undefined);
        }
        setVideoStatus(ImageGenStatus.IDLE);
    };

    // ── Upload Video ──
    const handleVideoUploadClick = () => {
        videoFileInputRef.current?.click();
    };

    const handleVideoFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const url = URL.createObjectURL(file);
            if (scene.isStartEndFrameMode) {
                onUpdate(scene.id, 'startEndVideoUrl', url);
            } else {
                onUpdate(scene.id, 'videoUrl', url);
            }
            setVideoStatus(ImageGenStatus.COMPLETED);
            setViewMode('video');
        }
        event.target.value = '';
    };

    // ── Sync prop image/video url with local status ──
    const syncMediaStatus = () => {
        if (scene.imageUrl) {
            latestImageRef.current = scene.imageUrl;
            setGenStatus(ImageGenStatus.COMPLETED);
        }
        // Check video status based on current mode
        const activeVideoUrl = scene.isStartEndFrameMode ? scene.startEndVideoUrl : scene.videoUrl;
        if (activeVideoUrl) {
            setVideoStatus(ImageGenStatus.COMPLETED);
        }
        if (scene.narrationAudioUrl) setAudioUrl(scene.narrationAudioUrl);
    };

    return {
        // State
        genStatus,
        videoStatus,
        viewMode, setViewMode,
        ttsLoading,
        audioUrl,
        audioRef,
        videoRef,
        hasImage,
        hasVideo,
        fileInputRef,
        videoFileInputRef,
        latestImageRef,

        // Handlers
        handleGenerateImage,
        handleGenerateVideo,
        handleNarrationTTS,
        handleDownloadAudio,
        handleUploadClick,
        handleFileChange,
        handleRefresh,
        handleDeleteImage,
        handleDeleteVideo,
        handleVideoUploadClick,
        handleVideoFileChange,
        saveImage,
        syncMediaStatus,
    };
}
