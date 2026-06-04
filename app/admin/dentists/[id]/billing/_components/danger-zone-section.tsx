'use client';

import { useMemo } from 'react';
import { AlertTriangle, Clock, RotateCcw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AdminDentistSubscriptionAction } from '@/lib/api/dentist';
import type { ApiAdminDentist, ApiSubscriptionSummary } from '@/lib/api/types';
import { useI18n } from '@/components/providers/i18n-provider';
import { formatLocalizedDate } from '@/lib/i18n/date';

interface DangerZoneSectionProps {
    dentist: ApiAdminDentist;
    subscription: ApiSubscriptionSummary;
    isPending: boolean;
    onAction: (dentist: ApiAdminDentist, action: AdminDentistSubscriptionAction) => void;
    getSubscriptionActionLabel: (action: AdminDentistSubscriptionAction) => string;
}

/**
 * Danger zone section. Two destructive buttons + an optional Resume banner.
 *
 *   - "Отменить в конце периода" (cancel_at_period_end): disabled when
 *     already scheduled OR no active paid period to schedule against.
 *   - "Отменить сразу" (cancel_now): disabled when already canceled.
 *   - Resume banner: shown when cancel_at_period_end=true, lets the admin
 *     undo the scheduled cancellation via mark_active.
 *
 * Disabled state shows a contextual reason inline and as a tooltip.
 */
export function DangerZoneSection({
    dentist,
    subscription: sub,
    isPending,
    onAction,
    getSubscriptionActionLabel,
}: DangerZoneSectionProps) {
    const { locale, t } = useI18n();

    const { cannotScheduleCancel, cannotCancelNow, scheduleCancelReason, cancelNowReason } = useMemo(() => {
        const cannotSchedule = !!sub.cancel_at_period_end
            || sub.status === 'none'
            || sub.status === 'canceled'
            || sub.status === 'read_only'
            || !sub.ends_at;
        const cannotNow = sub.status === 'none' || sub.status === 'canceled';

        const scheduleReason = cannotSchedule
            ? (sub.cancel_at_period_end
                ? t('admin.billing.dangerZone.alreadyScheduled')
                : sub.status === 'canceled'
                    ? t('admin.billing.dangerZone.alreadyCanceled')
                    : t('admin.billing.dangerZone.noActivePeriod'))
            : sub.ends_at
                ? t('admin.billing.dangerZone.atPeriodEndWithDate', {
                    date: formatLocalizedDate(sub.ends_at, locale, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                    }),
                })
                : t('admin.billing.dangerZone.atPeriodEnd');
        const nowReason = cannotNow
            ? (sub.status === 'canceled'
                ? t('admin.billing.dangerZone.alreadyCanceled')
                : t('admin.billing.dangerZone.noSub'))
            : t('admin.billing.dangerZone.cancelNow');

        return {
            cannotScheduleCancel: cannotSchedule,
            cannotCancelNow: cannotNow,
            scheduleCancelReason: scheduleReason,
            cancelNowReason: nowReason,
        };
    }, [sub.cancel_at_period_end, sub.status, sub.ends_at, t, locale]);

    const showResumeBanner = sub.cancel_at_period_end
        && sub.status !== 'canceled'
        && sub.status !== 'read_only';

    return (
        <div className="rounded-2xl border border-red-200 bg-red-50/20 p-5 shadow-sm shadow-red-100/30">
            <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
                    <AlertTriangle className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                    <h2 className="text-lg font-bold tracking-[-0.02em] text-slate-950">
                        {t('admin.billing.dangerZone.title')}
                    </h2>
                    <p className="mt-0.5 text-sm text-slate-600">
                        {t('admin.billing.dangerZone.description')}
                    </p>
                </div>
            </div>

            {showResumeBanner ? (
                <div className="mt-4 flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3 min-w-0">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                            <RotateCcw className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                            <p className="font-semibold text-slate-950">
                                {t('admin.billing.dangerZone.resumeTitle')}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-600">
                                {t('admin.billing.dangerZone.resumeDescription')}
                            </p>
                        </div>
                    </div>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="sm:shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100"
                        disabled={isPending}
                        onClick={() => onAction(dentist, 'mark_active')}
                    >
                        {t('admin.billing.dangerZone.resumeAction')}
                    </Button>
                </div>
            ) : null}

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                    type="button"
                    onClick={() => onAction(dentist, 'cancel_at_period_end')}
                    disabled={isPending || cannotScheduleCancel}
                    title={scheduleCancelReason}
                    className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-amber-200 hover:bg-amber-50/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:bg-white"
                >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                        <Clock className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                        <p className="font-semibold text-slate-950">
                            {getSubscriptionActionLabel('cancel_at_period_end')}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-600">
                            {scheduleCancelReason}
                        </p>
                    </div>
                </button>

                <button
                    type="button"
                    onClick={() => onAction(dentist, 'cancel_now')}
                    disabled={isPending || cannotCancelNow}
                    title={cancelNowReason}
                    className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-red-200 hover:bg-red-50/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:bg-white"
                >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
                        <XCircle className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                        <p className="font-semibold text-slate-950">
                            {getSubscriptionActionLabel('cancel_now')}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-600">
                            {cancelNowReason}
                        </p>
                    </div>
                </button>
            </div>
        </div>
    );
}
