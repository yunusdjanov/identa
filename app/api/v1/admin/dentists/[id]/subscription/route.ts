import { NextResponse } from 'next/server';
import { applySubscriptionAction, findDentist } from '@/lib/mock/admin-store';
import { requireAdmin } from '../../../../_auth';

// Local mock: admin subscription management (set plan, mark read-only/active, cancel...).
// Mirrors the validation rules of `ManageDentistSubscriptionRequest` so the
// mock produces the same 422 responses a developer would see in production —
// previously the mock silently no-op'd invalid payloads, which hid bugs.

const PAID_ACTIONS = new Set([
    'apply_monthly',
    'apply_yearly',
    'activate_monthly',
    'activate_yearly',
    'extend_monthly',
    'extend_yearly',
    'set_basic_monthly',
    'set_basic_yearly',
    'set_pro_monthly',
    'set_pro_yearly',
]);

const STATE_ACTIONS = new Set([
    'set_trial',
    'mark_read_only',
    'mark_active',
    'cancel_at_period_end',
    'cancel_now',
]);

const ALLOWED_PAYMENT_METHODS = new Set(['cash', 'p2p', 'bank_transfer']);

function validationError(errors: Record<string, string[]>) {
    return NextResponse.json(
        { message: 'Validation failed.', errors },
        { status: 422 }
    );
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if (auth) return auth;

    const { id } = await params;
    const dentist = findDentist(id);
    if (!dentist) {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }
    // Mirror backend: a soft-deleted dentist's subscription cannot be
    // mutated. `findDentist(allowDeleted: false)` style — 404 keeps the
    // surface terse and matches DentistAccountController behavior.
    if (dentist.status === 'deleted') {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const action = typeof body?.action === 'string' ? body.action : '';

    // `action` is required and must be one of the known set.
    if (!action || (!PAID_ACTIONS.has(action) && !STATE_ACTIONS.has(action))) {
        return validationError({ action: ['Invalid or missing action.'] });
    }

    const isPaid = PAID_ACTIONS.has(action);
    const paymentMethod = typeof body?.payment_method === 'string' ? body.payment_method : null;
    const paymentAmount = typeof body?.payment_amount === 'number' ? body.payment_amount : null;

    if (isPaid) {
        if (paymentMethod === null) {
            return validationError({ payment_method: ['Payment method is required for paid actions.'] });
        }
        if (!ALLOWED_PAYMENT_METHODS.has(paymentMethod)) {
            return validationError({ payment_method: ['Payment method must be cash, p2p, or bank_transfer.'] });
        }
        if (paymentAmount === null || !Number.isFinite(paymentAmount) || paymentAmount <= 0) {
            // amount=0 with method='cash' would otherwise activate a paid
            // plan for free while still leaving a "I received 0 cash" paper
            // trail. Match the backend's `gt:0` rule explicitly.
            return validationError({ payment_amount: ['Payment amount must be greater than zero.'] });
        }
        if (paymentAmount > 1_000_000_000) {
            return validationError({ payment_amount: ['Payment amount exceeds the allowed maximum.'] });
        }
    }

    const noteRaw = body?.note;
    let note: string | undefined;
    if (typeof noteRaw === 'string') {
        const trimmed = noteRaw.replace(/<[^>]*>/g, '').trim();
        if (trimmed.length > 500) {
            return validationError({ note: ['Note must be at most 500 characters.'] });
        }
        note = trimmed === '' ? undefined : trimmed;
    }

    applySubscriptionAction(
        dentist,
        action,
        paymentMethod ?? undefined,
        paymentAmount ?? undefined,
        note
    );

    return NextResponse.json({ data: dentist });
}
