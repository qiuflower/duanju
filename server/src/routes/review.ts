import { Router, Request, Response } from 'express';
import { reviewVideoPrompt, regenerateVideoPromptOptimized } from '../services/ai/review/index';

const router = Router();

// POST /api/review/video-prompt
router.post('/video-prompt', async (req: Request, res: Response) => {
    try {
        const { prompt, language } = req.body;
        if (!prompt || !language) {
            return res.status(400).json({ error: 'Missing required fields: prompt, language' });
        }

        const result = await reviewVideoPrompt(prompt, language);
        res.json(result);
    } catch (e: any) {
        console.error('[Review/video-prompt]', e);
        res.status(500).json({ error: e?.message || 'Internal error' });
    }
});

// POST /api/review/optimize
router.post('/optimize', async (req: Request, res: Response) => {
    try {
        const { scene, assets, stylePrefix, language, reviewResult } = req.body;
        if (!scene || !language) {
            return res.status(400).json({ error: 'Missing required fields: scene, language' });
        }

        const result = await regenerateVideoPromptOptimized(
            scene,
            assets || [],
            stylePrefix || '',
            language,
            reviewResult
        );
        res.json(result);
    } catch (e: any) {
        console.error('[Review/optimize]', e);
        res.status(500).json({ error: e?.message || 'Internal error' });
    }
});

export default router;
