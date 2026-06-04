import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    test: {
        environment: 'jsdom',
        setupFiles: ['./test/setup.ts'],
        include: ['**/*.test.ts', '**/*.test.tsx'],
        exclude: ['backend/**', 'node_modules/**', '.next/**'],
        testTimeout: 20000,
        coverage: {
            provider: 'v8',
            reporter: ['text-summary', 'html'],
            include: ['app/**', 'components/**', 'lib/**'],
            exclude: [
                '**/*.test.{ts,tsx}',
                '**/*.d.ts',
                'app/api/**', // route handlers exercised by backend/e2e, not unit tests
                'lib/i18n/dictionaries.ts', // data file, validated by dictionaries.test.ts
            ],
            // Floor to prevent coverage regressions. Set just below the current
            // numbers — raise these as more critical-path tests land. The goal
            // is a ratchet, not chasing 100% (an anti-pattern that yields
            // brittle tests). New high-risk logic should ship with tests.
            thresholds: {
                statements: 40,
                branches: 36,
                functions: 35,
                lines: 40,
            },
        },
    },
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./', import.meta.url)),
        },
    },
});
