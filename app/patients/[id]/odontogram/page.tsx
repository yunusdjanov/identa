'use client';

import { use, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-shell';
import { Skeleton } from '@/components/ui/skeleton';
import {
    getPatient,
    listAllPatientTreatments,
} from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import type { ApiTreatment } from '@/lib/api/types';
import { ArrowLeft } from 'lucide-react';
import { ToothDetailDialog } from '@/components/odontogram/tooth-detail-dialog';
import { useI18n } from '@/components/providers/i18n-provider';

function OdontogramLoadingSkeleton() {
    return (
        <div className="space-y-8">
            <div className="flex items-center space-x-4">
                <Skeleton className="h-9 w-9" />
                <div className="space-y-2">
                    <Skeleton className="h-9 w-40" />
                    <Skeleton className="h-4 w-56" />
                </div>
            </div>

            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-64" />
                </CardHeader>
                <CardContent className="space-y-6">
                    {Array.from({ length: 2 }).map((_, sectionIndex) => (
                        <div key={sectionIndex} className="space-y-3">
                            <Skeleton className="h-4 w-24 mx-auto" />
                            <div className="flex justify-center gap-1">
                                {Array.from({ length: 16 }).map((__, toothIndex) => (
                                    <Skeleton key={toothIndex} className="h-12 w-8 rounded-lg" />
                                ))}
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}

export default function OdontogramPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = use(params);
    const { t } = useI18n();
    const router = useRouter();
    const [selectedTooth, setSelectedTooth] = useState<number | null>(null);

    const patientQuery = useQuery({
        queryKey: ['patients', 'detail', id],
        queryFn: () => getPatient(id),
        retry: false,
    });
    const treatmentsQuery = useQuery({
        queryKey: ['patients', 'detail', id, 'treatments', 'odontogram'],
        queryFn: () => listAllPatientTreatments(id, {
            sort: '-treatment_date,-created_at',
            includeImages: false,
        }),
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

    if (patientQuery.isLoading || treatmentsQuery.isLoading) {
        return <OdontogramLoadingSkeleton />;
    }

    if (patientQuery.isError || treatmentsQuery.isError || !patientQuery.data) {
        return (
            <div className="space-y-4">
                <p className="text-sm text-red-600">
                    {getApiErrorMessage(
                        patientQuery.error || treatmentsQuery.error,
                        t('odontogram.loadFailed')
                    )}
                </p>
                <Button
                    variant="outline"
                    onClick={() => {
                        patientQuery.refetch();
                        treatmentsQuery.refetch();
                    }}
                >
                    {t('common.retry')}
                </Button>
            </div>
        );
    }

    const renderTooth = (toothNumber: number) => {
        const toothTreatments = treatmentsByTooth.get(toothNumber) ?? [];
        const historyCount = toothTreatments.length;
        const hasHistory = historyCount > 0;
        const isSelected = selectedTooth === toothNumber;

        return (
            <button
                key={toothNumber}
                onClick={() => setSelectedTooth(toothNumber)}
                className={`
          relative w-8 h-12 sm:w-10 sm:h-14 md:w-12 md:h-16 rounded-lg border-2 transition-all
          hover:scale-105 hover:shadow-md cursor-pointer
          ${
    hasHistory
        ? 'border-blue-300 bg-blue-50 text-blue-900 hover:border-blue-400 hover:bg-blue-100'
        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
}
          ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1 border-blue-500' : ''}
        `}
                title={t('odontogram.toothTitle', { toothNumber })}
            >
                <span className="absolute inset-0 flex items-center justify-center text-[10px] sm:text-xs font-bold text-gray-700">
                    {toothNumber}
                </span>
                {hasHistory ? (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-sky-600 px-1 text-[9px] font-semibold text-white">
                        {historyCount}
                    </span>
                ) : null}
            </button>
        );
    };

    return (
        <div className="space-y-8">
            <PageHeader
                title={t('odontogram.title')}
                description={patientQuery.data.full_name}
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
                    <div className="space-y-8">
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-gray-600 text-center">{t('odontogram.upperJaw')}</p>
                            <div className="flex justify-center space-x-4 sm:space-x-6 md:space-x-8">
                                <div>
                                    <p className="text-xs text-gray-500 text-center mb-2">{t('odontogram.upperRight')}</p>
                                    <div className="flex gap-0.5 sm:gap-1">
                                        {[8, 7, 6, 5, 4, 3, 2, 1].map((num) => renderTooth(num))}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 text-center mb-2">{t('odontogram.upperLeft')}</p>
                                    <div className="flex gap-0.5 sm:gap-1">
                                        {[9, 10, 11, 12, 13, 14, 15, 16].map((num) => renderTooth(num))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="border-t-2 border-gray-300"></div>

                        <div className="space-y-2">
                            <p className="text-sm font-medium text-gray-600 text-center">{t('odontogram.lowerJaw')}</p>
                            <div className="flex justify-center space-x-4 sm:space-x-6 md:space-x-8">
                                <div>
                                    <p className="text-xs text-gray-500 text-center mb-2">{t('odontogram.lowerRight')}</p>
                                    <div className="flex gap-0.5 sm:gap-1">
                                        {[32, 31, 30, 29, 28, 27, 26, 25].map((num) => renderTooth(num))}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 text-center mb-2">{t('odontogram.lowerLeft')}</p>
                                    <div className="flex gap-0.5 sm:gap-1">
                                        {[17, 18, 19, 20, 21, 22, 23, 24].map((num) => renderTooth(num))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <p className="text-xs text-gray-500 text-center mt-6">
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
