import { describe, it, expect } from 'vitest';
import { deepClone, ensureUniqueId, remapSelfAssetIds } from '../../src/features/useSceneManager';

// ════════════════════════════════════════════
// deepClone
// ════════════════════════════════════════════
describe('deepClone', () => {
    it('creates independent copy of primitive', () => {
        expect(deepClone(42)).toBe(42);
        expect(deepClone('hello')).toBe('hello');
    });

    it('creates deep copy of object', () => {
        const obj = { a: 1, nested: { b: 2 } };
        const cloned = deepClone(obj);
        expect(cloned).toEqual(obj);
        cloned.nested.b = 99;
        expect(obj.nested.b).toBe(2); // original unchanged
    });

    it('creates deep copy of array', () => {
        const arr = [1, [2, 3], { x: 4 }];
        const cloned = deepClone(arr);
        expect(cloned).toEqual(arr);
        (cloned[1] as number[]).push(99);
        expect(arr[1]).toEqual([2, 3]); // original unchanged
    });

    it('handles null', () => {
        expect(deepClone(null)).toBeNull();
    });
});

// ════════════════════════════════════════════
// ensureUniqueId
// ════════════════════════════════════════════
describe('ensureUniqueId', () => {
    it('returns desiredId when no conflict', () => {
        const existing = new Set(['S01', 'S02']);
        expect(ensureUniqueId('S03', existing)).toBe('S03');
    });

    it('appends _2 on first conflict', () => {
        const existing = new Set(['S01']);
        expect(ensureUniqueId('S01', existing)).toBe('S01_2');
    });

    it('increments to _3 when _2 also exists', () => {
        const existing = new Set(['S01', 'S01_2']);
        expect(ensureUniqueId('S01', existing)).toBe('S01_3');
    });

    it('increments to _4 when _2 and _3 both exist', () => {
        const existing = new Set(['S01', 'S01_2', 'S01_3']);
        expect(ensureUniqueId('S01', existing)).toBe('S01_4');
    });

    it('works with empty set', () => {
        expect(ensureUniqueId('S01', new Set())).toBe('S01');
    });

    it('handles copy suffix pattern (S01_copy)', () => {
        const existing = new Set(['S01', 'S01_copy']);
        expect(ensureUniqueId('S01_copy', existing)).toBe('S01_copy_2');
    });
});

// ════════════════════════════════════════════
// remapSelfAssetIds
// ════════════════════════════════════════════
describe('remapSelfAssetIds', () => {
    it('replaces matching scene_img_ ID', () => {
        const ids = ['scene_img_S01', 'hero_base', 'heroine_base'];
        const result = remapSelfAssetIds(ids, 'S01', 'S01_copy');
        expect(result).toEqual(['scene_img_S01_copy', 'hero_base', 'heroine_base']);
    });

    it('leaves non-matching IDs unchanged', () => {
        const ids = ['hero_base', 'heroine_base'];
        expect(remapSelfAssetIds(ids, 'S01', 'S01_copy')).toEqual(['hero_base', 'heroine_base']);
    });

    it('returns undefined for undefined input', () => {
        expect(remapSelfAssetIds(undefined, 'S01', 'S01_copy')).toBeUndefined();
    });

    it('handles empty array', () => {
        expect(remapSelfAssetIds([], 'S01', 'S01_copy')).toEqual([]);
    });

    it('replaces multiple matching IDs', () => {
        const ids = ['scene_img_S01', 'scene_img_S01'];
        expect(remapSelfAssetIds(ids, 'S01', 'S02')).toEqual(['scene_img_S02', 'scene_img_S02']);
    });
});
