import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the providers — must use class syntax for `new`
vi.mock('../../server/src/services/ai/providers/polo', () => ({
    PoloProvider: class {
        generateContent = vi.fn().mockResolvedValue({ text: 'polo-response' });
        generateVideos = vi.fn().mockResolvedValue({ operation: { id: 'polo-op' } });
        getVideosOperation = vi.fn().mockResolvedValue({ done: true });
    },
}));

vi.mock('../../server/src/services/ai/providers/t8star', () => ({
    T8StarProvider: class {
        generateContent = vi.fn().mockResolvedValue({ text: 't8star-response' });
        generateVideos = vi.fn().mockResolvedValue({ operation: { id: 't8-op' } });
        getVideosOperation = vi.fn().mockResolvedValue({ done: true });
        speech = vi.fn().mockResolvedValue(new ArrayBuffer(8));
    },
}));

beforeEach(async () => { vi.resetModules(); });

describe('ModelManager', () => {
    async function getManager() {
        const mod = await import('../../server/src/services/ai/model-manager');
        return mod.getModelManager();
    }

    it('starts with default config (all t8star)', async () => {
        const mm = await getManager();
        const config = mm.getConfig();
        expect(config.textmodel).toBe('t8star');
        expect(config.imagemodel).toBe('t8star');
        expect(config.videomodel).toBe('t8star');
    });

    it('setConfig accepts valid providers', async () => {
        const mm = await getManager();
        mm.setConfig({ textmodel: 'polo', imagemodel: 'polo' });
        expect(mm.getConfig().textmodel).toBe('polo');
        expect(mm.getConfig().imagemodel).toBe('polo');
        expect(mm.getConfig().videomodel).toBe('t8star');
    });

    it('setConfig ignores invalid provider names', async () => {
        const mm = await getManager();
        mm.setConfig({ textmodel: 'invalid_provider' as any });
        expect(mm.getConfig().textmodel).toBe('t8star');
    });

    it('getConfig returns a copy (not reference)', async () => {
        const mm = await getManager();
        const config = mm.getConfig();
        config.textmodel = 'polo';
        expect(mm.getConfig().textmodel).toBe('t8star');
    });

    it('routes text requests to text provider', async () => {
        const mm = await getManager();
        const result = await mm.generateContent({ model: 'gemini-3.1-flash-lite-preview-thinking-high', contents: 'test' });
        expect(result).toBeDefined();
    });

    it('detects image request by model name containing "image"', async () => {
        const mm = await getManager();
        const result = await mm.generateContent({ model: 'gemini-3.1-flash-image-preview-2k', contents: 'test' });
        expect(result).toBeDefined();
    });

    it('detects image request by imageConfig in config', async () => {
        const mm = await getManager();
        const result = await mm.generateContent({ model: 'any-model', contents: 'test', config: { imageConfig: {} } });
        expect(result).toBeDefined();
    });

    it('speech() delegates to t8star provider', async () => {
        const mm = await getManager();
        const result = await mm.speech({ text: 'hello' });
        expect(result).toBeInstanceOf(ArrayBuffer);
    });
});
