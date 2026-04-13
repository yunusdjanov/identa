import { expect, Page } from '@playwright/test';

async function submitLoginAndAssert(page: Page, expectedPathPattern: RegExp): Promise<void> {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    const onConsole = (message: import('@playwright/test').ConsoleMessage): void => {
        if (message.type() === 'error') {
            consoleErrors.push(message.text());
        }
    };
    const onPageError = (error: Error): void => {
        pageErrors.push(error.message);
    };

    page.on('console', onConsole);
    page.on('pageerror', onPageError);

    const formValidity = await page.evaluate(() => {
        const form = document.querySelector('form');
        if (!(form instanceof HTMLFormElement)) {
            return { valid: false, reason: 'missing-form' };
        }

        const valid = form.checkValidity();
        if (valid) {
            return { valid: true, reason: null };
        }

        const invalidField = form.querySelector(':invalid');
        if (invalidField instanceof HTMLElement) {
            if (
                invalidField instanceof HTMLInputElement
                || invalidField instanceof HTMLSelectElement
                || invalidField instanceof HTMLTextAreaElement
            ) {
                return {
                    valid: false,
                    reason: `${invalidField.name || invalidField.id || invalidField.tagName}: ${invalidField.validationMessage}`,
                };
            }

            return {
                valid: false,
                reason: invalidField.tagName,
            };
        }

        return { valid: false, reason: 'unknown-invalid' };
    });

    if (!formValidity.valid) {
        throw new Error(`Login form is invalid before submit: ${formValidity.reason ?? 'unknown'}`);
    }

    const loginResponsePromise = page.waitForResponse(
        (response) =>
            response.url().includes('/api/v1/auth/login')
            && response.request().method() === 'POST',
        { timeout: 15_000 }
    );

    await page.getByRole('button', { name: 'Sign In' }).click();

    let loginResponse: import('@playwright/test').Response;
    try {
        loginResponse = await loginResponsePromise;
    }
    catch (error) {
        const diagnostics = await page.evaluate(() => {
            const button = Array.from(document.querySelectorAll('button')).find(
                (candidate) => candidate.textContent?.trim() === 'Sign In'
            ) as HTMLButtonElement | undefined;
            const alertText =
                document.querySelector('[role="alert"]')?.textContent?.trim()
                ?? null;

            return {
                buttonDisabled: button?.disabled ?? null,
                buttonType: button?.type ?? null,
                alertText,
                currentUrl: window.location.href,
            };
        });

        const consoleDump = consoleErrors.length > 0 ? consoleErrors.join(' | ') : 'none';
        const pageErrorDump = pageErrors.length > 0 ? pageErrors.join(' | ') : 'none';
        throw new Error(
            `Login response was not emitted. url=${diagnostics.currentUrl}; `
            + `buttonDisabled=${diagnostics.buttonDisabled}; buttonType=${diagnostics.buttonType}; `
            + `alert=${diagnostics.alertText ?? 'none'}; pageErrors=${pageErrorDump}; consoleErrors=${consoleDump}; `
            + `original=${error instanceof Error ? error.message : String(error)}`
        );
    }

    page.off('console', onConsole);
    page.off('pageerror', onPageError);

    if (!loginResponse.ok()) {
        const body = await loginResponse.text();
        throw new Error(
            `Login request failed with status ${loginResponse.status()}: ${body}`
        );
    }

    await expect(page).toHaveURL(expectedPathPattern, { timeout: 15_000 });
}

export async function loginDentist(page: Page): Promise<void> {
    await page.context().addCookies([
        { name: 'identa_locale', value: 'en', url: 'http://localhost:3100' },
    ]);
    await page.goto('/login');
    await page.getByLabel('Email').fill('dentist@identa.test');
    await page.getByLabel('Password').fill('password123');
    await submitLoginAndAssert(page, /\/dashboard(?:\/)?(?:\?.*)?$/);
}

export async function loginAdmin(page: Page): Promise<void> {
    await page.context().addCookies([
        { name: 'identa_locale', value: 'en', url: 'http://localhost:3100' },
    ]);
    await page.goto('/admin/login');
    await page.getByLabel('Email').fill('admin@identa.test');
    await page.getByLabel('Password').fill('password123');
    await submitLoginAndAssert(page, /\/admin(?:\/)?(?:\?.*)?$/);
}
