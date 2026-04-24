'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getPatient } from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import { useI18n } from '@/components/providers/i18n-provider';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { TreatmentHistoryCard } from '@/components/patients/treatment-history-card';

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

    const patientQuery = useQuery({
        queryKey: ['patients', 'detail', id],
        queryFn: () => getPatient(id),
        retry: false,
        staleTime: 30_000,
    });

    if (patientQuery.isLoading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="space-y-2">
                        <Skeleton className="h-9 w-64" />
                        <Skeleton className="h-4 w-80" />
                    </div>
                    <Skeleton className="h-9 w-40" />
                </div>
                <Skeleton className="h-[28rem] w-full rounded-xl" />
            </div>
        );
    }

    if (patientQuery.isError || !patientQuery.data) {
        return (
            <div className="space-y-4">
                <p className="text-sm text-red-600">
                    {getApiErrorMessage(patientQuery.error, t('patientDetail.error.loadFailed'))}
                </p>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => patientQuery.refetch()}>
                        {t('common.retry')}
                    </Button>
                    <Link href={backHref}>
                        <Button variant="outline">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            {backLabel}
                        </Button>
                    </Link>
                </div>
            </div>
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
