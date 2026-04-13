'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ApiTreatment } from '@/lib/api/types';
import { useI18n } from '@/components/providers/i18n-provider';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ToothDetailDialog } from '@/components/odontogram/tooth-detail-dialog';

interface ClinicalSnapshotCardProps {
    treatments: ApiTreatment[];
    isTreatmentsLoading?: boolean;
    isTreatmentsError?: boolean;
}

const SNAPSHOT_ODONTOGRAM_OPEN_KEY = 'identa:patient-history-snapshot-odontogram-open';
const UPPER_RIGHT_TEETH = [8, 7, 6, 5, 4, 3, 2, 1] as const;
const UPPER_LEFT_TEETH = [9, 10, 11, 12, 13, 14, 15, 16] as const;
const LOWER_RIGHT_TEETH = [32, 31, 30, 29, 28, 27, 26, 25] as const;
const LOWER_LEFT_TEETH = [17, 18, 19, 20, 21, 22, 23, 24] as const;

export function ClinicalSnapshotCard({
    treatments,
    isTreatmentsLoading = false,
    isTreatmentsError = false,
}: ClinicalSnapshotCardProps) {
    const { t } = useI18n();
    const [isOdontogramOpen, setIsOdontogramOpen] = useState(false);
    const [isPreferenceLoaded, setIsPreferenceLoaded] = useState(false);
    const [selectedTooth, setSelectedTooth] = useState<number | null>(null);

    useEffect(() => {
        try {
            const saved = window.localStorage.getItem(SNAPSHOT_ODONTOGRAM_OPEN_KEY);
            if (saved === '0') {
                setIsOdontogramOpen(false);
            } else if (saved === '1') {
                setIsOdontogramOpen(true);
            }
        } catch {
            // Ignore localStorage access errors.
        } finally {
            setIsPreferenceLoaded(true);
        }
    }, []);

    useEffect(() => {
        if (!isPreferenceLoaded) {
            return;
        }

        try {
            window.localStorage.setItem(SNAPSHOT_ODONTOGRAM_OPEN_KEY, isOdontogramOpen ? '1' : '0');
        } catch {
            // Ignore localStorage access errors.
        }
    }, [isPreferenceLoaded, isOdontogramOpen]);

    const toothCounts = useMemo(() => {
        const counts = new Map<number, number>();

        for (const treatment of treatments) {
            const uniqueTeethForEntry = new Set<number>();

            for (const tooth of treatment.teeth ?? []) {
                if (Number.isFinite(tooth) && tooth >= 1 && tooth <= 32) {
                    uniqueTeethForEntry.add(tooth);
                }
            }

            if (
                typeof treatment.tooth_number === 'number'
                && Number.isFinite(treatment.tooth_number)
                && treatment.tooth_number >= 1
                && treatment.tooth_number <= 32
            ) {
                uniqueTeethForEntry.add(treatment.tooth_number);
            }

            for (const tooth of uniqueTeethForEntry) {
                counts.set(tooth, (counts.get(tooth) ?? 0) + 1);
            }
        }

        return counts;
    }, [treatments]);

    const linkedTeethCount = toothCounts.size;
    const treatmentsByTooth = useMemo(() => {
        const map = new Map<number, ApiTreatment[]>();

        for (const treatment of treatments) {
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

            for (const tooth of linkedTeeth) {
                const items = map.get(tooth) ?? [];
                items.push(treatment);
                map.set(tooth, items);
            }
        }

        for (const [tooth, items] of map.entries()) {
            const sorted = [...items].sort((a, b) => {
                const byDate = (b.treatment_date ?? '').localeCompare(a.treatment_date ?? '');
                if (byDate !== 0) {
                    return byDate;
                }
                return (b.created_at ?? '').localeCompare(a.created_at ?? '');
            });

            map.set(tooth, sorted);
        }

        return map;
    }, [treatments]);

    const lastEntryDate = useMemo(() => {
        let latest: string | null = null;

        for (const treatment of treatments) {
            const date = treatment.treatment_date ?? null;
            if (!date) {
                continue;
            }

            if (!latest || date > latest) {
                latest = date;
            }
        }

        return latest;
    }, [treatments]);

    const netBalance = useMemo(
        () =>
            treatments.reduce(
                (sum, treatment) => sum + Number(treatment.debt_amount ?? 0) - Number(treatment.paid_amount ?? 0),
                0
            ),
        [treatments]
    );

    const showTreatmentSkeleton = isTreatmentsLoading && treatments.length === 0;
    const showTreatmentFallback = isTreatmentsError && treatments.length === 0;

    const renderTooth = (toothNumber: number) => {
        const count = toothCounts.get(toothNumber) ?? 0;
        const hasHistory = count > 0;
        const className = `relative flex h-10 w-7 items-center justify-center rounded-lg border text-[11px] font-semibold transition-colors sm:h-11 sm:w-8 ${
            hasHistory
                ? 'border-blue-300 bg-blue-50 text-blue-900 hover:border-blue-400 hover:bg-blue-100'
                : 'border-gray-300 bg-white text-gray-700'
        }`;

        if (!hasHistory) {
            return (
                <div key={toothNumber} className={className} title={t('odontogram.toothTitle', { toothNumber })}>
                    <span>{toothNumber}</span>
                </div>
            );
        }

        return (
            <button
                key={toothNumber}
                type="button"
                className={className}
                title={t('odontogram.toothTitle', { toothNumber })}
                onClick={() => setSelectedTooth(toothNumber)}
            >
                <span>{toothNumber}</span>
                <span className="absolute -right-1 -top-1 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-sky-600 px-1 text-[8px] font-semibold text-white">
                    {count}
                </span>
            </button>
        );
    };

    return (
        <>
            <section className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50/60 p-3 md:p-4">
                <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                        <div className="inline-flex items-center gap-2">
                            <span className="text-gray-500">{t('patientHistory.snapshot.entries')}:</span>
                            {showTreatmentSkeleton ? (
                                <Skeleton className="h-4 w-10 rounded" />
                            ) : (
                                <span className="font-semibold text-gray-900">{showTreatmentFallback ? '-' : treatments.length}</span>
                            )}
                        </div>
                        <div className="inline-flex items-center gap-2">
                            <span className="text-gray-500">{t('patientHistory.snapshot.linkedTeeth')}:</span>
                            {showTreatmentSkeleton ? (
                                <Skeleton className="h-4 w-10 rounded" />
                            ) : (
                                <span className="font-semibold text-gray-900">{showTreatmentFallback ? '-' : linkedTeethCount}</span>
                            )}
                        </div>
                        <div className="inline-flex items-center gap-2">
                            <span className="text-gray-500">{t('patientHistory.snapshot.lastEntry')}:</span>
                            {showTreatmentSkeleton ? (
                                <Skeleton className="h-4 w-20 rounded" />
                            ) : (
                                <span className="font-semibold text-gray-900">
                                    {showTreatmentFallback ? '-' : (lastEntryDate ? formatDate(lastEntryDate) : t('patients.never'))}
                                </span>
                            )}
                        </div>
                        <div className="inline-flex items-center gap-2">
                            <span className="text-gray-500">{t('patientHistory.netBalance')}:</span>
                            {showTreatmentSkeleton ? (
                                <Skeleton className="h-4 w-24 rounded" />
                            ) : (
                                <span
                                    className={`font-semibold ${
                                        showTreatmentFallback
                                            ? 'text-gray-900'
                                            : netBalance > 0
                                                ? 'text-red-700'
                                                : netBalance < 0
                                                    ? 'text-green-700'
                                                    : 'text-gray-900'
                                    }`}
                                >
                                    {showTreatmentFallback ? '-' : formatCurrency(netBalance)}
                                </span>
                            )}
                        </div>

                        <div className="ml-auto">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setIsOdontogramOpen((current) => !current)}
                            >
                                {isOdontogramOpen ? (
                                    <>
                                        <ChevronUp className="h-4 w-4" />
                                        {t('patientHistory.snapshot.hide')}
                                    </>
                                ) : (
                                    <>
                                        <ChevronDown className="h-4 w-4" />
                                        {t('patientHistory.snapshot.show')}
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>

                {isOdontogramOpen ? (
                    <div className="rounded-xl border border-gray-200 bg-white p-3 md:p-4">
                        {showTreatmentSkeleton ? (
                            <div className="space-y-4">
                                {Array.from({ length: 2 }).map((_, sectionIndex) => (
                                    <div key={sectionIndex} className="space-y-2">
                                        <Skeleton className="mx-auto h-4 w-24" />
                                        <div className="flex justify-center gap-1">
                                            {Array.from({ length: 16 }).map((__, toothIndex) => (
                                                <Skeleton key={toothIndex} className="h-10 w-7 rounded-lg sm:h-11 sm:w-8" />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-5">
                                <div className="space-y-2">
                                    <p className="text-center text-base font-medium text-gray-700">{t('odontogram.upperJaw')}</p>
                                    <div className="flex justify-center gap-4 sm:gap-6">
                                        <div>
                                            <p className="mb-1 text-center text-xs text-gray-500">{t('odontogram.upperRight')}</p>
                                            <div className="flex gap-0.5 sm:gap-1">
                                                {UPPER_RIGHT_TEETH.map((toothNumber) => renderTooth(toothNumber))}
                                            </div>
                                        </div>
                                        <div>
                                            <p className="mb-1 text-center text-xs text-gray-500">{t('odontogram.upperLeft')}</p>
                                            <div className="flex gap-0.5 sm:gap-1">
                                                {UPPER_LEFT_TEETH.map((toothNumber) => renderTooth(toothNumber))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="h-px w-full bg-gray-200" />

                                <div className="space-y-2">
                                    <p className="text-center text-base font-medium text-gray-700">{t('odontogram.lowerJaw')}</p>
                                    <div className="flex justify-center gap-4 sm:gap-6">
                                        <div>
                                            <p className="mb-1 text-center text-xs text-gray-500">{t('odontogram.lowerRight')}</p>
                                            <div className="flex gap-0.5 sm:gap-1">
                                                {LOWER_RIGHT_TEETH.map((toothNumber) => renderTooth(toothNumber))}
                                            </div>
                                        </div>
                                        <div>
                                            <p className="mb-1 text-center text-xs text-gray-500">{t('odontogram.lowerLeft')}</p>
                                            <div className="flex gap-0.5 sm:gap-1">
                                                {LOWER_LEFT_TEETH.map((toothNumber) => renderTooth(toothNumber))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ) : null}
            </section>

            {selectedTooth !== null ? (
                <ToothDetailDialog
                    open={selectedTooth !== null}
                    onOpenChange={(open) => {
                        if (!open) {
                            setSelectedTooth(null);
                        }
                    }}
                    toothNumber={selectedTooth}
                    treatments={treatmentsByTooth.get(selectedTooth) ?? []}
                />
            ) : null}
        </>
    );
}
