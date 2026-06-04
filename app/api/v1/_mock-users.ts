/**
 * Shared mock user fixtures for the local Next.js mock API.
 *
 * The mock used to inline these in both `/auth/login` and `/auth/me`,
 * duplicating the shape every time a new field was added to `ApiUser`.
 * Centralising the fixtures here lets both routes serve identical data
 * and adds support for assistant accounts — previously only the dentist
 * owner and admin could be exercised against the local mock, which left
 * the assistant UX (permission gates, must_change_password forced reset,
 * tenant scoping) untestable without spinning up the Laravel backend.
 *
 * Lookup priority used by `/auth/login`:
 *   1. `portal: 'admin'` → returns ADMIN_USER regardless of email
 *   2. Email match against ASSISTANT_USERS keys → returns that assistant
 *   3. Otherwise → DENTIST_USER (the historical default)
 *
 * Assistant emails are deliberately distinct shapes:
 *  - `zulfiya@identa.uz` — happy path: active, full patient+appointment
 *    manage permissions, password rotation already done.
 *  - `sardor@identa.uz` — partial permissions: payments-side staff who
 *    can NOT manage patients (only view them) — useful for testing the
 *    hide-not-disable patterns added in AF5.
 *  - `madina@identa.uz` — must_change_password=true: lets you reach the
 *    forced-reset banner + tab lock added in AF1 without an admin reset.
 *    `view`-only permissions to also verify the permission-aware nav.
 */

interface MockSubscription {
    status: 'active' | 'grace' | 'read_only' | 'cancelled' | 'none';
    plan: string;
    plan_name?: string | null;
    billing_period?: 'monthly' | 'yearly' | 'trial' | null;
    trial_ends_at: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
    grace_ends_at?: string | null;
    days_remaining?: number | null;
    upload_max_mb: number;
    stored_image_max_mb: number;
    can_export: boolean;
    staff_limit: number;
    active_staff_count?: number;
    entry_image_limit: number;
    is_configured?: boolean;
    is_read_only?: boolean;
    access_mode?: 'full' | 'read_only';
    cancel_at_period_end?: boolean;
    cancelled_at?: string | null;
    pending_plan_id?: string | null;
    pending_plan_code?: string | null;
    pending_plan_name?: string | null;
    pending_billing_period?: 'monthly' | 'yearly' | null;
    pending_change_effective_at?: string | null;
    payment_method?: 'cash' | 'p2p' | 'bank_transfer' | null;
    payment_amount?: number | null;
    note?: string | null;
}

export interface MockUser {
    id: string;
    name: string;
    email: string;
    email_verified_at?: string | null;
    role: 'admin' | 'dentist' | 'assistant';
    email_verified: boolean;
    account_status: 'active' | 'blocked' | 'deleted';
    must_change_password?: boolean;
    has_password?: boolean;
    provider?: 'password' | 'google' | null;
    avatar_url?: string | null;
    dentist_owner_id?: string | null;
    assistant_permissions?: string[];
    can_export?: boolean;
    subscription?: MockSubscription | null;
}

const DENTIST_SUBSCRIPTION: MockSubscription = {
    status: 'active',
    plan: 'pro',
    plan_name: 'Pro',
    billing_period: 'monthly',
    trial_ends_at: null,
    starts_at: '2026-04-01T00:00:00Z',
    ends_at: '2026-07-01T00:00:00Z',
    grace_ends_at: null,
    days_remaining: 27,
    upload_max_mb: 8,
    stored_image_max_mb: 80,
    can_export: true,
    staff_limit: 5,
    active_staff_count: 2,
    entry_image_limit: 10,
    is_configured: true,
    is_read_only: false,
    access_mode: 'full',
    cancel_at_period_end: false,
    cancelled_at: null,
    pending_plan_id: null,
    pending_plan_code: null,
    pending_plan_name: null,
    pending_billing_period: null,
    pending_change_effective_at: null,
    payment_method: 'p2p',
    payment_amount: 300000,
    note: null,
};

const DENTIST_USER: MockUser = {
    id: 'dentist-1',
    name: 'Zohid Yunusjonov',
    email: 'yunusdjanov@gmail.com',
    role: 'dentist',
    email_verified: true,
    account_status: 'active',
    must_change_password: false,
    subscription: DENTIST_SUBSCRIPTION,
};

const ADMIN_USER: MockUser = {
    id: 'admin-1',
    name: 'Identa Admin',
    email: 'admin@identa.test',
    role: 'admin',
    email_verified: true,
    account_status: 'active',
    must_change_password: false,
    subscription: null,
};

/**
 * Assistants are scoped to dentist-1 (matches the admin store seed under
 * `staffByDentist['1']`). The subscription field mirrors the parent's so
 * the read-only / staff-limit indicators read consistently in the UI.
 */
const ASSISTANT_USERS: Record<string, MockUser> = {
    'zulfiya@identa.uz': {
        id: '101',
        name: 'Zulfiya Nazarova',
        email: 'zulfiya@identa.uz',
        role: 'assistant',
        email_verified: true,
        account_status: 'active',
        must_change_password: false,
        avatar_url: 'https://i.pravatar.cc/96?u=zulfiya',
        dentist_owner_id: 'dentist-1',
        assistant_permissions: [
            'patients.view',
            'patients.manage',
            'appointments.view',
            'appointments.manage',
        ],
        subscription: DENTIST_SUBSCRIPTION,
    },
    'sardor@identa.uz': {
        id: '102',
        name: 'Sardor Aliyev',
        email: 'sardor@identa.uz',
        role: 'assistant',
        email_verified: true,
        account_status: 'active',
        must_change_password: false,
        avatar_url: null,
        dentist_owner_id: 'dentist-1',
        // Payments-side staff: cannot manage or view patients, only see and
        // record payments. Exercises the AF5 hide-not-disable patterns.
        assistant_permissions: [
            'patients.view',
            'payments.view',
            'payments.manage',
        ],
        subscription: DENTIST_SUBSCRIPTION,
    },
    'madina@identa.uz': {
        id: '103',
        name: 'Madina Yusupova',
        email: 'madina@identa.uz',
        role: 'assistant',
        email_verified: true,
        account_status: 'active',
        // Set true so login bounces this user straight into /settings with
        // the forced-reset banner and other tabs disabled. Useful for
        // smoke-testing the AF1 enforcement without an admin password
        // reset roundtrip.
        must_change_password: true,
        avatar_url: 'https://i.pravatar.cc/96?u=madina',
        dentist_owner_id: 'dentist-1',
        assistant_permissions: ['patients.view'],
        subscription: DENTIST_SUBSCRIPTION,
    },
};

/**
 * Resolve which fixture a /auth/me request should return based on the
 * `mock_role` and (when present) `mock_user_id` cookies. Falls back to
 * the dentist fixture when nothing else matches — same default the mock
 * always had, so existing dev flows don't change.
 */
export function resolveMockUser(role: string | undefined, userId: string | undefined): MockUser {
    if (role === 'admin') return ADMIN_USER;
    if (role === 'assistant' && userId) {
        const match = Object.values(ASSISTANT_USERS).find((u) => u.id === userId);
        if (match) return match;
    }
    return DENTIST_USER;
}

/**
 * Resolve which fixture a /auth/login attempt should return based on the
 * posted body. Mirrors the resolution logic the real Laravel backend
 * applies, but doesn't actually validate the password — the mock accepts
 * any password the way it always has, so manual smoke-testing stays fast.
 */
export function resolveLoginUser(body: { email?: unknown; portal?: unknown }): MockUser {
    if (body?.portal === 'admin') return ADMIN_USER;
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (email && ASSISTANT_USERS[email]) {
        return ASSISTANT_USERS[email];
    }
    return DENTIST_USER;
}
