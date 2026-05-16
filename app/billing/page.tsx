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
import { Check, CreditCard, LockKeyhole } from 'lucide-react';

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

            <Card className="rounded-[1.5rem] border-blue-100 bg-white/95 shadow-sm shadow-blue-100/50">
                <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-sm font-medium text-slate-500">{t('billing.currentPlan')}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                            <h2 className="text-2xl font-semibold text-slate-950">
                                {subscription?.plan_name ?? subscription?.plan ?? '-'}
                            </h2>
                            <Badge variant={subscription?.is_read_only ? 'destructive' : 'secondary'}>
                                {subscription?.status ?? 'none'}
                            </Badge>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">
                            {subscription?.ends_at
                                ? t('billing.endsAt', {
                                    date: formatLocalizedDate(subscription.ends_at, locale, {
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric',
                                    }),
                                })
                                : t('billing.noEndDate')}
                        </p>
                        {subscription?.pending_change_effective_at ? (
                            <p className="mt-2 text-sm font-medium text-blue-700">
                                {t('billing.pendingChange', {
                                    date: formatLocalizedDate(subscription.pending_change_effective_at, locale, {
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric',
                                    }),
                                })}
                            </p>
                        ) : null}
                    </div>
                    {subscription?.is_read_only ? (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                            <div className="flex gap-2">
                                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>{t('billing.readOnlyWarning')}</span>
                            </div>
                        </div>
                    ) : null}
                </CardContent>
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
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700',
                        ].join(' ')}
                    >
                        {t(`billing.period.${value}`)}
                    </button>
                ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {plans.map((plan) => {
                    const price = plan.is_trial ? null : getPlanPrice(plan, period);
                    const disabled = plan.is_paid && (!isOwner || price === null || price <= 0 || checkoutMutation.isPending);

                    return (
                        <Card key={plan.code} className="flex min-w-0 rounded-[1.5rem] border-slate-200 bg-white/95 shadow-sm">
                            <CardHeader>
                                <div className="flex items-center justify-between gap-3">
                                    <CardTitle className="min-w-0 break-words text-xl">{plan.name}</CardTitle>
                                    {subscription?.plan === plan.code ? (
                                        <Badge>{t('billing.current')}</Badge>
                                    ) : null}
                                </div>
                                <p className="min-h-10 text-sm text-slate-600">{plan.description}</p>
                            </CardHeader>
                            <CardContent className="flex flex-1 flex-col gap-4">
                                <div>
                                    <p className="text-3xl font-semibold text-slate-950">
                                        {plan.is_trial
                                            ? t('billing.free')
                                            : formatMoney(price, plan.currency)}
                                    </p>
                                    <p className="text-sm text-slate-500">
                                        {plan.is_trial
                                            ? t('billing.trialDays', { days: plan.trial_days ?? 30 })
                                            : t(`billing.period.${period}`)}
                                    </p>
                                </div>
                                <ul className="space-y-2 text-sm text-slate-700">
                                    {[
                                        t('billing.feature.staff', { count: plan.staff_limit }),
                                        t('billing.feature.images', { count: plan.entry_image_limit }),
                                        t('billing.feature.upload', { mb: plan.upload_max_mb }),
                                        plan.can_export ? t('billing.feature.export') : t('billing.feature.noExport'),
                                    ].map((feature) => (
                                        <li key={feature} className="flex gap-2">
                                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                                            <span>{feature}</span>
                                        </li>
                                    ))}
                                </ul>
                                {plan.is_paid ? (
                                    <Button
                                        type="button"
                                        className="mt-auto w-full"
                                        disabled={disabled}
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
                                        <CreditCard className="mr-2 h-4 w-4" />
                                        {isOwner ? t('billing.checkout') : t('billing.ownerOnly')}
                                    </Button>
                                ) : null}
                            </CardContent>
                        </Card>
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
                                                    ? 'border-blue-300 bg-blue-50 text-blue-950'
                                                    : 'border-slate-200 bg-white text-slate-800',
                                                disabled ? 'cursor-not-allowed opacity-50' : 'hover:border-blue-200 hover:bg-blue-50/60',
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

            <Card className="rounded-[1.5rem] border-slate-200 bg-white/95 shadow-sm">
                <CardHeader>
                    <CardTitle>{t('billing.paymentHistory')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <DataTableShell>
                        <Table className={getDataTableClassName('history')}>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t('billing.table.plan')}</TableHead>
                                    <TableHead>{t('billing.table.amount')}</TableHead>
                                    <TableHead>{t('billing.table.status')}</TableHead>
                                    <TableHead>{t('billing.table.order')}</TableHead>
                                    <TableHead>{t('billing.table.date')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(paymentsQuery.data ?? []).map((payment) => (
                                    <TableRow key={payment.id}>
                                        <TableCell>{payment.plan_name}</TableCell>
                                        <TableCell>{formatMoney(payment.amount, payment.currency)}</TableCell>
                                        <TableCell>
                                            <Badge variant={payment.status === 'paid' ? 'secondary' : 'outline'}>
                                                {payment.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="font-mono text-xs">{payment.provider_order_id}</TableCell>
                                        <TableCell>
                                            {payment.created_at
                                                ? formatLocalizedDate(payment.created_at, locale, {
                                                    year: 'numeric',
                                                    month: 'short',
                                                    day: 'numeric',
                                                })
                                                : '-'}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {(paymentsQuery.data ?? []).length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="py-8 text-center text-sm text-slate-500">
                                            {t('billing.noPayments')}
                                        </TableCell>
                                    </TableRow>
                                ) : null}
                            </TableBody>
                        </Table>
                    </DataTableShell>
                </CardContent>
            </Card>
        </div>
    );
}
