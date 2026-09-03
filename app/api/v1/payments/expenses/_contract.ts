export interface MockExpensePayload {
    title: string;
    amount: number;
    quantity: number;
    currency: 'UZS' | 'USD';
    expense_date: string;
}

export type MockExpensePayloadResult =
    | { data: MockExpensePayload; errors?: never }
    | { data?: never; errors: Record<string, string[]> };

function numericValue(value: unknown): number {
    if (
        (typeof value !== 'number' && typeof value !== 'string')
        || (typeof value === 'string' && value.trim() === '')
    ) {
        return Number.NaN;
    }

    return Number(value);
}

export function isDateKey(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(parsed.getTime())
        && parsed.toISOString().slice(0, 10) === value;
}

export function parseExpensePayload(body: unknown): MockExpensePayloadResult {
    const payload = body && typeof body === 'object' && !Array.isArray(body)
        ? body as Record<string, unknown>
        : {};
    const title = typeof payload.title === 'string' ? payload.title.trim() : '';
    const amount = numericValue(payload.amount);
    const quantity = payload.quantity == null ? 1 : numericValue(payload.quantity);
    const currency = payload.currency == null
        ? 'UZS'
        : typeof payload.currency === 'string'
            ? payload.currency.trim().toUpperCase()
            : payload.currency;
    const supportedCurrency = currency === 'UZS' || currency === 'USD'
        ? currency
        : null;
    const expenseDate = typeof payload.expense_date === 'string' ? payload.expense_date : '';
    const errors: Record<string, string[]> = {};

    if (title.length < 2 || title.length > 160) {
        errors.title = ['Title must contain 2 to 160 characters.'];
    }
    if (!Number.isFinite(amount) || amount < 0.01 || amount > 99_999_999.99) {
        errors.amount = ['Invalid amount.'];
    }
    if (!Number.isFinite(quantity) || quantity < 0.01 || quantity > 999_999.99) {
        errors.quantity = ['Invalid quantity.'];
    }
    if (supportedCurrency === null) {
        errors.currency = ['Unsupported currency.'];
    }
    if (!isDateKey(expenseDate)) {
        errors.expense_date = ['Invalid expense date.'];
    }

    if (Object.keys(errors).length > 0 || supportedCurrency === null) {
        return { errors };
    }

    return {
        data: {
            title,
            amount,
            quantity,
            currency: supportedCurrency,
            expense_date: expenseDate,
        },
    };
}
