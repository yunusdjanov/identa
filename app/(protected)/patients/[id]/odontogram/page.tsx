'use client';

import { use, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-shell';
import { OdontogramLoadingState } from '@/components/layout/page-loading-skeletons';
import {
    getCurrentUser,
    getPatient,
    listAllPatientTreatments,
} from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import type { ApiTreatment } from '@/lib/api/types';
import { ArrowLeft } from 'lucide-react';
import { ToothDetailDialog } from '@/components/odontogram/tooth-detail-dialog';
import { useI18n } from '@/components/providers/i18n-provider';
import { AppErrorState } from '@/components/error/app-error-state';
import { AccessDeniedState } from '@/components/error/access-denied-state';
import { canView } from '@/lib/auth/permissions';
import { formatToothNumber, TOOTH_LAYOUT } from '@/lib/tooth-numbering';
import { queryKeys } from '@/lib/query-keys';

export default function OdontogramPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = use(params);
    const { t } = useI18n();
    const router = useRouter();
    const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
    const currentUserQuery = useQuery({
        queryKey: queryKeys.auth.me(),
        queryFn: getCurrentUser,
        staleTime: 5 * 60_000,
    });
    const canViewPatients = canView(currentUserQuery.data, 'patients');

    const patientQuery = useQuery({
        queryKey: queryKeys.patients.detail(id),
        queryFn: () => getPatient(id),
        enabled: canViewPatients,
        retry: false,
    });
    const treatmentsQuery = useQuery({
        queryKey: queryKeys.patients.detail(id, 'treatments', 'odontogram'),
        queryFn: () => listAllPatientTreatments(id, {
            sort: '-treatment_date,-created_at',
            includeImages: false,
        }),
        enabled: canViewPatients,
        staleTime: 30_000,
        gcTime: 300_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        placeholderData: (previousData) => previousData,
    });

    const treatmentsByTooth = useMemo(() => {
        const map = new Map<number, ApiTreatment[]>();

        for (const treatment of treatmentsQuery.data ?? []) {
            const linkedTeeth = new Set<number>();

            for (const tooth of treatment.teeth ?? []) {
                if (Number.isFinite(tooth) && tooth >= 1 && tooth <= 32) {
                    linkedTeeth.add(tooth);
                }
            }

            if (
                typeof treatment.tooth_number === 'number'
                && Number.isFinite(treatment.tooth_number)
                && treatment.tooth_number >= 1
                && treatment.tooth_number <= 32
            ) {
                linkedTeeth.add(treatment.tooth_number);
            }

            for (const toothNumber of linkedTeeth) {
                const current = map.get(toothNumber) ?? [];
                current.push(treatment);
                map.set(toothNumber, current);
            }
        }

        for (const [toothNumber, treatments] of map.entries()) {
            const sorted = [...treatments].sort((a, b) => {
                const dateCompare = (b.treatment_date ?? '').localeCompare(a.treatment_date ?? '');
                if (dateCompare !== 0) {
                    return dateCompare;
                }
                return (b.created_at ?? '').localeCompare(a.created_at ?? '');
            });
            map.set(toothNumber, sorted);
        }

        return map;
    }, [treatmentsQuery.data]);

    if (currentUserQuery.isLoading || patientQuery.isLoading || treatmentsQuery.isLoading) {
        return <OdontogramLoadingState />;
    }

    if (currentUserQuery.isError) {
        return (
            <AppErrorState
                title={t('common.loadErrorTitle')}
                description={getApiErrorMessage(
                    currentUserQuery.error || patientQuery.error || treatmentsQuery.error,
                    t('odontogram.loadFailed')
                )}
                retryLabel={t('common.retry')}
                onRetry={() => {
                    currentUserQuery.refetch();
                    patientQuery.refetch();
                    treatmentsQuery.refetch();
                }}
                backHref="/patients"
                backLabel={t('patientDetail.backToPatients')}
            />
        );
    }

    if (!canViewPatients) {
        return (
            <AccessDeniedState
                title={t('common.forbiddenTitle')}
                description={t('permissions.deniedDescription')}
                actionHref="/patients"
                actionLabel={t('patientDetail.backToPatients')}
            />
        );
    }

    if (patientQuery.isError || treatmentsQuery.isError || !patientQuery.data) {
        return (
            <AppErrorState
                title={t('common.loadErrorTitle')}
                description={getApiErrorMessage(
                    patientQuery.error || treatmentsQuery.error,
                    t('odontogram.loadFailed')
                )}
                retryLabel={t('common.retry')}
                onRetry={() => {
                    patientQuery.refetch();
                    treatmentsQuery.refetch();
                }}
                backHref="/patients"
                backLabel={t('patientDetail.backToPatients')}
            />
        );
    }

    const patient = patientQuery.data;

    const renderTooth = (toothNumber: number) => {
        const toothTreatments = treatmentsByTooth.get(toothNumber) ?? [];
        const historyCount = toothTreatments.length;
        const hasHistory = historyCount > 0;
        const isSelected = selectedTooth === toothNumber;
        const toothLabel = formatToothNumber(toothNumber);

        return (
            <button
                key={toothNumber}
                onClick={() => setSelectedTooth(toothNumber)}
                className={`
          relative w-8 h-12 sm:w-10 sm:h-14 md:w-12 md:h-16 rounded-lg border-2 transition-all
          hover:scale-105 cursor-pointer
          ${hasHistory
              ? 'border-teal-500 bg-gradient-to-b from-teal-100 to-teal-200 shadow-sm shadow-teal-300/60 hover:border-teal-600 hover:from-teal-200 hover:to-teal-300'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}
          ${isSelected
              ? 'ring-2 ring-teal-600 ring-offset-2 border-teal-600 shadow-md shadow-teal-400/40 scale-105'
              : ''}
        `}
                title={t('odontogram.toothTitle', { toothNumber: toothLabel })}
            >
                <span className={`absolute inset-0 flex items-center justify-center text-[10px] sm:text-xs font-bold ${hasHistory ? 'text-teal-800' : 'text-slate-600'}`}>
                    {toothLabel}
                </span>
                {hasHistory ? (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-teal-600 px-1 text-[11px] font-semibold text-white shadow-sm">
                        {historyCount}
                    </span>
                ) : null}
            </button>
        );
    };

    return (
        <div className="space-y-5 lg:space-y-6">
            <PageHeader
                title={t('odontogram.title')}
                description={patient.full_name}
                actions={(
                    <Button variant="outline" onClick={() => router.push(`/patients/${id}`)}>
                        <ArrowLeft className="w-4 h-4" />
                        {t('patientDetail.backToPatients')}
                    </Button>
                )}
            />

            <Card>
                <CardHeader>
                    <CardTitle>{t('odontogram.chartTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
        <div className="space-y-5 lg:space-y-6">
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-slate-600 text-center">{t('odontogram.upperJaw')}</p>
                            <div data-testid="odontogram-upper-jaw-scroll" className="overflow-x-auto pb-2 no-scrollbar">
                                <div className="flex w-max min-w-full justify-center space-x-4 px-1 sm:space-x-6 md:space-x-8">
                                    <div>
                                        <p className="text-xs text-slate-500 text-center mb-2">{t('odontogram.upperRight')}</p>
                                        <div className="flex gap-0.5 sm:gap-1">
                                            {TOOTH_LAYOUT.upperRight.map((num) => renderTooth(num))}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 text-center mb-2">{t('odontogram.upperLeft')}</p>
                                        <div className="flex gap-0.5 sm:gap-1">
                                            {TOOTH_LAYOUT.upperLeft.map((num) => renderTooth(num))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="border-t-2 border-slate-300"></div>

                        <div className="space-y-2">
                            <p className="text-sm font-medium text-slate-600 text-center">{t('odontogram.lowerJaw')}</p>
                            <div data-testid="odontogram-lower-jaw-scroll" className="overflow-x-auto pb-2 no-scrollbar">
                                <div className="flex w-max min-w-full justify-center space-x-4 px-1 sm:space-x-6 md:space-x-8">
                                    <div>
                                        <p className="text-xs text-slate-500 text-center mb-2">{t('odontogram.lowerRight')}</p>
                                        <div className="flex gap-0.5 sm:gap-1">
                                            {TOOTH_LAYOUT.lowerRight.map((num) => renderTooth(num))}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 text-center mb-2">{t('odontogram.lowerLeft')}</p>
                                        <div className="flex gap-0.5 sm:gap-1">
                                            {TOOTH_LAYOUT.lowerLeft.map((num) => renderTooth(num))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <p className="text-xs text-slate-500 text-center mt-6">
                        {t('patientHistory.subtitle')}
                    </p>
                </CardContent>
            </Card>

            {selectedTooth !== null ? (
                <ToothDetailDialog
                    open={selectedTooth !== null}
                    onOpenChange={(open) => !open && setSelectedTooth(null)}
                    patientId={id}
                    toothNumber={selectedTooth}
                    treatments={treatmentsByTooth.get(selectedTooth) ?? []}
                />
            ) : null}
        </div>
    );
}
