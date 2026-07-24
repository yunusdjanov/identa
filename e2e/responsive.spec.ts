import { expect, test, type Page } from '@playwright/test';
import { loginAdmin, loginDentist } from './helpers/auth';

async function expectNoPageHorizontalOverflow(page: Page): Promise<void> {
    const dimensions = await page.evaluate(() => ({
        viewportWidth: document.documentElement.clientWidth,
        pageWidth: Math.max(
            document.documentElement.scrollWidth,
            document.body?.scrollWidth ?? 0
        ),
    }));

    expect(dimensions.pageWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
}

async function expectInsideViewport(page: Page, selector: string): Promise<void> {
    const bounds = await page.locator(selector).evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
            left: rect.left,
            right: rect.right,
            viewportWidth: document.documentElement.clientWidth,
        };
    });

    expect(bounds.left).toBeGreaterThanOrEqual(-1);
    expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth + 1);
}

test.describe('Responsive smoke coverage', () => {
    test('public landing and auth shells stay within the viewport', async ({ page }) => {
        for (const path of ['/', '/login', '/register']) {
            await page.goto(path);
            await expect(page.locator('main').first()).toBeVisible();
            await expectNoPageHorizontalOverflow(page);
        }
    });

    test('dentist core routes and finance controls stay contained', async ({ page }) => {
        await loginDentist(page);

        for (const path of ['/dashboard', '/appointments', '/payments', '/settings']) {
            await page.goto(path);
            await expect(page.locator('main').first()).toBeVisible();
            await expectNoPageHorizontalOverflow(page);
        }

        await page.goto('/analytics');
        const rangeSelector = page.getByRole('radiogroup');
        await expect(rangeSelector).toBeVisible();
        await expectInsideViewport(page, '[role="radiogroup"]');
        await expectNoPageHorizontalOverflow(page);

        await page.goto('/payments');
        const patientsTab = page.getByRole('button', { name: /^(Patients|Пациенты|Bemorlar)$/ });
        await expect(patientsTab).toBeVisible();
        await patientsTab.click();

        const patientLink = page.locator('tbody a[href^="/payments/patients/"]').first();
        await expect(patientLink).toBeVisible();
        const patientHref = await patientLink.getAttribute('href');
        expect(patientHref).toBeTruthy();

        await page.goto(patientHref!);
        await expect(page.getByTestId('patient-detail-header-facts')).toBeVisible();
        await expect(page.getByTestId('payment-summary-grid')).toBeVisible();
        await expectNoPageHorizontalOverflow(page);

        const patientId = patientHref!.split('/').filter(Boolean).at(-1);
        expect(patientId).toBeTruthy();
        await page.goto(`/patients/${patientId}/odontogram`);
        await expect(page.getByTestId('odontogram-upper-jaw-scroll')).toBeVisible();
        await expect(page.getByTestId('odontogram-lower-jaw-scroll')).toBeVisible();
        await expectInsideViewport(page, '[data-testid="odontogram-upper-jaw-scroll"]');
        await expectNoPageHorizontalOverflow(page);
    });

    test('admin dashboards stay within the viewport', async ({ page }) => {
        await loginAdmin(page);

        for (const path of ['/admin', '/admin/analytics', '/admin/payments', '/admin/settings']) {
            await page.goto(path);
            await expect(page.locator('main').first()).toBeVisible();
            await expectNoPageHorizontalOverflow(page);
        }
    });
});
