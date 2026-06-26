import { NextResponse } from 'next/server';
import { forbidden, hasMockPermission, requireAuth } from '../../_auth';
import { PAYMENT_EXPENSES } from '../../_mock-data';

function expenseSummary(expenses: typeof PAYMENT_EXPENSES) {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const latest = expenses.reduce<string | null>((value, expense) => {
        if (!expense.expense_date) {
            return value;
        }

        return value === null || expense.expense_date > value ? expense.expense_date : value;
    }, null);

    return {
        total_count: expenses.length,
        total_amount: expenses.reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0),
        current_month_amount: expenses
            .filter((expense) => expense.expense_date.startsWith(currentMonth))
            .reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0),
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
    const filtered = search
        ? PAYMENT_EXPENSES.filter((expense) => expense.title.toLowerCase().includes(search))
        : PAYMENT_EXPENSES;

    return NextResponse.json({
        data: filtered,
        meta: {
            pagination: { page: 1, per_page: 50, total: filtered.length, total_pages: 1 },
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
    const now = new Date().toISOString();
    const expense = {
        id: `exp-${Date.now()}`,
        title: body.title,
        amount: Number(body.amount ?? 0),
        expense_date: body.expense_date,
        created_at: now,
        updated_at: now,
    };

    PAYMENT_EXPENSES.unshift(expense);

    return NextResponse.json({ data: expense }, { status: 201 });
}
