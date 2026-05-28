'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/ui/page-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { BillingLoadingState } from '@/components/layout/page-loading-skeletons';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { DataTableShell, getDataTableClassName } from '@/components/ui/data-table-shell';
import {
    createBillingCheckout,
    getCurrentSubscription,
    getCurrentUser,
    listAssistants,
    listBillingPayments,
    listBillingPlans,
} from '@/lib/api/dentist';
import type { ApiAssistantAccount, ApiPlan } from '@/lib/api/types';
import { getApiErrorMessage } from '@/lib/api/client';
import { formatLocalizedDate } from '@/lib/i18n/date';
import { useI18n } from '@/components/providers/i18n-provider';
import { toast } from 'sonner';
import { ArrowRight, Check, CreditCard, Crown, Download, Image as ImageIcon, LockKeyhole, Sparkles, Upload, Users, X, Zap } from 'lucide-react';
import { buildPdfFilename, exportRowsToPdf } from '@/lib/export/pdf';

type BillingPeriod = 'monthly' | 'yearly';

function formatMoney(amount: number | null, currency: string): string {
    if (amount === null) {
        return '-';
    }

    return new Intl.NumberFormat('uz-UZ', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
    }).format(amount);
}

function getPlanPrice(plan: ApiPlan, period: BillingPeriod): number | null {
    return period === 'yearly' ? plan.yearly_price : plan.monthly_price;
}

function isProToBasicDowngrade(subscriptionPlan: string | null | undefined, targetPlan: ApiPlan): boolean {
    return subscriptionPlan === 'pro' && targetPlan.code === 'basic';
}

export default function BillingPage() {
    const { t, locale } = useI18n();
    const queryClient = useQueryClient();
    const [period, setPeriod] = useState<BillingPeriod>('monthly');
    const [downgradePlan, setDowngradePlan] = useState<ApiPlan | null>(null);
    const [selectedStaffIds, setSelectedStaffIds] = useState<number[]>([]);

    const currentUserQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        retry: false,
    });
    const subscriptionQuery = useQuery({
        queryKey: ['billing', 'current-subscription'],
        queryFn: getCurrentSubscription,
    });
    const plansQuery = useQuery({
        queryKey: ['billing', 'plans'],
        queryFn: listBillingPlans,
    });
    const paymentsQuery = useQuery({
        queryKey: ['billing', 'payments'],
        queryFn: listBillingPayments,
    });
    const staffQuery = useQuery({
        queryKey: ['team', 'assistants', 'billing-downgrade'],
        queryFn: () => listAssistants({ perPage: 100 }),
        enabled: downgradePlan !== null && currentUserQuery.data?.role === 'dentist',
    });

    const checkoutMutation = useMutation({
        mutationFn: (payload: {
            plan_code: 'basic' | 'pro';
            billing_period: BillingPeriod;
            selected_active_staff_ids?: number[];
        }) =>
            createBillingCheckout(payload),
        onSuccess: (checkout) => {
            queryClient.invalidateQueries({ queryKey: ['billing', 'payments'] });
            setDowngradePlan(null);
            setSelectedStaffIds([]);
            window.location.href = checkout.checkout_url;
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('billing.checkoutFailed')));
        },
    });

    const plans = useMemo(() => plansQuery.data ?? [], [plansQuery.data]);
    const subscription = subscriptionQuery.data ?? currentUserQuery.data?.subscription ?? null;
    const isOwner = currentUserQuery.data?.role === 'dentist';
    const isLoading = currentUserQuery.isLoading || subscriptionQuery.isLoading || plansQuery.isLoading;
    const activeStaff = useMemo(
        () => (staffQuery.data?.data ?? []).filter(
            (assistant: ApiAssistantAccount) => assistant.account_status === 'active'
        ),
        [staffQuery.data]
    );
    const effectiveSelectedStaffIds = useMemo(() => {
        if (selectedStaffIds.length > 0 || !downgradePlan) {
            return selectedStaffIds;
        }

        return activeStaff
            .slice(0, downgradePlan.staff_limit)
            .map((assistant) => Number(assistant.id));
    }, [activeStaff, downgradePlan, selectedStaffIds]);

    const openDowngradeDialog = (plan: ApiPlan) => {
        setDowngradePlan(plan);
        setSelectedStaffIds(activeStaff.slice(0, plan.staff_limit).map((assistant) => Number(assistant.id)));
    };
    const submitDowngrade = () => {
        if (!downgradePlan) {
            return;
        }

        if (effectiveSelectedStaffIds.length > downgradePlan.staff_limit) {
            toast.error(t('billing.downgrade.tooManyStaff', { count: downgradePlan.staff_limit }));
            return;
        }
        if (activeStaff.length > downgradePlan.staff_limit && effectiveSelectedStaffIds.length !== downgradePlan.staff_limit) {
            toast.error(t('billing.downgrade.selectExactStaff', { count: downgradePlan.staff_limit }));
            return;
        }

        checkoutMutation.mutate({
            plan_code: downgradePlan.code as 'basic' | 'pro',
            billing_period: period,
            selected_active_staff_ids: effectiveSelectedStaffIds,
        });
    };

    if (isLoading) {
        return <BillingLoadingState />;
    }

    return (
        <div className="space-y-5 lg:space-y-6">
            <PageHeader title={t('billing.title')} description={t('billing.subtitle')} />

            <Card className="overflow-hidden rounded-2xl border-slate-200 bg-white p-0 shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-sm shadow-teal-200">
                            <Crown className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-lg font-bold tracking-tight text-slate-950">
                                    {subscription?.plan_name ?? subscription?.plan ?? '-'}
                                </h2>
                                {subscription?.status ? (
                                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                        subscription.is_read_only
                                            ? 'bg-red-50 text-red-700 ring-1 ring-red-100'
                                            : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                                    }`}>
                                        <span className={`h-1.5 w-1.5 rounded-full ${subscription.is_read_only ? 'bg-red-500' : 'bg-emerald-500'}`} />
                                        {subscription.status}
                                    </span>
                                ) : null}
                            </div>
                            {subscription?.payment_amount ? (
                                <p className="mt-0.5 text-xs text-slate-500">
                                    {formatMoney(subscription.payment_amount, 'UZS')} / {t(subscription.billing_period === 'yearly' ? 'billing.period.yearly' : 'billing.period.monthly')}
                                </p>
                            ) : (
                                <p className="mt-0.5 text-xs text-slate-500">{t('billing.subtitle')}</p>
                            )}
                        </div>
                    </div>
                    {subscription?.pending_change_effective_at ? (
                        <span className="inline-flex items-center gap-1.5 self-start rounded-lg bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 ring-1 ring-teal-100 sm:self-center">
                            {t('billing.pendingChange', {
                                date: formatLocalizedDate(subscription.pending_change_effective_at, locale, {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                }),
                            })}
                        </span>
                    ) : null}
                </div>

                <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                    <div className="px-5 py-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('billing.label.expires')}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                            {subscription?.ends_at
                                ? formatLocalizedDate(subscription.ends_at, locale, { year: 'numeric', month: 'short', day: 'numeric' })
                                : t('billing.noEndDate')}
                        </p>
                        {typeof subscription?.days_remaining === 'number' && subscription.days_remaining > 0 ? (
                            <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                                {t('billing.daysRemaining', { count: subscription.days_remaining })}
                            </p>
                        ) : null}
                    </div>
                    <div className="px-5 py-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('billing.label.staff')}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900 tabular-nums">
                            {subscription?.active_staff_count ?? 0}
                            {typeof subscription?.staff_limit === 'number' ? (
                                <span className="text-slate-400"> / {subscription.staff_limit}</span>
                            ) : null}
                        </p>
                    </div>
                </div>

                {subscription?.is_read_only ? (
                    <div className="flex items-start gap-2 border-t border-red-100 bg-red-50/50 px-5 py-3 text-sm text-red-800">
                        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{t('billing.readOnlyWarning')}</span>
                    </div>
                ) : null}
            </Card>

            <div className="flex w-full rounded-2xl border border-slate-200 bg-white p-1 shadow-sm sm:w-fit">
                {(['monthly', 'yearly'] as const).map((value) => (
                    <button
                        key={value}
                        type="button"
                        onClick={() => setPeriod(value)}
                        className={[
                            'flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition sm:flex-none',
                            period === value
                                ? 'bg-teal-50 text-teal-700 shadow-sm ring-1! ring-teal-300! focus-visible:border-transparent!'
                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                        ].join(' ')}
                    >
                        {t(`billing.period.${value}`)}
                    </button>
                ))}
            </div>

            <div className="grid gap-5 pt-3 md:grid-cols-2 xl:grid-cols-3">
                {plans.map((plan) => {
                    const price = plan.is_trial ? null : getPlanPrice(plan, period);
                    const disabled = plan.is_paid && (!isOwner || price === null || price <= 0 || checkoutMutation.isPending);
                    const isCurrent = subscription?.plan === plan.code;
                    const isPopular = plan.code === 'pro' && !isCurrent;
                    const planIcon = plan.code === 'pro' ? Crown : plan.code === 'basic' ? Zap : Sparkles;
                    const PlanIcon = planIcon;
                    const features: Array<{ icon: typeof Users; label: string; muted?: boolean }> = [
                        { icon: Users, label: t('billing.feature.staff', { count: plan.staff_limit }) },
                        { icon: ImageIcon, label: t('billing.feature.images', { count: plan.entry_image_limit }) },
                        { icon: Upload, label: t('billing.feature.upload', { mb: plan.upload_max_mb }) },
                        { icon: plan.can_export ? Check : X, label: plan.can_export ? t('billing.feature.export') : t('billing.feature.noExport'), muted: !plan.can_export },
                    ];

                    return (
                        <div key={plan.code} className="relative">
                            {isPopular ? (
                                <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2">
                                    <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-teal-600 to-teal-500 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white shadow-lg shadow-teal-500/30">
                                        ★ {t('billing.popular')}
                                    </span>
                                </div>
                            ) : null}
                            <div
                                className={`group relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border bg-white p-6 transition-all duration-200 ${
                                    isCurrent
                                        ? 'border-teal-400 bg-gradient-to-br from-teal-50/50 via-white to-white shadow-lg shadow-teal-200/40 ring-1 ring-teal-200/60'
                                        : isPopular
                                            ? 'border-teal-300/60 shadow-md shadow-teal-100/40 ring-1 ring-teal-100 hover:-translate-y-0.5 hover:border-teal-400 hover:shadow-xl hover:shadow-teal-200/40'
                                            : 'border-slate-200 shadow-sm hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md'
                                }`}
                            >
                                {isPopular ? (
                                    <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gradient-to-br from-teal-200/60 to-transparent blur-2xl" aria-hidden="true" />
                                ) : null}

                                <div className="relative flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                                            isPopular || isCurrent
                                                ? 'bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-sm shadow-teal-300/40'
                                                : 'bg-slate-100 text-slate-600'
                                        }`}>
                                            <PlanIcon className="h-5 w-5" />
                                        </span>
                                        <div className="min-w-0">
                                            <h3 className="text-lg font-bold tracking-tight text-slate-950">{plan.name}</h3>
                                            <p className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-slate-500">{plan.description}</p>
                                        </div>
                                    </div>
                                    {isCurrent ? (
                                        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-teal-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-teal-800 ring-1 ring-teal-200">
                                            <span className="relative flex h-1.5 w-1.5">
                                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
                                                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-teal-600" />
                                            </span>
                                            {t('billing.current')}
                                        </span>
                                    ) : null}
                                </div>

                                <div className="relative mt-6 flex items-baseline gap-1.5">
                                    {plan.is_trial ? (
                                        <span className="text-3xl font-semibold tracking-tight text-slate-900">{t('billing.free')}</span>
                                    ) : (
                                        <>
                                            <span className="text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">{formatMoney(price, plan.currency)}</span>
                                            <span className="text-sm font-medium text-slate-400">/ {t(`billing.period.${period}`).toLowerCase()}</span>
                                        </>
                                    )}
                                </div>
                                <p className={`mt-1 text-xs ${plan.is_trial ? 'text-slate-500' : 'text-transparent select-none'}`}>
                                    {plan.is_trial ? t('billing.trialDays', { days: plan.trial_days ?? 14 }) : '.'}
                                </p>

                                <div className="relative my-6 h-px w-full bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

                                <ul className="relative space-y-3 text-sm">
                                    {features.map(({ icon: FeatureIcon, label, muted }) => (
                                        <li key={label} className="flex items-start gap-3">
                                            <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${
                                                muted
                                                    ? 'bg-slate-100 text-slate-400'
                                                    : isPopular || isCurrent
                                                        ? 'bg-teal-100 text-teal-700'
                                                        : 'bg-slate-100 text-slate-700'
                                            }`}>
                                                <FeatureIcon className="h-3 w-3 stroke-[2.5]" />
                                            </span>
                                            <span className={muted ? 'text-slate-400 line-through decoration-slate-200' : 'text-slate-700'}>{label}</span>
                                        </li>
                                    ))}
                                </ul>

                                {plan.is_paid ? (
                                    <Button
                                        type="button"
                                        className={`group/btn relative mt-7 w-full overflow-hidden rounded-xl transition-all ${
                                            isCurrent
                                                ? 'pointer-events-none border border-teal-200 bg-teal-50 text-teal-700 shadow-none hover:bg-teal-50'
                                                : isPopular
                                                    ? 'bg-gradient-to-r from-teal-600 to-teal-500 text-white shadow-md shadow-teal-500/30 hover:shadow-lg hover:shadow-teal-500/40'
                                                    : 'bg-slate-900 text-white shadow-sm hover:bg-slate-800'
                                        }`}
                                        variant={isCurrent ? 'outline' : 'default'}
                                        disabled={disabled || isCurrent}
                                        onClick={() => {
                                            if (isProToBasicDowngrade(subscription?.plan, plan)) {
                                                openDowngradeDialog(plan);
                                                return;
                                            }

                                            checkoutMutation.mutate({
                                                plan_code: plan.code as 'basic' | 'pro',
                                                billing_period: period,
                                            });
                                        }}
                                    >
                                        {isCurrent ? (
                                            <>
                                                <Check className="mr-2 h-4 w-4" />
                                                {t('billing.current')}
                                            </>
                                        ) : (
                                            <span className="flex items-center justify-center gap-2">
                                                <CreditCard className="h-4 w-4" />
                                                <span>{isOwner ? t('billing.checkout') : t('billing.ownerOnly')}</span>
                                                <ArrowRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-0.5" />
                                            </span>
                                        )}
                                    </Button>
                                ) : (
                                    <div className="mt-7 flex h-10 items-center justify-center rounded-xl border border-dashed border-slate-200 text-xs font-medium text-slate-400">
                                        {t('billing.trialDays', { days: plan.trial_days ?? 14 })}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <Dialog
                open={downgradePlan !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setDowngradePlan(null);
                        setSelectedStaffIds([]);
                    }
                }}
            >
                <DialogContent className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto p-5 sm:max-w-lg sm:p-6">
                    <DialogHeader>
                        <DialogTitle>{t('billing.downgrade.title')}</DialogTitle>
                        <DialogDescription className="sr-only">
                            {t('billing.downgrade.description', {
                                count: downgradePlan?.staff_limit ?? 0,
                            })}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-slate-600">
                            {t('billing.downgrade.description', {
                                count: downgradePlan?.staff_limit ?? 0,
                            })}
                        </p>

                        {staffQuery.isLoading ? (
                            <div className="space-y-2">
                                <Skeleton className="h-12 rounded-xl" />
                                <Skeleton className="h-12 rounded-xl" />
                                <Skeleton className="h-12 rounded-xl" />
                            </div>
                        ) : activeStaff.length === 0 ? (
                            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                                {t('billing.downgrade.noStaff')}
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {activeStaff.map((assistant) => {
                                    const assistantId = Number(assistant.id);
                                    const checked = effectiveSelectedStaffIds.includes(assistantId);
                                    const limit = downgradePlan?.staff_limit ?? 0;
                                    const disabled = !checked && effectiveSelectedStaffIds.length >= limit;

                                    return (
                                        <button
                                            key={assistant.id}
                                            type="button"
                                            disabled={disabled}
                                            onClick={() => {
                                                setSelectedStaffIds(
                                                    effectiveSelectedStaffIds.includes(assistantId)
                                                        ? effectiveSelectedStaffIds.filter((id) => id !== assistantId)
                                                        : [...effectiveSelectedStaffIds, assistantId]
                                                );
                                            }}
                                            className={[
                                                'flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition',
                                                checked
                                                    ? 'border-teal-300 bg-teal-50 text-teal-950'
                                                    : 'border-slate-200 bg-white text-slate-800',
                                                disabled ? 'cursor-not-allowed opacity-50' : 'hover:border-teal-200 hover:bg-teal-50/60',
                                            ].join(' ')}
                                        >
                                            <span>
                                                <span className="block text-sm font-medium">{assistant.name}</span>
                                                <span className="block text-xs text-slate-500">{assistant.email}</span>
                                            </span>
                                            <Badge variant={checked ? 'secondary' : 'outline'}>
                                                {checked ? t('billing.downgrade.keepActive') : t('billing.downgrade.disable')}
                                            </Badge>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
                            <Button
                                type="button"
                                variant="outline"
                                className="flex-1"
                                onClick={() => {
                                    setDowngradePlan(null);
                                    setSelectedStaffIds([]);
                                }}
                            >
                                {t('common.cancel')}
                            </Button>
                            <Button
                                type="button"
                                className="flex-1"
                                disabled={checkoutMutation.isPending || staffQuery.isLoading}
                                onClick={submitDowngrade}
                            >
                                {checkoutMutation.isPending ? t('billing.processing') : t('billing.downgrade.continue')}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Card className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-sm">
                <CardHeader className="border-b border-slate-100 bg-slate-50/40 px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                                <CreditCard className="h-4 w-4" />
                            </span>
                            <CardTitle className="text-base font-semibold tracking-tight">{t('billing.paymentHistory')}</CardTitle>
                        </div>
                        <div className="flex items-center gap-2">
                            {subscription?.can_export && (paymentsQuery.data ?? []).length > 0 ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-1.5 rounded-lg px-2.5 text-xs"
                                    onClick={() => {
                                        const data = paymentsQuery.data ?? [];
                                        const totalAmount = data.reduce((s, p) => s + (p.amount ?? 0), 0);
                                        const rows = data.map((p) => [
                                            p.created_at ? formatLocalizedDate(p.created_at, locale, { year: 'numeric', month: 'short', day: 'numeric' }) : '-',
                                            p.plan_name ?? '-',
                                            formatMoney(p.amount, p.currency),
                                            p.status,
                                            p.provider_order_id ?? '-',
                                        ]);
                                        exportRowsToPdf({
                                            filename: buildPdfFilename('billing-history'),
                                            title: t('billing.paymentHistory'),
                                            subtitle: t('billing.subtitle'),
                                            columns: [
                                                t('billing.table.date'),
                                                t('billing.table.plan'),
                                                t('billing.table.amount'),
                                                t('billing.table.status'),
                                                t('billing.table.order'),
                                            ],
                                            rows,
                                            summary: [
                                                { label: t('billing.paymentHistory'), value: String(data.length) },
                                                { label: t('billing.table.amount'), value: formatMoney(totalAmount, 'UZS') },
                                            ],
                                            orientation: 'landscape',
                                        });
                                        toast.success(t('export.downloaded'));
                                    }}
                                >
                                    <Download className="h-3.5 w-3.5" />
                                    PDF
                                </Button>
                            ) : null}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {(paymentsQuery.data ?? []).length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                                <CreditCard className="h-6 w-6" />
                            </span>
                            <p className="text-sm font-medium text-slate-600">{t('billing.noPayments')}</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[640px] border-collapse text-sm">
                                <thead>
                                    <tr className="border-b border-slate-100 bg-slate-50/50">
                                        <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t('billing.table.date')}</th>
                                        <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t('billing.table.plan')}</th>
                                        <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t('billing.table.amount')}</th>
                                        <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t('billing.table.status')}</th>
                                        <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t('billing.table.order')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {(paymentsQuery.data ?? []).map((payment) => {
                                        const isPaid = payment.status === 'paid';
                                        return (
                                            <tr key={payment.id} className="transition-colors hover:bg-slate-50/60">
                                                <td className="px-5 py-3.5 text-sm tabular-nums text-slate-700">
                                                    {payment.created_at
                                                        ? formatLocalizedDate(payment.created_at, locale, {
                                                            year: 'numeric',
                                                            month: 'short',
                                                            day: 'numeric',
                                                        })
                                                        : '-'}
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <div className="flex items-center gap-2">
                                                        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-teal-50 text-teal-700 ring-1 ring-teal-100">
                                                            <Crown className="h-3 w-3" />
                                                        </span>
                                                        <span className="text-sm font-semibold text-slate-900">{payment.plan_name}</span>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3.5 text-right text-sm font-semibold tabular-nums text-slate-900">
                                                    {formatMoney(payment.amount, payment.currency)}
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                                        isPaid
                                                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                                                            : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
                                                    }`}>
                                                        <span className={`h-1.5 w-1.5 rounded-full ${isPaid ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                                        {payment.status}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <span className="font-mono text-xs text-slate-500">{payment.provider_order_id}</span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
