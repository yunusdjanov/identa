type QueryKeyPart = string | number | boolean | null | undefined | Record<string, unknown>;

function key<const TParts extends readonly QueryKeyPart[]>(...parts: TParts): TParts {
    return parts;
}

export const queryKeys = {
    auth: {
        all: () => key('auth'),
        me: () => key('auth', 'me'),
    },
    admin: {
        all: () => key('admin'),
        analyticsAll: () => key('admin', 'analytics'),
        analytics: (filters: Record<string, unknown>) => key('admin', 'analytics', filters),
        auditLogs: () => key('admin', 'audit-logs'),
        dentists: {
            all: () => key('admin', 'dentists'),
            list: (...parts: readonly QueryKeyPart[]) => key('admin', 'dentists', ...parts),
            detail: (dentistId: string) => key('admin', 'dentists', dentistId),
            billing: (dentistId: string) => key('admin', 'dentists', dentistId, 'billing'),
            staff: (dentistId: string) => key('admin', 'dentists', dentistId, 'staff'),
            auditLogs: (dentistId: string) => key('admin', 'dentists', dentistId, 'audit-logs'),
        },
        plans: {
            all: () => key('admin', 'plans'),
        },
        payments: {
            all: () => key('admin', 'payments'),
            list: (...parts: readonly QueryKeyPart[]) => key('admin', 'payments', ...parts),
        },
    },
    billing: {
        all: () => key('billing'),
        plans: () => key('billing', 'plans'),
        currentSubscription: () => key('billing', 'current-subscription'),
        payments: () => key('billing', 'payments'),
    },
    settings: {
        all: () => key('settings'),
        profile: () => key('settings', 'profile'),
        teamAssistants: (...parts: readonly QueryKeyPart[]) =>
            key('settings', 'team-assistants', ...parts),
        auditLogs: (...parts: readonly QueryKeyPart[]) =>
            key('settings', 'audit-logs', ...parts),
    },
    patients: {
        all: () => key('patients'),
        list: (...parts: readonly QueryKeyPart[]) => key('patients', 'list', ...parts),
        recent: () => key('patients', 'recent'),
        lookup: (...parts: readonly QueryKeyPart[]) => key('patients', 'lookup', ...parts),
        detail: (patientId: string, ...parts: readonly QueryKeyPart[]) =>
            key('patients', 'detail', patientId, ...parts),
        overview: (patientId: string, ...parts: readonly QueryKeyPart[]) =>
            key('patients', 'detail', patientId, 'overview', ...parts),
        treatments: (patientId: string) => key('patients', 'detail', patientId, 'treatments'),
        treatment: (patientId: string, treatmentId: string) =>
            key('patients', 'detail', patientId, 'treatments', treatmentId),
    },
    patientCategories: {
        all: () => key('patient-categories'),
        list: () => key('patient-categories', 'list'),
    },
    appointments: {
        all: () => key('appointments'),
        list: (...parts: readonly QueryKeyPart[]) => key('appointments', 'list', ...parts),
        configuration: () => key('appointments', 'configuration'),
        availability: (date: string) => key('appointments', 'availability', date),
    },
    analytics: {
        all: () => key('analytics'),
        summary: (filters: Record<string, unknown>) => key('analytics', 'summary', filters),
    },
    payments: {
        all: () => key('payments'),
        ledger: {
            all: () => key('payments', 'ledger'),
            patients: (...parts: readonly QueryKeyPart[]) => key('payments', 'ledger', 'patients', ...parts),
            patient: (patientId: string) => key('payments', 'ledger', 'patient', patientId),
        },
        expenses: {
            all: () => key('payments', 'expenses'),
            list: (...parts: readonly QueryKeyPart[]) => key('payments', 'expenses', ...parts),
        },
    },
    dashboard: {
        all: () => key('dashboard'),
    },
} as const;
