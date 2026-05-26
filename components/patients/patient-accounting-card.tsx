'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listAllPatientTreatments } from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import { useI18n } from '@/components/providers/i18n-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getBalanceMetricTone, MetricSummaryCard } from '@/components/ui/metric-summary-card';
import { formatCurrency, formatDate } from '@/lib/utils';

interface PatientAccountingCardProps {
    patientId: string;
    historyHref?: string;
    previewLimit?: number;
    historyLabel?: string;
}

const ACCOUNTING_PREVIEW_LIMIT = 5;

export function PatientAccountingCard({
    patientId,
    historyHref,
    previewLimit = ACCOUNTING_PREVIEW_LIMIT,
    historyLabel,
}: PatientAccountingCardProps) {
    const { t } = useI18n();

    const treatmentsQuery = useQuery({
        queryKey: ['patients', 'detail', patientId, 'treatments', 'accounting-summary'],
        queryFn: () => listAllPatientTreatments(patientId, { sort: '-treatment_date,-created_at', includeImages: false }),
        staleTime: 30_000,
        gcTime: 300_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });

    const treatments = useMemo(() => treatmentsQuery.data ?? [], [treatmentsQuery.data]);
    const summary = useMemo(() => {
        const totalDebt = treatments.reduce((sum, treatment) => sum + Number(treatment.debt_amount ?? 0), 0);
        const totalPaid = treatments.reduce((sum, treatment) => sum + Number(treatment.paid_amount ?? 0), 0);

        return {
            totalDebt,
            totalPaid,
            netBalance: totalDebt - totalPaid,
        };
    }, [treatments]);

    const previewRows = treatments.slice(0, previewLimit);

    return (
        <Card className="interactive-card">
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                    <CardTitle>{t('patientDetail.accountingTitle')}</CardTitle>
                    <p className="mt-1 text-sm text-slate-500">{t('patientDetail.accountingSubtitle')}</p>
                </div>
                <Link href={historyHref ?? `/payments?patientId=${encodeURIComponent(patientId)}`}>
                    <Button variant="outline" size="sm">
                        {historyLabel ?? t('patientDetail.openAccountingHistory')}
                    </Button>
                </Link>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <MetricSummaryCard label={t('patientHistory.totalDebt')} value={formatCurrency(summary.totalDebt)} tone="red" compact />
                    <MetricSummaryCard label={t('patientHistory.totalPaid')} value={formatCurrency(summary.totalPaid)} tone="emerald" compact />
                    <MetricSummaryCard
                        label={t('patientHistory.netBalance')}
                        value={formatCurrency(summary.netBalance)}
                        tone={getBalanceMetricTone(summary.netBalance)}
                        compact
                    />
                </div>

                {treatmentsQuery.isLoading ? (
                    <div className="overflow-x-auto pb-1">
                        <div className="min-w-[680px] space-y-3">
                            {Array.from({ length: 3 }).map((_, index) => (
                                <div key={index} className="grid grid-cols-[120px_1fr_120px_120px_120px] gap-3 rounded-lg border border-slate-200 p-3">
                                    <Skeleton className="h-4 w-20" />
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-20" />
                                    <Skeleton className="h-4 w-20" />
                                    <Skeleton className="h-4 w-20" />
                                </div>
                            ))}
                        </div>
                    </div>
                ) : treatmentsQuery.isError ? (
                    <div className="space-y-3 rounded-xl border border-red-100 bg-red-50 p-4">
                        <p className="text-sm text-red-600">
                            {getApiErrorMessage(treatmentsQuery.error, t('patientHistory.error.loadFailed'))}
                        </p>
                        <Button variant="outline" onClick={() => treatmentsQuery.refetch()}>
                            {t('common.retry')}
                        </Button>
                    </div>
                ) : previewRows.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 px-6 py-10 text-center">
                        <p className="text-sm text-slate-500">{t('patientDetail.noAccountingEntries')}</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 pb-1">
                        <div className="min-w-[680px]">
                            <div className="grid grid-cols-[110px_1fr_110px_110px_110px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                                <span>{t('payments.table.date')}</span>
                                <span>{t('patientHistory.table.workDone')}</span>
                                <span>{t('patientHistory.table.debt')}</span>
                                <span>{t('patientHistory.table.paid')}</span>
                                <span>{t('patientHistory.table.remaining')}</span>
                            </div>
                            <div className="divide-y divide-slate-100">
                                {previewRows.map((treatment) => (
                                    <div
                                        key={treatment.id}
                                        className="grid grid-cols-[110px_1fr_110px_110px_110px] gap-3 px-4 py-3 text-sm"
                                    >
                                        <span className="text-slate-600">{formatDate(treatment.treatment_date)}</span>
                                        <div className="min-w-0">
                                            <p className="truncate font-medium text-slate-900">{treatment.treatment_type}</p>
                                            {treatment.comment ? (
                                                <p className="truncate text-xs text-slate-500">{treatment.comment}</p>
                                            ) : null}
                                        </div>
                                        <span className="font-medium text-red-700">
                                            {formatCurrency(Number(treatment.debt_amount))}
                                        </span>
                                        <span className="font-medium text-green-700">
                                            {formatCurrency(Number(treatment.paid_amount))}
                                        </span>
                                        <span className={`font-medium ${Number(treatment.balance) > 0 ? 'text-red-700' : 'text-green-700'}`}>
                                            {formatCurrency(Number(treatment.balance))}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
