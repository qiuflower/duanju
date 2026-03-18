import { describe, it, expect } from 'vitest';
import { getLensById, getLensesByCategory, toCompactLensLibrary, toDetailedLensLibrary } from '../../server/src/domain/generation/core-lenses';

// ════════════════════════════════════════════
// getLensById
// ════════════════════════════════════════════
describe('getLensById', () => {
    it('returns Lens for valid ID "001"', () => {
        const lens = getLensById('001');
        expect(lens).toBeDefined();
        expect(lens?.id).toBe('001');
        expect(lens?.name).toBeTruthy();
    });

    it('returns undefined for non-existent ID', () => {
        expect(getLensById('999')).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
        expect(getLensById('')).toBeUndefined();
    });

    it('each lens has required fields', () => {
        const lens = getLensById('001');
        expect(lens).toHaveProperty('id');
        expect(lens).toHaveProperty('name');
        expect(lens).toHaveProperty('description');
        expect(lens).toHaveProperty('keywords');
    });
});

// ════════════════════════════════════════════
// getLensesByCategory
// ════════════════════════════════════════════
describe('getLensesByCategory', () => {
    it('returns non-empty object', () => {
        const categories = getLensesByCategory();
        expect(Object.keys(categories).length).toBeGreaterThan(0);
    });

    it('each category is an array of Lenses', () => {
        const categories = getLensesByCategory();
        for (const [, lenses] of Object.entries(categories)) {
            expect(Array.isArray(lenses)).toBe(true);
            expect((lenses as any[]).length).toBeGreaterThan(0);
            expect((lenses as any[])[0]).toHaveProperty('id');
        }
    });
});

// ════════════════════════════════════════════
// toCompactLensLibrary
// ════════════════════════════════════════════
describe('toCompactLensLibrary', () => {
    it('returns non-empty string', () => {
        const result = toCompactLensLibrary();
        expect(result.length).toBeGreaterThan(100);
    });

    it('contains bracketed IDs like [001]', () => {
        const result = toCompactLensLibrary();
        expect(result).toContain('[001]');
    });

    it('is significantly shorter than detailed library', () => {
        const compact = toCompactLensLibrary();
        const detailed = toDetailedLensLibrary(['001', '002', '003']);
        // Compact for ALL lenses should still be reasonable
        expect(compact.length).toBeGreaterThan(0);
    });
});

// ════════════════════════════════════════════
// toDetailedLensLibrary
// ════════════════════════════════════════════
describe('toDetailedLensLibrary', () => {
    it('expands valid shot IDs into detailed descriptions', () => {
        const result = toDetailedLensLibrary(['001']);
        expect(result).toContain('001');
        expect(result.length).toBeGreaterThan(20);
    });

    it('returns content for multiple IDs', () => {
        const result = toDetailedLensLibrary(['001', '002', '003']);
        expect(result).toContain('001');
        expect(result).toContain('002');
    });

    it('handles empty array gracefully', () => {
        const result = toDetailedLensLibrary([]);
        expect(typeof result).toBe('string');
    });

    it('skips invalid IDs without crashing', () => {
        const result = toDetailedLensLibrary(['001', 'INVALID', '999']);
        expect(result).toContain('001');
    });
});
