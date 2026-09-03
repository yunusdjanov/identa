import { NextResponse } from 'next/server';
import { forbidden, hasMockPermission, requireAuth } from '../../../_auth';
import { PAYMENT_EXPENSES } from '../../../_mock-data';
import { parseExpensePayload } from '../_contract';

interface ExpenseParams {
    params: Promise<{ id: string }>;
}

function expenseNotFound() {
    return NextResponse.json(
        { error: { code: 'not_found', message: 'Expense not found.' } },
        { status: 404 }
    );
}

function validationFailure(errors: Record<string, string[]>) {
    return NextResponse.json(
        { message: 'Validation failed.', errors },
        { status: 422 }
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

    const result = parseExpensePayload(await request.json());
    if (result.errors) {
        return validationFailure(result.errors);
    }

    const current = PAYMENT_EXPENSES[index];
    const updated = {
        ...current,
        ...result.data,
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
