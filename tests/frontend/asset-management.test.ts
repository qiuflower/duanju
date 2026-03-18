import { describe, it, expect } from 'vitest';
import { mergeAssetsIntoGlobal, pruneOrphanedGlobalAssets, deleteAssetGlobal, deleteAssetLocal, pruneAssetsOnChunkDelete } from '../../src/app/assetUtils';
import type { Asset, NovelChunk } from '../../src/shared/types';

// ── Helpers ──────────────────────────────────────

function makeAsset(overrides: Partial<Asset> = {}): Asset {
    return {
        id: 'asset_1',
        name: '苏小小',
        description: '主角',
        type: 'character',
        ...overrides,
    };
}

function makeChunk(overrides: Partial<NovelChunk> = {}): NovelChunk {
    return {
        id: 'chunk_1',
        index: 0,
        text: '测试文本',
        status: 'idle',
        assets: [],
        scenes: [],
        ...overrides,
    };
}

// ════════════════════════════════════════════════
// mergeAssetsIntoGlobal
// ════════════════════════════════════════════════
describe('mergeAssetsIntoGlobal', () => {

    it('1. 新资产 — 添加到全局池', () => {
        const global: Asset[] = [];
        const extracted = [makeAsset({ id: 'hero', name: '苏小小' })];
        const { merged, hasChanges } = mergeAssetsIntoGlobal(global, extracted);
        expect(merged).toHaveLength(1);
        expect(merged[0].id).toBe('hero');
        expect(hasChanges).toBe(true);
    });

    it('2. 已存在 — 更新 description, 保留已有 refImageUrl', () => {
        const global = [makeAsset({
            id: 'hero', description: '撑伞少女',
            refImageUrl: 'blob:xxx', refImageAssetId: 'db_123'
        })];
        const extracted = [makeAsset({ id: 'hero', description: '手持折扇的侠女' })];
        const { merged } = mergeAssetsIntoGlobal(global, extracted);
        expect(merged[0].description).toBe('手持折扇的侠女');  // 更新
        expect(merged[0].refImageUrl).toBe('blob:xxx');          // 保留!
        expect(merged[0].refImageAssetId).toBe('db_123');        // 保留!
    });

    it('3. 混合 — 新增+更新同时处理', () => {
        const global = [makeAsset({ id: 'hero', description: '少女' })];
        const extracted = [
            makeAsset({ id: 'hero', description: '侠女' }),
            makeAsset({ id: 'temple', name: '古庙' })
        ];
        const { merged } = mergeAssetsIntoGlobal(global, extracted);
        expect(merged).toHaveLength(2);
        expect(merged[0].description).toBe('侠女');
        expect(merged[1].id).toBe('temple');
    });

    it('4. 空提取 — 不产生变化', () => {
        const global = [makeAsset({ id: 'hero' })];
        const { merged, hasChanges } = mergeAssetsIntoGlobal(global, []);
        expect(merged).toBe(global);   // same reference
        expect(hasChanges).toBe(false);
    });

    it('5. 保留已有 prompt — 不被空值覆盖', () => {
        const global = [makeAsset({ id: 'hero', prompt: 'old prompt' })];
        const extracted = [makeAsset({ id: 'hero', prompt: undefined })];
        const { merged } = mergeAssetsIntoGlobal(global, extracted);
        expect(merged[0].prompt).toBe('old prompt');
    });

    it('6. 新 prompt 覆盖 — 如果新值存在则使用新值', () => {
        const global = [makeAsset({ id: 'hero', prompt: 'old prompt' })];
        const extracted = [makeAsset({ id: 'hero', prompt: 'new prompt' })];
        const { merged } = mergeAssetsIntoGlobal(global, extracted);
        expect(merged[0].prompt).toBe('new prompt');
    });
});

// ════════════════════════════════════════════════
// pruneOrphanedGlobalAssets
// ════════════════════════════════════════════════
describe('pruneOrphanedGlobalAssets', () => {

    it('7. 无其他 chunk 引用 → 从全局移除', () => {
        const global = [
            makeAsset({ id: 'hero' }),
            makeAsset({ id: 'town', name: '雨镇' }),
            makeAsset({ id: 'temple', name: '古庙' })
        ];
        const chunks = [
            makeChunk({ id: 'c1', assets: [makeAsset({ id: 'hero' }), makeAsset({ id: 'town' })] }),
            makeChunk({ id: 'c2', assets: [] }),
        ];
        // c1 重新生成: hero 保留, town 消失, temple 新增
        const result = pruneOrphanedGlobalAssets(
            global,
            ['hero', 'town'],     // 旧 chunk 资产
            ['hero', 'temple'],   // 新 chunk 资产
            chunks,
            'c1'
        );
        expect(result.find(a => a.id === 'hero')).toBeDefined();   // 保留
        expect(result.find(a => a.id === 'town')).toBeUndefined(); // 删除(无人引用)
        expect(result.find(a => a.id === 'temple')).toBeDefined(); // 保留(新增)
    });

    it('8. 有其他 chunk 引用 → 保留在全局', () => {
        const global = [
            makeAsset({ id: 'hero' }),
            makeAsset({ id: 'town', name: '雨镇' })
        ];
        const chunks = [
            makeChunk({ id: 'c1', assets: [makeAsset({ id: 'hero' }), makeAsset({ id: 'town' })] }),
            makeChunk({ id: 'c2', assets: [makeAsset({ id: 'town' })] }),  // c2 也引用 town
        ];
        const result = pruneOrphanedGlobalAssets(
            global,
            ['hero', 'town'],  // c1 旧资产
            ['hero'],           // c1 新资产(town 消失)
            chunks,
            'c1'
        );
        expect(result.find(a => a.id === 'town')).toBeDefined(); // 保留! c2 仍引用
    });

    it('9. 无资产消失 → 返回原数组', () => {
        const global = [makeAsset({ id: 'hero' })];
        const chunks = [makeChunk({ id: 'c1', assets: [makeAsset({ id: 'hero' })] })];
        const result = pruneOrphanedGlobalAssets(
            global,
            ['hero'],  // 旧
            ['hero'],  // 新 (相同)
            chunks,
            'c1'
        );
        expect(result).toBe(global); // same reference = no change
    });
});

// ════════════════════════════════════════════════
// deleteAssetGlobal / deleteAssetLocal
// ════════════════════════════════════════════════
describe('deleteAssetGlobal', () => {

    it('10. 全局删除 — 从 global + 所有 chunk 移除', () => {
        const global = [makeAsset({ id: 'hero' }), makeAsset({ id: 'town' })];
        const chunks = [
            makeChunk({ id: 'c1', assets: [makeAsset({ id: 'hero' })] }),
            makeChunk({ id: 'c2', assets: [makeAsset({ id: 'hero' }), makeAsset({ id: 'town' })] }),
        ];
        const result = deleteAssetGlobal(global, chunks, 'hero');
        expect(result.globalAssets).toHaveLength(1);
        expect(result.globalAssets[0].id).toBe('town');
        expect(result.chunks[0].assets).toHaveLength(0);
        expect(result.chunks[1].assets).toHaveLength(1);
        expect(result.chunks[1].assets[0].id).toBe('town');
    });
});

describe('deleteAssetLocal', () => {

    it('11. 局部删除 — 仅从目标 chunk 移除, 其他 chunk 不变', () => {
        const chunks = [
            makeChunk({ id: 'c1', assets: [makeAsset({ id: 'hero' })] }),
            makeChunk({ id: 'c2', assets: [makeAsset({ id: 'hero' })] }),
        ];
        const result = deleteAssetLocal(chunks, 'c1', 'hero');
        expect(result[0].assets).toHaveLength(0);   // c1: 移除
        expect(result[1].assets).toHaveLength(1);    // c2: 不变!
        expect(result[1].assets[0].id).toBe('hero');
    });
});

// ════════════════════════════════════════════════
// pruneAssetsOnChunkDelete
// ════════════════════════════════════════════════
describe('pruneAssetsOnChunkDelete', () => {

    it('12. 删除章节 — 孤儿资产从全局移除', () => {
        const global = [
            makeAsset({ id: 'hero' }),
            makeAsset({ id: 'town' })
        ];
        const chunks = [
            makeChunk({ id: 'c1', assets: [makeAsset({ id: 'hero' }), makeAsset({ id: 'town' })] }),
            makeChunk({ id: 'c2', assets: [makeAsset({ id: 'hero' })] }),
        ];
        // 删除 c1: hero 被 c2 引用保留, town 无人引用删除
        const result = pruneAssetsOnChunkDelete(global, chunks, 'c1');
        expect(result.find(a => a.id === 'hero')).toBeDefined();   // 保留
        expect(result.find(a => a.id === 'town')).toBeUndefined(); // 删除
    });

    it('13. 删除章节 — 无孤儿时不变', () => {
        const global = [makeAsset({ id: 'hero' })];
        const chunks = [
            makeChunk({ id: 'c1', assets: [makeAsset({ id: 'hero' })] }),
            makeChunk({ id: 'c2', assets: [makeAsset({ id: 'hero' })] }),
        ];
        const result = pruneAssetsOnChunkDelete(global, chunks, 'c1');
        expect(result).toBe(global); // same reference = no change
    });

    it('14. 删除空章节 — 不影响全局', () => {
        const global = [makeAsset({ id: 'hero' })];
        const chunks = [
            makeChunk({ id: 'c1', assets: [] }),
            makeChunk({ id: 'c2', assets: [makeAsset({ id: 'hero' })] }),
        ];
        const result = pruneAssetsOnChunkDelete(global, chunks, 'c1');
        expect(result).toBe(global);
    });
});
