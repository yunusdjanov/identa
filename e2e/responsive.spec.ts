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

function usesCompactDataLayout(page: Page): boolean {
    return (page.viewportSize()?.width ?? 1280) < 1024;
}

async function getFirstPatientId(page: Page): Promise<string> {
    if (usesCompactDataLayout(page)) {
        const card = page.locator('[data-testid^="patient-mobile-card-"]').first();
        await expect(card).toBeVisible();
        return (await card.getAttribute('data-testid'))?.replace('patient-mobile-card-', '') ?? '';
    }

    const row = page.locator('tbody tr[id^="patient-row-"]').first();
    await expect(row).toBeVisible();
    return (await row.getAttribute('id'))?.replace('patient-row-', '') ?? '';
}

async function getFirstFinancePatientHref(page: Page): Promise<string> {
    const container = usesCompactDataLayout(page)
        ? page.getByTestId('payments-patient-mobile-list')
        : page.getByTestId('payments-patient-desktop-table');
    const link = container.locator('a[href^="/payments/patients/"]').first();
    await expect(link).toBeVisible();
    return await link.getAttribute('href') ?? '';
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

        for (const path of ['/dashboard', '/appointments', '/payments', '/billing', '/settings']) {
            await page.goto(path);
            await expect(page.locator('main').first()).toBeVisible();
            await expectNoPageHorizontalOverflow(page);
        }

        if (usesCompactDataLayout(page)) {
            await page.goto('/dashboard?view=week');
            const responsiveGrid = page.getByTestId('dashboard-week-grid-responsive');
            await expect(responsiveGrid).toBeVisible();
            await expect(page.getByTestId('appointments-week-grid-desktop')).toBeHidden();
            await expect(responsiveGrid.locator(':scope > button')).toHaveCount(7);
        }

        await page.goto('/patients');
        await expect(page.getByTestId('patients-filter-toolbar')).toBeVisible();
        await expectNoPageHorizontalOverflow(page);
        if (usesCompactDataLayout(page)) {
            await expect(page.getByTestId('patients-mobile-list')).toBeVisible();
            await expect(page.getByTestId('patients-desktop-table')).toBeHidden();
        }
        const patientId = await getFirstPatientId(page);
        expect(patientId).toBeTruthy();
        await page.goto(`/patients/${patientId}`);
        await expect(page.getByTestId('patient-detail-page-layout')).toBeVisible();
        await expect(page.getByTestId('patient-detail-header-facts')).toBeVisible();
        await expectInsideViewport(page, '[data-testid="patient-detail-header-facts"]');
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

        if (usesCompactDataLayout(page)) {
            await expect(page.getByTestId('payments-patient-mobile-list')).toBeVisible();
            await expect(page.getByTestId('payments-patient-desktop-table')).toBeHidden();
        }
        const patientHref = await getFirstFinancePatientHref(page);
        expect(patientHref).toBeTruthy();

        await page.goto(patientHref);
        await expect(page.getByTestId('patient-detail-header-facts')).toBeVisible();
        await expect(page.getByTestId('payment-summary-grid')).toBeVisible();
        if (usesCompactDataLayout(page) && await page.getByTestId('payment-ledger-mobile-list').count()) {
            await expect(page.getByTestId('payment-ledger-mobile-list')).toBeVisible();
            await expect(page.getByTestId('payment-ledger-desktop-table')).toBeHidden();
        }
        await expectNoPageHorizontalOverflow(page);

        const ledgerPatientId = patientHref.split('/').filter(Boolean).at(-1);
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
                await expect(page.getByTestId('dashboard-week-grid-responsive')).toBeHidden();
                await expect(desktopGrid.locator(':scope > div')).toHaveCount(7);
                await expectNoPageHorizontalOverflow(page);

                const measurements = await page.evaluate(() => {
                    const contentElement = document.querySelector<HTMLElement>('[data-testid="appointments-planner-content"]');
                    const toolbarElement = document.querySelector<HTMLElement>('[data-testid="appointments-view-toolbar"]');
                    const gridElement = document.querySelector<HTMLElement>('[data-testid="appointments-week-grid-desktop"]');

                    if (!contentElement || !toolbarElement || !gridElement) {
                        throw new Error('Dashboard planner elements were not rendered.');
                    }

                    const contentRect = contentElement.getBoundingClientRect();
                    const toolbarRect = toolbarElement.getBoundingClientRect();
                    const gridRect = gridElement.getBoundingClientRect();
                    const columnWidths = Array.from(gridElement.children).map((column) =>
                        column.getBoundingClientRect().width
                    );

                    return {
                        toolbarWidth: toolbarRect.width,
                        gridWidth: gridRect.width,
                        horizontalGutterDifference: Math.abs(
                            (gridRect.left - contentRect.left) - (contentRect.right - gridRect.right)
                        ),
                        minColumnWidth: Math.min(...columnWidths),
                        maxColumnWidth: Math.max(...columnWidths),
                    };
                });

                expect(measurements.gridWidth).toBeLessThanOrEqual(1401);
                expect(Math.abs(measurements.toolbarWidth - measurements.gridWidth)).toBeLessThanOrEqual(1);
                expect(measurements.horizontalGutterDifference).toBeLessThanOrEqual(1);
                expect(measurements.minColumnWidth).toBeGreaterThanOrEqual(160);
                expect(measurements.maxColumnWidth - measurements.minColumnWidth).toBeLessThanOrEqual(1);
            });
        }
    });

    test('mobile app navigation is evenly distributed and clears page content', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'chromium', 'Mobile header matrix runs once in Chromium.');

        await loginDentist(page);

        for (const viewport of [
            { width: 320, height: 720 },
            { width: 375, height: 812 },
            { width: 440, height: 956 },
        ]) {
            await test.step(`${viewport.width}x${viewport.height}`, async () => {
                await page.setViewportSize(viewport);
                await page.goto('/dashboard?view=week');

                const mobileNavigation = page.getByTestId('app-header-mobile-nav');
                const mobileItems = page.getByTestId('app-header-mobile-nav-item');
                await expect(mobileNavigation).toBeVisible();
                await expect(mobileItems).toHaveCount(4);
                await expect(page.getByTestId('dashboard-workspace')).toBeVisible();
                await expectNoPageHorizontalOverflow(page);

                const measurements = await page.evaluate(() => {
                    const header = document.querySelector<HTMLElement>('[data-app-header]');
                    const navigation = document.querySelector<HTMLElement>('[data-testid="app-header-mobile-nav"]');
                    const main = document.querySelector<HTMLElement>('#main-content');
                    const firstPageElement = main?.firstElementChild;
                    const items = Array.from(
                        document.querySelectorAll<HTMLElement>('[data-testid="app-header-mobile-nav-item"]')
                    );

                    if (!header || !navigation || !main || !firstPageElement || items.length !== 4) {
                        throw new Error('Mobile application shell was not rendered.');
                    }

                    const headerRect = header.getBoundingClientRect();
                    const navigationRect = navigation.getBoundingClientRect();
                    const contentRect = firstPageElement.getBoundingClientRect();
                    const itemRects = items.map((item) => item.getBoundingClientRect());

                    return {
                        navigationLeft: navigationRect.left,
                        navigationRight: navigationRect.right,
                        viewportWidth: document.documentElement.clientWidth,
                        contentGap: contentRect.top - headerRect.bottom,
                        minItemWidth: Math.min(...itemRects.map((rect) => rect.width)),
                        maxItemWidth: Math.max(...itemRects.map((rect) => rect.width)),
                        minItemHeight: Math.min(...itemRects.map((rect) => rect.height)),
                        maxItemHeight: Math.max(...itemRects.map((rect) => rect.height)),
                    };
                });

                expect(measurements.navigationLeft).toBeGreaterThanOrEqual(-1);
                expect(measurements.navigationRight).toBeLessThanOrEqual(measurements.viewportWidth + 1);
                expect(measurements.maxItemWidth - measurements.minItemWidth).toBeLessThanOrEqual(1);
                expect(measurements.minItemHeight).toBeGreaterThanOrEqual(47);
                expect(measurements.maxItemHeight).toBeLessThanOrEqual(49);
                expect(measurements.contentGap).toBeGreaterThanOrEqual(12);
                expect(measurements.contentGap).toBeLessThanOrEqual(24);
            });
        }
    });

    test('dashboard day cards keep mobile-app geometry with web interactions', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'chromium', 'Mobile day-card matrix runs once in Chromium.');

        await loginDentist(page);

        for (const viewport of [
            { width: 320, height: 720 },
            { width: 375, height: 812 },
            { width: 440, height: 956 },
        ]) {
            await test.step(`${viewport.width}x${viewport.height}`, async () => {
                await page.setViewportSize(viewport);
                await page.goto('/dashboard?view=week');

                const grid = page.getByTestId('dashboard-week-grid-responsive');
                const cards = grid.locator(':scope > button');
                await expect(grid).toBeVisible();
                await expect(cards).toHaveCount(7);
                await expectNoPageHorizontalOverflow(page);

                const measurements = await grid.evaluate((element) => {
                    const gridRect = element.getBoundingClientRect();
                    const layoutRect = document.body.getBoundingClientRect();
                    const styles = window.getComputedStyle(element);
                    const cardRects = Array.from(element.children).map((card) => card.getBoundingClientRect());
                    const firstCardStyles = window.getComputedStyle(element.children[0]);

                    return {
                        gridLeftInset: gridRect.left - layoutRect.left,
                        gridRightInset: layoutRect.right - gridRect.right,
                        columnGap: Number.parseFloat(styles.columnGap),
                        minCardWidth: Math.min(...cardRects.map((rect) => rect.width)),
                        maxCardWidth: Math.max(...cardRects.map((rect) => rect.width)),
                        minCardHeight: firstCardStyles.minHeight,
                        cardRadius: firstCardStyles.borderRadius,
                        cardBackground: firstCardStyles.backgroundColor,
                    };
                });

                expect(measurements.gridLeftInset).toBeGreaterThanOrEqual(15);
                expect(measurements.gridLeftInset).toBeLessThanOrEqual(19);
                expect(measurements.gridRightInset).toBeGreaterThanOrEqual(15);
                expect(measurements.gridRightInset).toBeLessThanOrEqual(19);
                expect(Math.abs(measurements.gridLeftInset - measurements.gridRightInset)).toBeLessThanOrEqual(1);
                expect(measurements.columnGap).toBe(12);
                expect(measurements.maxCardWidth - measurements.minCardWidth).toBeLessThanOrEqual(1);
                expect(measurements.minCardHeight).toBe('260px');
                expect(measurements.cardRadius).toBe('14px');
                expect(measurements.cardBackground).toBe('rgb(242, 242, 247)');
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

        if (usesCompactDataLayout(page)) {
            await page.goto('/admin');
            await expect(page.getByTestId('admin-dentists-mobile-list')).toBeVisible();
            await expect(page.getByTestId('admin-dentists-desktop-table')).toBeHidden();
        }
    });
});
