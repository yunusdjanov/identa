'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    ArrowLeft,
    BadgeCheck,
    CheckCircle,
    CheckCircle2,
    Clock,
    CreditCard,
    History,
    Key,
    RotateCcw,
    ShieldAlert,
    StickyNote,
    UserPlus,
    XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { AdminHeader } from '@/components/admin/admin-header';
import { AdminDentistBillingLoadingState } from '@/components/layout/page-loading-skeletons';
import { AppErrorState } from '@/components/error/app-error-state';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SubscriptionActionDialog } from './_components/subscription-action-dialog';
import { ActivityTabsCard } from './_components/activity-tabs-card';
import { StateManagementSection } from './_components/state-management-section';
import { DangerZoneSection } from './_components/danger-zone-section';
import { PlanPickerSection } from './_components/plan-picker-section';

import { getApiErrorMessage } from '@/lib/api/client';
import {
    type AdminDentistSubscriptionAction,
    getAdminDentistBilling,
    getCurrentUser,
    listAdminDentistAuditLogs,
    listAdminPlans,
    manageAdminDentistSubscription,
} from '@/lib/api/dentist';
import type {
    ApiAdminDentist,
    ApiBillingPayment,
    ApiPlan,
    ApiSubscriptionSummary,
} from '@/lib/api/types';
import { useInstantLogout } from '@/lib/auth/use-instant-logout';
import { useI18n } from '@/components/providers/i18n-provider';
import { formatLocalizedDate } from '@/lib/i18n/date';
import { localizeSubscriptionNote } from '@/lib/i18n/subscription-notes';
import { toast } from 'sonner';

interface ManageSubscriptionForm {
    paymentMethod: 'cash' | 'p2p' | 'bank_transfer';
    paymentAmount: string;
    note: string;
}

interface SubscriptionDialogState {
    account: ApiAdminDentist;
    action: AdminDentistSubscriptionAction;
}

const BILLING_SUBSCRIPTION_ACTIONS = new Set<AdminDentistSubscriptionAction>([
    'apply_monthly',
    'apply_yearly',
    'activate_monthly',
    'activate_yearly',
    'extend_monthly',
    'extend_yearly',
    'set_basic_monthly',
    'set_basic_yearly',
    'set_pro_monthly',
    'set_pro_yearly',
]);

function createEmptySubscriptionForm(): ManageSubscriptionForm {
    return { paymentMethod: 'cash', paymentAmount: '', note: '' };
}

// Upper bound on the manual payment_amount field — anything above this is
// almost certainly a typo. The dialog component carries its own
// SUBSCRIPTION_NOTE_MAX_LENGTH constant in sync with the backend column.
const PAYMENT_AMOUNT_MAX_VALUE = 1_000_000_000;

/**
 * Type-safe builder for paid-plan subscription actions. Replaces the
 * `as AdminDentistSubscriptionAction` casts used inline; if the backend
 * ever adds a plan code or period the compiler will flag every callsite
 * instead of silently producing an invalid action string at runtime.
 */
const PAID_PLAN_ACTION_MAP: Record<'basic' | 'pro', Record<'monthly' | 'yearly', AdminDentistSubscriptionAction>> = {
    basic: {
        monthly: 'set_basic_monthly',
        yearly: 'set_basic_yearly',
    },
    pro: {
        monthly: 'set_pro_monthly',
        yearly: 'set_pro_yearly',
    },
};

function paidPlanAction(planCode: string, period: 'monthly' | 'yearly'): AdminDentistSubscriptionAction | null {
    if (planCode !== 'basic' && planCode !== 'pro') {
        return null;
    }
    return PAID_PLAN_ACTION_MAP[planCode][period];
}

function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
}

function formatBillingAmount(payment: ApiBillingPayment, locale: string): string {
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: payment.currency || 'UZS',
        maximumFractionDigits: 0,
    }).format(payment.amount);
}

function formatPlanPrice(amount: number, currency: string, locale: string): string {
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency || 'UZS',
        maximumFractionDigits: 0,
    }).format(amount);
}

function formatPaymentsTotal(
    payments: ApiBillingPayment[],
    locale: string,
    summary?: Array<{
        currency: string;
        total: number;
    }>
): string {
    const totals = summary?.length
        ? summary
        : Object.values(payments
            .filter((payment) => payment.status === 'paid')
            .reduce<Record<string, { currency: string; total: number }>>((rows, payment) => {
                const currency = payment.currency || 'UZS';
                const row = rows[currency] ?? { currency, total: 0 };
                row.total += payment.amount;
                rows[currency] = row;
                return rows;
            }, {}));

    return totals
        .map((row) => new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: row.currency,
            maximumFractionDigits: 0,
        }).format(row.total))
        .join(' / ');
}

type Translator = (key: string, variables?: Record<string, string | number>) => string;

function getSubscriptionPlanLabel(
    subscription: ApiSubscriptionSummary | null | undefined,
    t: Translator
): string {
    if (!subscription?.plan) return t('admin.subscription.notConfigured');
    return t(`admin.subscription.plan.${subscription.plan}`);
}

/**
 * Pending plan label — prefers the localized i18n key derived from
 * `pending_plan_code`. Falls back to the frozen backend snapshot
 * `pending_plan_name` when the code is missing (older Subscription rows)
 * so we never show an empty cell.
 */
function getSubscriptionPendingPlanLabel(
    subscription: ApiSubscriptionSummary | null | undefined,
    t: Translator
): string {
    if (!subscription?.pending_plan_code) {
        return subscription?.pending_plan_name ?? '-';
    }
    const key = `admin.subscription.plan.${subscription.pending_plan_code}`;
    const translated = t(key);
    return translated === key ? (subscription.pending_plan_name ?? subscription.pending_plan_code) : translated;
}

function getSubscriptionStatusLabel(
    subscription: ApiSubscriptionSummary | null | undefined,
    t: Translator
): string {
    if (!subscription) return t('subscription.status.none');
    return t(`subscription.status.${subscription.status}`);
}

function getSubscriptionActionLabel(action: AdminDentistSubscriptionAction, t: Translator): string {
    return t(`admin.subscription.action.${action}`);
}

function getSubscriptionStatusBadgeClasses(
    status: ApiSubscriptionSummary['status'] | undefined
): string {
    switch (status) {
        case 'active':
            return 'border-emerald-100 bg-emerald-50 text-emerald-700';
        case 'trialing':
            return 'border-blue-100 bg-blue-50 text-blue-700';
        case 'grace':
            return 'border-amber-100 bg-amber-50 text-amber-700';
        case 'read_only':
            return 'border-orange-100 bg-orange-50 text-orange-700';
        case 'canceled':
            return 'border-slate-200 bg-slate-100 text-slate-600';
        case 'none':
        default:
            return 'border-slate-200 bg-slate-50 text-slate-600';
    }
}

function getAccountStatusBadgeClasses(status: ApiAdminDentist['status']): string {
    switch (status) {
        case 'active':
            return 'border-emerald-100 bg-emerald-50 text-emerald-700';
        case 'blocked':
            return 'border-amber-100 bg-amber-50 text-amber-700';
        case 'deleted':
        default:
            return 'border-slate-200 bg-slate-100 text-slate-600';
    }
}

function getPaymentStatusBadgeClasses(status: ApiBillingPayment['status']): string {
    switch (status) {
        case 'paid':
            return 'border-emerald-100 bg-emerald-50 text-emerald-700';
        case 'pending':
            return 'border-amber-100 bg-amber-50 text-amber-700';
        case 'failed':
            return 'border-red-100 bg-red-50 text-red-700';
        case 'refunded':
            return 'border-blue-100 bg-blue-50 text-blue-700';
        case 'canceled':
        default:
            return 'border-slate-200 bg-slate-100 text-slate-600';
    }
}

function getPaymentStatusLabel(status: ApiBillingPayment['status'], t: Translator): string {
    return t(`admin.billing.payment.status.${status}`);
}

function getPaymentStatusIcon(status: ApiBillingPayment['status']): {
    Icon: LucideIcon;
    iconClassName: string;
} {
    switch (status) {
        case 'paid':
            return { Icon: CheckCircle2, iconClassName: 'bg-emerald-50 text-emerald-600' };
        case 'pending':
            return { Icon: Clock, iconClassName: 'bg-amber-50 text-amber-600' };
        case 'failed':
            return { Icon: XCircle, iconClassName: 'bg-red-50 text-red-600' };
        case 'refunded':
            return { Icon: RotateCcw, iconClassName: 'bg-blue-50 text-blue-600' };
        case 'canceled':
        default:
            return { Icon: XCircle, iconClassName: 'bg-slate-100 text-slate-500' };
    }
}

function getBillingPeriodLabel(period: string | null | undefined, t: Translator): string {
    if (!period) return '-';
    if (period === 'trial' || period === 'monthly' || period === 'yearly') {
        return t(`subscription.plan.${period}`);
    }
    return period;
}

function getAuditEventVisual(eventType: string): {
    Icon: LucideIcon;
    iconClassName: string;
} {
    // Map known event types to a semantic icon + tinted background so the
    // audit timeline reads at a glance (matches the payment history pattern).
    if (eventType.includes('subscription')) {
        return { Icon: CreditCard, iconClassName: 'bg-slate-100 text-slate-700' };
    }
    if (eventType.includes('password')) {
        return { Icon: Key, iconClassName: 'bg-amber-50 text-amber-600' };
    }
    if (eventType.includes('email_verified')) {
        return { Icon: BadgeCheck, iconClassName: 'bg-emerald-50 text-emerald-600' };
    }
    if (eventType.includes('created') || eventType.includes('registered')) {
        return { Icon: UserPlus, iconClassName: 'bg-teal-50 text-teal-600' };
    }
    if (eventType.includes('status')) {
        return { Icon: ShieldAlert, iconClassName: 'bg-amber-50 text-amber-600' };
    }
    if (eventType.includes('refund')) {
        return { Icon: RotateCcw, iconClassName: 'bg-blue-50 text-blue-600' };
    }
    if (eventType.includes('cancel')) {
        return { Icon: XCircle, iconClassName: 'bg-red-50 text-red-600' };
    }
    if (eventType.includes('restore')) {
        return { Icon: CheckCircle, iconClassName: 'bg-emerald-50 text-emerald-600' };
    }
    return { Icon: History, iconClassName: 'bg-slate-100 text-slate-500' };
}

export default function AdminBillingDetailPage() {
    const params = useParams();
    const id = (params?.id ?? '').toString();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { locale, t } = useI18n();
    const handleLogout = useInstantLogout('/admin/login');

    const [subscriptionDialog, setSubscriptionDialog] = useState<SubscriptionDialogState | null>(null);
    const [subscriptionForm, setSubscriptionForm] = useState<ManageSubscriptionForm>(createEmptySubscriptionForm());

    const authQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        retry: false,
    });

    const billingQuery = useQuery({
        queryKey: ['admin', 'dentists', id, 'billing'],
        queryFn: () => getAdminDentistBilling(id),
        enabled: authQuery.data?.role === 'admin' && Boolean(id),
    });

    const plansQuery = useQuery({
        queryKey: ['admin', 'plans'],
        queryFn: listAdminPlans,
        enabled: authQuery.data?.role === 'admin',
        staleTime: 5 * 60_000,
    });

    const auditQuery = useQuery({
        queryKey: ['admin', 'dentists', id, 'audit-logs'],
        queryFn: () => listAdminDentistAuditLogs(id, { perPage: 10 }),
        enabled: authQuery.data?.role === 'admin' && Boolean(id),
        staleTime: 60_000,
    });

    const plans = useMemo<ApiPlan[]>(() => {
        return (plansQuery.data ?? [])
            .filter((p) => p.is_active)
            .sort((a, b) => a.sort_order - b.sort_order);
    }, [plansQuery.data]);

    const subscriptionRequiresPaymentDetails = subscriptionDialog !== null
        && BILLING_SUBSCRIPTION_ACTIONS.has(subscriptionDialog.action);

    const subscriptionMutation = useMutation({
        mutationFn: ({ payload }: { payload: Parameters<typeof manageAdminDentistSubscription>[1] }) =>
            manageAdminDentistSubscription(id, payload),
        onSuccess: (_account, variables) => {
            toast.success(t('admin.toast.subscriptionUpdated', {
                action: getSubscriptionActionLabel(variables.payload.action, t),
            }));
            setSubscriptionDialog(null);
            setSubscriptionForm(createEmptySubscriptionForm());
            queryClient.invalidateQueries({ queryKey: ['admin', 'dentists'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'dentists', id, 'billing'] });
            // Audit panel reads `['admin','audit-logs', id, 'user']` and stays
            // stale for the configured staleTime (60s) — force refresh so the
            // event admin just triggered shows up at the top of the timeline.
            queryClient.invalidateQueries({ queryKey: ['admin', 'audit-logs', id] });
            // Manual apply/extend actions also create a BillingPayment row on
            // the backend — refresh the global admin payments list so the new
            // row shows up if the admin opens it next.
            queryClient.invalidateQueries({ queryKey: ['admin', 'payments'] });
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('admin.error.subscriptionUpdateFailed')));
        },
    });

    const openSubscriptionDialog = (
        account: ApiAdminDentist,
        action: AdminDentistSubscriptionAction
    ) => {
        // Prefill payment_amount with the *target* plan's price for plan-
        // switch actions (set_basic_yearly etc.) so admin doesn't carry over
        // the old plan's amount and silently under-charge. For
        // extend_/activate_/apply_ on the SAME plan/period we keep the
        // current subscription amount (renewal at the same rate).
        const targetPrice = (() => {
            // Plan-switch actions hint plan + period in the action name.
            const isSetBasic = action.startsWith('set_basic_');
            const isSetPro = action.startsWith('set_pro_');
            if (!isSetBasic && !isSetPro) return null;
            const targetPlan = plans.find((p) => p.code === (isSetBasic ? 'basic' : 'pro'));
            if (!targetPlan) return null;
            const period = action.endsWith('_yearly') ? 'yearly' : 'monthly';
            return period === 'yearly' ? targetPlan.yearly_price : targetPlan.monthly_price;
        })();

        const prefillAmount = targetPrice !== null && targetPrice > 0
            ? String(targetPrice)
            : (account.subscription.payment_amount !== null
                ? String(account.subscription.payment_amount)
                : '');

        setSubscriptionForm({
            paymentMethod: account.subscription.payment_method ?? 'cash',
            paymentAmount: prefillAmount,
            note: '',
        });
        setSubscriptionDialog({ account, action });
    };

    const submitSubscriptionAction = () => {
        if (!subscriptionDialog) return;
        const trimmedAmount = subscriptionForm.paymentAmount.trim();
        // Reject scientific notation, hex, comma decimals — only plain decimal
        // digits with at most one dot. Previously `Number('1e6')` returned
        // 1_000_000 silently, letting admin enter unintended amounts.
        const isValidNumeric = trimmedAmount === '' || /^\d+(\.\d{1,2})?$/.test(trimmedAmount);
        const parsedAmount = trimmedAmount === '' ? null : Number(trimmedAmount);
        if (
            !isValidNumeric
            || (parsedAmount !== null && (
                !Number.isFinite(parsedAmount)
                || parsedAmount <= 0
                || parsedAmount > PAYMENT_AMOUNT_MAX_VALUE
            ))
        ) {
            toast.error(t('admin.subscription.amountInvalid'));
            return;
        }
        subscriptionMutation.mutate({
            payload: {
                action: subscriptionDialog.action,
                ...(subscriptionRequiresPaymentDetails
                    ? { payment_method: subscriptionForm.paymentMethod }
                    : {}),
                ...(parsedAmount !== null ? { payment_amount: parsedAmount } : {}),
                ...(subscriptionForm.note.trim() !== '' ? { note: subscriptionForm.note.trim() } : {}),
            },
        });
    };

    useEffect(() => {
        if (authQuery.isError && !authQuery.isLoading) {
            router.replace('/admin/login');
            return;
        }
        if (authQuery.data && authQuery.data.role !== 'admin') {
            router.replace('/');
        }
    }, [authQuery.isError, authQuery.isLoading, authQuery.data, router]);

    // Reuse the same skeleton the Next.js loading.tsx route renders. The
    // earlier inline version showed 3 plain h-32 boxes which didn't match
    // the multi-section real layout (dentist header + plan picker grid +
    // state management + activity card with tabs) and caused a visible
    // relayout flash once auth resolved.
    if (authQuery.isLoading || !authQuery.data || authQuery.data.role !== 'admin') {
        return <AdminDentistBillingLoadingState />;
    }

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(219,234,254,0.55),transparent_34rem),linear-gradient(180deg,#f8fbff_0%,#f8fafc_42%,#f1f5f9_100%)]">
            <AdminHeader active="dashboard" onLogout={handleLogout} />

            <main className="mx-auto max-w-[1440px] space-y-5 px-3 py-6 sm:px-6 sm:py-8 lg:px-8">
                <Link
                    href="/admin"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-slate-900"
                >
                    <ArrowLeft className="h-4 w-4" />
                    {t('admin.staffPage.back')}
                </Link>

                {billingQuery.isLoading ? (
                    // Layout-shaped placeholders so the page doesn't jump
                    // once the data lands: dentist header card with avatar +
                    // identity + 3 inline metric columns, then plan picker
                    // grid, then state-management card, then activity card.
                    // Heights are approximate — the real content sets the
                    // final height once data arrives.
                    <div className="space-y-5">
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60">
                            <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[1.5fr_1fr_1fr_1fr] lg:items-center lg:gap-0">
                                <div className="flex min-w-0 items-center gap-4 lg:pr-4">
                                    <Skeleton className="h-14 w-14 shrink-0 rounded-full sm:h-16 sm:w-16" />
                                    <div className="min-w-0 space-y-2">
                                        <Skeleton className="h-6 w-44 rounded-xl sm:h-7 sm:w-56" />
                                        <Skeleton className="h-4 w-40 rounded-xl" />
                                        <Skeleton className="h-5 w-20 rounded-full" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 divide-y divide-slate-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0 lg:col-span-3 lg:grid-cols-subgrid lg:divide-x-0">
                                    {Array.from({ length: 3 }).map((_, index) => (
                                        <div
                                            key={index}
                                            className="min-w-0 space-y-2 py-3 first:pt-0 last:pb-0 sm:px-4 sm:py-0 lg:border-l lg:border-slate-200 lg:px-5"
                                        >
                                            <Skeleton className="h-3 w-20 rounded-xl" />
                                            <Skeleton className="h-5 w-28 rounded-xl" />
                                            <Skeleton className="h-3 w-16 rounded-xl" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="grid gap-4 md:grid-cols-3">
                            {Array.from({ length: 3 }).map((_, index) => (
                                <Skeleton key={index} className="h-48 rounded-2xl" />
                            ))}
                        </div>
                        <Skeleton className="h-40 rounded-2xl" />
                        <Skeleton className="h-64 rounded-2xl" />
                    </div>
                ) : billingQuery.isError ? (
                    <AppErrorState
                        title={t('common.loadErrorTitle')}
                        description={getApiErrorMessage(billingQuery.error, t('admin.billing.loadFailed'))}
                        retryLabel={t('common.retry')}
                        onRetry={() => billingQuery.refetch()}
                    />
                ) : billingQuery.data ? (() => {
                    // Hoist a narrowed alias so we never need `billingQuery.data!`
                    // inside callbacks. React Query may refetch in the background
                    // and produce a transient undefined; this captures the value
                    // available at render time and keeps closures pointing at it.
                    const billing = billingQuery.data;
                    return (
                    <>
                        {/* Dentist header with inline metrics (identity left, 3 metrics right) */}
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60">
                            <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[1.5fr_1fr_1fr_1fr] lg:items-center lg:gap-0">
                                {/* Identity (column 1: ~33% via 1.5fr) */}
                                <div className="flex min-w-0 items-center gap-4 lg:pr-4">
                                    <Avatar size="lg" className="size-14 sm:size-16">
                                        {billing.dentist.avatar_url ? (
                                            <AvatarImage
                                                src={billing.dentist.avatar_url}
                                                alt={billing.dentist.name}
                                                referrerPolicy="no-referrer"
                                            />
                                        ) : null}
                                        <AvatarFallback className="bg-teal-50 text-lg font-semibold text-teal-700">
                                            {getInitials(billing.dentist.name)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0">
                                        <h1 className="truncate text-xl font-bold tracking-[-0.02em] text-slate-950 sm:text-2xl">
                                            {t('common.doctorPrefix')} {billing.dentist.name}
                                        </h1>
                                        <p className="truncate text-sm text-slate-600">
                                            {billing.dentist.email}
                                        </p>
                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                            <Badge
                                                variant="outline"
                                                className={getAccountStatusBadgeClasses(billing.dentist.status)}
                                            >
                                                {t(`admin.status.${billing.dentist.status}`)}
                                            </Badge>
                                            {billing.dentist.email_verified ? (
                                                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                                                    <BadgeCheck className="h-3.5 w-3.5" />
                                                    {t('admin.emailVerified')}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                                                    <ShieldAlert className="h-3.5 w-3.5" />
                                                    {t('admin.emailUnverified')}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Inline metrics — at lg+ spans cols 2-4 of parent via subgrid (each cell = 1fr of parent) */}
                                <div className="grid grid-cols-1 divide-y divide-slate-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0 lg:col-span-3 lg:grid-cols-subgrid lg:divide-x-0">
                                    <div className="min-w-0 py-3 first:pt-0 sm:px-4 sm:py-0 lg:border-l lg:border-slate-200 lg:px-5">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                                            {t('admin.billing.currentPlan')}
                                        </p>
                                        <p className="mt-1 truncate text-base font-semibold text-slate-950">
                                            {getSubscriptionPlanLabel(billing.subscription, t)}
                                        </p>
                                        <div className="mt-1 flex flex-wrap items-center gap-1">
                                            <Badge
                                                variant="outline"
                                                className={`${getSubscriptionStatusBadgeClasses(billing.subscription.status)} px-1.5 py-0 text-[10px]`}
                                            >
                                                {getSubscriptionStatusLabel(billing.subscription, t)}
                                            </Badge>
                                            {billing.subscription.cancel_at_period_end ? (
                                                <Badge
                                                    variant="outline"
                                                    className="border-amber-100 bg-amber-50 px-1.5 py-0 text-[10px] text-amber-700"
                                                >
                                                    {t('admin.subscription.cancelAtPeriodEnd')}
                                                </Badge>
                                            ) : null}
                                        </div>
                                    </div>
                                    <div className="min-w-0 py-3 sm:px-4 sm:py-0 lg:border-l lg:border-slate-200 lg:px-5">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                                            {t('admin.billing.endsAt')}
                                        </p>
                                        <p className="mt-1 truncate text-base font-semibold text-slate-950">
                                            {billing.subscription.ends_at
                                                ? formatLocalizedDate(billing.subscription.ends_at, locale, {
                                                    year: 'numeric',
                                                    month: 'short',
                                                    day: 'numeric',
                                                })
                                                : t('admin.subscription.notConfigured')}
                                        </p>
                                        <p className="mt-1 truncate text-xs text-slate-500">
                                            {getBillingPeriodLabel(billing.subscription.billing_period, t)}
                                        </p>
                                    </div>
                                    <div className="min-w-0 py-3 last:pb-0 sm:px-4 sm:py-0 lg:border-l lg:border-slate-200 lg:px-5">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                                            {t('admin.billing.staff')}
                                        </p>
                                        <p className="mt-1 truncate text-base font-semibold text-slate-950">
                                            {t('admin.billing.staffCount', {
                                                active: billing.staff.active,
                                                total: billing.subscription.staff_limit ?? billing.staff.total,
                                            })}
                                        </p>
                                        <p className="mt-1 truncate text-xs text-slate-500">
                                            {t('admin.billing.usageSummary', {
                                                patients: billing.usage.patients,
                                                appointments: billing.usage.appointments,
                                                payments: billing.usage.payments,
                                            })}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Subscription note (admin entered) */}
                        {billing.subscription.note ? (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
                                <div className="flex items-start gap-3">
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                                        <StickyNote className="h-4 w-4" />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700">
                                            {t('admin.billing.note.label')}
                                        </p>
                                        <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-900">
                                            {localizeSubscriptionNote(billing.subscription.note, t)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        {/* Pending change alert — shows target plan + period
                            in addition to the effective date so admin knows
                            exactly what will activate at period end. */}
                        {billing.subscription.pending_change_effective_at ? (
                            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-3 text-sm text-blue-800">
                                {billing.subscription.pending_plan_name && billing.subscription.pending_billing_period
                                    ? t('admin.billing.pendingChangeAlertDetailed', {
                                        plan: getSubscriptionPendingPlanLabel(billing.subscription, t),
                                        period: t(`subscription.plan.${billing.subscription.pending_billing_period}`),
                                        date: formatLocalizedDate(
                                            billing.subscription.pending_change_effective_at,
                                            locale,
                                            { year: 'numeric', month: 'short', day: 'numeric' }
                                        ),
                                    })
                                    : t('admin.billing.pendingChangeAlert', {
                                        date: formatLocalizedDate(
                                            billing.subscription.pending_change_effective_at,
                                            locale,
                                            { year: 'numeric', month: 'short', day: 'numeric' }
                                        ),
                                    })}
                            </div>
                        ) : null}

                        {/* Plan picker — extracted to _components/plan-picker-section.tsx */}
                        <PlanPickerSection
                            dentist={billing.dentist}
                            subscription={billing.subscription}
                            plans={plans}
                            plansLoading={plansQuery.isLoading}
                            isPending={subscriptionMutation.isPending}
                            onAction={openSubscriptionDialog}
                            formatPlanPrice={(amount, currency) => formatPlanPrice(amount, currency, locale)}
                            paidPlanAction={paidPlanAction}
                        />

                        {/* State management — extracted to _components/state-management-section.tsx */}
                        <StateManagementSection
                            dentist={billing.dentist}
                            subscription={billing.subscription}
                            isPending={subscriptionMutation.isPending}
                            onAction={openSubscriptionDialog}
                            getSubscriptionActionLabel={(action) => getSubscriptionActionLabel(action, t)}
                        />

                        {/* Danger zone — extracted to _components/danger-zone-section.tsx */}
                        <DangerZoneSection
                            dentist={billing.dentist}
                            subscription={billing.subscription}
                            isPending={subscriptionMutation.isPending}
                            onAction={openSubscriptionDialog}
                            getSubscriptionActionLabel={(action) => getSubscriptionActionLabel(action, t)}
                        />

                        {/* Activity card — extracted to _components/activity-tabs-card.tsx */}
                        <ActivityTabsCard
                            payments={billing.payments}
                            paymentHistoryTotal={billing.payment_history?.total ?? billing.payments.length}
                            paymentHistoryTruncated={billing.payment_history?.truncated ?? false}
                            paidPaymentCount={billing.payment_history?.paid_count
                                ?? billing.payments.filter((payment) => payment.status === 'paid').length}
                            auditLoading={auditQuery.isLoading}
                            auditError={auditQuery.isError
                                ? getApiErrorMessage(auditQuery.error, t('admin.billing.auditLog.loadFailed'))
                                : null}
                            auditEntries={auditQuery.data?.data}
                            onRetryAudit={() => auditQuery.refetch()}
                            formatTotal={() => formatPaymentsTotal(
                                billing.payments,
                                locale,
                                billing.payment_history?.paid_totals_by_currency
                            )}
                            formatPaymentAmount={(payment) => formatBillingAmount(payment, locale)}
                            getBillingPeriodLabel={(period) => getBillingPeriodLabel(period, t)}
                            getPaymentStatusBadgeClasses={getPaymentStatusBadgeClasses}
                            getPaymentStatusLabel={(status) => getPaymentStatusLabel(status, t)}
                            getPaymentStatusIcon={getPaymentStatusIcon}
                            getAuditEventVisual={getAuditEventVisual}
                        />
                    </>
                    );
                })() : null}
            </main>

            {/* Action confirm dialog — extracted to its own component to keep
                this page under control. Encapsulates the period-switch and
                staff-downgrade warning logic + payment/note form. */}
            <SubscriptionActionDialog
                state={subscriptionDialog}
                form={subscriptionForm}
                onFormChange={setSubscriptionForm}
                isPending={subscriptionMutation.isPending}
                plans={plans}
                onClose={() => {
                    setSubscriptionDialog(null);
                    setSubscriptionForm(createEmptySubscriptionForm());
                }}
                onSubmit={submitSubscriptionAction}
                getSubscriptionActionLabel={(action) => getSubscriptionActionLabel(action, t)}
                getSubscriptionPlanLabel={(sub) => getSubscriptionPlanLabel(sub, t)}
                getSubscriptionStatusLabel={(sub) => getSubscriptionStatusLabel(sub, t)}
            />
        </div>
    );
}
