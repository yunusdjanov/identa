'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/components/providers/i18n-provider';

function resolveProtectedTitleKey(pathname: string): string {
    if (pathname.startsWith('/payments/patients/')) return 'payments.patientLedger.exportTitle';
    if (pathname.startsWith('/patients/') && pathname.endsWith('/odontogram')) return 'odontogram.title';
    if (pathname.startsWith('/patients/') && pathname.endsWith('/history')) return 'patientHistory.title';
    if (pathname.startsWith('/patients/')) return 'patients.title';
    if (pathname.startsWith('/patients')) return 'patients.title';
    if (pathname.startsWith('/appointments')) return 'appointments.title';
    if (pathname.startsWith('/payments')) return 'payments.title';
    if (pathname.startsWith('/analytics')) return 'analytics.title';
    if (pathname.startsWith('/settings')) return 'settings.title';
    if (pathname.startsWith('/billing')) return 'billing.title';
    if (pathname.startsWith('/staff')) return 'staff.title';
    return 'dashboard.title';
}

function resolveAdminTitleKey(pathname: string): string {
    if (pathname === '/admin/login') return 'admin.login.signInTitle';
    if (pathname.startsWith('/admin/analytics')) return 'admin.analyticsTitle';
    if (pathname.startsWith('/admin/payments')) return 'admin.paymentsTitle';
    if (pathname.startsWith('/admin/plans')) return 'admin.plans.title';
    if (pathname.startsWith('/admin/settings')) return 'admin.settings.title';
    if (pathname.includes('/staff')) return 'staff.title';
    if (pathname.includes('/billing')) return 'billing.title';
    return 'admin.dashboardTitle';
}

export function RouteTitleSync({ scope }: { scope: 'protected' | 'admin' }) {
    const pathname = usePathname();
    const { locale, t } = useI18n();

    useEffect(() => {
        const key = scope === 'admin'
            ? resolveAdminTitleKey(pathname)
            : resolveProtectedTitleKey(pathname);
        const title = t(key);
        document.title = `${title} | Identa`;
    }, [locale, pathname, scope, t]);

    return null;
}
