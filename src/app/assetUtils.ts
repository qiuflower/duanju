import { Asset, NovelChunk } from '@/shared/types';

/**
 * 合并提取的资产到全局池
 * - 新资产: 直接添加
 * - 已存在: 更新文本字段, 保留已有的 refImageUrl/refImageAssetId
 */
export function mergeAssetsIntoGlobal(
    currentGlobal: Asset[],
    extracted: Asset[]
): { merged: Asset[]; hasChanges: boolean } {
    if (extracted.length === 0) return { merged: currentGlobal, hasChanges: false };

    const merged = [...currentGlobal];
    let hasChanges = false;

    extracted.forEach(ext => {
        const idx = merged.findIndex(g => g.id === ext.id);
        if (idx === -1) {
            merged.push(ext);
            hasChanges = true;
        } else {
            const existing = merged[idx];
            merged[idx] = {
                ...existing,
                description: ext.description,
                name: ext.name || existing.name,
                type: ext.type || existing.type,
                visualDna: ext.visualDna || existing.visualDna,
                prompt: ext.prompt || existing.prompt,
                refImageUrl: ext.refImageUrl || existing.refImageUrl,
                refImageAssetId: ext.refImageAssetId || existing.refImageAssetId,
            };
            hasChanges = true;
        }
    });

    return { merged, hasChanges };
}

/**
 * 条件删除: 移除不再被任何 chunk 引用的全局资产
 * 仅删除「从当前 chunk 消失」且「无其他 chunk 引用」的资产
 */
export function pruneOrphanedGlobalAssets(
    globalAssets: Asset[],
    previousChunkAssetIds: string[],
    newAssetIds: string[],
    allChunks: NovelChunk[],
    currentChunkId: string
): Asset[] {
    const removed = previousChunkAssetIds.filter(id => !newAssetIds.includes(id));
    if (removed.length === 0) return globalAssets;

    const referencedByOthers = new Set<string>();
    allChunks.forEach(c => {
        if (c.id === currentChunkId) return;
        c.assets.forEach(a => referencedByOthers.add(a.id));
    });

    const toDelete = removed.filter(id => !referencedByOthers.has(id));
    if (toDelete.length === 0) return globalAssets;

    const toDeleteSet = new Set(toDelete);
    return globalAssets.filter(a => !toDeleteSet.has(a.id));
}

/** 全局删除: 从 global + 所有 chunk 移除 */
export function deleteAssetGlobal(
    globalAssets: Asset[],
    chunks: NovelChunk[],
    assetId: string
): { globalAssets: Asset[]; chunks: NovelChunk[] } {
    return {
        globalAssets: globalAssets.filter(a => a.id !== assetId),
        chunks: chunks.map(c => ({
            ...c, assets: c.assets.filter(a => a.id !== assetId)
        }))
    };
}

/** 局部删除: 仅从目标 chunk 移除 */
export function deleteAssetLocal(
    chunks: NovelChunk[],
    chunkId: string,
    assetId: string
): NovelChunk[] {
    return chunks.map(c =>
        c.id === chunkId
            ? { ...c, assets: c.assets.filter(a => a.id !== assetId) }
            : c
    );
}

/** 章节删除时清理孤儿资产: 移除仅被该 chunk 引用的全局资产 */
export function pruneAssetsOnChunkDelete(
    globalAssets: Asset[],
    allChunks: NovelChunk[],
    deletedChunkId: string
): Asset[] {
    const deletedChunk = allChunks.find(c => c.id === deletedChunkId);
    if (!deletedChunk || deletedChunk.assets.length === 0) return globalAssets;

    const referencedByOthers = new Set<string>();
    allChunks.forEach(c => {
        if (c.id === deletedChunkId) return;
        c.assets.forEach(a => referencedByOthers.add(a.id));
    });

    const orphanIds = new Set(
        deletedChunk.assets
            .map(a => a.id)
            .filter(id => !referencedByOthers.has(id))
    );

    if (orphanIds.size === 0) return globalAssets;
    return globalAssets.filter(a => !orphanIds.has(a.id));
}
