import { NextResponse } from 'next/server';
import { requireDentist } from '../../_auth';
import { getAdminStore, isoDaysFromNow, pushAuditEntry } from '@/lib/mock/admin-store';
import type { ApiBillingPayment } from '@/lib/api/types';

// Local mock: PayX checkout creation.
//
// Production flow (BillingService::createCheckout + PayxService::createCheckout):
//   1. Validate plan is active + paid, prices set.
//   2. Cancel stale pending payments for (user, plan, period).
//   3. Create BillingPayment(STATUS_PENDING).
//   4. Call PayX → receive transaction_id + payment URL.
//   5. Persist transaction_id as provider_payment_id, return URL to client.
//
// In mock mode we have no real PayX, so we simulate the same payload shape:
// create a PENDING payment row in the admin store under the dentist, return a
// pseudo checkout_url. The dentist UI redirects to this URL — in development
// this 404s gracefully (no PayX runtime). The checkout creation itself, the
// audit log, and the pending payment record all behave per backend.

// The mock dentist (/auth/me id 'dentist-1') is seeded under admin store id '1'.
const MOCK_DENTIST_ID = '1';

const ALLOWED_PLANS = new Set(['basic', 'pro']);
const ALLOWED_PERIODS = new Set(['monthly', 'yearly']);

export async function POST(request: Request) {
    // Billing is the practice OWNER's concern only — assistants must
    // never reach checkout, even in mock mode. Backend gates this with
    // `role:dentist` (api.php).
    const auth = await requireDentist();
    if (auth) return auth;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const planCode = typeof body.plan_code === 'string' ? body.plan_code : '';
    const billingPeriod = typeof body.billing_period === 'string' ? body.billing_period : '';

    if (!ALLOWED_PLANS.has(planCode)) {
        return NextResponse.json(
            { message: 'Validation failed.', errors: { plan_code: ['Plan must be basic or pro.'] } },
            { status: 422 }
        );
    }
    if (!ALLOWED_PERIODS.has(billingPeriod)) {
        return NextResponse.json(
            { message: 'Validation failed.', errors: { billing_period: ['Period must be monthly or yearly.'] } },
            { status: 422 }
        );
    }

    const store = getAdminStore();
    const plan = store.plans.find((p) => p.code === planCode);
    if (!plan || !plan.is_active || !plan.is_paid) {
        return NextResponse.json(
            { message: 'Validation failed.', errors: { plan_code: ['Plan is not available.'] } },
            { status: 422 }
        );
    }

    const amount = billingPeriod === 'yearly' ? plan.yearly_price : plan.monthly_price;
    if (amount === null || amount <= 0) {
        return NextResponse.json(
            { message: 'Validation failed.', errors: { plan_code: ['Plan price is not configured.'] } },
            { status: 422 }
        );
    }

    // Soft-cancel stale pending payments — matches BillingService.php:152-157.
    const existingPayments = store.paymentsByDentist[MOCK_DENTIST_ID] ?? [];
    let staleCancelled = 0;
    existingPayments.forEach((p) => {
        if (p.plan_code === planCode && p.billing_period === billingPeriod && p.status === 'pending') {
            p.status = 'canceled';
            staleCancelled++;
        }
    });

    const transactionId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const orderId = `ord-mock-${Date.now()}`;
    const payment: ApiBillingPayment = {
        id: `bp-mock-${Date.now()}`,
        plan_code: planCode as 'basic' | 'pro',
        plan_name: plan.name,
        billing_period: billingPeriod as 'monthly' | 'yearly',
        amount: Math.round(amount * 100) / 100,
        currency: plan.currency,
        status: 'pending',
        provider: 'payx',
        provider_payment_id: transactionId,
        provider_order_id: orderId,
        paid_at: null,
        created_at: isoDaysFromNow(0),
    };

    if (!store.paymentsByDentist[MOCK_DENTIST_ID]) {
        store.paymentsByDentist[MOCK_DENTIST_ID] = [];
    }
    store.paymentsByDentist[MOCK_DENTIST_ID].unshift(payment);

    pushAuditEntry({
        eventType: 'billing.checkout.created',
        entityType: 'billing_payment',
        entityId: payment.id,
        metadata: {
            user_id: MOCK_DENTIST_ID,
            plan_code: planCode,
            billing_period: billingPeriod,
            amount: payment.amount,
            currency: payment.currency,
            stale_pending_cancelled: staleCancelled,
            provider_payment_id: transactionId,
        },
    });

    return NextResponse.json({
        data: {
            // In production this is the URL PayX returns. In mock we just hand
            // back a synthetic URL — the dentist UI redirects there and shows a
            // dev-mode notice if PayX isn't reachable.
            checkout_url: `https://checkout.payx.uz/mock/${transactionId}`,
            payment,
        },
    });
}
