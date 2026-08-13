import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RouteTitleSync } from '@/components/layout/route-title-sync';

let pathname = '/dashboard';
let translations: Record<string, string> = {};

vi.mock('next/navigation', () => ({
    usePathname: () => pathname,
}));

vi.mock('@/components/providers/i18n-provider', () => ({
    useI18n: () => ({
        locale: 'en',
        t: (key: string) => translations[key] ?? key,
    }),
}));

afterEach(() => cleanup());

describe('RouteTitleSync', () => {
    it.each([
        ['/dashboard', 'Dashboard'],
        ['/patients', 'Patients'],
        ['/patients/42', 'Patients'],
        ['/patients/42/history', 'Work History'],
        ['/patients/42/odontogram', 'Odontogram'],
        ['/payments/patients/42', 'Patient payments'],
    ])('uses a private, non-identifying protected title for %s', async (path, title) => {
        pathname = path;
        translations = {
            'dashboard.title': 'Dashboard',
            'patients.title': 'Patients',
            'patientHistory.title': 'Work History',
            'odontogram.title': 'Odontogram',
            'payments.patientLedger.exportTitle': 'Patient payments',
        };

        render(<RouteTitleSync scope="protected" />);
        await waitFor(() => expect(document.title).toBe(`${title} | Identa`));
    });

    it.each([
        ['/admin/login', 'Admin Sign In'],
        ['/admin', 'Super Admin Dashboard'],
        ['/admin/analytics', 'Analytics'],
        ['/admin/dentists/42/staff', 'Staff'],
        ['/admin/dentists/42/billing', 'Billing'],
    ])('uses a section-specific admin title for %s', async (path, title) => {
        pathname = path;
        translations = {
            'admin.login.signInTitle': 'Admin Sign In',
            'admin.dashboardTitle': 'Super Admin Dashboard',
            'admin.analyticsTitle': 'Analytics',
            'staff.title': 'Staff',
            'billing.title': 'Billing',
        };

        render(<RouteTitleSync scope="admin" />);
        await waitFor(() => expect(document.title).toBe(`${title} | Identa`));
    });
});
