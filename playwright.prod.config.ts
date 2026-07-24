import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    timeout: 90_000,
    fullyParallel: false,
    workers: 1,
    retries: 1,
    reporter: [['list']],
    expect: {
        timeout: 15_000,
    },
    use: {
        baseURL: process.env.E2E_FRONTEND_URL ?? 'https://identa.uz',
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'mobile-chromium',
            testMatch: /responsive\.spec\.ts/,
            use: {
                browserName: 'chromium',
                viewport: { width: 390, height: 844 },
                deviceScaleFactor: 1,
                hasTouch: true,
                isMobile: true,
            },
        },
        {
            name: 'tablet-chromium',
            testMatch: /responsive\.spec\.ts/,
            use: {
                browserName: 'chromium',
                viewport: { width: 768, height: 1024 },
                deviceScaleFactor: 1,
                hasTouch: true,
            },
        },
    ],
});
