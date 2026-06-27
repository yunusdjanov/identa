import { NextResponse } from 'next/server';
import { forbidden, hasMockPermission, requireAuth } from '../../../_auth';
import { PAYMENT_EXPENSES } from '../../../_mock-data';

interface ExpenseParams {
    params: Promise<{ id: string }>;
}

function expenseNotFound() {
    return NextResponse.json(
        { error: { code: 'not_found', message: 'Expense not found.' } },
        { status: 404 }
    );
}

export async function PUT(request: Request, { params }: ExpenseParams) {
    const auth = await requireAuth();
    if (auth) return auth;
    if (!(await hasMockPermission('payments.manage'))) {
        return forbidden();
    }

    const { id } = await params;
    const index = PAYMENT_EXPENSES.findIndex((expense) => expense.id === id);
    if (index === -1) {
        return expenseNotFound();
    }

    const body = await request.json();
    const current = PAYMENT_EXPENSES[index];
    const updated = {
        ...current,
        title: body.title,
        amount: Number(body.amount ?? 0),
        quantity: Number(body.quantity ?? 1),
        currency: body.currency === 'USD' ? 'USD' : 'UZS',
        expense_date: body.expense_date,
        updated_at: new Date().toISOString(),
    };

    PAYMENT_EXPENSES[index] = updated;

    return NextResponse.json({ data: updated });
}

export async function DELETE(_request: Request, { params }: ExpenseParams) {
    const auth = await requireAuth();
    if (auth) return auth;
    if (!(await hasMockPermission('payments.manage'))) {
        return forbidden();
    }

    const { id } = await params;
    const index = PAYMENT_EXPENSES.findIndex((expense) => expense.id === id);
    if (index === -1) {
        return expenseNotFound();
    }

    PAYMENT_EXPENSES.splice(index, 1);

    return new NextResponse(null, { status: 204 });
}
