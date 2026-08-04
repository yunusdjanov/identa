import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { loginAdmin, loginDentist } from './helpers/auth';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const;

async function expectNoSeriousAccessibilityViolations(page: Page): Promise<void> {
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15_000 });

    const builder = new AxeBuilder({ page }).withTags([...WCAG_TAGS]);

    // The landing dashboard illustration is exposed as one labelled image.
    // Its intentionally tiny decorative facsimile text is not page content
    // and is therefore outside WCAG text-contrast requirements.
    if (new URL(page.url()).pathname === '/') {
        builder.exclude('.hero-preview');
    }

    const results = await builder.analyze();
    const violations = results.violations.filter(
        (violation) => violation.impact === 'critical' || violation.impact === 'serious'
    );
    const diagnostic = violations
        .map((violation) => {
            const targets = violation.nodes
                .slice(0, 5)
                .map((node) => node.target.join(' '))
                .join(', ');

            return `${violation.id}: ${violation.help} (${targets})`;
        })
        .join('\n');

    expect(
        violations.map((violation) => ({
            id: violation.id,
            impact: violation.impact,
            targets: violation.nodes.map((node) => node.target),
        })),
        diagnostic
    ).toEqual([]);
}

test.describe('WCAG accessibility smoke coverage', () => {
    test.describe.configure({ timeout: 180_000 });

    test('public landing and authentication routes have no serious violations', async ({ page }) => {
        for (const path of ['/', '/login', '/register', '/forgot-password', '/admin/login']) {
            await test.step(`scan ${path}`, async () => {
                await page.goto(path);
                await expectNoSeriousAccessibilityViolations(page);
            });
        }
    });

    test('dentist core routes have no serious violations', async ({ page }) => {
        await loginDentist(page);

        for (const path of ['/dashboard', '/patients', '/appointments', '/payments', '/analytics', '/settings']) {
            await test.step(`scan ${path}`, async () => {
                await page.goto(path);
                await expectNoSeriousAccessibilityViolations(page);
            });
        }
    });

    test('admin core routes have no serious violations', async ({ page }) => {
        await loginAdmin(page);

        for (const path of ['/admin', '/admin/analytics', '/admin/payments', '/admin/plans', '/admin/settings']) {
            await test.step(`scan ${path}`, async () => {
                await page.goto(path);
                await expectNoSeriousAccessibilityViolations(page);
            });
        }
    });
});
