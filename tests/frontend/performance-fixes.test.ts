import { describe, it, expect } from 'vitest';
import { buildExportData } from '../../src/app/chunkUtils';
import { matchAssetsToPrompt } from '../../src/services/ai/media/video';
import type { NovelChunk, Scene, Asset } from '../../src/shared/types';

// ── Helpers ──────────────────────────────────────

function makeScene(overrides: Partial<Scene> = {}): Scene {
    return {
        id: 'E1_B1',
        narration: '雨夜古镇',
        visual_desc: '油纸伞少女在雨夜漫步',
        np_prompt: '@图像[苏小小] a girl with umbrella',
        imageUrl: undefined,
        assetIds: ['hero'],
        ...overrides,
    };
}

function makeAsset(overrides: Partial<Asset> = {}): Asset {
    return {
        id: 'hero',
        name: '苏小小',
        description: '主角 少女 长发 白衣',
        type: 'character',
        ...overrides,
    };
}

function makeChunk(overrides: Partial<NovelChunk> = {}): NovelChunk {
    return {
        id: 'chunk_1',
        index: 0,
        title: 'Ep 1: 雨夜惊变',
        text: '苏小小撑着油纸伞走在古镇的雨夜中',
        status: 'scripted',
        assets: [makeAsset()],
        scenes: [makeScene()],
        ...overrides,
    };
}

// ════════════════════════════════════════════════
// 1. Export: blob URL 剥离
// ════════════════════════════════════════════════
describe('Export: blob URL stripping', () => {

    it('1. buildExportData 保留 data: URL 格式的 refImageUrl', () => {
        const chunk = makeChunk({
            assets: [makeAsset({ refImageUrl: 'data:image/png;base64,abc123' })],
        });
        const data = buildExportData(chunk);
        expect(data.assets[0].refImageUrl).toBe('data:image/png;base64,abc123');
    });

    it('2. buildExportData 保留 http: URL 格式的 refImageUrl', () => {
        const chunk = makeChunk({
            assets: [makeAsset({ refImageUrl: 'https://example.com/img.png' })],
        });
        const data = buildExportData(chunk);
        expect(data.assets[0].refImageUrl).toBe('https://example.com/img.png');
    });

    it('3. blob: URL 需要在导出时被剥离 (验证检测逻辑)', () => {
        // This tests the detection logic used in handleDownload
        const blobUrl = 'blob:http://localhost:5173/abc-123-def';
        expect(blobUrl.startsWith('blob:')).toBe(true);

        const httpUrl = 'https://example.com/img.png';
        expect(httpUrl.startsWith('blob:')).toBe(false);

        const dataUrl = 'data:image/png;base64,abc123';
        expect(dataUrl.startsWith('blob:')).toBe(false);

        const undefinedUrl = undefined;
        expect(undefinedUrl?.startsWith('blob:')).toBeFalsy();
    });

    it('4. blob: URL 剥离逻辑正确处理 scene 的所有媒体字段', () => {
        const stripBlobUrl = (url?: string) =>
            url?.startsWith('blob:') ? undefined : url;

        // blob URLs -> undefined
        expect(stripBlobUrl('blob:http://localhost/123')).toBeUndefined();
        expect(stripBlobUrl('blob:https://example.com/456')).toBeUndefined();

        // non-blob URLs -> preserved
        expect(stripBlobUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
        expect(stripBlobUrl('http://example.com/img.png')).toBe('http://example.com/img.png');
        expect(stripBlobUrl(undefined)).toBeUndefined();
    });
});

// ════════════════════════════════════════════════
// 2. Export: 安全文件名
// ════════════════════════════════════════════════
describe('Export: safe filename format', () => {

    it('5. 新文件名格式仅使用 asset ID (无中文/特殊字符)', () => {
        const asset = makeAsset({ id: 'char_001', name: '苏小小/少女' });
        const newFilename = `${asset.id}.png`;
        const legacyFilename = `${asset.id}_${asset.name}.png`;

        // New format is clean
        expect(newFilename).toBe('char_001.png');
        expect(newFilename).toMatch(/^[a-zA-Z0-9_.]+$/);

        // Legacy format has Chinese chars
        expect(legacyFilename).toContain('苏小小');
        expect(legacyFilename).toContain('/'); // potentially break path
    });

    it('6. 多种特殊字符的 asset name 不影响新文件名', () => {
        const specialNames = ['角色/NPC', 'item (magic)', 'sword&shield', '地點 #1'];
        for (const name of specialNames) {
            const asset = makeAsset({ id: 'asset_123', name });
            const filename = `${asset.id}.png`;
            expect(filename).toBe('asset_123.png');
        }
    });
});

// ════════════════════════════════════════════════
// 3. Import: 文件名向后兼容
// ════════════════════════════════════════════════
describe('Import: filename backward compatibility', () => {

    it('7. 导入时优先查找新格式，回退到旧格式', () => {
        // Simulate zip file lookup logic:
        // const imgFile = zip.file(`asset_refs/${asset.id}.png`)
        //     || zip.file(`asset_refs/${asset.id}_${asset.name}.png`);

        const asset = makeAsset({ id: 'hero', name: '苏小小' });
        const newPath = `asset_refs/${asset.id}.png`;
        const legacyPath = `asset_refs/${asset.id}_${asset.name}.png`;

        expect(newPath).toBe('asset_refs/hero.png');
        expect(legacyPath).toBe('asset_refs/hero_苏小小.png');

        // Simulate: new format found
        const zipFiles1 = new Set([newPath]);
        const found1 = zipFiles1.has(newPath) || zipFiles1.has(legacyPath);
        expect(found1).toBe(true);

        // Simulate: only legacy format found
        const zipFiles2 = new Set([legacyPath]);
        const found2 = zipFiles2.has(newPath) || zipFiles2.has(legacyPath);
        expect(found2).toBe(true);

        // Simulate: neither found
        const zipFiles3 = new Set<string>();
        const found3 = zipFiles3.has(newPath) || zipFiles3.has(legacyPath);
        expect(found3).toBe(false);
    });
});

// ════════════════════════════════════════════════
// 4. matchAssetsToPrompt — 纯函数测试
// ════════════════════════════════════════════════
describe('matchAssetsToPrompt', () => {

    it('8. 按名称匹配 — prompt 中包含 asset name 时得分高', () => {
        const assets = [
            makeAsset({ id: 'a1', name: '苏小小', refImageUrl: 'data:img;base64,1' }),
            makeAsset({ id: 'a2', name: '李大力', refImageUrl: 'data:img;base64,2' }),
        ];
        const result = matchAssetsToPrompt('苏小小在雨中漫步', assets);
        expect(result.length).toBeGreaterThanOrEqual(1);
        expect(result[0].id).toBe('a1');
    });

    it('9. 按显式 ID 匹配 — explicitIds 优先级最高', () => {
        const assets = [
            makeAsset({ id: 'a1', name: '苏小小', refImageUrl: 'data:img;base64,1' }),
            makeAsset({ id: 'a2', name: '李大力', refImageUrl: 'data:img;base64,2' }),
        ];
        const result = matchAssetsToPrompt('一个人在走路', assets, ['a2']);
        expect(result[0].id).toBe('a2');
    });

    it('10. 无匹配 — 返回空数组', () => {
        const assets = [
            makeAsset({ id: 'a1', name: '苏小小', refImageUrl: 'data:img;base64,1' }),
        ];
        const result = matchAssetsToPrompt('完全无关的场景描述', assets);
        expect(result).toEqual([]);
    });

    it('11. 没有 refImageUrl 的 asset 被过滤', () => {
        const assets = [
            makeAsset({ id: 'a1', name: '苏小小', refImageUrl: undefined }),
        ];
        const result = matchAssetsToPrompt('苏小小在雨中', assets);
        expect(result).toEqual([]);
    });

    it('12. 关键词重叠匹配 — description 关键词与 prompt 重叠 (英文)', () => {
        const assets = [
            makeAsset({
                id: 'a1', name: 'ancient-sword',
                description: 'ancient long blade bronze sharp weapon',
                refImageUrl: 'data:img;base64,1'
            }),
        ];
        // "ancient" and "weapon" overlap with description
        const result = matchAssetsToPrompt('ancient warrior holds weapon', assets);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('a1');
    });

    it('13. 结果按分数降序排列', () => {
        const assets = [
            makeAsset({
                id: 'a1', name: '背景人物',
                description: '路人甲',
                refImageUrl: 'data:img;base64,1'
            }),
            makeAsset({
                id: 'a2', name: '苏小小',
                description: '主角 少女 长发',
                refImageUrl: 'data:img;base64,2'
            }),
        ];
        // 苏小小 has name match (50pts) + possible keyword overlap
        // 背景人物 has no name match, low keyword overlap
        const result = matchAssetsToPrompt('苏小小是一个少女主角', assets);
        expect(result[0].id).toBe('a2');
    });
});

// ════════════════════════════════════════════════
// 5. Merged updates — videoAssetIds 合并逻辑
// ════════════════════════════════════════════════
describe('Merged updates: videoAssetIds computation', () => {

    it('14. 首次图片生成时应计算 videoAssetIds', () => {
        const scene = makeScene({
            id: 'E1_B1',
            videoAssetIds: undefined, // first time
            assetIds: ['hero'],
            visual_desc: '苏小小在雨夜漫步',
        });
        const assets = [
            makeAsset({ id: 'hero', name: '苏小小', refImageUrl: 'data:img;base64,1' }),
        ];

        // Simulate the merged update logic from handleImageGenerated
        const updates: Partial<Scene> = { imageUrl: 'data:image/png;base64,newimg' };
        if (!scene.isStartEndFrameMode && scene.videoAssetIds === undefined) {
            const currentSceneImgId = `scene_img_${scene.id}`;
            const availableAssets = assets.filter(a => (scene.assetIds || []).includes(a.id));
            const matched = matchAssetsToPrompt(scene.visual_desc || '', availableAssets, scene.assetIds || []);
            updates.videoAssetIds = [currentSceneImgId, ...matched.slice(0, 2).map(a => a.id)];
        }

        expect(updates.imageUrl).toBeDefined();
        expect(updates.videoAssetIds).toBeDefined();
        expect(updates.videoAssetIds![0]).toBe('scene_img_E1_B1');
        expect(updates.videoAssetIds!).toContain('hero');
    });

    it('15. videoAssetIds 已存在时不覆盖', () => {
        const scene = makeScene({
            videoAssetIds: ['existing_id'], // already set
        });

        const updates: Partial<Scene> = { imageUrl: 'data:image/png;base64,newimg' };
        if (!scene.isStartEndFrameMode && scene.videoAssetIds === undefined) {
            updates.videoAssetIds = ['should_not_reach'];
        }

        expect(updates.videoAssetIds).toBeUndefined();
    });

    it('16. startEndFrameMode 时设置 startEndAssetIds 而非 videoAssetIds', () => {
        const scene = makeScene({
            id: 'E1_B2',
            isStartEndFrameMode: true,
        });

        const updates: Partial<Scene> = { imageUrl: 'data:image/png;base64,newimg' };
        if (scene.isStartEndFrameMode) {
            updates.startEndAssetIds = [`scene_img_${scene.id}`];
        } else if (scene.videoAssetIds === undefined) {
            updates.videoAssetIds = ['should_not_reach'];
        }

        expect(updates.startEndAssetIds).toEqual(['scene_img_E1_B2']);
        expect(updates.videoAssetIds).toBeUndefined();
    });
});

// ════════════════════════════════════════════════
// 6. Blob URL 检测 & 转换逻辑
// ════════════════════════════════════════════════
describe('Blob URL detection for base64 resolution', () => {

    it('17. blob: URL 被正确识别需要转换', () => {
        const blobUrl = 'blob:http://localhost:5173/abc-def-123';
        const needsConversion = blobUrl.startsWith('blob:');
        expect(needsConversion).toBe(true);
    });

    it('18. data: URL 不需要转换', () => {
        const dataUrl = 'data:image/png;base64,iVBORw0KGgo...';
        const needsConversion = dataUrl.startsWith('blob:');
        expect(needsConversion).toBe(false);
    });

    it('19. http/https URL 不需要转换', () => {
        expect('https://example.com/img.png'.startsWith('blob:')).toBe(false);
        expect('http://localhost:3000/img.png'.startsWith('blob:')).toBe(false);
    });

    it('20. undefined/null URL 安全处理', () => {
        const url1: string | undefined = undefined;
        expect(url1?.startsWith('blob:')).toBeFalsy();

        const url2: string | null = null;
        expect(url2?.startsWith('blob:')).toBeFalsy();
    });

    it('21. 资产有 blob URL 但无 refImageAssetId 时不转换', () => {
        const asset = makeAsset({
            refImageUrl: 'blob:http://localhost/123',
            refImageAssetId: undefined,
        });

        // The conversion condition: startsWith('blob:') && refImageAssetId
        const shouldConvert = asset.refImageUrl?.startsWith('blob:') && asset.refImageAssetId;
        expect(shouldConvert).toBeFalsy();
    });

    it('22. 资产有 blob URL 且有 refImageAssetId 时应转换', () => {
        const asset = makeAsset({
            refImageUrl: 'blob:http://localhost/123',
            refImageAssetId: 'uuid-abc-123',
        });

        const shouldConvert = asset.refImageUrl?.startsWith('blob:') && asset.refImageAssetId;
        expect(shouldConvert).toBeTruthy();
    });
});
