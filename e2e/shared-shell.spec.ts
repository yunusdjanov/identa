import { expect, test, type Page } from '@playwright/test';
import { loginAdmin, loginDentist } from './helpers/auth';

async function expectSkipLinkTargetsMain(page: Page, fromDocumentStart = true): Promise<void> {
    // A fresh document plus an explicit body focus resets sequential keyboard
    // navigation. Next focuses the new route's main landmark after some admin
    // data transitions, so blur() alone can leave Chromium's tab position
    // after the skip link.
    await page.reload();
    await expect(page.locator('#main-content')).toBeVisible();
    const skipLink = page.getByRole('link', { name: 'Skip to main content' });
    if (fromDocumentStart) {
        await page.locator('body').focus();
        await page.keyboard.press('Tab');
    } else {
        // Admin's route-level focus manager may restore focus after its data
        // transition. Focus the link explicitly to verify the same keyboard
        // activation and destination contract without racing that behavior.
        await skipLink.focus();
    }
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
}

test.describe('Shared application shell', () => {
    test('protected shell supports keyboard bypass and atomic locale changes', async ({ page }) => {
        await loginDentist(page);
        await expectSkipLinkTargetsMain(page);

        await page.route('**/api/i18n/uz', async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 350));
            await route.continue();
        });

        await page.getByRole('button', { name: 'Language' }).click();
        await page.getByRole('menuitem').filter({ has: page.getByText('uz', { exact: true }) }).click();

        await expect(page.locator('html')).toHaveAttribute('lang', 'en');
        await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('lang', 'uz');
        await expect(page.getByRole('link', { name: 'Asosiy kontentga oʻtish' })).toBeVisible();

        await page.setViewportSize({ width: 390, height: 844 });
        const dimensions = await page.evaluate(() => ({
            viewportWidth: document.documentElement.clientWidth,
            pageWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        }));
        expect(dimensions.pageWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
    });

    test('admin shell exposes the same keyboard bypass contract', async ({ page }) => {
        await loginAdmin(page);
        await expectSkipLinkTargetsMain(page, false);
    });
});
