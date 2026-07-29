import type {
    ApiAdminDentist,
    ApiAssistantAccount,
    ApiAuditLogEntry,
    ApiBillingPayment,
    ApiPlan,
    ApiSubscriptionSummary,
} from '@/lib/api/types';

// ---------------------------------------------------------------------------
// Local-dev mock store for the ADMIN panel.
//
// The real admin endpoints live in the Laravel backend; this gives the Next.js
// mock API enough stateful data to exercise the admin UI (dentist management,
// subscriptions, staff, plans, leads, landing settings) without a backend.
//
// State is kept on `globalThis` so it survives Next.js hot-reloads during a dev
// session (a fresh server start reseeds). It is intentionally process-local and
// never used in production.
// ---------------------------------------------------------------------------

function isoDaysFromNow(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString();
}

function daysRemaining(endsAt: string | null): number | null {
    if (!endsAt) {
        return null;
    }
    const diff = new Date(endsAt).getTime() - Date.now();
    return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
}

function buildSubscription(overrides: Partial<ApiSubscriptionSummary> = {}): ApiSubscriptionSummary {
    const base: ApiSubscriptionSummary = {
        is_configured: true,
        plan: 'basic',
        plan_name: 'Basic',
        billing_period: 'monthly',
        status: 'active',
        access_mode: 'full',
        starts_at: isoDaysFromNow(-10),
        ends_at: isoDaysFromNow(20),
        trial_ends_at: null,
        grace_ends_at: null,
        cancel_at_period_end: false,
        cancelled_at: null,
        pending_plan_id: null,
        pending_plan_code: null,
        pending_plan_name: null,
        pending_billing_period: null,
        pending_change_effective_at: null,
        days_remaining: 20,
        staff_limit: 3,
        active_staff_count: 0,
        entry_image_limit: 5,
        upload_max_mb: 4,
        stored_image_max_mb: 40,
        can_export: true,
        is_read_only: false,
        payment_method: 'cash',
        payment_amount: 120000,
        note: null,
    };
    const merged = { ...base, ...overrides };
    merged.days_remaining = daysRemaining(merged.ends_at);
    merged.is_read_only = merged.status === 'read_only';
    merged.access_mode = merged.is_read_only ? 'read_only' : 'full';
    return merged;
}

interface AdminStore {
    dentists: ApiAdminDentist[];
    staffByDentist: Record<string, ApiAssistantAccount[]>;
    paymentsByDentist: Record<string, ApiBillingPayment[]>;
    plans: ApiPlan[];
    nextDentistId: number;
    // Audit entries appended at runtime by admin mutations (subscription
    // updates, status changes, refunds, etc). The /audit-logs route merges
    // these with the static AUDIT_LOGS seed so the UI history panel
    // reflects mock-side actions immediately.
    dynamicAuditEntries: ApiAuditLogEntry[];
    nextAuditId: number;
}

function createInitialStore(): AdminStore {
    const dentists: ApiAdminDentist[] = [
        {
            id: '1',
            name: 'Zohid Yunusjonov',
            email: 'yunusdjanov@gmail.com',
            email_verified: true,
            avatar_url: 'https://i.pravatar.cc/96?u=zohid',
            practice_name: 'Smile Lab Dental',
            registration_date: isoDaysFromNow(-120),
            status: 'active',
            last_login: isoDaysFromNow(-1),
            patient_count: 248,
            appointment_count: 612,
            active_staff_count: 2,
            total_staff_count: 3,
            subscription: buildSubscription({
                plan: 'pro',
                plan_name: 'Pro',
                billing_period: 'yearly',
                ends_at: isoDaysFromNow(210),
                staff_limit: 5,
                active_staff_count: 2,
                payment_amount: 1200000,
            }),
        },
        {
            id: '2',
            name: 'Dilnoza Karimova',
            email: 'dilnoza.k@clinic.uz',
            email_verified: false,
            avatar_url: null,
            practice_name: 'Dental Art',
            registration_date: isoDaysFromNow(-26),
            status: 'active',
            last_login: isoDaysFromNow(-3),
            patient_count: 41,
            appointment_count: 73,
            active_staff_count: 0,
            total_staff_count: 0,
            subscription: buildSubscription({
                plan: 'trial',
                plan_name: 'Trial',
                billing_period: 'trial',
                status: 'trialing',
                starts_at: isoDaysFromNow(-26),
                ends_at: isoDaysFromNow(4),
                trial_ends_at: isoDaysFromNow(4),
                staff_limit: 1,
                payment_method: null,
                payment_amount: null,
            }),
        },
        {
            id: '3',
            name: 'Bekzod Rahimov',
            email: 'bekzod@dentcare.uz',
            email_verified: true,
            avatar_url: 'https://i.pravatar.cc/96?u=bekzod',
            practice_name: 'DentCare',
            registration_date: isoDaysFromNow(-200),
            status: 'blocked',
            last_login: isoDaysFromNow(-45),
            patient_count: 96,
            appointment_count: 188,
            active_staff_count: 0,
            total_staff_count: 1,
            subscription: buildSubscription({
                plan: 'basic',
                plan_name: 'Basic',
                billing_period: 'monthly',
                status: 'read_only',
                ends_at: isoDaysFromNow(-5),
                staff_limit: 3,
                payment_amount: 120000,
            }),
        },
        {
            id: '4',
            name: 'Nilufar Tosheva',
            email: 'nilufar@oradent.uz',
            email_verified: false,
            avatar_url: null,
            practice_name: 'OraDent',
            registration_date: isoDaysFromNow(-4),
            status: 'active',
            last_login: null,
            patient_count: 3,
            appointment_count: 1,
            active_staff_count: 0,
            total_staff_count: 0,
            subscription: buildSubscription({
                plan: 'basic',
                plan_name: 'Basic',
                billing_period: 'monthly',
                status: 'active',
                cancel_at_period_end: true,
                ends_at: isoDaysFromNow(12),
                staff_limit: 3,
                payment_method: 'p2p',
                payment_amount: 120000,
            }),
        },
    ];

    return {
        dentists,
        staffByDentist: {
            '1': [
                {
                    id: '101',
                    name: 'Zulfiya Nazarova',
                    email: 'zulfiya@identa.uz',
                    phone: '+998901111111',
                    avatar_url: 'https://i.pravatar.cc/96?u=zulfiya',
                    account_status: 'active',
                    assistant_permissions: ['patients.view', 'patients.manage', 'appointments.view', 'appointments.manage'],
                    must_change_password: false,
                    last_login_at: isoDaysFromNow(-1),
                    created_at: isoDaysFromNow(-90),
                },
                {
                    id: '102',
                    name: 'Sardor Aliyev',
                    email: 'sardor@identa.uz',
                    phone: '+998902222222',
                    avatar_url: null,
                    account_status: 'active',
                    assistant_permissions: ['patients.view', 'payments.view', 'payments.manage'],
                    must_change_password: false,
                    last_login_at: isoDaysFromNow(-7),
                    created_at: isoDaysFromNow(-60),
                },
                {
                    id: '103',
                    name: 'Madina Yusupova',
                    email: 'madina@identa.uz',
                    phone: null,
                    avatar_url: 'https://i.pravatar.cc/96?u=madina',
                    account_status: 'blocked',
                    assistant_permissions: ['patients.view'],
                    must_change_password: true,
                    last_login_at: null,
                    created_at: isoDaysFromNow(-30),
                },
            ],
            '3': [
                {
                    id: '301',
                    name: 'Otabek Saidov',
                    email: 'otabek@dentcare.uz',
                    phone: '+998903333333',
                    avatar_url: null,
                    account_status: 'blocked',
                    assistant_permissions: ['patients.view', 'appointments.view'],
                    must_change_password: false,
                    last_login_at: isoDaysFromNow(-46),
                    created_at: isoDaysFromNow(-180),
                },
            ],
        },
        paymentsByDentist: {
            '1': [
                {
                    id: 'pay-1',
                    plan_code: 'pro',
                    plan_name: 'Pro',
                    billing_period: 'yearly',
                    amount: 1200000,
                    currency: 'UZS',
                    status: 'paid',
                    provider: 'payx',
                    provider_payment_id: 'px_8842',
                    provider_order_id: 'ord_2026_0012',
                    paid_at: isoDaysFromNow(-150),
                    created_at: isoDaysFromNow(-150),
                },
                {
                    id: 'pay-2',
                    plan_code: 'basic',
                    plan_name: 'Basic',
                    billing_period: 'monthly',
                    amount: 120000,
                    currency: 'UZS',
                    status: 'paid',
                    provider: 'payx',
                    provider_payment_id: 'px_7710',
                    provider_order_id: 'ord_2025_0431',
                    paid_at: isoDaysFromNow(-181),
                    created_at: isoDaysFromNow(-181),
                },
            ],
            '3': [
                {
                    id: 'pay-3',
                    plan_code: 'basic',
                    plan_name: 'Basic',
                    billing_period: 'monthly',
                    amount: 120000,
                    currency: 'UZS',
                    status: 'failed',
                    provider: 'payx',
                    provider_payment_id: null,
                    provider_order_id: 'ord_2026_0099',
                    paid_at: null,
                    created_at: isoDaysFromNow(-6),
                },
            ],
        },
        plans: [
            {
                id: 'plan-trial',
                code: 'trial',
                name: 'Trial',
                description: '30 kunlik bepul sinov',
                is_trial: true,
                is_paid: false,
                trial_days: 30,
                monthly_price: null,
                yearly_price: null,
                currency: 'UZS',
                staff_limit: 1,
                entry_image_limit: 2,
                upload_max_mb: 3,
                stored_image_max_mb: 6,
                can_export: false,
                is_active: true,
                sort_order: 10,
                updated_at: isoDaysFromNow(-30),
            },
            {
                id: 'plan-basic',
                code: 'basic',
                name: 'Basic',
                description: 'Kichik klinikalar uchun',
                is_trial: false,
                is_paid: true,
                trial_days: null,
                monthly_price: 120000,
                yearly_price: 1200000,
                currency: 'UZS',
                staff_limit: 3,
                entry_image_limit: 5,
                upload_max_mb: 4,
                stored_image_max_mb: 40,
                can_export: true,
                is_active: true,
                sort_order: 20,
                updated_at: isoDaysFromNow(-30),
            },
            {
                id: 'plan-pro',
                code: 'pro',
                name: 'Pro',
                description: 'Katta klinikalar uchun',
                is_trial: false,
                is_paid: true,
                trial_days: null,
                monthly_price: 200000,
                yearly_price: 2000000,
                currency: 'UZS',
                staff_limit: 5,
                entry_image_limit: 10,
                upload_max_mb: 8,
                stored_image_max_mb: 80,
                can_export: true,
                is_active: true,
                sort_order: 30,
                updated_at: isoDaysFromNow(-30),
            },
        ],
        nextDentistId: 5,
        dynamicAuditEntries: [],
        nextAuditId: 1000,
    };
}

const globalRef = globalThis as typeof globalThis & { __identaAdminStore?: AdminStore };

export function getAdminStore(): AdminStore {
    if (!globalRef.__identaAdminStore) {
        globalRef.__identaAdminStore = createInitialStore();
    }
    return globalRef.__identaAdminStore;
}

export function findDentist(id: string): ApiAdminDentist | undefined {
    return getAdminStore().dentists.find((dentist) => dentist.id === id);
}

export type AdminPaymentWithDentist = ApiBillingPayment & {
    dentist: {
        id: string;
        name: string;
        email: string;
        avatar_url: string | null;
    } | null;
};

export function getAllPayments(): AdminPaymentWithDentist[] {
    const store = getAdminStore();
    const all: AdminPaymentWithDentist[] = [];

    for (const [dentistId, payments] of Object.entries(store.paymentsByDentist)) {
        const dentist = store.dentists.find((d) => d.id === dentistId);
        for (const payment of payments) {
            all.push({
                ...payment,
                dentist: dentist
                    ? {
                        id: dentist.id,
                        name: dentist.name,
                        email: dentist.email,
                        avatar_url: dentist.avatar_url,
                    }
                    : null,
            });
        }
    }

    return all.sort((a, b) => {
        const ta = new Date(a.created_at ?? 0).getTime();
        const tb = new Date(b.created_at ?? 0).getTime();
        return tb - ta;
    });
}

export function findPayment(id: string): { payment: ApiBillingPayment; dentistId: string } | undefined {
    const store = getAdminStore();
    for (const [dentistId, payments] of Object.entries(store.paymentsByDentist)) {
        const payment = payments.find((p) => p.id === id);
        if (payment) {
            return { payment, dentistId };
        }
    }
    return undefined;
}

export function paymentsSummary(all: AdminPaymentWithDentist[] = getAllPayments()): {
    this_month: number;
    this_year: number;
    all_time: number;
    paid_count: number;
    currency: string;
    totals_by_currency: Array<{
        currency: string;
        this_month: number;
        this_year: number;
        all_time: number;
        paid_count: number;
    }>;
} {
    const paid = all.filter((p) => p.status === 'paid');
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const startOfYear = new Date(startOfMonth.getFullYear(), 0, 1);

    const grouped = paid.reduce<Record<string, {
        currency: string;
        this_month: number;
        this_year: number;
        all_time: number;
        paid_count: number;
    }>>((acc, p) => {
        const code = p.currency || 'UZS';
        const row = acc[code] ?? {
            currency: code,
            this_month: 0,
            this_year: 0,
            all_time: 0,
            paid_count: 0,
        };
        row.all_time += p.amount;
        row.paid_count += 1;
        if (p.paid_at !== null && new Date(p.paid_at) >= startOfMonth) {
            row.this_month += p.amount;
        }
        if (p.paid_at !== null && new Date(p.paid_at) >= startOfYear) {
            row.this_year += p.amount;
        }
        acc[code] = row;
        return acc;
    }, {});
    const totalsByCurrency = Object.values(grouped)
        .sort((a, b) => b.all_time - a.all_time);
    const primary = totalsByCurrency[0] ?? {
        currency: 'UZS',
        this_month: 0,
        this_year: 0,
        all_time: 0,
        paid_count: 0,
    };

    return {
        this_month: primary.this_month,
        this_year: primary.this_year,
        all_time: primary.all_time,
        paid_count: paid.length,
        currency: primary.currency,
        totals_by_currency: totalsByCurrency,
    };
}

export function dentistSummary(): { total_count: number; active_count: number; new_registrations_7d: number } {
    const store = getAdminStore();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    // Exclude soft-deleted rows from every total. The backend's
    // `DentistAccountController::index` summary applies the same scope
    // (account_status != deleted); the mock used to count `dentists.length`
    // which inflated the summary cards in the archive view by the number of
    // already-deleted accounts. Aligning the source of truth fixes the
    // drift between mock dev and prod for the same data.
    const nonDeleted = store.dentists.filter((d) => d.status !== 'deleted');
    return {
        total_count: nonDeleted.length,
        active_count: nonDeleted.filter((dentist) => dentist.status === 'active').length,
        new_registrations_7d: nonDeleted.filter(
            (dentist) => new Date(dentist.registration_date).getTime() >= sevenDaysAgo
        ).length,
    };
}

/**
 * Sync the dentist row's `active_staff_count` / `total_staff_count` with the
 * actual `staffByDentist[id]` array. Seed values drift the moment any team
 * mutation runs (status flip, soft-delete, create) — call this after every
 * mutation, or before serializing a dentist record, to keep production
 * parity (backend computes these via SQL aggregates on read).
 */
export function recomputeStaffCounts(dentistId: string): void {
    const store = getAdminStore();
    const dentist = store.dentists.find((d) => d.id === dentistId);
    if (!dentist) return;
    const staff = store.staffByDentist[dentistId] ?? [];
    dentist.active_staff_count = staff.filter((s) => s.account_status === 'active').length;
    dentist.total_staff_count = staff.filter((s) => s.account_status !== 'deleted').length;
}

type SubscriptionAction =
    | 'apply_monthly' | 'apply_yearly'
    | 'activate_monthly' | 'activate_yearly'
    | 'extend_monthly' | 'extend_yearly'
    | 'set_trial'
    | 'set_basic_monthly' | 'set_basic_yearly'
    | 'set_pro_monthly' | 'set_pro_yearly'
    | 'mark_read_only' | 'mark_active'
    | 'cancel_at_period_end' | 'cancel_now';

/**
 * Append an admin-side audit entry mirroring the Laravel AuditLogger output.
 * The /audit-logs route merges these with the static AUDIT_LOGS seed so the
 * UI history panel reflects mock-side actions immediately — matching the
 * production contract where backend writes audit rows on every admin write.
 */
export function pushAuditEntry(entry: {
    eventType: string;
    entityType?: string | null;
    entityId?: string | null;
    metadata?: Record<string, unknown> | null;
}): ApiAuditLogEntry {
    const store = getAdminStore();
    const id = `log-dyn-${store.nextAuditId++}`;
    const row: ApiAuditLogEntry = {
        id,
        event_type: entry.eventType,
        entity_type: entry.entityType ?? null,
        entity_id: entry.entityId ?? null,
        actor_role: 'admin',
        actor: {
            id: 'admin-1',
            name: 'Admin',
            email: 'admin@identa.uz',
            role: 'admin',
        },
        ip_address: '127.0.0.1',
        user_agent: null,
        metadata: entry.metadata ?? null,
        created_at: new Date().toISOString(),
    };
    store.dynamicAuditEntries.unshift(row);
    return row;
}

export function getDynamicAuditEntries(): ApiAuditLogEntry[] {
    return [...getAdminStore().dynamicAuditEntries];
}

/**
 * Resolve a paid-plan action to its target {plan, period} pair. Returns null
 * for non-paid actions (mark_*, cancel_*, set_trial) so the caller can take
 * a different branch.
 *
 * `planName` and `staffLimit` are read from the live plan row in the admin
 * store, NOT hardcoded — so an admin who renames a plan via /admin/plans or
 * changes its staff_limit sees those edits reflected on the very next
 * subscription action (production parity: backend calls $plan->name).
 */
function resolvePaidPlanFromAction(action: SubscriptionAction):
    { plan: 'basic' | 'pro'; planName: string; period: 'monthly' | 'yearly'; staffLimit: number }
    | null
{
    const period = action.includes('yearly') ? 'yearly' : 'monthly';
    const plans = getAdminStore().plans;
    if (action.startsWith('set_basic_') || action === 'apply_monthly' || action === 'activate_monthly' || action === 'extend_monthly') {
        const basic = plans.find((p) => p.code === 'basic');
        return {
            plan: 'basic',
            planName: basic?.name ?? 'Basic',
            period,
            staffLimit: basic?.staff_limit ?? 3,
        };
    }
    if (action.startsWith('set_pro_') || action === 'apply_yearly' || action === 'activate_yearly' || action === 'extend_yearly') {
        const pro = plans.find((p) => p.code === 'pro');
        return {
            plan: 'pro',
            planName: pro?.name ?? 'Pro',
            period,
            staffLimit: pro?.staff_limit ?? 5,
        };
    }
    return null;
}

function addPeriod(base: Date, period: 'monthly' | 'yearly'): Date {
    const out = new Date(base);
    if (period === 'yearly') {
        out.setFullYear(out.getFullYear() + 1);
    } else {
        out.setMonth(out.getMonth() + 1);
    }
    return out;
}

export function applySubscriptionAction(
    dentist: ApiAdminDentist,
    action: SubscriptionAction,
    paymentMethod?: ApiSubscriptionSummary['payment_method'],
    paymentAmount?: number,
    note?: string
): void {
    const current = dentist.subscription;
    const oldSummary = {
        plan: current.plan,
        billing_period: current.billing_period,
        status: current.status,
        ends_at: current.ends_at,
    };

    switch (action) {
        case 'set_trial': {
            // Read live trial plan row so renames / staff_limit / trial_days
            // tweaks via /admin/plans flow through to the dentist record.
            const trialPlan = getAdminStore().plans.find((p) => p.code === 'trial');
            const trialDays = trialPlan?.trial_days ?? 30;
            dentist.subscription = buildSubscription({
                plan: 'trial',
                plan_name: trialPlan?.name ?? 'Trial',
                billing_period: 'trial',
                status: 'trialing',
                starts_at: isoDaysFromNow(0),
                ends_at: isoDaysFromNow(trialDays),
                trial_ends_at: isoDaysFromNow(trialDays),
                staff_limit: trialPlan?.staff_limit ?? 1,
                payment_method: null,
                payment_amount: null,
                note: note ?? null,
                cancel_at_period_end: false,
                cancelled_at: null,
            });
            break;
        }

        case 'mark_read_only':
            dentist.subscription = buildSubscription({
                ...current,
                status: 'read_only',
                cancel_at_period_end: false,
                // Mirror the backend cleanup: clear legacy payment fields so
                // the dentist's billing card no longer shows a revoked
                // payment as if it were still funding access.
                payment_method: null,
                payment_amount: null,
                cancelled_at: isoDaysFromNow(0),
                note: note ?? current.note,
            });
            break;

        case 'mark_active': {
            // Restore ends_at if it expired so the dentist actually regains
            // a valid paid period — matches SubscriptionService::markActive
            // which extends a past ends_at by 30 days.
            const endsAtIso = current.ends_at;
            const stillFuture = endsAtIso && new Date(endsAtIso).getTime() > Date.now();
            const ends = stillFuture ? (endsAtIso as string) : isoDaysFromNow(30);
            dentist.subscription = buildSubscription({
                ...current,
                status: 'active',
                cancel_at_period_end: false,
                cancelled_at: null,
                ends_at: ends,
                note: note ?? current.note,
            });
            break;
        }

        case 'cancel_at_period_end':
            dentist.subscription = buildSubscription({
                ...current,
                cancel_at_period_end: true,
                note: note ?? current.note,
            });
            break;

        case 'cancel_now':
            dentist.subscription = buildSubscription({
                ...current,
                status: 'canceled',
                cancel_at_period_end: false,
                cancelled_at: isoDaysFromNow(0),
                ends_at: isoDaysFromNow(0),
                note: note ?? current.note,
            });
            break;

        default: {
            // Paid-plan branch: apply/activate/extend/set_*_monthly/yearly.
            // Mirrors the backend's `renewOrActivate` smart logic — extend
            // when the target matches the current plan + period and the sub
            // is active; otherwise activate a fresh period.
            const target = resolvePaidPlanFromAction(action);
            if (!target) break;

            const canExtend = current.plan === target.plan
                && current.billing_period === target.period
                && current.status === 'active'
                && current.ends_at !== null;
            const startsAt = isoDaysFromNow(0);
            const baseDate = canExtend && current.ends_at
                ? new Date(Math.max(new Date(current.ends_at).getTime(), Date.now()))
                : new Date();
            const endsAt = addPeriod(baseDate, target.period).toISOString();

            dentist.subscription = buildSubscription({
                ...current,
                plan: target.plan,
                plan_name: target.planName,
                billing_period: target.period,
                status: 'active',
                starts_at: canExtend ? current.starts_at : startsAt,
                ends_at: endsAt,
                staff_limit: target.staffLimit,
                trial_ends_at: null,
                cancel_at_period_end: false,
                cancelled_at: null,
                payment_method: paymentMethod ?? current.payment_method,
                payment_amount: paymentAmount ?? current.payment_amount,
                note: note ?? null,
            });
            break;
        }
    }

    pushAuditEntry({
        // Emit specific event types per action category so the audit-logs UI
        // and finance dashboards can filter cancellations, mark-only flips,
        // and revenue actions without scraping metadata — matches the
        // backend event-type fan-out added in DentistAccountController.
        eventType: (() => {
            switch (action) {
                case 'cancel_at_period_end': return 'admin.dentist.subscription_cancel_at_period_end';
                case 'cancel_now': return 'admin.dentist.subscription_cancel_now';
                case 'mark_read_only': return 'admin.dentist.subscription_mark_read_only';
                case 'mark_active': return 'admin.dentist.subscription_mark_active';
                case 'set_trial': return 'admin.dentist.subscription_set_trial';
                default: return 'admin.dentist.subscription_updated';
            }
        })(),
        entityType: 'user',
        entityId: dentist.id,
        metadata: {
            action,
            // Add top-level plan / status alongside old/new summaries —
            // matches backend metadata shape so the same audit-log
            // consumer queries work in mock and prod.
            plan: dentist.subscription.plan,
            status: dentist.subscription.status,
            old_subscription: oldSummary,
            new_subscription: {
                plan: dentist.subscription.plan,
                billing_period: dentist.subscription.billing_period,
                status: dentist.subscription.status,
                ends_at: dentist.subscription.ends_at,
            },
            payment_method: paymentMethod ?? null,
            payment_amount: paymentAmount ?? null,
            note: note ?? null,
        },
    });
}

export { buildSubscription, isoDaysFromNow };
