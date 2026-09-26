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
        for (const path of [
            '/',
            '/login',
            '/register',
            '/forgot-password',
            '/reset-password?token=invalid&email=test%40example.com',
            '/verify-email?status=invalid',
            '/admin/login',
        ]) {
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

        await page.goto('/patients');
        await expect(page.getByTestId('patients-filter-toolbar')).toBeVisible();
        await expectNoPageHorizontalOverflow(page);
        const firstPatientRow = page.locator('tbody tr[id^="patient-row-"]').first();
        await expect(firstPatientRow).toBeVisible();
        const patientRowId = await firstPatientRow.getAttribute('id');
        const patientId = patientRowId?.replace('patient-row-', '') ?? '';
        expect(patientId).toBeTruthy();
        await page.goto(`/patients/${patientId}`);
        await expect(page.getByTestId('patient-detail-page-layout')).toBeVisible();
        await expect(page.getByTestId('patient-detail-header-facts')).toBeVisible();
        await expectNoPageHorizontalOverflow(page);

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

        const ledgerPatientId = patientHref!.split('/').filter(Boolean).at(-1);
        expect(ledgerPatientId).toBeTruthy();
        await page.goto(`/patients/${ledgerPatientId}/history`);
        await expect(page.getByTestId('patient-history-header')).toBeVisible();
        await expectNoPageHorizontalOverflow(page);
    });

    test('dashboard planner stays balanced at common laptop viewports', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'chromium', 'Laptop viewport matrix runs once in desktop Chromium.');

        await loginDentist(page);

        for (const viewport of [
            { width: 1366, height: 768 },
            { width: 1440, height: 900 },
            { width: 1536, height: 864 },
        ]) {
            await test.step(`${viewport.width}x${viewport.height}`, async () => {
                await page.setViewportSize(viewport);
                await page.goto('/dashboard?view=week');

                await expect(page.getByTestId('dashboard-workspace')).toBeVisible();
                const toolbar = page.getByTestId('appointments-view-toolbar');
                const desktopGrid = page.getByTestId('appointments-week-grid-desktop');

                await expect(toolbar).toBeVisible();
                await expect(desktopGrid).toBeVisible();
                await expect(page.getByTestId('appointments-week-grid-stacked')).toBeHidden();
                await expect(desktopGrid.locator(':scope > div')).toHaveCount(7);
                await expectNoPageHorizontalOverflow(page);

                const measurements = await page.evaluate(() => {
                    const toolbarElement = document.querySelector<HTMLElement>('[data-testid="appointments-view-toolbar"]');
                    const gridElement = document.querySelector<HTMLElement>('[data-testid="appointments-week-grid-desktop"]');

                    if (!toolbarElement || !gridElement) {
                        throw new Error('Dashboard planner elements were not rendered.');
                    }

                    const toolbarRect = toolbarElement.getBoundingClientRect();
                    const gridRect = gridElement.getBoundingClientRect();
                    const columnWidths = Array.from(gridElement.children).map((column) =>
                        column.getBoundingClientRect().width
                    );
                    const viewportWidth = document.documentElement.clientWidth;

                    return {
                        toolbarWidth: toolbarRect.width,
                        gridWidth: gridRect.width,
                        centerOffset: Math.abs((gridRect.left + gridRect.right) / 2 - viewportWidth / 2),
                        minColumnWidth: Math.min(...columnWidths),
                        maxColumnWidth: Math.max(...columnWidths),
                    };
                });

                expect(measurements.gridWidth).toBeLessThanOrEqual(1401);
                expect(Math.abs(measurements.toolbarWidth - measurements.gridWidth)).toBeLessThanOrEqual(1);
                expect(measurements.centerOffset).toBeLessThanOrEqual(2);
                expect(measurements.minColumnWidth).toBeGreaterThanOrEqual(160);
                expect(measurements.maxColumnWidth - measurements.minColumnWidth).toBeLessThanOrEqual(1);
            });
        }
    });

    test('admin dashboards stay within the viewport', async ({ page }) => {
        await loginAdmin(page);

        for (const path of [
            '/admin',
            '/admin/analytics',
            '/admin/payments',
            '/admin/plans',
            '/admin/settings',
            '/admin/dentists/1/billing',
            '/admin/dentists/1/staff',
        ]) {
            await page.goto(path);
            await expect(page.locator('main').first()).toBeVisible();
            await expectNoPageHorizontalOverflow(page);
        }
    });
});
