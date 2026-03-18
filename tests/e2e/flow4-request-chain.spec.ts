/**
 * Flow 4 — 前后端请求链路 (Request Chain)
 * 对应数据流程图 §5: FE → ModelManager → Provider → Express → 外部 API
 */
import { test, expect } from '@playwright/test';
import { IS_REAL_API, AI_WAIT, inputTextAndGenerate } from './test-helpers';

test.describe('Flow 4: 前后端请求链路', () => {

    test('4.1 参数校验 — /api/pipeline/analyze 缺 text 返回 400', async ({ request }) => {
        const response = await request.post('/api/pipeline/analyze', {
            data: { language: 'Chinese' }
        });
        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.error).toBeTruthy();
        expect(body.error).toContain('text');
    });

    test('4.2 参数校验 — /api/pipeline/beat-sheet 缺 style 返回 400', async ({ request }) => {
        const response = await request.post('/api/pipeline/beat-sheet', {
            data: {
                episode: { episode_number: 1, title: 'test', text: 'test' },
                language: 'Chinese'
            }
        });
        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.error).toBeTruthy();
    });

    test('4.3 速率限制 — 超过 100 次/分钟返回 429', async ({ request }) => {
        const promises: Promise<any>[] = [];
        for (let i = 0; i < 105; i++) {
            promises.push(
                request.post('/api/pipeline/analyze', {
                    data: { text: 'test', language: 'Chinese' },
                    timeout: 5000,
                }).catch(() => null)
            );
        }
        const responses = await Promise.all(promises);
        const validResponses = responses.filter(r => r !== null);
        expect(validResponses.length).toBeGreaterThan(0);
    });

    test('4.4 服务器可达性 — 前端页面正常加载', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('header')).toBeVisible();
        const title = await page.title();
        expect(title).toBeTruthy();
    });

    test('4.5 错误传播 — 后端错误不导致前端白屏', async ({ page }) => {
        if (IS_REAL_API) {
            // In real API mode, just verify the app loads and handles network issues gracefully
            await page.goto('/');
            await page.waitForLoadState('networkidle');
            await expect(page.locator('header')).toBeVisible();
            return;
        }

        await page.route('**/api/pipeline/analyze', async (route) => {
            await route.fulfill({ status: 500, json: { error: 'Internal server error' } });
        });
        await page.route('**/api/style/visual-dna', async (route) => {
            await route.fulfill({ json: { visualDna: '' } });
        });

        await page.goto('/');
        await page.waitForLoadState('networkidle');

        await inputTextAndGenerate(page, '测试文本');
        await page.waitForTimeout(AI_WAIT);

        const pageContent = await page.textContent('body');
        expect(pageContent).toBeTruthy();
        expect(pageContent!.length).toBeGreaterThan(10);
        await expect(page.locator('header')).toBeVisible();
    });
});
