import { NovelChunk } from '@/shared/types';

/**
 * Pure function: creates a copy of a chunk and inserts it after the source.
 * - New chunk gets a unique ID and title with "(Copy)" suffix
 * - Status is reset to 'idle'
 * - Scene IDs are regenerated; media URLs are cleared
 * - All chunks are re-indexed
 */
export function buildCopiedChunk(chunks: NovelChunk[], chunkId: string): NovelChunk[] {
    const sourceIndex = chunks.findIndex(c => c.id === chunkId);
    if (sourceIndex === -1) return chunks;
    const source = chunks[sourceIndex];
    const newChunk: NovelChunk = {
        ...source,
        id: `chunk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title: `${source.title || `Ep ${source.index + 1}`} (Copy)`,
        status: 'idle',
        scenes: source.scenes.map(s => ({
            ...s,
            id: `scene_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            imageUrl: undefined,
            imageAssetId: undefined,
            videoUrl: undefined,
            videoAssetId: undefined,
            startEndVideoUrl: undefined,
            startEndVideoAssetId: undefined,
            narrationAudioUrl: undefined,
        })),
    };
    const next = [...chunks];
    next.splice(sourceIndex + 1, 0, newChunk);
    return next.map((c, i) => ({ ...c, index: i }));
}

/** 构建导出 data.json 的完整结构 */
export interface ChunkExportData {
    version: number;
    chunkId: string;
    title?: string;
    text: string;
    assets: any[];
    scenes: any[];
    beatSheet?: any;
    episodeData?: any;
    batchMeta?: any;
}

export function buildExportData(chunk: NovelChunk): ChunkExportData {
    return {
        version: 1,
        chunkId: chunk.id,
        title: chunk.title,
        text: chunk.text,
        assets: chunk.assets,
        scenes: chunk.scenes,
        beatSheet: (chunk as any).beatSheet,
        episodeData: (chunk as any).episodeData,
        batchMeta: (chunk as any).batchMeta,
    };
}

/** 解析导入数据并创建 NovelChunk (不含媒体恢复) */
export function parseImportData(data: any): NovelChunk {
    if (!data.scenes || !Array.isArray(data.scenes)) throw new Error("Invalid scenes: must be array");
    if (!data.text || typeof data.text !== 'string') throw new Error("Invalid text: must be string");
    if (data.assets && !Array.isArray(data.assets)) throw new Error("Invalid assets: must be array");

    return {
        ...data,
        id: `chunk_${Date.now()}_import`,
        title: data.title || 'Imported Chunk',
        text: data.text,
        assets: data.assets || [],
        scenes: data.scenes,
        status: 'scripted',
        beatSheet: data.beatSheet,
        episodeData: data.episodeData,
        batchMeta: data.batchMeta,
    };
}
