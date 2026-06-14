'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Lock } from 'lucide-react';
import type { ApiTreatment } from '@/lib/api/types';
import { useI18n } from '@/components/providers/i18n-provider';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatDate } from '@/lib/utils';
import { getCurrentUser } from '@/lib/api/dentist';
import { canView } from '@/lib/auth/permissions';
import { ToothDetailDialog } from '@/components/odontogram/tooth-detail-dialog';
import { formatToothNumber, TOOTH_LAYOUT } from '@/lib/tooth-numbering';
import { getBalanceMetricTone } from '@/components/ui/metric-summary-card';

interface ClinicalSnapshotCardProps {
    patientId: string;
    treatments: ApiTreatment[];
    isTreatmentsLoading?: boolean;
    isTreatmentsError?: boolean;
}

const SNAPSHOT_ODONTOGRAM_OPEN_KEY = 'identa:patient-history-snapshot-odontogram-open';

function getBalanceStatusKey(balance: number) {
    if (balance < 0) {
        return 'patientHistory.balanceStatus.advance';
    }

    if (balance === 0) {
        return 'patientHistory.balanceStatus.paid';
    }

    return 'patientHistory.balanceStatus.debt';
}

function getBalanceTextClass(balance: number) {
    const tone = getBalanceMetricTone(balance);

    if (tone === 'blue') {
        return 'text-blue-700';
    }

    if (tone === 'slate') {
        return 'text-slate-700';
    }

    return 'text-yellow-800';
}

function getBalanceBadgeClass(balance: number) {
    const tone = getBalanceMetricTone(balance);

    if (tone === 'blue') {
        return 'border-blue-200 bg-blue-50 text-blue-700';
    }

    if (tone === 'slate') {
        return 'border-slate-200 bg-slate-50 text-slate-600';
    }

    return 'border-yellow-200 bg-yellow-50 text-yellow-700';
}

export function ClinicalSnapshotCard({
    patientId,
    treatments,
    isTreatmentsLoading = false,
    isTreatmentsError = false,
}: ClinicalSnapshotCardProps) {
    const { t } = useI18n();
    const [isOdontogramOpen, setIsOdontogramOpen] = useState(false);
    const [isPreferenceLoaded, setIsPreferenceLoaded] = useState(false);
    const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
    // The net-balance chip leaks the same financial signal as the
    // treatment-history-card summary trio. Gate on payments.view so an
    // assistant without that perm doesn't see the patient's outstanding
    // balance in the snapshot header.
    const currentUserQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        staleTime: 30_000,
    });
    const canViewFinancials = canView(currentUserQuery.data, 'payments');

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
    const netBalanceTextClass = getBalanceTextClass(netBalance);
    const netBalanceBadgeClass = getBalanceBadgeClass(netBalance);

    const showTreatmentSkeleton = isTreatmentsLoading && treatments.length === 0;
    const showTreatmentFallback = isTreatmentsError && treatments.length === 0;

    const renderTooth = (toothNumber: number) => {
        const count = toothCounts.get(toothNumber) ?? 0;
        const hasHistory = count > 0;
        const toothLabel = formatToothNumber(toothNumber);
        const className = `relative flex h-10 w-7 items-center justify-center rounded-lg border text-[11px] font-semibold transition-colors sm:h-11 sm:w-8 ${
            hasHistory
                ? 'border-teal-500 bg-teal-100 text-teal-900 ring-1 ring-teal-200 hover:border-teal-600 hover:bg-teal-200'
                : 'border-slate-300 bg-white text-slate-700'
        }`;

        if (!hasHistory) {
            return (
                <div key={toothNumber} className={className} title={t('odontogram.toothTitle', { toothNumber: toothLabel })}>
                    <span>{toothLabel}</span>
                </div>
            );
        }

        return (
            <button
                key={toothNumber}
                type="button"
                className={className}
                title={t('odontogram.toothTitle', { toothNumber: toothLabel })}
                onClick={() => setSelectedTooth(toothNumber)}
            >
                <span>{toothLabel}</span>
                <span className="absolute -right-1 -top-1 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-sky-600 px-1 text-[11px] font-semibold text-white">
                    {count}
                </span>
            </button>
        );
    };

    return (
        <>
            <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 md:p-4">
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                        <div className="inline-flex items-center gap-2">
                            <span className="text-slate-500">{t('patientHistory.snapshot.entries')}:</span>
                            {showTreatmentSkeleton ? (
                                <Skeleton className="h-4 w-10 rounded" />
                            ) : (
                                <span className="font-semibold text-slate-900">{showTreatmentFallback ? '-' : treatments.length}</span>
                            )}
                        </div>
                        <div className="inline-flex items-center gap-2">
                            <span className="text-slate-500">{t('patientHistory.snapshot.linkedTeeth')}:</span>
                            {showTreatmentSkeleton ? (
                                <Skeleton className="h-4 w-10 rounded" />
                            ) : (
                                <span className="font-semibold text-slate-900">{showTreatmentFallback ? '-' : linkedTeethCount}</span>
                            )}
                        </div>
                        <div className="inline-flex items-center gap-2">
                            <span className="text-slate-500">{t('patientHistory.snapshot.lastEntry')}:</span>
                            {showTreatmentSkeleton ? (
                                <Skeleton className="h-4 w-20 rounded" />
                            ) : (
                                <span className="font-semibold text-slate-900">
                                    {showTreatmentFallback ? '-' : (lastEntryDate ? formatDate(lastEntryDate) : t('patients.never'))}
                                </span>
                            )}
                        </div>
                        <div className="inline-flex items-center gap-2">
                            <span className="text-slate-500">{t('patientHistory.netBalance')}:</span>
                            {showTreatmentSkeleton ? (
                                <Skeleton className="h-4 w-24 rounded" />
                            ) : canViewFinancials ? (
                                showTreatmentFallback ? (
                                    <span className="font-semibold text-slate-900">-</span>
                                ) : (
                                    <>
                                        <span className={`font-semibold ${netBalanceTextClass}`}>
                                            {formatCurrency(Math.abs(netBalance))}
                                        </span>
                                        <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${netBalanceBadgeClass}`}>
                                            {t(getBalanceStatusKey(netBalance))}
                                        </span>
                                    </>
                                )
                            ) : (
                                <span className="inline-flex items-center gap-1 font-semibold text-slate-300" aria-label={t('dashboard.lockedKpi.label')}>
                                    <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                    {t('dashboard.lockedKpi.label')}
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
                    <div className="rounded-xl border border-slate-200 bg-white p-3 md:p-4">
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
                                    <p className="text-center text-base font-medium text-slate-700">{t('odontogram.upperJaw')}</p>
                                    <div className="flex justify-center gap-4 sm:gap-6 max-sm:flex-col max-sm:items-center">
                                        <div>
                                            <p className="mb-1 text-center text-xs text-slate-500">{t('odontogram.upperRight')}</p>
                                            <div className="flex gap-0.5 sm:gap-1">
                                                {TOOTH_LAYOUT.upperRight.map((toothNumber) => renderTooth(toothNumber))}
                                            </div>
                                        </div>
                                        <div>
                                            <p className="mb-1 text-center text-xs text-slate-500">{t('odontogram.upperLeft')}</p>
                                            <div className="flex gap-0.5 sm:gap-1">
                                                {TOOTH_LAYOUT.upperLeft.map((toothNumber) => renderTooth(toothNumber))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="h-px w-full bg-slate-200" />

                                <div className="space-y-2">
                                    <p className="text-center text-base font-medium text-slate-700">{t('odontogram.lowerJaw')}</p>
                                    <div className="flex justify-center gap-4 sm:gap-6 max-sm:flex-col max-sm:items-center">
                                        <div>
                                            <p className="mb-1 text-center text-xs text-slate-500">{t('odontogram.lowerRight')}</p>
                                            <div className="flex gap-0.5 sm:gap-1">
                                                {TOOTH_LAYOUT.lowerRight.map((toothNumber) => renderTooth(toothNumber))}
                                            </div>
                                        </div>
                                        <div>
                                            <p className="mb-1 text-center text-xs text-slate-500">{t('odontogram.lowerLeft')}</p>
                                            <div className="flex gap-0.5 sm:gap-1">
                                                {TOOTH_LAYOUT.lowerLeft.map((toothNumber) => renderTooth(toothNumber))}
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
                    patientId={patientId}
                    toothNumber={selectedTooth}
                    treatments={treatmentsByTooth.get(selectedTooth) ?? []}
                />
            ) : null}
        </>
    );
}
