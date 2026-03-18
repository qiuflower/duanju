import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { pollVideoUntilDone } from '../../src/services/api';

describe('pollVideoUntilDone', () => {
    beforeEach(() => { mockFetch.mockReset(); });

    it('returns url when video completes on 2nd poll', async () => {
        mockFetch
            .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ done: false }) })
            .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ done: true, url: 'https://video.mp4' }) });
        const result = await pollVideoUntilDone({ name: 'op-1' }, 10, 10);
        expect(result.url).toBe('https://video.mp4');
    });

    it('throws on error status', async () => {
        mockFetch
            .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ done: false }) })
            .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ error: 'Generation failed' }) });
        await expect(pollVideoUntilDone({ name: 'op-1' }, 10, 10)).rejects.toThrow('Generation failed');
    });

    it('throws on timeout (maxRetries exceeded)', async () => {
        mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ done: false }) });
        await expect(pollVideoUntilDone({ name: 'op-1' }, 10, 3)).rejects.toThrow('timed out');
    });

    it('calls onPoll callback with attempt number', async () => {
        const onPoll = vi.fn();
        mockFetch
            .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ done: false }) })
            .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ done: true, url: 'https://video.mp4' }) });
        await pollVideoUntilDone({ name: 'op-1' }, 10, 10, onPoll);
        expect(onPoll).toHaveBeenCalledWith(1);
        expect(onPoll).toHaveBeenCalledWith(2);
    });
});
