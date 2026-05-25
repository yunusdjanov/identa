'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-shell';
import { getApiErrorMessage } from '@/lib/api/client';
import { getCurrentUser, getDashboardSnapshot, listPatients, listAllTreatments } from '@/lib/api/dentist';
import type { ApiAppointment, ApiPatient, ApiTreatment } from '@/lib/api/types';
import { useI18n } from '@/components/providers/i18n-provider';
import { AppErrorState } from '@/components/error/app-error-state';
import { AccessDeniedState } from '@/components/error/access-denied-state';
import { canView, PERMISSION_DENIED_MESSAGE } from '@/lib/auth/permissions';
import { RouteDashboardLoadingState } from '@/components/layout/page-loading-skeletons';
import {
    AppointmentStatusChart,
    PatientGrowthChart,
    RevenueChart,
    TopDebtorsCard,
} from '@/components/dashboard/dashboard-charts';
import { extractPrimaryPhone } from '@/lib/utils';
import { apiClient } from '@/lib/api/client';
import type { ApiEnvelope } from '@/lib/api/types';

function monthKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(date: Date): string {
    return date.toLocaleString('en-US', { month: 'short' });
}

function build6Months(now: Date): Array<{ key: string; label: string; date: Date }> {
    return Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        return { key: monthKey(d), label: monthLabel(d), date: d };
    });
}

async function listAllAppointments(): Promise<ApiAppointment[]> {
    const { data } = await apiClient.get<ApiEnvelope<ApiAppointment[]>>('/appointments', {
        params: { per_page: 500 },
    });
    return data.data ?? [];
}

export default function AnalyticsPage() {
    const { t } = useI18n();

    const currentUserQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
    });
    const currentUser = currentUserQuery.data;
    const canViewPayments = canView(currentUser, 'payments');
    const canViewPatients = canView(currentUser, 'patients');
    const canViewAppointments = canView(currentUser, 'appointments');

    const treatmentsQuery = useQuery({
        queryKey: ['analytics', 'treatments'],
        queryFn: () => listAllTreatments({ sort: '-treatment_date,-created_at', includeImages: false }),
        enabled: canViewPayments,
    });

    const patientsQuery = useQuery({
        queryKey: ['analytics', 'patients'],
        queryFn: () => listPatients({ page: 1, perPage: 500, sortBy: '-created_at' }),
        enabled: canViewPatients,
    });

    const appointmentsQuery = useQuery({
        queryKey: ['analytics', 'appointments'],
        queryFn: listAllAppointments,
        enabled: canViewAppointments,
    });

    const snapshotQuery = useQuery({
        queryKey: ['dashboard', 'snapshot'],
        queryFn: () => getDashboardSnapshot({ includeFinancials: true }),
        enabled: canViewPayments,
    });

    const now = useMemo(() => new Date(), []);
    const months = useMemo(() => build6Months(now), [now]);

    const revenueByMonth = useMemo(() => {
        const treatments = treatmentsQuery.data ?? [];
        return months.map(({ key, label, date }) => {
            const inMonth = treatments.filter((tr) => {
                if (!tr.treatment_date) return false;
                const d = new Date(tr.treatment_date);
                return monthKey(d) === key;
            });
            const revenue = inMonth.reduce((sum, tr) => sum + Number(tr.paid_amount ?? 0), 0);
            const debt = inMonth.reduce((sum, tr) => sum + Number(tr.debt_amount ?? 0), 0);
            return { month: label, revenue, debt };
        });
    }, [treatmentsQuery.data, months]);

    const patientGrowth = useMemo(() => {
        const patients = patientsQuery.data?.data ?? [];
        return months.map(({ key, label, date }) => {
            const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
            const newInMonth = patients.filter((p: ApiPatient) => {
                if (!p.created_at) return false;
                const d = new Date(p.created_at);
                return monthKey(d) === key;
            }).length;
            const total = patients.filter((p: ApiPatient) => {
                if (!p.created_at) return false;
                return new Date(p.created_at) <= endOfMonth;
            }).length;
            return { month: label, total, new: newInMonth };
        });
    }, [patientsQuery.data, months]);

    const appointmentStatus = useMemo(() => {
        const appointments = appointmentsQuery.data ?? [];
        const counts: Record<string, number> = { scheduled: 0, completed: 0, cancelled: 0, no_show: 0 };
        for (const apt of appointments) {
            const status = apt.status as keyof typeof counts;
            if (status in counts) counts[status] = (counts[status] ?? 0) + 1;
        }
        return Object.entries(counts).map(([status, count]) => ({ status: status as ApiAppointment['status'], count }));
    }, [appointmentsQuery.data]);

    const topDebtors = useMemo(() => {
        const treatments = treatmentsQuery.data ?? [];
        const grouped: Record<string, { name: string; phone: string; debt: number }> = {};
        for (const tr of treatments) {
            const debtAmount = Number(tr.debt_amount ?? 0) - Number(tr.paid_amount ?? 0);
            if (debtAmount <= 0) continue;
            const patientId = tr.patient_id ?? 'unknown';
            const existing = grouped[patientId] ?? {
                name: tr.patient_name ?? '—',
                phone: extractPrimaryPhone(tr.patient_phone ?? '') || '',
                debt: 0,
            };
            existing.debt += debtAmount;
            grouped[patientId] = existing;
        }
        return Object.values(grouped)
            .sort((a, b) => b.debt - a.debt)
            .slice(0, 5);
    }, [treatmentsQuery.data]);

    if (currentUserQuery.isLoading) {
        return <RouteDashboardLoadingState />;
    }

    if (!canViewPayments && !canViewPatients && !canViewAppointments) {
        return <AccessDeniedState description={PERMISSION_DENIED_MESSAGE} />;
    }

    if (currentUserQuery.isError) {
        return (
            <AppErrorState
                title={t('analytics.title')}
                description={getApiErrorMessage(currentUserQuery.error, '')}
                onRetry={() => currentUserQuery.refetch()}
            />
        );
    }

    const isAnyLoading =
        treatmentsQuery.isLoading
        || patientsQuery.isLoading
        || appointmentsQuery.isLoading
        || snapshotQuery.isLoading;

    if (isAnyLoading) {
        return <RouteDashboardLoadingState />;
    }

    return (
        <div className="space-y-5 lg:space-y-6">
            <PageHeader title={t('analytics.title')} description={t('analytics.subtitle')} />

            {canViewPayments && canViewAppointments ? (
                <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-3">
                    <div className="lg:col-span-2">
                        <RevenueChart data={revenueByMonth} />
                    </div>
                    <AppointmentStatusChart data={appointmentStatus} />
                </div>
            ) : null}

            {canViewPatients && canViewPayments ? (
                <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                    <PatientGrowthChart data={patientGrowth} />
                    <TopDebtorsCard data={topDebtors} />
                </div>
            ) : null}
        </div>
    );
}
