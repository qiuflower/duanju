import { describe, it, expect, vi } from 'vitest';
import { computeStylePrefix, executeWithRetryAndValidation } from '../../server/src/services/ai/agents/pipeline';
import { GlobalStyle } from '../../server/src/shared/types';

// ════════════════════════════════════════════
// computeStylePrefix
// ════════════════════════════════════════════
describe('computeStylePrefix', () => {
    it('returns visualTags when useOriginalCharacters is false', () => {
        const style: GlobalStyle = { visualTags: '[Anime][Fantasy]' } as any;
        expect(computeStylePrefix(style)).toBe('[Anime][Fantasy]');
    });

    it('returns empty when no visualTags and no work style', () => {
        expect(computeStylePrefix({} as any)).toBe('');
    });

    it('appends 美术风格 suffix for Chinese work names', () => {
        const style: GlobalStyle = {
            visualTags: '',
            work: { useOriginalCharacters: true, custom: '新海诚' }
        } as any;
        expect(computeStylePrefix(style)).toBe('新海诚美术风格');
    });

    it('appends Art Style suffix for English work names', () => {
        const style: GlobalStyle = {
            visualTags: '',
            work: { useOriginalCharacters: true, custom: 'Ghibli' }
        } as any;
        expect(computeStylePrefix(style)).toBe('Ghibli Art Style');
    });

    it('does not double-append suffix', () => {
        const style: GlobalStyle = {
            visualTags: '',
            work: { useOriginalCharacters: true, custom: '新海诚美术风格' }
        } as any;
        expect(computeStylePrefix(style)).toBe('新海诚美术风格');
    });

    it('does not double-append Art Style suffix', () => {
        const style: GlobalStyle = {
            visualTags: '',
            work: { useOriginalCharacters: true, custom: 'Ghibli Art Style' }
        } as any;
        expect(computeStylePrefix(style)).toBe('Ghibli Art Style');
    });

    it('uses selected when custom is empty', () => {
        const style: GlobalStyle = {
            visualTags: '',
            work: { useOriginalCharacters: true, custom: '', selected: '宫崎骏' }
        } as any;
        expect(computeStylePrefix(style)).toBe('宫崎骏美术风格');
    });

    it('ignores work style when useOriginalCharacters is false even if custom exists', () => {
        const style: GlobalStyle = {
            visualTags: '[Cyberpunk]',
            work: { useOriginalCharacters: false, custom: 'Ghibli' }
        } as any;
        expect(computeStylePrefix(style)).toBe('[Cyberpunk]');
    });

    it('returns visualTags when work.custom is empty and useOriginalCharacters but no style', () => {
        const style: GlobalStyle = {
            visualTags: '[Dark]',
            work: { useOriginalCharacters: true, custom: '', selected: 'None' }
        } as any;
        expect(computeStylePrefix(style)).toBe('[Dark]');
    });
});

// ════════════════════════════════════════════
// executeWithRetryAndValidation
// ════════════════════════════════════════════
describe('executeWithRetryAndValidation', () => {
    it('returns on first success when validator passes', async () => {
        const op = vi.fn().mockResolvedValue({ beats: [1] });
        const result = await executeWithRetryAndValidation<{ beats: number[] }>(op, r => r.beats.length > 0, 'Test', {}, 3);
        expect(result).toEqual({ beats: [1] });
        expect(op).toHaveBeenCalledTimes(1);
    });

    it('retries when validator fails and eventually succeeds', async () => {
        let count = 0;
        const op = vi.fn().mockImplementation(async () => {
            count++;
            return count >= 2 ? { beats: [1] } : { beats: [] };
        });
        const result = await executeWithRetryAndValidation<{ beats: number[] }>(op, r => r.beats.length > 0, 'Test', {}, 3);
        expect(result.beats).toHaveLength(1);
        expect(op).toHaveBeenCalledTimes(2);
    });

    it('throws after maxRetries when validator always fails', async () => {
        const op = vi.fn().mockResolvedValue({ beats: [] });
        await expect(executeWithRetryAndValidation<{ beats: number[] }>(op, r => r.beats.length > 0, 'Agent X', {}, 2))
            .rejects.toThrow('[Agent X] Execution failed after 2 retries');
    });

    it('retries on operation throw', async () => {
        let count = 0;
        const op = vi.fn().mockImplementation(async () => {
            count++;
            if (count < 2) throw new Error('network fail');
            return { ok: true };
        });
        const result = await executeWithRetryAndValidation(op, () => true, 'Test', {}, 3);
        expect(result).toEqual({ ok: true });
        expect(op).toHaveBeenCalledTimes(2);
    });
});
