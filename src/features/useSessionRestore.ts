import React, { useState, useEffect } from 'react';
import { Asset, GlobalStyle, NovelChunk, Scene } from '@/shared/types';
import { saveState, loadState } from '@/services/storage';
import { STATE_KEY, DEFAULT_STYLES } from '@/shared/constants/defaults';

interface SessionState {
    globalAssets: Asset[];
    setGlobalAssets: React.Dispatch<React.SetStateAction<Asset[]>>;
    chunks: NovelChunk[];
    setChunks: React.Dispatch<React.SetStateAction<NovelChunk[]>>;
    globalStyle: GlobalStyle;
    setGlobalStyle: React.Dispatch<React.SetStateAction<GlobalStyle>>;
    language: string;
    setLanguage: React.Dispatch<React.SetStateAction<string>>;
    filename: string;
    setFilename: React.Dispatch<React.SetStateAction<string>>;
}

export function useSessionRestore(state: SessionState) {
    const [isRestored, setIsRestored] = useState(false);
    const { globalAssets, setGlobalAssets, chunks, setChunks, globalStyle, setGlobalStyle, language, setLanguage, filename, setFilename } = state;

    // Restore State
    useEffect(() => {
        const restoreSession = async () => {
            try {
                const savedState = await loadState(STATE_KEY);
                if (savedState) {
                    if (savedState.globalAssets) {
                        const cleanAssets = savedState.globalAssets.map((asset: Asset) => ({
                            ...asset,
                            refImageUrl: asset.refImageUrl?.startsWith('blob:') ? undefined : asset.refImageUrl
                        }));
                        setGlobalAssets(cleanAssets);
                    }
                    if (savedState.chunks) {
                        const hydratedChunks = savedState.chunks.map((chunk: NovelChunk) => ({
                            ...chunk,
                            assets: chunk.assets.map((asset: Asset) => ({
                                ...asset,
                                refImageUrl: asset.refImageUrl?.startsWith('blob:') ? undefined : asset.refImageUrl
                            })),
                            scenes: chunk.scenes.map((scene: Scene) => {
                                let newVideoUrl = scene.videoUrl;
                                let newImageUrl = scene.imageUrl;
                                if (newVideoUrl?.startsWith('blob:')) newVideoUrl = undefined;
                                if (newImageUrl?.startsWith('blob:')) newImageUrl = undefined;
                                return {
                                    ...scene,
                                    videoUrl: newVideoUrl,
                                    imageUrl: newImageUrl,
                                    narrationAudioUrl: scene.narrationAudioUrl?.startsWith('blob:') ? undefined : scene.narrationAudioUrl
                                };
                            })
                        }));
                        setChunks(hydratedChunks);
                    }
                    if (savedState.globalStyle) setGlobalStyle(savedState.globalStyle);
                    if (savedState.language) setLanguage(savedState.language);
                    if (savedState.filename) setFilename(savedState.filename);
                }
            } catch (e) {
                console.error("Failed to restore session", e);
            } finally {
                setIsRestored(true);
            }
        };
        restoreSession();
    }, []);

    // Save State (debounced)
    useEffect(() => {
        if (!isRestored) return;
        const timeoutId = setTimeout(() => {
            saveState(STATE_KEY, { globalAssets, chunks, globalStyle, language, filename })
                .catch(e => console.error("Failed to save state", e));
        }, 1000);
        return () => clearTimeout(timeoutId);
    }, [globalAssets, chunks, globalStyle, language, filename, isRestored]);

    // Sync language -> default style options
    useEffect(() => {
        const defaults = DEFAULT_STYLES[language] || DEFAULT_STYLES["English"];
        setGlobalStyle(prev => ({
            ...prev,
            director: { ...prev.director, options: defaults.directors },
            work: { ...prev.work, options: defaults.works },
            texture: { ...prev.texture, options: defaults.textures }
        }));
    }, [language]);

    return { isRestored };
}
