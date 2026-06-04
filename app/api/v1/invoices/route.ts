import { NextResponse } from 'next/server';
import { forbidden, hasMockPermission, requireAuth } from '../_auth';
import { INVOICES } from '../_mock-data';

// Invoice routes mirror backend gating: `payments.view` for reads,
// `payments.manage` for writes. Without these checks an assistant
// without payments perms could see every invoice in the practice plus
// aggregated outstanding totals.
export async function GET() {
    const auth = await requireAuth();
    if (auth) return auth;
    if (!(await hasMockPermission('payments.view'))) {
        return forbidden();
    }
    const summary = { total: INVOICES.reduce((s, i) => s + i.total_amount, 0), paid: INVOICES.reduce((s, i) => s + i.paid_amount, 0), outstanding: INVOICES.reduce((s, i) => s + i.balance, 0) };
    return NextResponse.json({ data: INVOICES, meta: { pagination: { page: 1, per_page: 50, total: INVOICES.length, total_pages: 1 }, summary } });
}

export async function POST(request: Request) {
    const auth = await requireAuth();
    if (auth) return auth;
    if (!(await hasMockPermission('payments.manage'))) {
        return forbidden();
    }
    const body = await request.json();
    const inv = { id: `inv-${Date.now()}`, invoice_number: `INV-${Date.now()}`, paid_amount: 0, balance: body.total_amount ?? 0, status: 'unpaid', notes: null, items: [], ...body };
    return NextResponse.json({ data: inv }, { status: 201 });
}
