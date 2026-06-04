import { describe, expect, it } from 'vitest';

import {
    canManage,
    canView,
    canViewAnalytics,
    hasPermission,
    isSubscriptionReadOnly,
    normalizeAssistantPermissions,
} from '@/lib/auth/permissions';
import type { ApiUser } from '@/lib/api/types';

// Minimal user fixtures cover the role × permission × account_status
// matrix the helpers fan out across. Each test names the scenario it
// guards so failures point at a specific contract — these are
// security-critical helpers and a regression here lets the wrong UI
// affordances render.

function buildDentist(overrides: Partial<ApiUser> = {}): ApiUser {
    return {
        id: '1',
        name: 'Dentist',
        email: 'd@test.local',
        role: 'dentist',
        email_verified: true,
        account_status: 'active',
        ...overrides,
    } as ApiUser;
}

function buildAdmin(overrides: Partial<ApiUser> = {}): ApiUser {
    return {
        id: '2',
        name: 'Admin',
        email: 'a@test.local',
        role: 'admin',
        email_verified: true,
        account_status: 'active',
        ...overrides,
    } as ApiUser;
}

function buildAssistant(
    permissions: string[],
    overrides: Partial<ApiUser> = {}
): ApiUser {
    return {
        id: '3',
        name: 'Assistant',
        email: 'as@test.local',
        role: 'assistant',
        email_verified: true,
        account_status: 'active',
        assistant_permissions: permissions,
        dentist_owner_id: '1',
        ...overrides,
    } as ApiUser;
}

describe('hasPermission', () => {
    it('returns false for null/undefined user', () => {
        expect(hasPermission(null, 'patients.view')).toBe(false);
        expect(hasPermission(undefined, 'patients.view')).toBe(false);
    });

    it('grants every permission to dentist and admin roles', () => {
        const dentist = buildDentist();
        const admin = buildAdmin();
        expect(hasPermission(dentist, 'patients.manage')).toBe(true);
        expect(hasPermission(dentist, 'payments.view')).toBe(true);
        expect(hasPermission(admin, 'appointments.manage')).toBe(true);
    });

    it('gates assistants by their assistant_permissions list', () => {
        const sardor = buildAssistant(['patients.view', 'payments.view', 'payments.manage']);
        expect(hasPermission(sardor, 'patients.view')).toBe(true);
        expect(hasPermission(sardor, 'payments.manage')).toBe(true);
        expect(hasPermission(sardor, 'patients.manage')).toBe(false);
        expect(hasPermission(sardor, 'appointments.view')).toBe(false);
    });

    it('rejects everything when account_status is not active (security guard)', () => {
        // AFD-H1: a blocked or soft-deleted assistant whose token cascade
        // hasn't finished propagating must not pass permission checks UI-side.
        const blockedDentist = buildDentist({ account_status: 'blocked' });
        const deletedAssistant = buildAssistant(['patients.view', 'patients.manage'], {
            account_status: 'deleted',
        });
        expect(hasPermission(blockedDentist, 'patients.view')).toBe(false);
        expect(hasPermission(deletedAssistant, 'patients.view')).toBe(false);
        expect(hasPermission(deletedAssistant, 'patients.manage')).toBe(false);
    });

    it('treats missing account_status as legacy active (backward compat)', () => {
        const legacyShape = buildDentist({ account_status: undefined as unknown as 'active' });
        expect(hasPermission(legacyShape, 'patients.view')).toBe(true);
    });
});

describe('canView / canManage', () => {
    it('canManage short-circuits when subscription is read-only', () => {
        // Subscription read-only is the dentist's payment lapse / admin
        // pause — even a perfectly-permissioned user cannot mutate.
        const readOnlyDentist = buildDentist({
            subscription: {
                status: 'past_due',
                plan: 'pro',
                trial_ends_at: null,
                upload_max_mb: 8,
                stored_image_max_mb: 80,
                can_export: true,
                staff_limit: 5,
                entry_image_limit: 10,
                is_read_only: true,
            } as unknown as ApiUser['subscription'],
        });
        expect(canView(readOnlyDentist, 'patients')).toBe(true);
        expect(canManage(readOnlyDentist, 'patients')).toBe(false);
    });

    it('admin role bypasses subscription read-only', () => {
        // Admin is the SaaS operator — they manage the subscription itself,
        // so a read-only flag on a dentist's subscription doesn't apply to
        // the admin's actions.
        const admin = buildAdmin({
            subscription: {
                is_read_only: true,
            } as unknown as ApiUser['subscription'],
        });
        expect(canManage(admin, 'patients')).toBe(true);
    });
});

describe('canViewAnalytics', () => {
    it('returns true when any single view permission is granted (OR semantics)', () => {
        const patientsOnly = buildAssistant(['patients.view']);
        const paymentsOnly = buildAssistant(['payments.view']);
        const noPerms = buildAssistant([]);
        expect(canViewAnalytics(patientsOnly)).toBe(true);
        expect(canViewAnalytics(paymentsOnly)).toBe(true);
        expect(canViewAnalytics(noPerms)).toBe(false);
    });
});

describe('isSubscriptionReadOnly', () => {
    it('admin role bypasses read-only checks', () => {
        const admin = buildAdmin({
            subscription: { is_read_only: true } as ApiUser['subscription'],
        });
        expect(isSubscriptionReadOnly(admin)).toBe(false);
    });

    it('detects read-only on non-admin role', () => {
        const dentist = buildDentist({
            subscription: { is_read_only: true } as ApiUser['subscription'],
        });
        expect(isSubscriptionReadOnly(dentist)).toBe(true);
    });
});

describe('normalizeAssistantPermissions', () => {
    it('promotes manage to also include view (auto-dependency)', () => {
        const normalized = normalizeAssistantPermissions(['patients.manage']);
        expect(normalized).toContain('patients.view');
        expect(normalized).toContain('patients.manage');
    });

    it('drops unknown permission strings (defense against tampered payloads)', () => {
        const normalized = normalizeAssistantPermissions(['patients.view', 'arbitrary.string', 'super_admin']);
        expect(normalized).toEqual(['patients.view']);
    });

    it('handles null/undefined input gracefully', () => {
        expect(normalizeAssistantPermissions(null)).toEqual([]);
        expect(normalizeAssistantPermissions(undefined)).toEqual([]);
    });
});
