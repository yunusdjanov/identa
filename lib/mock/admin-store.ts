import type {
    ApiAdminDentist,
    ApiAssistantAccount,
    ApiBillingPayment,
    ApiLandingSettings,
    ApiLeadRequest,
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
    leads: ApiLeadRequest[];
    landing: ApiLandingSettings;
    nextDentistId: number;
    nextLeadId: number;
}

function createInitialStore(): AdminStore {
    const dentists: ApiAdminDentist[] = [
        {
            id: '1',
            name: 'Zohid Yunusjonov',
            email: 'yunusdjanov@gmail.com',
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
                upload_max_mb: 1,
                stored_image_max_mb: 0.5,
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
        leads: [
            {
                id: '1',
                name: 'Aziza Komilova',
                phone: '+998901234567',
                clinic_name: 'Bright Smile',
                city: 'Toshkent',
                note: 'Demo so‘rab qoldi',
                status: 'new',
                handled_at: null,
                created_at: isoDaysFromNow(-1),
            },
            {
                id: '2',
                name: 'Jasur Tursunov',
                phone: '+998935551122',
                clinic_name: 'MediDent',
                city: 'Samarqand',
                note: null,
                status: 'contacted',
                handled_at: isoDaysFromNow(-2),
                created_at: isoDaysFromNow(-3),
            },
            {
                id: '3',
                name: 'Gulnora Eshonova',
                phone: '+998977778899',
                clinic_name: 'DentaPlus',
                city: 'Buxoro',
                note: 'Yillik tarif narxini so‘radi',
                status: 'closed',
                handled_at: isoDaysFromNow(-8),
                created_at: isoDaysFromNow(-10),
            },
        ],
        landing: {
            trial_price_amount: 0,
            monthly_price_amount: 120000,
            yearly_price_amount: 1200000,
            currency: 'UZS',
            telegram_contact_url: 'https://t.me/identa_support',
        },
        nextDentistId: 5,
        nextLeadId: 4,
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

export function dentistSummary(): { total_count: number; active_count: number; new_registrations_7d: number } {
    const store = getAdminStore();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return {
        total_count: store.dentists.length,
        active_count: store.dentists.filter((dentist) => dentist.status === 'active').length,
        new_registrations_7d: store.dentists.filter(
            (dentist) => new Date(dentist.registration_date).getTime() >= sevenDaysAgo
        ).length,
    };
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

export function applySubscriptionAction(
    dentist: ApiAdminDentist,
    action: SubscriptionAction,
    paymentMethod?: ApiSubscriptionSummary['payment_method'],
    paymentAmount?: number,
    note?: string
): void {
    const current = dentist.subscription;
    const period = action.includes('yearly') ? 'yearly' : 'monthly';
    const ends = period === 'yearly' ? isoDaysFromNow(365) : isoDaysFromNow(30);
    const pay = {
        payment_method: paymentMethod ?? current.payment_method,
        payment_amount: paymentAmount ?? current.payment_amount,
        note: note ?? null,
    };

    switch (action) {
        case 'set_trial':
            dentist.subscription = buildSubscription({
                plan: 'trial', plan_name: 'Trial', billing_period: 'trial', status: 'trialing',
                starts_at: isoDaysFromNow(0), ends_at: isoDaysFromNow(30), trial_ends_at: isoDaysFromNow(30),
                staff_limit: 1, payment_method: null, payment_amount: null, note: note ?? null,
            });
            break;
        case 'set_basic_monthly':
        case 'set_basic_yearly':
        case 'apply_monthly':
        case 'activate_monthly':
        case 'extend_monthly':
            dentist.subscription = buildSubscription({
                plan: 'basic', plan_name: 'Basic', billing_period: period, status: 'active',
                starts_at: isoDaysFromNow(0), ends_at: ends, staff_limit: 3, ...pay,
            });
            break;
        case 'set_pro_monthly':
        case 'set_pro_yearly':
        case 'apply_yearly':
        case 'activate_yearly':
        case 'extend_yearly':
            dentist.subscription = buildSubscription({
                plan: 'pro', plan_name: 'Pro', billing_period: period, status: 'active',
                starts_at: isoDaysFromNow(0), ends_at: ends, staff_limit: 5, ...pay,
            });
            break;
        case 'mark_read_only':
            dentist.subscription = buildSubscription({ ...current, status: 'read_only', note: note ?? current.note });
            break;
        case 'mark_active':
            dentist.subscription = buildSubscription({ ...current, status: 'active', note: note ?? current.note });
            break;
        case 'cancel_at_period_end':
            dentist.subscription = buildSubscription({ ...current, cancel_at_period_end: true, note: note ?? current.note });
            break;
        case 'cancel_now':
            dentist.subscription = buildSubscription({
                ...current, status: 'canceled', cancel_at_period_end: false,
                cancelled_at: isoDaysFromNow(0), ends_at: isoDaysFromNow(0), note: note ?? current.note,
            });
            break;
    }
}

export { buildSubscription, isoDaysFromNow };
