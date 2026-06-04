import type { ApiUser } from '@/lib/api/types';

const STAFF_PERMISSIONS = [
    'patients.view',
    'patients.manage',
    'appointments.view',
    'appointments.manage',
    'payments.view',
    'payments.manage',
] as const;

type StaffPermission = (typeof STAFF_PERMISSIONS)[number];
type PermissionModule = 'patients' | 'appointments' | 'payments';

type PermissionsTranslator = (key: string) => string;

const MODULE_PERMISSIONS: Record<PermissionModule, { view: StaffPermission; manage: StaffPermission }> = {
    patients: {
        view: 'patients.view',
        manage: 'patients.manage',
    },
    appointments: {
        view: 'appointments.view',
        manage: 'appointments.manage',
    },
    payments: {
        view: 'payments.view',
        manage: 'payments.manage',
    },
};

const MANAGE_DEPENDENCIES: Record<StaffPermission, StaffPermission | null> = {
    'patients.view': null,
    'patients.manage': 'patients.view',
    'appointments.view': null,
    'appointments.manage': 'appointments.view',
    'payments.view': null,
    'payments.manage': 'payments.view',
};

export function normalizeAssistantPermissions(permissions: string[] | undefined | null): StaffPermission[] {
    const permissionSet = new Set<StaffPermission>();

    (permissions ?? []).forEach((permission) => {
        if (!isStaffPermission(permission)) {
            return;
        }

        permissionSet.add(permission);
        const viewPermission = MANAGE_DEPENDENCIES[permission];
        if (viewPermission) {
            permissionSet.add(viewPermission);
        }
    });

    Object.entries(MANAGE_DEPENDENCIES).forEach(([permission, viewPermission]) => {
        if (viewPermission && !permissionSet.has(viewPermission)) {
            permissionSet.delete(permission as StaffPermission);
        }
    });

    return STAFF_PERMISSIONS.filter((permission) => permissionSet.has(permission));
}

function isStaffPermission(permission: string): permission is StaffPermission {
    return (STAFF_PERMISSIONS as readonly string[]).includes(permission);
}

export function hasPermission(user: ApiUser | null | undefined, permission: StaffPermission): boolean {
    if (!user) {
        return false;
    }

    // A blocked or soft-deleted assistant whose `/auth/me` still echoes the
    // legacy session payload (token cascade in flight, or stale cache from
    // before the dentist owner was blocked) would otherwise pass every
    // permission check and briefly see protected UI. Backend mutations are
    // already guarded by EnsureRole/EnsureAccessChain, but the UI should
    // also degrade gracefully — no "you can edit" affordances should appear
    // when the underlying account is not in good standing.
    if (user.account_status && user.account_status !== 'active') {
        return false;
    }

    if (user.role === 'admin' || user.role === 'dentist') {
        return true;
    }

    if (user.role !== 'assistant') {
        return false;
    }

    return normalizeAssistantPermissions(user.assistant_permissions).includes(permission);
}

export function canView(user: ApiUser | null | undefined, module: PermissionModule): boolean {
    return hasPermission(user, MODULE_PERMISSIONS[module].view);
}

export function canManage(user: ApiUser | null | undefined, module: PermissionModule): boolean {
    if (isSubscriptionReadOnly(user)) {
        return false;
    }

    return hasPermission(user, MODULE_PERMISSIONS[module].manage);
}

export function getModuleForPath(pathname: string): PermissionModule | null {
    if (pathname.startsWith('/patients')) {
        return 'patients';
    }
    if (pathname.startsWith('/appointments')) {
        return 'appointments';
    }
    if (pathname.startsWith('/payments')) {
        return 'payments';
    }

    return null;
}

/**
 * Is the user allowed to open /analytics? Analytics aggregates payments,
 * patients, and appointments — granting access if ANY of those view
 * permissions is granted. Returns `true` for dentist/admin without
 * checking individual permissions (they always pass).
 *
 * Used by the nav-link locked-state and the page-level `AccessDeniedState`
 * gate to stay in sync. Without it, the analytics nav link was always
 * unlocked, sending zero-permission assistants to a blank-ish page.
 */
export function canViewAnalytics(user: ApiUser | null | undefined): boolean {
    return canView(user, 'patients')
        || canView(user, 'appointments')
        || canView(user, 'payments');
}

export function isSubscriptionReadOnly(user: ApiUser | null | undefined): boolean {
    return user?.role !== 'admin' && user?.subscription?.is_read_only === true;
}

export function getManageDeniedMessage(user: ApiUser | null | undefined, t: PermissionsTranslator): string {
    return t(isSubscriptionReadOnly(user) ? 'permissions.readOnlyDeniedDescription' : 'permissions.deniedDescription');
}
