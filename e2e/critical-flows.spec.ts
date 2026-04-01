import { expect, test } from '@playwright/test';
import { loginAdmin, loginDentist } from './helpers/auth';

function toLocalDateInputValue(date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function waitForSuccessfulMutation(
    page: import('@playwright/test').Page,
    endpoint: string,
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
): Promise<void> {
    const deadline = Date.now() + 20_000;
    const observedStatuses: number[] = [];

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

            if (response.status() >= 200 && response.status() < 300) {
                return;
            }
        }
        catch {
            break;
        }
    }

    const observed = observedStatuses.length > 0 ? observedStatuses.join(', ') : 'none';
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
        + `Cookies: ${cookieNames}. Auth check: ${authStatus} ${authBody}`
    );
}

test.describe('Critical Journeys', () => {
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

        await page.locator('tr', { hasText: patientName }).getByRole('button', { name: 'View Details' }).click();
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
        await dialog.getByLabel('Date').fill(toLocalDateInputValue());
        await dialog.getByLabel('Time').fill('21:30');
        await dialog.getByLabel('Reason for Visit').fill(reason);

        const createPromise = waitForSuccessfulMutation(page, '/api/v1/appointments', 'POST');
        await dialog.getByRole('button', { name: 'Schedule Appointment' }).click();
        await createPromise;
        await expect(dialog).toBeHidden({ timeout: 15_000 });
        await expect(page.getByText(reason)).toBeVisible({ timeout: 15_000 });
    });

    test('invoice + payment lifecycle', async ({ page }) => {
        await loginDentist(page);
        await page.goto('/payments');
        await expect(page.getByText('Loading invoices...')).toHaveCount(0, { timeout: 15_000 });

        const invoiceRow = page.locator('tbody tr').filter({
            hasText: /unpaid|partially paid/i,
        }).first();
        await expect(invoiceRow).toBeVisible({ timeout: 15_000 });
        await invoiceRow.getByRole('button', { name: 'View invoice' }).click();

        const invoiceDialog = page.getByRole('dialog');
        await expect(invoiceDialog).toBeVisible();
        await invoiceDialog.getByRole('button', { name: 'Record Payment' }).click();

        const paymentDialog = page.getByRole('dialog').filter({
            has: page.getByRole('heading', { name: 'Record Payment' }),
        });
        await expect(paymentDialog).toBeVisible();
        await paymentDialog.getByRole('button', { name: 'Full Amount' }).click();

        const paymentPromise = waitForSuccessfulMutation(page, '/api/v1/payments', 'POST');
        await paymentDialog.getByRole('button', { name: 'Record Payment' }).click();
        await paymentPromise;
        await expect(paymentDialog).toBeHidden({ timeout: 15_000 });
    });

    test('admin management lifecycle', async ({ page }) => {
        const dentistName = `E2E Dentist ${Date.now()}`;
        const dentistEmail = `e2e-${Date.now()}@odenta.test`;

        await loginAdmin(page);
        await page.getByRole('button', { name: 'Create' }).click();

        await page.getByLabel(/Dentist Name/i).fill(dentistName);
        await page.getByLabel(/^Email/i).fill(dentistEmail);
        await page.getByLabel('Practice Name').fill('E2E Practice');
        await page.getByLabel('Initial Password').fill('password123');
        await page.getByRole('button', { name: 'Create Account' }).click();

        await page.getByPlaceholder('Search dentists...').fill(dentistEmail);
        const row = page.locator('tr', { hasText: dentistEmail });
        await expect(row).toBeVisible();

        await row.locator('button').last().click();
        await page.getByRole('menuitem', { name: 'Block Account' }).click();
        await expect(row.getByText('Blocked')).toBeVisible();

        await row.locator('button').last().click();
        await page.getByRole('menuitem', { name: 'Activate Account' }).click();
        await expect(row.getByText('Active')).toBeVisible();
    });
});
