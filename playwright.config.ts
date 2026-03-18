import { defineConfig, devices } from '@playwright/test';

const isRealApi = process.env.REAL_API === 'true';

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: 'html',

    use: {
        baseURL: 'http://localhost:3000',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        actionTimeout: isRealApi ? 120000 : 15000,
    },

    // Real API 模式：单个测试最长 5 分钟；Mock 模式：2 分钟
    timeout: isRealApi ? 300000 : 120000,

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],

    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 30000,
    },
});
