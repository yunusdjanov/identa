import { expect, Page } from '@playwright/test';

export async function loginDentist(page: Page): Promise<void> {
    await page.context().addCookies([
        { name: 'odenta_locale', value: 'en', url: 'http://localhost:3100' },
    ]);
    await page.goto('/login');
    await page.getByLabel('Email').fill('dentist@odenta.test');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/dashboard(?:\/)?(?:\?.*)?$/, { timeout: 15_000 });
}

export async function loginAdmin(page: Page): Promise<void> {
    await page.context().addCookies([
        { name: 'odenta_locale', value: 'en', url: 'http://localhost:3100' },
    ]);
    await page.goto('/admin/login');
    await page.getByLabel('Email').fill('admin@odenta.test');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/admin(?:\/)?(?:\?.*)?$/, { timeout: 15_000 });
}
