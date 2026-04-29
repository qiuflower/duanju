import { Router, Request, Response } from 'express';
import { extractAssets, extractVisualDna, analyzeVisualStyleFromImages, extractAssetsFromBeats } from '../services/ai/style/index';

const router = Router();

// POST /api/style/extract-assets
router.post('/extract-assets', async (req: Request, res: Response) => {
    try {
        const { text, language, existingAssets, workStyle, textureStyle, useOriginalCharacters, skipDna } = req.body;
        if (!text || !language) {
            return res.status(400).json({ error: 'Missing required fields: text, language' });
        }

        const result = await extractAssets(text, language, existingAssets || [], workStyle || '', textureStyle || '', useOriginalCharacters || false, skipDna || false);
        res.json(result);
    } catch (e: any) {
        console.error('[Style/extract-assets]', e);
        res.status(500).json({ error: e?.message || 'Internal error' });
    }
});

// POST /api/style/visual-dna
router.post('/visual-dna', async (req: Request, res: Response) => {
    try {
        const { workStyle, textureStyle, language, lock, useOriginalCharacters, images } = req.body;
        if (!language) {
            return res.status(400).json({ error: 'Missing required field: language' });
        }

        const result = await extractVisualDna(workStyle || '', textureStyle || '', language, useOriginalCharacters || false, images);
        
        // 如果传入了 lock 参数，则可以在这里返回一个状态标记（具体锁定逻辑在前端更新 GlobalStyle）
        res.json({ dna: result, locked: !!lock });
    } catch (e: any) {
        console.error('[Style/visual-dna]', e);
        res.status(500).json({ error: e?.message || 'Internal error' });
    }
});

// POST /api/style/analyze-images
router.post('/analyze-images', async (req: Request, res: Response) => {
    try {
        const { images, language } = req.body;
        if (!images || !language) {
            return res.status(400).json({ error: 'Missing required fields: images, language' });
        }

        const result = await analyzeVisualStyleFromImages(images, language);
        res.json(result);
    } catch (e: any) {
        console.error('[Style/analyze-images]', e);
        res.status(500).json({ error: e?.message || 'Internal error' });
    }
});

// POST /api/style/extract-assets-from-beats
router.post('/extract-assets-from-beats', async (req: Request, res: Response) => {
    try {
        const { beatSheet, language, existingAssets, workStyle, useOriginalCharacters } = req.body;
        if (!beatSheet || !language) {
            return res.status(400).json({ error: 'Missing required fields: beatSheet, language' });
        }

        const result = await extractAssetsFromBeats(beatSheet, language, existingAssets || [], workStyle || '', useOriginalCharacters || false);
        res.json({ assets: result });
    } catch (e: any) {
        console.error('[Style/extract-assets-from-beats]', e);
        res.status(500).json({ error: e?.message || 'Internal error' });
    }
});

export default router;
