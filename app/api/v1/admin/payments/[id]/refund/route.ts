import { NextResponse } from 'next/server';
import { findDentist, findPayment, pushAuditEntry } from '@/lib/mock/admin-store';
import { requireAdmin } from '../../../../_auth';

// Local mock: admin-initiated refund.
// PayX does not expose a refund API — the merchant performs the money
// transfer outside the system. This endpoint only records the refund and
// cascades a read-only lock on the subscription this payment funded.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if (auth) return auth;

    const { id } = await params;
    const found = findPayment(id);
    if (!found) {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }
    // Idempotency: backend uses lockForUpdate to serialize concurrent admin
    // clicks. In a single-process Node.js mock there's no row lock to grab,
    // but we still re-check the status as a defensive parity — the second of
    // two near-simultaneous clicks should NOT double-write the audit pair.
    if (found.payment.status === 'refunded') {
        return NextResponse.json(
            {
                message: 'Validation failed.',
                errors: { status: ['Payment is already refunded.'] },
            },
            { status: 422 }
        );
    }
    if (found.payment.status !== 'paid') {
        return NextResponse.json(
            {
                message: 'Validation failed.',
                errors: { status: ['Only paid payments can be refunded.'] },
            },
            { status: 422 }
        );
    }

    const oldStatus = found.payment.status;
    found.payment.status = 'refunded';

    // Cascade: if the dentist's CURRENT subscription is the one this payment
    // funded, lock the account into read-only. For a past subscription the
    // payment row is updated but no access cascade happens (matches backend).
    let cascadeOutcome: string = 'no_subscription_link';
    const dentist = findDentist(found.dentistId);
    if (dentist && dentist.subscription) {
        // Mock store doesn't track per-payment subscription_id linkage, so we
        // treat the most recent paid payment as funding the current sub —
        // sufficient parity for the happy path.
        dentist.subscription.status = 'read_only';
        dentist.subscription.access_mode = 'read_only';
        dentist.subscription.payment_method = null;
        dentist.subscription.payment_amount = null;
        cascadeOutcome = 'cascaded_to_read_only';
    }

    pushAuditEntry({
        eventType: 'admin.payment.refunded',
        entityType: 'billing_payment',
        entityId: id,
        metadata: {
            old_status: oldStatus,
            new_status: 'refunded',
            amount: found.payment.amount,
            currency: found.payment.currency,
            user_id: found.dentistId,
            cascade_outcome: cascadeOutcome,
        },
    });
    // Mirror under the affected user so the billing-detail audit panel
    // (which filters by entity_type=user, entity_id=dentistId) picks it up.
    pushAuditEntry({
        eventType: 'admin.dentist.payment_refunded',
        entityType: 'user',
        entityId: found.dentistId,
        metadata: {
            payment_id: id,
            amount: found.payment.amount,
            currency: found.payment.currency,
            cascade_outcome: cascadeOutcome,
        },
    });

    return NextResponse.json({
        data: {
            ...found.payment,
            dentist: dentist
                ? {
                    id: dentist.id,
                    name: dentist.name,
                    email: dentist.email,
                    avatar_url: dentist.avatar_url,
                }
                : null,
        },
        meta: {
            cascade_outcome: cascadeOutcome,
        },
    });
}
