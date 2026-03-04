import { useState, useRef, useMemo } from 'react';
import { Scene, Asset, GlobalStyle } from '@/shared/types';
import { matchAssetsToPrompt, updateVideoPromptDirectly, regenerateScenePrompt } from '@/services/ai';

export interface UseSceneAssetsProps {
    scene: Scene;
    assets: Asset[];
    globalStyle: GlobalStyle;
    language: string;
    chapterScenes: Scene[];
    onUpdate: (id: string, field: keyof Scene, value: any) => void;
}

export function useSceneAssets(props: UseSceneAssetsProps) {
    const { scene, assets, globalStyle, language, chapterScenes, onUpdate } = props;

    const [activeAssetSelector, setActiveAssetSelector] = useState<'none' | 'image' | 'video'>('none');
    const [promptGenLoading, setPromptGenLoading] = useState(false);
    const [videoPromptUpdating, setVideoPromptUpdating] = useState(false);
    const [useAssets, setUseAssets] = useState(scene.useAssets ?? true);

    const assetUpdateTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastProcessedImageAssetsRef = useRef<string[]>(scene.assetIds || []);
    const lastProcessedVideoAssetsRef = useRef<string[]>(
        scene.isStartEndFrameMode
            ? (scene.startEndAssetIds || [])
            : (scene.videoAssetIds || [])
    );
    const lastProcessedSpecsRef = useRef({
        video_duration: scene.video_duration,
        video_camera: scene.video_camera,
        video_lens: scene.video_lens,
        video_vfx: scene.video_vfx
    });

    // Reset refs when scene ID changes
    const lastSceneIdRef = useRef(scene.id);
    if (lastSceneIdRef.current !== scene.id) {
        lastSceneIdRef.current = scene.id;
        lastProcessedImageAssetsRef.current = scene.assetIds || [];
        lastProcessedVideoAssetsRef.current = scene.isStartEndFrameMode
            ? (scene.startEndAssetIds || [])
            : (scene.videoAssetIds || []);
        lastProcessedSpecsRef.current = {
            video_duration: scene.video_duration,
            video_camera: scene.video_camera,
            video_lens: scene.video_lens,
            video_vfx: scene.video_vfx
        };
    }

    // ── Scene Asset Resolver ──
    const resolveSceneAssets = (newAssetIds: string[], overrideAssets?: Asset[]): Asset[] => {
        let assetsToUse = overrideAssets || assets;
        newAssetIds.forEach(id => {
            if (id.startsWith('scene_img_') && !assetsToUse.find(a => a.id === id)) {
                if (id === `scene_img_${scene.id}`) {
                    assetsToUse = [...assetsToUse, {
                        id,
                        name: "Current Scene",
                        description: "The current generated storyboard image for this scene.",
                        type: "item",
                        refImageUrl: scene.imageUrl
                    }];
                } else {
                    const sceneId = id.replace('scene_img_', '');
                    const refScene = chapterScenes.find(s => s.id === sceneId);
                    if (refScene) {
                        assetsToUse = [...assetsToUse, {
                            id,
                            name: `Scene ${refScene.id}`,
                            description: refScene.visual_desc || "Generated storyboard",
                            type: "item",
                            refImageUrl: refScene.imageUrl,
                            refImageAssetId: refScene.imageAssetId
                        }];
                    }
                }
            }
        });
        return assetsToUse;
    };

    // ── Video Prompt Update ──
    const updateVideoPromptWithAssets = async (newAssetIds: string[], overrideAssets?: Asset[]) => {
        setVideoPromptUpdating(true);
        lastProcessedVideoAssetsRef.current = [...newAssetIds].sort();
        try {
            const tempScene = { ...scene, assetIds: newAssetIds };
            const assetsToUse = resolveSceneAssets(newAssetIds, overrideAssets);
            const optimized = await updateVideoPromptDirectly(tempScene, language, assetsToUse, globalStyle);
            onUpdate(scene.id, 'video_prompt', optimized.prompt);
            if (optimized.specs.duration) onUpdate(scene.id, 'video_duration', optimized.specs.duration);
            if (optimized.specs.camera) onUpdate(scene.id, 'video_camera', optimized.specs.camera);
            if (optimized.specs.lens) onUpdate(scene.id, 'video_lens', optimized.specs.lens);
            if (optimized.specs.vfx) onUpdate(scene.id, 'video_vfx', optimized.specs.vfx);
        } catch (e) {
            console.error("Video prompt update failed", e);
        } finally {
            setVideoPromptUpdating(false);
        }
    };

    // ── Image Prompt Update ──
    const updatePromptWithAssets = async (newAssetIds: string[], overrideAssets?: Asset[]) => {
        setPromptGenLoading(true);
        lastProcessedImageAssetsRef.current = [...newAssetIds].sort();
        onUpdate(scene.id, 'assetIds', newAssetIds);
        try {
            const tempScene = { ...scene, assetIds: newAssetIds };
            const assetsToUse = resolveSceneAssets(newAssetIds, overrideAssets);
            const newPrompt = await regenerateScenePrompt(tempScene, assetsToUse, globalStyle, language);
            onUpdate(scene.id, 'np_prompt', newPrompt);
        } catch (e) {
            console.error("Prompt refresh failed", e);
        } finally {
            setPromptGenLoading(false);
        }
    };

    // ── Scheduled Asset Update (debounced) ──
    const scheduleAssetUpdate = (newIds: string[], assetsToUse: Asset[], type: 'video' | 'image') => {
        if (assetUpdateTimerRef.current) clearTimeout(assetUpdateTimerRef.current);
        assetUpdateTimerRef.current = setTimeout(() => {
            const sortedNewIds = [...newIds].sort();
            const lastIds = type === 'video'
                ? lastProcessedVideoAssetsRef.current
                : lastProcessedImageAssetsRef.current;
            const sortedLastIds = [...lastIds].sort();
            const isSame = sortedNewIds.length === sortedLastIds.length &&
                sortedNewIds.every((val, index) => val === sortedLastIds[index]);
            if (isSame) return;
            if (type === 'video') {
                updateVideoPromptWithAssets(newIds, assetsToUse);
            } else {
                updatePromptWithAssets(newIds, assetsToUse);
            }
        }, 5000);
    };

    // ── Spec Commit ──
    const handleSpecCommit = async (field: keyof Scene, value: string) => {
        const tempScene = { ...scene, [field]: value };
        const prevSpecs = lastProcessedSpecsRef.current;
        const isChanged =
            tempScene.video_duration !== prevSpecs.video_duration ||
            tempScene.video_camera !== prevSpecs.video_camera ||
            tempScene.video_lens !== prevSpecs.video_lens ||
            tempScene.video_vfx !== prevSpecs.video_vfx;
        if (!isChanged) return;
        lastProcessedSpecsRef.current = {
            video_duration: tempScene.video_duration,
            video_camera: tempScene.video_camera,
            video_lens: tempScene.video_lens,
            video_vfx: tempScene.video_vfx
        };
        setVideoPromptUpdating(true);
        try {
            const optimized = await updateVideoPromptDirectly(tempScene, language, assets, globalStyle);
            onUpdate(scene.id, 'video_prompt', optimized.prompt);
        } catch (e) {
            console.error("Spec update optimization failed", e);
        } finally {
            setVideoPromptUpdating(false);
        }
    };

    const handleLocalSpecChange = (field: keyof Scene, value: string) => {
        onUpdate(scene.id, field, value);
    };

    // ── Asset Add / Remove ──
    const handleAddAsset = (assetId: string | string[], newAsset?: Asset | Asset[]) => {
        const assetIdsToAdd = Array.isArray(assetId) ? assetId : [assetId];
        const newAssetsToAdd = newAsset ? (Array.isArray(newAsset) ? newAsset : [newAsset]) : [];

        if (activeAssetSelector === 'video') {
            if (scene.isStartEndFrameMode) {
                const targetAssetId = assetIdsToAdd[0];
                const currentSceneImgId = `scene_img_${scene.id}`;
                const newIds = [currentSceneImgId, targetAssetId];
                onUpdate(scene.id, 'video_prompt_backup', scene.video_prompt);
                onUpdate(scene.id, 'startEndAssetIds', newIds);
                const assetsToUse = newAssetsToAdd.length > 0 ? [...assets, ...newAssetsToAdd] : assets;
                scheduleAssetUpdate(newIds, assetsToUse, 'video');
            } else {
                const currentVideoIds = scene.videoAssetIds || scene.assetIds?.slice(0, 3) || [];
                const uniqueNewIds = assetIdsToAdd.filter(id => !currentVideoIds.includes(id));
                if (currentVideoIds.length + uniqueNewIds.length > 3) {
                    alert(language === 'Chinese'
                        ? `视频参考图最多只能添加3张 (当前已选${currentVideoIds.length}张, 尝试添加${uniqueNewIds.length}张)`
                        : `Video storyboard supports a maximum of 3 reference assets (Current: ${currentVideoIds.length}, Adding: ${uniqueNewIds.length})`);
                    return;
                }
                if (uniqueNewIds.length > 0) {
                    const newIds = [...currentVideoIds, ...uniqueNewIds];
                    const assetsToUse = newAssetsToAdd.length > 0 ? [...assets, ...newAssetsToAdd] : assets;
                    onUpdate(scene.id, 'videoAssetIds', newIds);
                    scheduleAssetUpdate(newIds, assetsToUse, 'video');
                }
            }
        } else {
            const currentIds = scene.assetIds || [];
            const uniqueNewIds = assetIdsToAdd.filter(id => !currentIds.includes(id));
            if (uniqueNewIds.length > 0) {
                const newIds = [...currentIds, ...uniqueNewIds];
                const assetsToUse = newAssetsToAdd.length > 0 ? [...assets, ...newAssetsToAdd] : assets;
                onUpdate(scene.id, 'assetIds', newIds);
                scheduleAssetUpdate(newIds, assetsToUse, 'image');
            }
        }
        setActiveAssetSelector('none');
    };

    const handleRemoveAsset = (assetId: string, mode: 'image' | 'video' = 'image') => {
        if (mode === 'video') {
            if (scene.isStartEndFrameMode) {
                const currentSceneImgId = `scene_img_${scene.id}`;
                const newIds = [currentSceneImgId];
                onUpdate(scene.id, 'startEndAssetIds', newIds);
                if (scene.video_prompt_backup) {
                    onUpdate(scene.id, 'video_prompt', scene.video_prompt_backup);
                    onUpdate(scene.id, 'video_prompt_backup', undefined);
                } else {
                    scheduleAssetUpdate(newIds, assets, 'video');
                }
            } else {
                const currentVideoIds = scene.videoAssetIds || scene.assetIds?.slice(0, 3) || [];
                const newIds = currentVideoIds.filter(id => id !== assetId);
                onUpdate(scene.id, 'videoAssetIds', newIds);
                scheduleAssetUpdate(newIds, assets, 'video');
            }
        } else {
            const currentIds = scene.assetIds || [];
            const newIds = currentIds.filter(id => id !== assetId);
            onUpdate(scene.id, 'assetIds', newIds);
            scheduleAssetUpdate(newIds, assets, 'image');
        }
    };

    // ── Scene images memo ──
    const sceneImages = useMemo(() => {
        return chapterScenes
            .filter(s => !!(s.imageUrl || s.imageAssetId))
            .map(s => ({
                id: `scene_img_${s.id}`,
                name: `Scene ${s.id}`,
                description: s.visual_desc || "Generated storyboard",
                type: 'item' as const,
                refImageUrl: s.imageUrl,
                refImageAssetId: s.imageAssetId
            }));
    }, [chapterScenes]);

    // ── Initialize video asset IDs when image first appears ──
    const initializeVideoAssetIds = () => {
        if (!scene.isStartEndFrameMode && scene.videoAssetIds === undefined) {
            const currentSceneImgId = `scene_img_${scene.id}`;
            const availableAssets = assets.filter(a => (scene.assetIds || []).includes(a.id));
            const matched = matchAssetsToPrompt(scene.visual_desc, availableAssets, scene.assetIds || []);
            const top2Ids = matched.slice(0, 2).map(a => a.id);
            const initialVideoIds = [currentSceneImgId, ...top2Ids];
            onUpdate(scene.id, 'videoAssetIds', initialVideoIds);
        }
    };

    return {
        // State
        useAssets, setUseAssets,
        activeAssetSelector, setActiveAssetSelector,
        promptGenLoading,
        videoPromptUpdating,
        sceneImages,

        // Handlers
        handleAddAsset,
        handleRemoveAsset,
        handleSpecCommit,
        handleLocalSpecChange,
        initializeVideoAssetIds,
    };
}
