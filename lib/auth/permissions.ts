import type { ApiUser } from '@/lib/api/types';

export const STAFF_PERMISSIONS = [
    'patients.view',
    'patients.manage',
    'appointments.view',
    'appointments.manage',
    'payments.view',
    'payments.manage',
] as const;

export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];
export type PermissionModule = 'patients' | 'appointments' | 'payments';

export const READ_ONLY_DENIED_MESSAGE = "Tarif muddati tugagan. Ma'lumotlarni o'zgartirish uchun tarifni yangilang.";

export const PERMISSION_DENIED_MESSAGE = 'Sizda bu bo‘limga kirish uchun ruxsat yo‘q.';

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

export function isStaffPermission(permission: string): permission is StaffPermission {
    return (STAFF_PERMISSIONS as readonly string[]).includes(permission);
}

export function hasPermission(user: ApiUser | null | undefined, permission: StaffPermission): boolean {
    if (!user) {
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

export function isSubscriptionReadOnly(user: ApiUser | null | undefined): boolean {
    return user?.role !== 'admin' && user?.subscription?.is_read_only === true;
}

export function getManageDeniedMessage(user: ApiUser | null | undefined): string {
    return isSubscriptionReadOnly(user) ? READ_ONLY_DENIED_MESSAGE : PERMISSION_DENIED_MESSAGE;
}
