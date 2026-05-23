import { NextResponse } from 'next/server';
import { requireAuth, list } from '../_auth';
import { INVOICES } from '../_mock-data';

export async function GET() {
    const auth = await requireAuth();
    if (auth) return auth;
    const summary = { total: INVOICES.reduce((s, i) => s + i.total_amount, 0), paid: INVOICES.reduce((s, i) => s + i.paid_amount, 0), outstanding: INVOICES.reduce((s, i) => s + i.balance, 0) };
    return NextResponse.json({ data: INVOICES, meta: { pagination: { page: 1, per_page: 50, total: INVOICES.length, total_pages: 1 }, summary } });
}

export async function POST(request: Request) {
    const auth = await requireAuth();
    if (auth) return auth;
    const body = await request.json();
    const inv = { id: `inv-${Date.now()}`, invoice_number: `INV-${Date.now()}`, paid_amount: 0, balance: body.total_amount ?? 0, status: 'unpaid', notes: null, items: [], ...body };
    return NextResponse.json({ data: inv }, { status: 201 });
}
