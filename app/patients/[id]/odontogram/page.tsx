'use client';

import { use, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    getPatient,
    listAllPatientOdontogram,
} from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import type { ApiOdontogramEntry } from '@/lib/api/types';
import { getToothConditionColor } from '@/lib/utils';
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
                    <Skeleton className="h-6 w-52" />
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                        {Array.from({ length: 7 }).map((_, index) => (
                            <Skeleton key={index} className="h-6 w-20 rounded-full" />
                        ))}
                    </div>
                    <Skeleton className="h-4 w-80" />
                </CardContent>
            </Card>

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
    const odontogramQuery = useQuery({
        queryKey: ['patients', 'odontogram', id],
        queryFn: () => listAllPatientOdontogram(id),
    });

    const entriesByTooth = useMemo(() => {
        const map = new Map<number, ApiOdontogramEntry[]>();
        for (const entry of odontogramQuery.data ?? []) {
            const current = map.get(entry.tooth_number) ?? [];
            current.push(entry);
            map.set(entry.tooth_number, current);
        }
        return map;
    }, [odontogramQuery.data]);

    const latestConditionByTooth = useMemo(() => {
        const map = new Map<number, string>();

        for (const [toothNumber, entries] of entriesByTooth.entries()) {
            const latest = [...entries].sort((a, b) => {
                const left = `${a.condition_date}-${a.created_at ?? ''}`;
                const right = `${b.condition_date}-${b.created_at ?? ''}`;
                return right.localeCompare(left);
            })[0];
            map.set(toothNumber, latest?.condition_type ?? 'healthy');
        }

        return map;
    }, [entriesByTooth]);

    if (patientQuery.isLoading || odontogramQuery.isLoading) {
        return <OdontogramLoadingSkeleton />;
    }

    if (patientQuery.isError || odontogramQuery.isError || !patientQuery.data) {
        return (
            <div className="space-y-4">
                <p className="text-sm text-red-600">
                    {getApiErrorMessage(
                        patientQuery.error || odontogramQuery.error,
                        t('odontogram.loadFailed')
                    )}
                </p>
                <Button
                    variant="outline"
                    onClick={() => {
                        patientQuery.refetch();
                        odontogramQuery.refetch();
                    }}
                >
                    {t('common.retry')}
                </Button>
            </div>
        );
    }

    const renderTooth = (toothNumber: number) => {
        const toothEntries = entriesByTooth.get(toothNumber) ?? [];
        const historyCount = toothEntries.length;
        const hasHistory = historyCount > 0;
        const condition = latestConditionByTooth.get(toothNumber) ?? 'healthy';
        const colorClass = getToothConditionColor(condition);

        return (
            <button
                key={toothNumber}
                onClick={() => setSelectedTooth(toothNumber)}
                className={`
          relative w-8 h-12 sm:w-10 sm:h-14 md:w-12 md:h-16 rounded-lg border-2 transition-all
          hover:scale-110 hover:shadow-lg cursor-pointer
          ${colorClass}
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
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push(`/patients/${id}`)}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">{t('odontogram.title')}</h1>
                        <p className="text-gray-500 mt-1">{patientQuery.data.full_name}</p>
                    </div>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">{t('odontogram.legendTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-3">
                        <Badge className="bg-gray-100 border-gray-300 text-gray-800">{t('odontogram.condition.healthy')}</Badge>
                        <Badge className="bg-red-100 border-red-500 text-red-800">{t('odontogram.condition.cavity')}</Badge>
                        <Badge className="bg-blue-100 border-blue-500 text-blue-800">{t('odontogram.condition.filling')}</Badge>
                        <Badge className="bg-yellow-100 border-yellow-600 text-yellow-800">{t('odontogram.condition.crown')}</Badge>
                        <Badge className="bg-purple-100 border-purple-500 text-purple-800">{t('odontogram.condition.rootCanal')}</Badge>
                        <Badge className="bg-gray-300 border-gray-600 text-gray-800">{t('odontogram.condition.extraction')}</Badge>
                        <Badge className="bg-green-100 border-green-500 text-green-800">{t('odontogram.condition.implant')}</Badge>
                    </div>
                    <p className="mt-3 text-xs text-gray-500">
                        {t('odontogram.legendHint')}
                    </p>
                </CardContent>
            </Card>

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
                        {t('odontogram.chartHint')}
                    </p>
                </CardContent>
            </Card>

            {selectedTooth !== null ? (
                <ToothDetailDialog
                    open={selectedTooth !== null}
                    onOpenChange={(open) => !open && setSelectedTooth(null)}
                    patientId={id}
                    toothNumber={selectedTooth}
                    entries={entriesByTooth.get(selectedTooth) ?? []}
                    onCreated={() => {
                        odontogramQuery.refetch();
                    }}
                />
            ) : null}
        </div>
    );
}
