'use client';

import type { LucideIcon } from 'lucide-react';
import { CreditCard, History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ApiAuditLogEntry, ApiBillingPayment } from '@/lib/api/types';
import { useI18n } from '@/components/providers/i18n-provider';
import { formatLocalizedDate } from '@/lib/i18n/date';

interface ActivityTabsCardProps {
    payments: ApiBillingPayment[];
    auditLoading: boolean;
    auditEntries: ApiAuditLogEntry[] | undefined;
    formatTotal: () => string;
    formatPaymentAmount: (payment: ApiBillingPayment) => string;
    getBillingPeriodLabel: (period: string | null | undefined) => string;
    getPaymentStatusBadgeClasses: (status: ApiBillingPayment['status']) => string;
    getPaymentStatusLabel: (status: ApiBillingPayment['status']) => string;
    getPaymentStatusIcon: (status: ApiBillingPayment['status']) => {
        Icon: LucideIcon;
        iconClassName: string;
    };
    getAuditEventVisual: (eventType: string) => {
        Icon: LucideIcon;
        iconClassName: string;
    };
}

/**
 * Unified activity card with two tabs: Payment History and Audit Log.
 *
 * The Payment History tab lists every BillingPayment for the dentist with a
 * status-aware icon. The Audit Log tab lists admin actions performed on the
 * dentist (subscription updates, email verification, refunds, etc.) with an
 * event-aware icon. Both tabs render an EmptyState when empty.
 *
 * Extracted from the page component to keep the parent under control.
 */
export function ActivityTabsCard({
    payments,
    auditLoading,
    auditEntries,
    formatTotal,
    formatPaymentAmount,
    getBillingPeriodLabel,
    getPaymentStatusBadgeClasses,
    getPaymentStatusLabel,
    getPaymentStatusIcon,
    getAuditEventVisual,
}: ActivityTabsCardProps) {
    const { locale, t } = useI18n();
    const hasPaidPayment = payments.some((p) => p.status === 'paid');

    return (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/60">
            <Tabs defaultValue="payments">
                <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <TabsList className="self-start" aria-label={t('admin.billing.activityTabsLabel')}>
                        <TabsTrigger value="payments" className="gap-2">
                            <CreditCard className="h-4 w-4" />
                            {t('admin.billing.paymentHistory')}
                        </TabsTrigger>
                        <TabsTrigger value="audit" className="gap-2">
                            <History className="h-4 w-4" />
                            {t('admin.billing.auditLog.title')}
                        </TabsTrigger>
                    </TabsList>
                    {hasPaidPayment ? (
                        <div className="text-left sm:text-right sm:shrink-0">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                {t('admin.billing.paymentHistory.total')}
                            </p>
                            <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-950">
                                {formatTotal()}
                            </p>
                        </div>
                    ) : null}
                </div>

                <TabsContent value="payments" className="p-5">
                    {payments.length === 0 ? (
                        <EmptyState
                            icon={CreditCard}
                            title={t('admin.billing.noPayments')}
                            size="sm"
                        />
                    ) : (
                        <div className="space-y-3">
                            {payments.map((payment) => {
                                const { Icon: StatusIcon, iconClassName } = getPaymentStatusIcon(payment.status);
                                const eventDate = payment.paid_at ?? payment.created_at;
                                return (
                                    <div
                                        key={payment.id}
                                        className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div className="flex min-w-0 flex-1 items-start gap-3">
                                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconClassName}`}>
                                                <StatusIcon className="h-4 w-4" />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate font-semibold text-slate-950">
                                                    {payment.plan_name}
                                                    <span className="text-slate-400"> · </span>
                                                    <span className="text-sm font-normal text-slate-600">
                                                        {getBillingPeriodLabel(payment.billing_period)}
                                                    </span>
                                                </p>
                                                <p className="mt-0.5 truncate text-xs text-slate-600">
                                                    {eventDate
                                                        ? formatLocalizedDate(eventDate, locale, {
                                                            year: 'numeric',
                                                            month: 'short',
                                                            day: 'numeric',
                                                        })
                                                        : '—'}
                                                    {payment.provider_order_id ? (
                                                        <>
                                                            <span className="text-slate-400"> · </span>
                                                            <span className="font-mono text-[11px]">{payment.provider_order_id}</span>
                                                        </>
                                                    ) : null}
                                                    {payment.provider_payment_id ? (
                                                        <>
                                                            <span className="text-slate-400"> · </span>
                                                            <span className="font-mono text-[11px]">{payment.provider_payment_id}</span>
                                                        </>
                                                    ) : null}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between gap-3 sm:shrink-0 sm:justify-end">
                                            <p className="font-semibold tabular-nums text-slate-900">
                                                {formatPaymentAmount(payment)}
                                            </p>
                                            <Badge
                                                variant="outline"
                                                className={getPaymentStatusBadgeClasses(payment.status)}
                                            >
                                                {getPaymentStatusLabel(payment.status)}
                                            </Badge>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="audit" className="p-5">
                    {auditLoading ? (
                        <div className="space-y-3">
                            <Skeleton className="h-16 rounded-xl" />
                            <Skeleton className="h-16 rounded-xl" />
                            <Skeleton className="h-16 rounded-xl" />
                        </div>
                    ) : auditEntries && auditEntries.length > 0 ? (
                        <div className="space-y-3">
                            {auditEntries.map((entry) => {
                                const eventKey = `audit.event.${entry.event_type}`;
                                const eventLabel = t(eventKey);
                                const noteFromMetadata =
                                    entry.metadata && typeof entry.metadata === 'object' && 'note' in entry.metadata
                                        ? String((entry.metadata as { note?: unknown }).note ?? '')
                                        : '';
                                const { Icon: EventIcon, iconClassName } = getAuditEventVisual(entry.event_type);
                                return (
                                    <div
                                        key={entry.id}
                                        className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div className="flex min-w-0 flex-1 items-start gap-3">
                                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconClassName}`}>
                                                <EventIcon className="h-4 w-4" />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate font-semibold text-slate-950">
                                                    {eventLabel === eventKey ? entry.event_type : eventLabel}
                                                </p>
                                                <p className="mt-0.5 truncate text-xs text-slate-600">
                                                    {entry.actor?.name ?? t('admin.billing.auditLog.system')}
                                                    {noteFromMetadata ? (
                                                        <>
                                                            <span className="text-slate-400"> · </span>
                                                            <span>{noteFromMetadata}</span>
                                                        </>
                                                    ) : null}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-end gap-3 sm:shrink-0">
                                            <span className="text-xs text-slate-500 tabular-nums">
                                                {entry.created_at
                                                    ? formatLocalizedDate(entry.created_at, locale, {
                                                        year: 'numeric',
                                                        month: 'short',
                                                        day: 'numeric',
                                                    })
                                                    : '—'}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <EmptyState
                            icon={History}
                            title={t('admin.billing.auditLog.empty')}
                            size="sm"
                        />
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}
