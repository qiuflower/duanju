/**
 * API Integration tests for all server routes.
 * AI service functions are mocked — we test request validation, error handling, and response format.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

// ─── Mock all AI services BEFORE importing routes ───
vi.mock('../../server/src/services/ai/agents/pipeline', () => ({
    analyzeNarrative: vi.fn().mockResolvedValue({ episodes: [{ title: 'Ep1' }] }),
    generateBeatSheet: vi.fn().mockResolvedValue({ beats: [] }),
    generatePromptsFromBeats: vi.fn().mockResolvedValue({ scenes: [], visualDna: 'test' }),
    generateEpisodeScenes: vi.fn().mockResolvedValue([{ id: 's1' }]),
}));

vi.mock('../../server/src/services/ai/media/image', () => ({
    generateAssetImage: vi.fn().mockResolvedValue({ imageUrl: 'data:image/png;base64,abc' }),
    generateSceneImage: vi.fn().mockResolvedValue({ imageUrl: 'data:image/png;base64,xyz' }),
}));

vi.mock('../../server/src/services/ai/media/video', () => ({
    submitVideoGeneration: vi.fn().mockResolvedValue({ taskId: 'task-123', operation: {} }),
    pollVideoStatus: vi.fn().mockResolvedValue({ done: false }),
}));

vi.mock('../../server/src/services/ai/media/audio', () => ({
    generateSpeech: vi.fn().mockResolvedValue({ audioBase64: 'base64audio' }),
}));

vi.mock('../../server/src/services/ai/style/index', () => ({
    extractAssets: vi.fn().mockResolvedValue({ assets: [], visualDna: '' }),
    extractVisualDna: vi.fn().mockResolvedValue({ visualDna: 'test-dna' }),
    analyzeVisualStyleFromImages: vi.fn().mockResolvedValue({ style: 'anime' }),
    extractAssetsFromBeats: vi.fn().mockResolvedValue([]),
}));



vi.mock('../../server/src/services/ai/model-manager', () => ({
    getModelManager: vi.fn().mockReturnValue({
        getConfig: vi.fn().mockReturnValue({ textmodel: 'gemini', imagemodel: 'imagen', videomodel: 'veo' }),
        setConfig: vi.fn(),
    }),
}));

// ─── Import routes after mocks are set up ───
import pipelineRouter from '../../server/src/routes/pipeline';
import mediaRouter from '../../server/src/routes/media';
import styleRouter from '../../server/src/routes/style';

import configRouter from '../../server/src/routes/config';

// ─── Build test Express app ───
const app: any = express();
app.use(express.json({ limit: '50mb' }));
app.use('/api/pipeline', pipelineRouter);
app.use('/api/media', mediaRouter);
app.use('/api/style', styleRouter);

app.use('/api/config', configRouter);

// ════════════════════════════════════════════
// Pipeline Routes
// ════════════════════════════════════════════
describe('Pipeline Routes', () => {
    describe('POST /api/pipeline/analyze', () => {
        it('400 when text missing', async () => {
            const res = await request(app).post('/api/pipeline/analyze').send({ language: 'zh' });
            expect(res.status).toBe(400);
            expect(res.body.error).toBeDefined();
        });
        it('400 when language missing', async () => {
            expect((await request(app).post('/api/pipeline/analyze').send({ text: 'hello' })).status).toBe(400);
        });
        it('200 with valid request', async () => {
            const res = await request(app).post('/api/pipeline/analyze').send({ text: '小说文本', language: 'zh' });
            expect(res.status).toBe(200);
            expect(res.body.episodes).toBeDefined();
        });
    });

    describe('POST /api/pipeline/beat-sheet', () => {
        it('400 when episode missing', async () => {
            expect((await request(app).post('/api/pipeline/beat-sheet').send({ language: 'zh', style: {} })).status).toBe(400);
        });
        it('200 with valid request', async () => {
            const res = await request(app).post('/api/pipeline/beat-sheet').send({ episode: { title: 'test' }, language: 'zh', style: { prefix: '' } });
            expect(res.status).toBe(200);
            expect(res.body.beats).toBeDefined();
        });
    });

    describe('POST /api/pipeline/prompts', () => {
        it('400 when beatSheet missing', async () => {
            expect((await request(app).post('/api/pipeline/prompts').send({ language: 'zh', style: {} })).status).toBe(400);
        });
        it('200 with valid request', async () => {
            const res = await request(app).post('/api/pipeline/prompts').send({ beatSheet: [{ id: 'b1' }], language: 'zh', style: { prefix: '' } });
            expect(res.status).toBe(200);
            expect(res.body.scenes).toBeDefined();
        });
    });

    describe('POST /api/pipeline/episode-scenes', () => {
        it('400 when episode missing', async () => {
            expect((await request(app).post('/api/pipeline/episode-scenes').send({ language: 'zh', style: {} })).status).toBe(400);
        });
        it('200 with valid request', async () => {
            const res = await request(app).post('/api/pipeline/episode-scenes').send({ episode: { title: 'test' }, language: 'zh', style: { prefix: '' } });
            expect(res.status).toBe(200);
            expect(res.body.scenes).toBeDefined();
        });
    });
});

// ════════════════════════════════════════════
// Media Routes
// ════════════════════════════════════════════
describe('Media Routes', () => {
    describe('POST /api/media/asset-image', () => {
        it('400 when asset missing', async () => { expect((await request(app).post('/api/media/asset-image').send({})).status).toBe(400); });
        it('200 with valid request', async () => {
            const res = await request(app).post('/api/media/asset-image').send({ asset: { name: 'test' } });
            expect(res.status).toBe(200);
            expect(res.body.imageUrl).toBeDefined();
        });
    });
    describe('POST /api/media/scene-image', () => {
        it('400 when scene missing', async () => { expect((await request(app).post('/api/media/scene-image').send({})).status).toBe(400); });
        it('200 with valid request', async () => { expect((await request(app).post('/api/media/scene-image').send({ scene: { prompt: 'test' } })).status).toBe(200); });
    });
    describe('POST /api/media/video', () => {
        it('400 when scene missing', async () => { expect((await request(app).post('/api/media/video').send({})).status).toBe(400); });
        it('200 with valid request', async () => {
            const res = await request(app).post('/api/media/video').send({ scene: { videoPrompt: 'test' } });
            expect(res.status).toBe(200);
            expect(res.body.taskId).toBeDefined();
        });
    });
    describe('POST /api/media/video-status', () => {
        it('400 when operation missing', async () => { expect((await request(app).post('/api/media/video-status').send({})).status).toBe(400); });
        it('200 with valid request', async () => {
            const res = await request(app).post('/api/media/video-status').send({ operation: { name: 'op-1' } });
            expect(res.status).toBe(200);
            expect(res.body.done).toBeDefined();
        });
    });
    describe('POST /api/media/speech', () => {
        it('400 when text and scene both missing', async () => { expect((await request(app).post('/api/media/speech').send({})).status).toBe(400); });
        it('200 with text', async () => { expect((await request(app).post('/api/media/speech').send({ text: '你好' })).status).toBe(200); });
    });
});

// ════════════════════════════════════════════
// Style Routes
// ════════════════════════════════════════════
describe('Style Routes', () => {
    describe('POST /api/style/extract-assets', () => {
        it('400 when text missing', async () => { expect((await request(app).post('/api/style/extract-assets').send({ language: 'zh' })).status).toBe(400); });
        it('200 with valid request', async () => { expect((await request(app).post('/api/style/extract-assets').send({ text: '文本', language: 'zh' })).status).toBe(200); });
    });
    describe('POST /api/style/visual-dna', () => {
        it('400 when language missing', async () => { expect((await request(app).post('/api/style/visual-dna').send({})).status).toBe(400); });
        it('200 with valid request', async () => { expect((await request(app).post('/api/style/visual-dna').send({ language: 'zh' })).status).toBe(200); });
    });
    describe('POST /api/style/analyze-images', () => {
        it('400 when images missing', async () => { expect((await request(app).post('/api/style/analyze-images').send({ language: 'zh' })).status).toBe(400); });
        it('200 with valid request', async () => { expect((await request(app).post('/api/style/analyze-images').send({ images: ['base64'], language: 'zh' })).status).toBe(200); });
    });
    describe('POST /api/style/extract-assets-from-beats', () => {
        it('400 when beatSheet missing', async () => { expect((await request(app).post('/api/style/extract-assets-from-beats').send({ language: 'zh' })).status).toBe(400); });
        it('200 with valid request', async () => { expect((await request(app).post('/api/style/extract-assets-from-beats').send({ beatSheet: [{ id: 'b1' }], language: 'zh' })).status).toBe(200); });
    });
});



// ════════════════════════════════════════════
// Config Routes
// ════════════════════════════════════════════
describe('Config Routes', () => {
    describe('GET /api/config', () => {
        it('200 returns config', async () => {
            const res = await request(app).get('/api/config');
            expect(res.status).toBe(200);
            expect(res.body.textmodel).toBeDefined();
        });
    });
    describe('POST /api/config', () => {
        it('200 updates and returns config', async () => {
            expect((await request(app).post('/api/config').send({ textmodel: 'gemini-3.1', imagemodel: 'imagen-3', videomodel: 'veo-2' })).status).toBe(200);
        });
    });
});
