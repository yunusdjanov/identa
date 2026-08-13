import { expect, test } from '@playwright/test';
import { loginAdmin, loginDentist } from './helpers/auth';

async function waitForSuccessfulMutation(
    page: import('@playwright/test').Page,
    endpoint: string,
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
): Promise<void> {
    const deadline = Date.now() + 20_000;
    const observedStatuses: number[] = [];
    const observedBodies: string[] = [];

    while (Date.now() < deadline) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
            break;
        }

        try {
            const response = await page.waitForResponse(
                (candidate) =>
                    candidate.url().includes(endpoint) &&
                    candidate.request().method() === method,
                { timeout: remaining }
            );

            observedStatuses.push(response.status());
            if (response.status() < 200 || response.status() >= 300) {
                observedBodies.push(`${response.status()}: ${(await response.text()).slice(0, 500)}`);
            }

            if (response.status() >= 200 && response.status() < 300) {
                return;
            }
        }
        catch {
            break;
        }
    }

    const observed = observedStatuses.length > 0 ? observedStatuses.join(', ') : 'none';
    const bodyDump = observedBodies.length > 0 ? observedBodies.join(' | ') : 'none';
    const backendOrigin = `http://${new URL(page.url()).hostname}:8100`;
    const cookies = await page.context().cookies(backendOrigin);
    const cookieNames = cookies.map((cookie) => cookie.name).join(', ') || 'none';
    const authCheck = await page.request.get(`${backendOrigin}/api/v1/auth/me`, {
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
    });
    const authStatus = authCheck.status();
    const authBody = await authCheck.text();

    throw new Error(
        `No successful ${method} ${endpoint} response. Observed statuses: ${observed}. `
        + `Bodies: ${bodyDump}. `
        + `Cookies: ${cookieNames}. Auth check: ${authStatus} ${authBody}`
    );
}

test.describe('Critical Journeys', () => {
    test('dentist logout revokes the browser session before returning to login', async ({ page }) => {
        await loginDentist(page);

        await page.getByRole('button', { name: 'My Account' }).click();
        const logoutResponse = page.waitForResponse(
            (response) => response.url().includes('/api/v1/auth/logout')
                && response.request().method() === 'POST'
        );
        await page.getByRole('menuitem', { name: 'Logout' }).click();

        await expect((await logoutResponse).status()).toBe(204);
        await expect(page).toHaveURL(/\/login(?:\?.*)?$/, { timeout: 15_000 });
        await expect(page.getByRole('heading', { name: 'Sign in to Identa' })).toBeVisible();

        await page.goto('/dashboard');
        await expect(page).toHaveURL(/\/login\?from=%2Fdashboard$/, { timeout: 15_000 });
        await expect(page.getByRole('heading', { name: 'Sign in to Identa' })).toBeVisible();
    });

    test('dentist auth + patient lifecycle', async ({ page }) => {
        const patientName = `E2E Patient ${Date.now()}`;
        const patientPhone = `+1555${Date.now().toString().slice(-7)}`;

        await loginDentist(page);
        await page.goto('/patients');
        await expect(page.getByText('Loading patients...')).toHaveCount(0, { timeout: 15_000 });
        await page.getByRole('button', { name: 'Add Patient' }).click();

        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await dialog.getByLabel('Full Name').fill(patientName);
        await dialog.getByLabel('Phone Number *').fill(patientPhone);

        const createPromise = waitForSuccessfulMutation(page, '/api/v1/patients', 'POST');
        await dialog.getByRole('button', { name: 'Add Patient' }).click();
        await createPromise;
        await expect(dialog).toBeHidden({ timeout: 15_000 });

        const searchInput = page.getByPlaceholder('Search by name, phone, or patient ID...');
        await searchInput.fill(patientName);
        await expect(page.getByRole('cell', { name: patientName })).toBeVisible({ timeout: 15_000 });

        await page.getByRole('button', { name: `Open details for ${patientName}` }).click({ force: true });
        await expect(page).toHaveURL(/\/patients\/.+/, { timeout: 15_000 });
        await expect(page.getByText('Loading patient details...')).toHaveCount(0, { timeout: 15_000 });
        await expect(page.getByRole('heading', { name: patientName })).toBeVisible({ timeout: 15_000 });
    });

    test('appointment scheduling lifecycle', async ({ page }) => {
        const reason = `E2E Appointment ${Date.now()}`;

        await loginDentist(page);
        await page.goto('/appointments');
        await expect(page.getByText('Loading appointments...')).toHaveCount(0, { timeout: 15_000 });
        await page.getByRole('button', { name: 'New Appointment' }).click();

        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await dialog.getByRole('combobox').first().click();
        await page.getByRole('option').first().click();
        await expect(dialog.getByText(/^Selected:/)).toBeVisible({ timeout: 30_000 });

        const timeButton = dialog.getByLabel('Time');
        await expect(timeButton).toBeEnabled({ timeout: 30_000 });
        await timeButton.click();
        const timeMenu = page.getByRole('menu');
        await expect(timeMenu).toBeVisible();
        await timeMenu.getByRole('menuitem').filter({ hasText: /^\d{2}:\d{2}$/ }).first().click();
        await dialog.getByLabel('Reason for Visit').fill(reason);

        const scheduleButton = dialog.getByRole('button', { name: 'Schedule Appointment' });
        await expect(scheduleButton).toBeEnabled();
        const createPromise = waitForSuccessfulMutation(page, '/api/v1/appointments', 'POST');
        await scheduleButton.click();
        await createPromise;
        await expect(dialog).toBeHidden({ timeout: 15_000 });
    });

    test('payments patient ledger lifecycle', async ({ page }) => {
        await loginDentist(page);
        await page.goto('/payments');

        const patientsTab = page.getByRole('button', { name: /^Patients$/ });
        await expect(patientsTab).toBeVisible({ timeout: 15_000 });
        await patientsTab.click();

        const patientLedgerLink = page.locator('tbody a[href^="/payments/patients/"]').first();
        await expect(patientLedgerLink).toBeVisible({ timeout: 15_000 });
        await patientLedgerLink.click();

        await expect(page).toHaveURL(/\/payments\/patients\/[^/]+$/, { timeout: 15_000 });
        await expect(page.getByTestId('patient-detail-header-facts')).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId('payment-summary-grid')).toBeVisible({ timeout: 30_000 });
        await expect(page.getByRole('columnheader', { name: /Work title|Название работы|Ish nomi/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /Add Entry|Добавить запись|Yozuv qo'shish/i })).toHaveCount(0);
    });

    test('admin management lifecycle', async ({ page }) => {
        const dentistName = `E2E Dentist ${Date.now()}`;
        const dentistEmail = `e2e-${Date.now()}@identa.test`;

        await loginAdmin(page);
        await page.getByRole('button', { name: 'Create' }).click();

        await page.getByLabel(/Dentist Name/i).fill(dentistName);
        await page.getByLabel(/^Email/i).fill(dentistEmail);
        await page.getByLabel('Practice Name').fill('E2E Practice');
        await page.getByLabel('Initial Password').fill('E2E-StrongPass-123!');
        const createPromise = waitForSuccessfulMutation(page, '/api/v1/admin/dentists', 'POST');
        await page.getByRole('dialog').getByRole('button', { name: 'Create Account' }).click();
        await createPromise;

        await page.getByPlaceholder('Search dentists...').fill(dentistEmail);
        const row = page.locator('tr', { hasText: dentistEmail });
        await expect(row).toBeVisible({ timeout: 15_000 });

        await row.locator('button').last().click();
        await page.getByRole('menuitem', { name: 'Block Account' }).click();
        await expect(row.getByText('Blocked')).toBeVisible();

        await row.locator('button').last().click();
        await page.getByRole('menuitem', { name: 'Activate Account' }).click();
        await expect(row.getByText('Active')).toBeVisible();
    });
});
