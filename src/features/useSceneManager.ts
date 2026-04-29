import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Scene, NovelChunk } from '@/shared/types';

type HistoryAction = {
    type: 'duplicate_scene';
    chunkId: string;
    insertIndex: number;
    sceneId: string;
    sceneSnapshot: Scene;
};

export function deepClone<T>(value: T): T {
    if (typeof globalThis.structuredClone === 'function') {
        return globalThis.structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value)) as T;
}

export function ensureUniqueId(desiredId: string, existingIds: Set<string>) {
    if (!existingIds.has(desiredId)) return desiredId;
    let i = 2;
    let candidate = `${desiredId}_${i}`;
    while (existingIds.has(candidate)) {
        i += 1;
        candidate = `${desiredId}_${i}`;
    }
    return candidate;
}

export function remapSelfAssetIds(ids: string[] | undefined, oldSceneId: string, newSceneId: string) {
    if (!ids) return ids;
    const oldSelfId = `scene_img_${oldSceneId}`;
    const newSelfId = `scene_img_${newSceneId}`;
    return ids.map(id => (id === oldSelfId ? newSelfId : id));
}

export function useSceneManager(
    chunks: NovelChunk[],
    setChunks: React.Dispatch<React.SetStateAction<NovelChunk[]>>
) {
    const [flashScene, setFlashScene] = useState<{ chunkId: string; sceneId: string } | null>(null);
    const undoStackRef = useRef<HistoryAction[]>([]);
    const redoStackRef = useRef<HistoryAction[]>([]);

    const triggerFlashScene = (chunkId: string, sceneId: string) => {
        setFlashScene({ chunkId, sceneId });
        window.setTimeout(() => {
            setFlashScene(prev => (prev?.chunkId === chunkId && prev?.sceneId === sceneId ? null : prev));
        }, 900);
    };

    const handleSceneUpdate = (chunkId: string, sceneId: string, updates: Partial<Scene> | ((prevScene: Scene) => Partial<Scene>)) => {
        setChunks(prev => prev.map(c => {
            if (c.id !== chunkId) return c;
            const updatedScenes = c.scenes.map(s => {
                if (s.id === sceneId) {
                    const evaluatedUpdates = typeof updates === 'function' ? updates(s) : updates;
                    return { ...s, ...evaluatedUpdates };
                }
                return s;
            });
            const allImagesDone = updatedScenes.every(s => !!s.imageUrl);
            const newStatus = (c.status === 'shooting' && allImagesDone) ? 'completed' : c.status;
            return { ...c, scenes: updatedScenes, status: newStatus };
        }));
    };

    const handleDuplicateScene = (chunkId: string, sceneId: string) => {
        const chunk = chunks.find(c => c.id === chunkId);
        if (!chunk) return;
        const idx = chunk.scenes.findIndex(s => s.id === sceneId);
        if (idx < 0) return;

        const existingIds = new Set<string>(chunk.scenes.map(s => s.id));
        const sourceScene = chunk.scenes[idx];
        const newSceneId = ensureUniqueId(`${sourceScene.id}_copy`, existingIds);
        const cloned = deepClone(sourceScene);
        cloned.id = newSceneId;
        cloned.assetIds = remapSelfAssetIds(cloned.assetIds, sourceScene.id, newSceneId);
        cloned.videoAssetIds = remapSelfAssetIds(cloned.videoAssetIds, sourceScene.id, newSceneId);

        const action: HistoryAction = {
            type: 'duplicate_scene',
            chunkId,
            insertIndex: idx + 1,
            sceneId: newSceneId,
            sceneSnapshot: deepClone(cloned)
        };

        setChunks(prev =>
            prev.map(c => {
                if (c.id !== chunkId) return c;
                const newScenes = [...c.scenes.slice(0, idx + 1), cloned, ...c.scenes.slice(idx + 1)];
                return { ...c, scenes: newScenes };
            })
        );

        undoStackRef.current.push(action);
        redoStackRef.current = [];
        triggerFlashScene(action.chunkId, action.sceneId);
    };

    const undo = useCallback(() => {
        const action = undoStackRef.current.pop();
        if (!action) return;

        if (action.type === 'duplicate_scene') {
            setChunks(prev => {
                const chunk = prev.find(c => c.id === action.chunkId);
                if (!chunk) { redoStackRef.current.push(action); return prev; }
                const idx = chunk.scenes.findIndex(s => s.id === action.sceneId);
                if (idx < 0) { redoStackRef.current.push(action); return prev; }
                const removedScene = chunk.scenes[idx];
                redoStackRef.current.push({ ...action, sceneSnapshot: deepClone(removedScene) });
                return prev.map(c => {
                    if (c.id !== action.chunkId) return c;
                    return { ...c, scenes: [...c.scenes.slice(0, idx), ...c.scenes.slice(idx + 1)] };
                });
            });
        }
    }, []);

    const redo = useCallback(() => {
        const action = redoStackRef.current.pop();
        if (!action) return;

        if (action.type === 'duplicate_scene') {
            const sceneToInsert = deepClone(action.sceneSnapshot);

            setChunks(prev => {
                const chunk = prev.find(c => c.id === action.chunkId);
                if (!chunk) return prev;
                const existingIds = new Set<string>(chunk.scenes.map(s => s.id));
                const insertIndex = Math.min(Math.max(action.insertIndex, 0), chunk.scenes.length);

                const desiredId = sceneToInsert.id;
                const finalId = ensureUniqueId(desiredId, existingIds);
                if (finalId !== desiredId) {
                    sceneToInsert.id = finalId;
                    sceneToInsert.assetIds = remapSelfAssetIds(sceneToInsert.assetIds, desiredId, finalId);
                    sceneToInsert.videoAssetIds = remapSelfAssetIds(sceneToInsert.videoAssetIds, desiredId, finalId);
                }

                return prev.map(c => {
                    if (c.id !== action.chunkId) return c;
                    return { ...c, scenes: [...c.scenes.slice(0, insertIndex), sceneToInsert, ...c.scenes.slice(insertIndex)] };
                });
            });

            undoStackRef.current.push({
                type: 'duplicate_scene',
                chunkId: action.chunkId,
                insertIndex: action.insertIndex,
                sceneId: sceneToInsert.id,
                sceneSnapshot: deepClone(sceneToInsert)
            });
            triggerFlashScene(action.chunkId, sceneToInsert.id);
        }
    }, []);

    // Keyboard listener for undo/redo
    const undoFnRef = useRef(undo);
    const redoFnRef = useRef(redo);
    useEffect(() => { undoFnRef.current = undo; }, [undo]);
    useEffect(() => { redoFnRef.current = redo; }, [redo]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const isModifier = e.ctrlKey || e.metaKey;
            if (!isModifier) return;
            const active = document.activeElement as HTMLElement | null;
            const tag = active?.tagName?.toLowerCase();
            const isEditing = tag === 'input' || tag === 'textarea' || tag === 'select' || (active ? (active as any).isContentEditable === true : false);
            if (isEditing) return;

            const key = e.key.toLowerCase();
            if (key === 'z' && !e.shiftKey) { e.preventDefault(); undoFnRef.current(); }
            else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); redoFnRef.current(); }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    return { flashScene, handleSceneUpdate, handleDuplicateScene };
}
