'use client';

import dynamic from 'next/dynamic';
import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getCurrentUser, getPatient } from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import { useI18n } from '@/components/providers/i18n-provider';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { PatientHistoryLoadingState } from '@/components/layout/page-loading-skeletons';
import { AppErrorState } from '@/components/error/app-error-state';
import { AccessDeniedState } from '@/components/error/access-denied-state';
import { canView, PERMISSION_DENIED_MESSAGE } from '@/lib/auth/permissions';

const TreatmentHistoryCard = dynamic(
    () => import('@/components/patients/treatment-history-card').then((module) => module.TreatmentHistoryCard),
    {
        ssr: false,
        loading: () => <Skeleton className="h-[28rem] w-full rounded-[1.75rem]" />,
    }
);

export default function PatientHistoryPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = use(params);
    const { t } = useI18n();
    const searchParams = useSearchParams();
    const from = searchParams.get('from');
    const backHref = from === 'payments' ? '/payments' : '/patients';
    const backLabel = from === 'payments' ? t('nav.payments') : t('nav.patients');
    const currentUserQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        staleTime: 5 * 60_000,
    });
    const canViewPatients = canView(currentUserQuery.data, 'patients');

    const patientQuery = useQuery({
        queryKey: ['patients', 'detail', id],
        queryFn: () => getPatient(id),
        enabled: canViewPatients,
        retry: false,
        staleTime: 30_000,
    });

    if (currentUserQuery.isLoading || patientQuery.isLoading) {
        return <PatientHistoryLoadingState />;
    }

    if (!canViewPatients) {
        return (
            <AccessDeniedState
                title={t('common.forbiddenTitle')}
                description={PERMISSION_DENIED_MESSAGE}
                actionHref={backHref}
                actionLabel={backLabel}
            />
        );
    }

    if (currentUserQuery.isError || patientQuery.isError || !patientQuery.data) {
        return (
            <AppErrorState
                title={t('common.loadErrorTitle')}
                description={getApiErrorMessage(currentUserQuery.error || patientQuery.error, t('patientDetail.error.loadFailed'))}
                retryLabel={t('common.retry')}
                onRetry={() => {
                    currentUserQuery.refetch();
                    patientQuery.refetch();
                }}
                backHref={backHref}
                backLabel={backLabel}
            />
        );
    }

    const patient = patientQuery.data;

    return (
        <div className="space-y-6">
            <PageHeader
                title={patient.full_name}
                description={t('patientHistory.subtitle')}
                actions={(
                    <Link href={backHref}>
                        <Button variant="outline">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            {backLabel}
                        </Button>
                    </Link>
                )}
            />

            <TreatmentHistoryCard patientId={id} patientName={patient.full_name} />
        </div>
    );
}
