'use client';

import { Check, CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { AdminDentistSubscriptionAction } from '@/lib/api/dentist';
import type { ApiAdminDentist, ApiPlan, ApiSubscriptionSummary } from '@/lib/api/types';
import { useI18n } from '@/components/providers/i18n-provider';

interface PlanPickerSectionProps {
    dentist: ApiAdminDentist;
    subscription: ApiSubscriptionSummary;
    plans: ApiPlan[];
    plansLoading: boolean;
    isPending: boolean;
    onAction: (dentist: ApiAdminDentist, action: AdminDentistSubscriptionAction) => void;
    formatPlanPrice: (amount: number, currency: string) => string;
    paidPlanAction: (planCode: string, period: 'monthly' | 'yearly') => AdminDentistSubscriptionAction | null;
}

/**
 * Plan picker section — three pricing cards (trial, basic, pro) with
 * action buttons that adapt to the current subscription state.
 *
 *   - Trial card: single "Assign" button (disabled if already on trial).
 *   - Paid cards: two buttons (Monthly/Yearly). When the current period
 *     matches a button, its label flips to "Renew" and clicking it extends
 *     the subscription by one more period; otherwise it switches plan.
 *   - Buttons are disabled when the price for that period is null OR the
 *     plan code can't be mapped to a valid action (defensive type guard).
 *
 * Visual: the active plan card gets a teal ring + check chip + aria-current.
 */
export function PlanPickerSection({
    dentist,
    subscription,
    plans,
    plansLoading,
    isPending,
    onAction,
    formatPlanPrice,
    paidPlanAction,
}: PlanPickerSectionProps) {
    const { t } = useI18n();

    return (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60">
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold tracking-[-0.02em] text-slate-950">
                    {t('admin.billing.actionGroup.changePlan')}
                </h2>
            </div>
            {plansLoading ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Skeleton className="h-64 rounded-xl" />
                    <Skeleton className="h-64 rounded-xl" />
                    <Skeleton className="h-64 rounded-xl" />
                </div>
            ) : plans.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {plans.map((plan) => {
                        const isCurrent = subscription.plan === plan.code;
                        const isCurrentMonthly = isCurrent && subscription.billing_period === 'monthly';
                        const isCurrentYearly = isCurrent && subscription.billing_period === 'yearly';
                        const isCurrentTrial = isCurrent && plan.code === 'trial';
                        return (
                            <div
                                key={plan.code}
                                aria-current={isCurrent ? 'true' : undefined}
                                className={
                                    'flex min-w-0 flex-col rounded-xl border p-4 transition ' +
                                    (isCurrent
                                        ? 'border-teal-300 bg-teal-50/30 ring-1 ring-teal-200'
                                        : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm')
                                }
                            >
                                <div className="flex min-w-0 items-center justify-between gap-2">
                                    <p className="truncate text-sm font-semibold text-slate-900">
                                        {t(`plan.${plan.code}.name`)}
                                    </p>
                                    {isCurrent ? (
                                        <span
                                            className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-700"
                                            aria-label={t('admin.billing.planCard.current')}
                                        >
                                            <CheckCircle2 className="h-3 w-3" />
                                        </span>
                                    ) : null}
                                </div>

                                <div className="mt-3">
                                    {plan.code === 'trial' ? (
                                        <>
                                            <p className="text-2xl font-bold tracking-tight text-slate-950">
                                                {t('admin.billing.planCard.trialFree')}
                                            </p>
                                            <p className="mt-0.5 text-xs text-slate-500">
                                                {t('admin.billing.planCard.trialDuration', { days: plan.trial_days ?? 30 })}
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex items-baseline gap-1">
                                                <span className="truncate text-2xl font-bold tracking-tight text-slate-950">
                                                    {plan.monthly_price !== null
                                                        ? formatPlanPrice(plan.monthly_price, plan.currency)
                                                        : '—'}
                                                </span>
                                                <span className="shrink-0 text-xs text-slate-500">
                                                    /{t('admin.billing.planCard.monthShort')}
                                                </span>
                                            </div>
                                            <p className="mt-0.5 text-xs text-slate-500">
                                                {plan.yearly_price !== null
                                                    ? formatPlanPrice(plan.yearly_price, plan.currency)
                                                    : '—'}
                                                /{t('admin.billing.planCard.yearShort')}
                                            </p>
                                        </>
                                    )}
                                </div>

                                <ul className="mt-4 flex-1 space-y-1.5 text-xs text-slate-700">
                                    <li className="flex items-start gap-1.5">
                                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                        <span>{t('billing.feature.staff', { count: plan.staff_limit })}</span>
                                    </li>
                                    <li className="flex items-start gap-1.5">
                                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                        <span>{t('billing.feature.images', { count: plan.entry_image_limit })}</span>
                                    </li>
                                    <li className="flex items-start gap-1.5">
                                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                        <span>{t('billing.feature.upload', { mb: plan.upload_max_mb })}</span>
                                    </li>
                                    {plan.can_export ? (
                                        <li className="flex items-start gap-1.5">
                                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                            <span>{t('billing.feature.export')}</span>
                                        </li>
                                    ) : (
                                        <li className="flex items-start gap-1.5 text-slate-400">
                                            <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" />
                                            <span>{t('billing.feature.noExport')}</span>
                                        </li>
                                    )}
                                </ul>

                                <div className="mt-4">
                                    {plan.code === 'trial' ? (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={isCurrentTrial ? 'outline' : 'default'}
                                            className="h-9 w-full"
                                            disabled={isPending || isCurrentTrial}
                                            onClick={() => onAction(dentist, 'set_trial')}
                                        >
                                            {t('admin.billing.planCard.assignTrial')}
                                        </Button>
                                    ) : (
                                        <div className="flex gap-2">
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant={isCurrentMonthly ? 'outline' : 'default'}
                                                className="h-9 min-w-0 flex-1"
                                                disabled={
                                                    isPending
                                                    || plan.monthly_price === null
                                                    || paidPlanAction(plan.code, 'monthly') === null
                                                }
                                                title={
                                                    isCurrentMonthly
                                                        ? t('admin.billing.planCard.renewTooltipMonthly')
                                                        : t('admin.billing.planCard.monthlyTooltip', { plan: plan.name })
                                                }
                                                onClick={() => {
                                                    const action = paidPlanAction(plan.code, 'monthly');
                                                    if (action !== null) {
                                                        onAction(dentist, action);
                                                    }
                                                }}
                                            >
                                                <span className="truncate">
                                                    {isCurrentMonthly
                                                        ? t('admin.billing.planCard.renew')
                                                        : t('admin.billing.planCard.monthly')}
                                                </span>
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant={isCurrentYearly ? 'outline' : 'default'}
                                                className="h-9 min-w-0 flex-1"
                                                disabled={
                                                    isPending
                                                    || plan.yearly_price === null
                                                    || paidPlanAction(plan.code, 'yearly') === null
                                                }
                                                title={
                                                    isCurrentYearly
                                                        ? t('admin.billing.planCard.renewTooltipYearly')
                                                        : t('admin.billing.planCard.yearlyTooltip', { plan: plan.name })
                                                }
                                                onClick={() => {
                                                    const action = paidPlanAction(plan.code, 'yearly');
                                                    if (action !== null) {
                                                        onAction(dentist, action);
                                                    }
                                                }}
                                            >
                                                <span className="truncate">
                                                    {isCurrentYearly
                                                        ? t('admin.billing.planCard.renew')
                                                        : t('admin.billing.planCard.yearly')}
                                                </span>
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}
