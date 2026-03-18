import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { safeJsonParse, withTimeout, retryWithBackoff, wait } from '../../server/src/services/ai/helpers';

// ────────────────────────────────────────────
// safeJsonParse (backend version)
// ────────────────────────────────────────────
describe('safeJsonParse', () => {
    const FALLBACK = { fallback: true };

    it('parses valid JSON', () => { expect(safeJsonParse('{"a":1}', FALLBACK)).toEqual({ a: 1 }); });
    it('handles ```json fences', () => { expect(safeJsonParse('```json\n{"a":1}\n```', FALLBACK)).toEqual({ a: 1 }); });
    it('handles ``` fences', () => { expect(safeJsonParse('```\n[1,2]\n```', FALLBACK)).toEqual([1, 2]); });
    it('returns fallback for undefined', () => { expect(safeJsonParse(undefined, FALLBACK)).toEqual(FALLBACK); });
    it('returns fallback for empty string', () => { expect(safeJsonParse('', FALLBACK)).toEqual(FALLBACK); });
    it('returns fallback for garbage', () => { expect(safeJsonParse('not json', FALLBACK)).toEqual(FALLBACK); });
});

// ────────────────────────────────────────────
// withTimeout
// ────────────────────────────────────────────
describe('withTimeout', () => {
    it('resolves when promise completes before timeout', async () => {
        expect(await withTimeout(Promise.resolve('ok'), 1000)).toBe('ok');
    });
    it('rejects when promise exceeds timeout', async () => {
        const slow = new Promise(resolve => setTimeout(resolve, 5000));
        await expect(withTimeout(slow, 50)).rejects.toThrow('Timeout');
    });
    it('passes through promise rejection', async () => {
        await expect(withTimeout(Promise.reject(new Error('original error')), 1000)).rejects.toThrow('original error');
    });
});

// ────────────────────────────────────────────
// retryWithBackoff
// ────────────────────────────────────────────
describe('retryWithBackoff', () => {
    it('succeeds on first attempt', async () => {
        const fn = vi.fn().mockResolvedValue('success');
        const result = await retryWithBackoff(fn, 3, 10);
        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on failure and eventually succeeds', async () => {
        let attempt = 0;
        const fn = vi.fn().mockImplementation(async () => { attempt++; if (attempt < 3) throw new Error('fail'); return 'success'; });
        const result = await retryWithBackoff(fn, 3, 10);
        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it('throws after max retries exhausted', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('always fails'));
        await expect(retryWithBackoff(fn, 2, 10)).rejects.toThrow('always fails');
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('calls onRetry callback on each retry', async () => {
        const onRetry = vi.fn();
        let attempt = 0;
        const fn = vi.fn().mockImplementation(async () => { attempt++; if (attempt < 2) throw new Error('fail1'); return 'done'; });
        await retryWithBackoff(fn, 3, 10, onRetry);
        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
    });
});

// ────────────────────────────────────────────
// wait
// ────────────────────────────────────────────
describe('wait', () => {
    it('resolves after specified ms', async () => {
        const start = Date.now();
        await wait(50);
        expect(Date.now() - start).toBeGreaterThanOrEqual(40);
    });
});
