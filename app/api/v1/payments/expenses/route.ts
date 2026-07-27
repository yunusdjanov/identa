import { NextResponse } from 'next/server';
import { forbidden, hasMockPermission, requireAuth } from '../../_auth';
import { PAYMENT_EXPENSES } from '../../_mock-data';

const IDEMPOTENT_EXPENSES = new Map<
    string,
    { payload: string; expenseId: string }
>();

function validationFailure(errors: Record<string, string[]>) {
    return NextResponse.json(
        { message: 'Validation failed.', errors },
        { status: 422 }
    );
}

function expenseSummary(expenses: typeof PAYMENT_EXPENSES) {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const latest = expenses.reduce<string | null>((value, expense) => {
        if (!expense.expense_date) {
            return value;
        }

        return value === null || expense.expense_date > value ? expense.expense_date : value;
    }, null);

    const totalsByCurrency = { UZS: 0, USD: 0 };
    const currentMonthByCurrency = { UZS: 0, USD: 0 };
    for (const expense of expenses) {
        const currency = expense.currency === 'USD' ? 'USD' : 'UZS';
        totalsByCurrency[currency] += Number(expense.amount ?? 0);
        if (expense.expense_date.startsWith(currentMonth)) {
            currentMonthByCurrency[currency] += Number(expense.amount ?? 0);
        }
    }

    return {
        total_count: expenses.length,
        // Backward-compatible scalar totals are UZS-only. Consumers that show
        // both currencies use totals_by_currency and never add USD to UZS.
        total_amount: totalsByCurrency.UZS,
        current_month_amount: expenses
            .filter(
                (expense) =>
                    expense.currency !== 'USD'
                    && expense.expense_date.startsWith(currentMonth)
            )
            .reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0),
        totals_by_currency: totalsByCurrency,
        current_month_by_currency: currentMonthByCurrency,
        latest_expense_date: latest,
    };
}

export async function GET(request: Request) {
    const auth = await requireAuth();
    if (auth) return auth;
    if (!(await hasMockPermission('payments.view'))) {
        return forbidden();
    }

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('filter[search]') ?? '').trim().toLowerCase();
    const dateFrom = searchParams.get('filter[date_from]');
    const dateTo = searchParams.get('filter[date_to]');
    const page = Number(searchParams.get('page') ?? 1);
    const perPage = Number(searchParams.get('per_page') ?? 50);
    const errors: Record<string, string[]> = {};
    if (!Number.isInteger(page) || page < 1) errors.page = ['Invalid page.'];
    if (!Number.isInteger(perPage) || perPage < 1 || perPage > 100) {
        errors.per_page = ['Invalid page size.'];
    }
    if (search.length > 160) errors['filter.search'] = ['Search is too long.'];
    if (dateFrom && !isDateKey(dateFrom)) {
        errors['filter.date_from'] = ['Invalid start date.'];
    }
    if (dateTo && !isDateKey(dateTo)) {
        errors['filter.date_to'] = ['Invalid end date.'];
    }
    if (dateFrom && dateTo && dateTo < dateFrom) {
        errors['filter.date_to'] = ['End date must not precede start date.'];
    }
    if (Object.keys(errors).length > 0) return validationFailure(errors);

    const filtered = PAYMENT_EXPENSES.filter(
        (expense) =>
            (!search || expense.title.toLowerCase().includes(search))
            && (!dateFrom || expense.expense_date >= dateFrom)
            && (!dateTo || expense.expense_date <= dateTo)
    );
    const start = (page - 1) * perPage;
    const paginated = filtered.slice(start, start + perPage);

    return NextResponse.json({
        data: paginated,
        meta: {
            pagination: {
                page,
                per_page: perPage,
                total: filtered.length,
                total_pages: Math.max(1, Math.ceil(filtered.length / perPage)),
            },
            summary: expenseSummary(filtered),
        },
    });
}

export async function POST(request: Request) {
    const auth = await requireAuth();
    if (auth) return auth;
    if (!(await hasMockPermission('payments.manage'))) {
        return forbidden();
    }

    const body = await request.json();
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const amount = Number(body.amount);
    const quantity = body.quantity === undefined ? 1 : Number(body.quantity);
    const currency = body.currency === undefined ? 'UZS' : body.currency;
    const expenseDate =
        typeof body.expense_date === 'string' ? body.expense_date : '';
    const errors: Record<string, string[]> = {};
    if (title.length < 2 || title.length > 160) {
        errors.title = ['Title must contain 2 to 160 characters.'];
    }
    if (!Number.isFinite(amount) || amount < 0.01 || amount > 99_999_999.99) {
        errors.amount = ['Invalid amount.'];
    }
    if (
        !Number.isFinite(quantity)
        || quantity < 0.01
        || quantity > 999_999.99
    ) {
        errors.quantity = ['Invalid quantity.'];
    }
    if (currency !== 'UZS' && currency !== 'USD') {
        errors.currency = ['Unsupported currency.'];
    }
    if (!isDateKey(expenseDate)) {
        errors.expense_date = ['Invalid expense date.'];
    }

    const idempotencyKey = request.headers.get('Idempotency-Key')?.trim() ?? '';
    if (
        idempotencyKey.length > 100
        || (idempotencyKey !== ''
            && !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey))
    ) {
        errors.idempotency_key = ['Invalid idempotency key.'];
    }
    if (Object.keys(errors).length > 0) return validationFailure(errors);

    const canonicalPayload = JSON.stringify({
        title,
        amount: amount.toFixed(2),
        quantity: quantity.toFixed(2),
        currency,
        expense_date: expenseDate,
    });
    const prior = idempotencyKey
        ? IDEMPOTENT_EXPENSES.get(idempotencyKey)
        : undefined;
    if (prior) {
        if (prior.payload !== canonicalPayload) {
            return validationFailure({
                idempotency_key: [
                    'This key was already used for another expense.',
                ],
            });
        }
        const existing = PAYMENT_EXPENSES.find(
            (expense) => expense.id === prior.expenseId
        );
        if (existing) {
            return NextResponse.json({ data: existing }, { status: 201 });
        }
        return validationFailure({
            idempotency_key: [
                'This idempotency key belongs to a deleted expense.',
            ],
        });
    }

    const now = new Date().toISOString();
    const expense = {
        id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title,
        amount,
        quantity,
        currency: currency === 'USD' ? 'USD' : 'UZS',
        expense_date: expenseDate,
        created_at: now,
        updated_at: now,
    };

    PAYMENT_EXPENSES.unshift(expense);
    if (idempotencyKey) {
        IDEMPOTENT_EXPENSES.set(idempotencyKey, {
            payload: canonicalPayload,
            expenseId: expense.id,
        });
    }

    return NextResponse.json({ data: expense }, { status: 201 });
}

function isDateKey(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(parsed.getTime())
        && parsed.toISOString().slice(0, 10) === value;
}
