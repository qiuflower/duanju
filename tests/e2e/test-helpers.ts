/**
 * E2E 测试共享配置
 * 
 * 通过 REAL_API 环境变量控制测试模式：
 * - REAL_API=true  → 真实 API 模式（跳过 mock，使用更长超时）
 * - 默认           → Mock 模式（拦截 API，返回预设数据）
 */
import { type Route, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures');

// ─── 模式检测 ────────────────────────────────────────
export const IS_REAL_API = process.env.REAL_API === 'true';

// ─── 超时配置 ────────────────────────────────────────
/** 等待 AI 生成操作完成的时间 */
export const AI_WAIT = IS_REAL_API ? 60000 : 3000;
/** 等待完整流水线（多步 AI 调用）的时间 */
export const PIPELINE_WAIT = IS_REAL_API ? 120000 : 8000;
/** 等待媒体生成的时间 */
export const MEDIA_WAIT = IS_REAL_API ? 90000 : 5000;

// ─── Fixtures ────────────────────────────────────────
export const mockAnalyze = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'mock-analyze-response.json'), 'utf-8'));
export const mockBeatSheet = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'mock-beatsheet-response.json'), 'utf-8'));
export const mockPrompts = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'mock-prompts-response.json'), 'utf-8'));
export const mockSceneImage = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'mock-scene-image.json'), 'utf-8'));
export const mockExtractAssets = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'mock-extract-assets.json'), 'utf-8'));

// ─── Mock 工具 ───────────────────────────────────────

/**
 * 拦截 API 并可选地 mock 响应。
 * - Mock 模式：拦截请求，捕获 body，返回 mock 数据
 * - Real 模式：拦截请求，捕获 body，然后 continue() 转发到真实服务器
 */
export function interceptApi(page: Page, urlPattern: string, mockResponse: any) {
    const captured: any[] = [];
    const handler = async (route: Route) => {
        try {
            const postData = route.request().postDataJSON();
            captured.push(postData);
        } catch {
            captured.push(null);
        }
        if (IS_REAL_API) {
            await route.continue();
        } else {
            await route.fulfill({ json: mockResponse });
        }
    };
    return { captured, setup: () => page.route(urlPattern, handler) };
}

/**
 * Mock 所有流水线 API（仅在 Mock 模式下生效）
 * Real 模式下此函数不做任何事。
 */
export async function mockAllPipelineApis(page: Page) {
    if (IS_REAL_API) return;

    await page.route('**/api/pipeline/analyze', async (route: Route) => {
        await route.fulfill({ json: mockAnalyze });
    });
    await page.route('**/api/pipeline/beat-sheet', async (route: Route) => {
        await route.fulfill({ json: mockBeatSheet });
    });
    await page.route('**/api/pipeline/prompts', async (route: Route) => {
        await route.fulfill({ json: mockPrompts });
    });
    await page.route('**/api/style/extract-assets', async (route: Route) => {
        await route.fulfill({ json: mockExtractAssets });
    });
    await page.route('**/api/style/visual-dna', async (route: Route) => {
        await route.fulfill({ json: { visualDna: '古风水墨测试DNA' } });
    });
    await page.route('**/api/style/extract-assets-from-beats', async (route: Route) => {
        await route.fulfill({ json: { assets: mockExtractAssets.assets } });
    });
}

/**
 * Mock 除指定 URL 外的所有流水线 API。
 * 用于需要捕获特定 API 请求的测试。
 */
export async function mockPipelineApisExcept(page: Page, excludePattern: string) {
    if (IS_REAL_API) return;

    const apis: Record<string, any> = {
        '**/api/pipeline/analyze': mockAnalyze,
        '**/api/pipeline/beat-sheet': mockBeatSheet,
        '**/api/pipeline/prompts': mockPrompts,
    };

    for (const [pattern, response] of Object.entries(apis)) {
        if (!pattern.includes(excludePattern)) {
            await page.route(pattern, async (route: Route) => {
                await route.fulfill({ json: response });
            });
        }
    }

    // Always mock style APIs (unless they're the excluded one)
    if (!excludePattern.includes('style')) {
        await page.route('**/api/style/**', async (route: Route) => {
            await route.fulfill({ json: { visualDna: 'test', assets: mockExtractAssets.assets } });
        });
    }
}

/** Navigate to 剧本输入 tab, input text, and click 生成分镜脚本 */
export async function inputTextAndGenerate(page: Page, text: string) {
    const scriptTab = page.getByRole('button', { name: '剧本输入' });
    await scriptTab.click();
    await page.waitForTimeout(500);

    const textarea = page.locator('textarea');
    await textarea.fill(text);

    const generateBtn = page.getByRole('button', { name: /生成分镜脚本/ });
    await generateBtn.click();
}
