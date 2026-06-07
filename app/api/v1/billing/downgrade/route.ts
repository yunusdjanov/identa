import { NextResponse } from 'next/server';
import { ok, requireDentist } from '../../_auth';
import { getAdminStore, pushAuditEntry } from '@/lib/mock/admin-store';

// Local mock: best-practice deferred downgrade (Pro → Basic) with NO payment.
//
// Mirrors BillingService::scheduleDowngrade — it schedules the switch for the
// end of the current paid period, creates NO BillingPayment / PayX invoice, and
// returns the refreshed subscription summary now carrying the pending change.
// Unlike /billing/checkout there is no checkout_url and no redirect.

// The mock dentist session (/auth/me id 'dentist-1') is seeded under admin
// store id '1'.
const MOCK_DENTIST_ID = '1';
const ALLOWED_PERIODS = new Set(['monthly', 'yearly']);

export async function POST(request: Request) {
    // Billing is owner-only — assistants never reach this. Backend gates with
    // `role:dentist` (api.php).
    const auth = await requireDentist();
    if (auth) return auth;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const planCode = typeof body.plan_code === 'string' ? body.plan_code : '';
    const billingPeriod = typeof body.billing_period === 'string' ? body.billing_period : '';

    // Basic is the only downgrade target (mirrors Rule::in([Plan::CODE_BASIC])).
    if (planCode !== 'basic') {
        return NextResponse.json(
            { message: 'Validation failed.', errors: { plan_code: ['Only Basic is a downgrade target.'] } },
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
    const dentist = store.dentists.find((d) => d.id === MOCK_DENTIST_ID);
    const subscription = dentist?.subscription;
    const basic = store.plans.find((p) => p.code === 'basic');

    // Only an active Pro subscription is a downgrade — matches the backend
    // isDeferredDowngrade() guard. Anything else is a paid action (checkout).
    if (!subscription || !basic || subscription.plan !== 'pro' || subscription.status !== 'active') {
        return NextResponse.json(
            { message: 'Validation failed.', errors: { plan_code: ['This plan change is not a downgrade.'] } },
            { status: 422 }
        );
    }

    subscription.pending_plan_id = 'basic';
    subscription.pending_plan_code = 'basic';
    subscription.pending_plan_name = basic.name;
    subscription.pending_billing_period = billingPeriod as 'monthly' | 'yearly';
    subscription.pending_change_effective_at = subscription.ends_at;

    pushAuditEntry({
        eventType: 'billing.subscription.downgrade_scheduled',
        entityType: 'user',
        entityId: MOCK_DENTIST_ID,
        metadata: {
            plan_code: 'basic',
            billing_period: billingPeriod,
            effective_at: subscription.ends_at,
        },
    });

    return ok(subscription);
}
