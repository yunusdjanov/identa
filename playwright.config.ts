import { defineConfig, devices } from '@playwright/test';

const frontendPort = 3100;
const backendPort = 8100;
const frontendHost = 'localhost';
const backendHost = 'localhost';

export default defineConfig({
    testDir: './e2e',
    timeout: 90_000,
    fullyParallel: false,
    workers: 1,
    retries: process.env.CI ? 2 : 0,
    reporter: [['list']],
    expect: {
        timeout: 15_000,
    },
    use: {
        baseURL: `http://${frontendHost}:${frontendPort}`,
        trace: 'on-first-retry',
    },
    webServer: [
        {
            command: `powershell -ExecutionPolicy Bypass -File .\\scripts\\run-e2e-backend.ps1 -Port ${backendPort} -FrontendUrl http://${frontendHost}:${frontendPort}`,
            url: `http://${backendHost}:${backendPort}/api/v1/health`,
            timeout: 180_000,
            reuseExistingServer: false,
        },
        {
            command: `powershell -ExecutionPolicy Bypass -File .\\scripts\\run-e2e-frontend.ps1 -Port ${frontendPort} -ApiUrl http://${backendHost}:${backendPort}/api`,
            url: `http://${frontendHost}:${frontendPort}`,
            timeout: 180_000,
            reuseExistingServer: false,
        },
    ],
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
