'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { AdminDashboardLoadingState } from '@/components/layout/page-loading-skeletons';
import { PageHeader } from '@/components/ui/page-shell';
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
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    type AdminDentistSubscriptionAction,
    createAdminDentist,
    deleteAdminDentist,
    getCurrentUser,
    getAdminDentistBilling,
    listAdminDentists,
    listAdminPlans,
    manageAdminDentistSubscription,
    resetAdminDentistPassword,
    restoreAdminDentist,
    updateAdminDentistStatus,
    verifyAdminDentistEmail,
} from '@/lib/api/dentist';
import type { ApiAdminDentist, ApiBillingPayment, ApiPlan, ApiSubscriptionSummary } from '@/lib/api/types';
import { getApiErrorMessage } from '@/lib/api/client';
import { toast } from 'sonner';
import {
    Users,
    UserCheck,
    UserPlus,
    Search,
    MoreVertical,
    Ban,
    CheckCircle,
    Key,
    Trash2,
    CreditCard,
    MailCheck,
    BadgeCheck,
    ShieldAlert,
    RotateCcw,
    CheckCircle2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/ui/empty-state';
import {
    INPUT_LIMITS,
    getEmailValidationMessage,
    getPasswordValidationMessage,
    getTextValidationMessage,
} from '@/lib/input-validation';
import { truncateForUi } from '@/lib/utils';
import { useI18n } from '@/components/providers/i18n-provider';
import { formatLocalizedDate } from '@/lib/i18n/date';
import { AdminHeader } from '@/components/admin/admin-header';
import { AppErrorState } from '@/components/error/app-error-state';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import { useInstantLogout } from '@/lib/auth/use-instant-logout';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';

interface CreateDentistForm {
    name: string;
    email: string;
    practiceName: string;
    password: string;
}

interface ResetPasswordForm {
    newPassword: string;
    confirmPassword: string;
}

interface ManageSubscriptionForm {
    paymentMethod: 'cash' | 'p2p' | 'bank_transfer';
    paymentAmount: string;
    note: string;
}

interface SubscriptionDialogState {
    account: ApiAdminDentist;
    action: AdminDentistSubscriptionAction;
}

const ADMIN_DENTISTS_PER_PAGE = 10;
const ADMIN_NAME_UI_LIMIT = 25;
const ADMIN_EMAIL_UI_LIMIT = 30;
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
    return {
        paymentMethod: 'cash',
        paymentAmount: '',
        note: '',
    };
}

function getSubscriptionPlanLabel(
    subscription: ApiSubscriptionSummary | null | undefined,
    t: (key: string, variables?: Record<string, string | number>) => string
): string {
    if (!subscription?.plan) {
        return t('admin.subscription.notConfigured');
    }

    return t(`admin.subscription.plan.${subscription.plan}`);
}

function getSubscriptionStatusLabel(
    subscription: ApiSubscriptionSummary | null | undefined,
    t: (key: string, variables?: Record<string, string | number>) => string
): string {
    if (!subscription) {
        return t('subscription.status.none');
    }

    return t(`subscription.status.${subscription.status}`);
}

function getSubscriptionActionLabel(
    action: AdminDentistSubscriptionAction,
    t: (key: string, variables?: Record<string, string | number>) => string
): string {
    return t(`admin.subscription.action.${action}`);
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

function getPaymentStatusLabel(
    status: ApiBillingPayment['status'],
    t: (key: string, variables?: Record<string, string | number>) => string
): string {
    return t(`admin.billing.payment.status.${status}`);
}

function getBillingPeriodLabel(
    period: string | null | undefined,
    t: (key: string, variables?: Record<string, string | number>) => string
): string {
    if (!period) {
        return '-';
    }
    if (period === 'trial' || period === 'monthly' || period === 'yearly') {
        return t(`subscription.plan.${period}`);
    }
    return period;
}

// The inline `AdminDashboardLoadingSkeleton` was removed in favour of the
// shared `AdminDashboardLoadingState` (page-loading-skeletons.tsx). The
// inline version drew an uneven 7-col row pattern and lacked the
// Active/Archive tabs strip + Add-dentist button that the real CardHeader
// renders, which produced a visible layout jump on every revalidation of
// the auth or accounts query. The shared skeleton mirrors all three
// (tabs + search + button + 7-col grid) and matches the route-level
// `app/admin/loading.tsx`.

export default function AdminDashboardPage() {
    const { t, locale } = useI18n();
    const router = useRouter();
    const queryClient = useQueryClient();
    const handleLogout = useInstantLogout('/admin/login');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'active' | 'archive'>('active');
    const [page, setPage] = useState(1);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [resetPasswordTarget, setResetPasswordTarget] = useState<{ id: string; name: string } | null>(
        null
    );
    const [deleteTarget, setDeleteTarget] = useState<ApiAdminDentist | null>(null);
    const [subscriptionDialog, setSubscriptionDialog] = useState<SubscriptionDialogState | null>(null);
    const [billingDetailsTarget, setBillingDetailsTarget] = useState<ApiAdminDentist | null>(null);
    // Track which row triggered the in-flight global mutations so only that
    // row's menu items are disabled (instead of disabling every row whenever
    // any mutation is pending). Cleared in each mutation's onSettled.
    const [activeMutationRowId, setActiveMutationRowId] = useState<string | null>(null);
    const [newDentist, setNewDentist] = useState<CreateDentistForm>({
        name: '',
        email: '',
        practiceName: '',
        password: '',
    });
    const [createSubmitAttempted, setCreateSubmitAttempted] = useState(false);
    const [resetPasswordForm, setResetPasswordForm] = useState<ResetPasswordForm>({
        newPassword: '',
        confirmPassword: '',
    });
    const [subscriptionForm, setSubscriptionForm] = useState<ManageSubscriptionForm>(
        createEmptySubscriptionForm()
    );
    const [resetPasswordSubmitAttempted, setResetPasswordSubmitAttempted] = useState(false);
    const createDentistNameError = getTextValidationMessage(newDentist.name, {
        label: t('admin.form.dentistName'),
        required: true,
        min: 3,
        max: INPUT_LIMITS.personName,
    });
    const createDentistEmailError = getEmailValidationMessage(newDentist.email, { required: true });
    const createDentistPracticeNameError = getTextValidationMessage(newDentist.practiceName, {
        label: t('admin.form.practiceName'),
        min: 3,
        max: INPUT_LIMITS.practiceName,
    });
    const createDentistPasswordError = getPasswordValidationMessage(newDentist.password, { required: true });
    const createDentistHasErrors = Boolean(
        createDentistNameError
        || createDentistEmailError
        || createDentistPracticeNameError
        || createDentistPasswordError
    );
    const resetPasswordError = getPasswordValidationMessage(resetPasswordForm.newPassword, { required: true });
    const resetPasswordMismatch = resetPasswordForm.confirmPassword.length > 0
        && resetPasswordForm.newPassword !== resetPasswordForm.confirmPassword;
    const resetPasswordConfirmationError = !resetPasswordForm.confirmPassword
        ? t('register.passwordConfirmRequired')
        : resetPasswordMismatch
            ? t('register.passwordMismatch')
            : null;
    const handleCreateModalOpenChange = (open: boolean) => {
        // Refuse to dismiss mid-submission so the admin doesn't lose the
        // form they just filled in while the network round-trip resolves.
        // The success/error handlers explicitly close the dialog.
        if (!open && createMutation.isPending) return;
        setShowCreateModal(open);
        if (!open) {
            setCreateSubmitAttempted(false);
        }
    };
    const openSubscriptionDialog = (
        account: ApiAdminDentist,
        action: AdminDentistSubscriptionAction
    ) => {
        setSubscriptionDialog({ account, action });
        setSubscriptionForm(createEmptySubscriptionForm());
    };

    const authQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        retry: false,
    });
    // Debounce the search input: without this each keystroke spawns a query,
    // saturating the network on slow links and inflating server load. 300 ms
    // matches the /admin/payments page debounce so behaviour is consistent.
    const debouncedSearch = useDebouncedValue(searchQuery.trim(), 300);

    const accountsQuery = useQuery({
        queryKey: ['admin', 'dentists', page, debouncedSearch, viewMode],
        queryFn: () =>
            listAdminDentists({
                page,
                perPage: ADMIN_DENTISTS_PER_PAGE,
                filter: {
                    search: debouncedSearch || undefined,
                    status: viewMode === 'archive' ? 'deleted' : undefined,
                },
            }),
        enabled: authQuery.data?.role === 'admin',
        placeholderData: (previousData) => previousData,
    });

    const billingDetailsQuery = useQuery({
        queryKey: ['admin', 'dentists', billingDetailsTarget?.id, 'billing'],
        queryFn: () => getAdminDentistBilling(billingDetailsTarget?.id ?? ''),
        enabled: authQuery.data?.role === 'admin' && billingDetailsTarget !== null,
    });

    const plansQuery = useQuery({
        queryKey: ['admin', 'plans'],
        queryFn: () => listAdminPlans(),
        enabled: authQuery.data?.role === 'admin' && billingDetailsTarget !== null,
        staleTime: 5 * 60_000,
    });

    const plans = useMemo<ApiPlan[]>(() => {
        return (plansQuery.data ?? [])
            .filter((p) => p.is_active)
            .sort((a, b) => a.sort_order - b.sort_order);
    }, [plansQuery.data]);

    useEffect(() => {
        if (authQuery.isError && !authQuery.isLoading) {
            router.push('/admin/login');
            return;
        }

        if (authQuery.data && authQuery.data.role !== 'admin') {
            router.push('/dashboard');
        }
    }, [authQuery.data, authQuery.isError, authQuery.isLoading, router]);

    const createMutation = useMutation({
        mutationFn: () =>
            createAdminDentist({
                name: newDentist.name.trim(),
                email: newDentist.email.trim(),
                password: newDentist.password,
                password_confirmation: newDentist.password,
                practice_name: newDentist.practiceName.trim() || undefined,
            }),
        onSuccess: () => {
            toast.success(t('admin.toast.accountCreated', { name: newDentist.name }));
            setShowCreateModal(false);
            setCreateSubmitAttempted(false);
            setNewDentist({ name: '', email: '', practiceName: '', password: '' });
            queryClient.invalidateQueries({ queryKey: ['admin', 'dentists'] });
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('admin.error.createAccountFailed')));
        },
    });

    const statusMutation = useMutation({
        mutationFn: ({ id, status }: { id: string; status: 'active' | 'blocked' }) => {
            setActiveMutationRowId(id);
            return updateAdminDentistStatus(id, status);
        },
        onSettled: () => setActiveMutationRowId(null),
        onSuccess: (account, variables) => {
            toast.success(
                account.status === 'blocked'
                    ? t('admin.toast.accountBlocked')
                    : t('admin.toast.accountActivated')
            );
            queryClient.invalidateQueries({ queryKey: ['admin', 'dentists'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'dentists', variables.id, 'billing'] });
            // Status change is audit-worthy — invalidate audit log so the
            // detail page history tab reflects the action without delay.
            queryClient.invalidateQueries({ queryKey: ['admin', 'audit-logs'] });
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('admin.error.updateStatusFailed')));
        },
    });

    const subscriptionMutation = useMutation({
        mutationFn: ({
            id,
            payload,
        }: {
            id: string;
            payload: Parameters<typeof manageAdminDentistSubscription>[1];
        }) => manageAdminDentistSubscription(id, payload),
        onSuccess: (_account, variables) => {
            toast.success(t('admin.toast.subscriptionUpdated', {
                action: getSubscriptionActionLabel(variables.payload.action, t),
            }));
            setSubscriptionDialog(null);
            setSubscriptionForm(createEmptySubscriptionForm());
            queryClient.invalidateQueries({ queryKey: ['admin', 'dentists'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'dentists', variables.id, 'billing'] });
            // Refresh audit log too so the action just performed shows up on
            // the detail page's history tab without staleTime delay.
            queryClient.invalidateQueries({ queryKey: ['admin', 'audit-logs'] });
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('admin.error.subscriptionUpdateFailed')));
        },
    });

    const resetMutation = useMutation({
        mutationFn: () => {
            if (!resetPasswordTarget) {
                // Reject (not throw) so TanStack's onError path fires —
                // synchronous throws inside mutationFn can surface as an
                // unhandled rejection in some versions.
                return Promise.reject(new Error(t('admin.error.selectDentistBeforeReset')));
            }

            return resetAdminDentistPassword(resetPasswordTarget.id, {
                new_password: resetPasswordForm.newPassword,
                new_password_confirmation: resetPasswordForm.confirmPassword,
            });
        },
        onSuccess: () => {
            toast.success(t('admin.toast.passwordReset'));
            // Capture the id before clearing the form so the invalidate keys
            // are stable (resetPasswordTarget gets nulled right after).
            const targetId = resetPasswordTarget?.id;
            setResetPasswordTarget(null);
            setResetPasswordForm({ newPassword: '', confirmPassword: '' });
            if (targetId) {
                queryClient.invalidateQueries({ queryKey: ['admin', 'dentists', targetId, 'billing'] });
            }
            queryClient.invalidateQueries({ queryKey: ['admin', 'audit-logs'] });
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('admin.error.resetPasswordFailed')));
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => deleteAdminDentist(id),
        onSuccess: (_account, id) => {
            // Capture the name BEFORE setDeleteTarget(null) clears it so the
            // toast carries the dentist's name for context.
            const deletedName = deleteTarget?.name;
            toast.success(
                deletedName
                    ? t('admin.toast.accountDeletedNamed', { name: deletedName })
                    : t('admin.toast.accountDeleted')
            );
            setDeleteTarget(null);
            // If we just removed the last row on the current page, drop back
            // a page so the user doesn't land on an empty paginated view.
            if (accounts.length === 1 && page > 1) {
                setPage((current) => Math.max(1, current - 1));
            }
            queryClient.invalidateQueries({ queryKey: ['admin', 'dentists'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'dentists', id, 'billing'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'audit-logs'] });
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('admin.error.deleteAccountFailed')));
        },
    });

    const verifyMutation = useMutation({
        mutationFn: (id: string) => {
            setActiveMutationRowId(id);
            return verifyAdminDentistEmail(id);
        },
        onSettled: () => setActiveMutationRowId(null),
        onSuccess: (_account, id) => {
            toast.success(t('admin.toast.emailVerified'));
            queryClient.invalidateQueries({ queryKey: ['admin', 'dentists'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'dentists', id, 'billing'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'audit-logs'] });
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('admin.error.verifyEmailFailed')));
        },
    });

    const restoreMutation = useMutation({
        mutationFn: (id: string) => {
            setActiveMutationRowId(id);
            return restoreAdminDentist(id);
        },
        onSettled: () => setActiveMutationRowId(null),
        onSuccess: (_account, id) => {
            toast.success(t('admin.toast.accountRestored'));
            queryClient.invalidateQueries({ queryKey: ['admin', 'dentists'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'dentists', id, 'billing'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'audit-logs'] });
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('admin.error.restoreFailed')));
        },
    });

    const accounts = accountsQuery.data?.data ?? [];
    const pagination = accountsQuery.data?.meta?.pagination;
    const summary = accountsQuery.data?.meta?.summary;

    // Clamp current page when the server reports fewer total pages than the
    // local `page` state (admin deletes the last entry on page 5 → backend
    // returns 4 pages; without this we'd show "Page 5 of 4" + empty body).
    // Adjusted during render (not in an effect) so the clamp lands before
    // paint; the `page > lastPage` guard self-terminates, so no render loop.
    if (pagination) {
        const lastPage = Math.max(1, pagination.total_pages);
        if (page > lastPage) {
            setPage(lastPage);
        }
    }

    const stats = useMemo(() => {
        // Prefer the backend's GLOBAL summary (summary.total_count etc.) over
        // pagination.total so the cards stay accurate while the user filters
        // by search/view mode. Falling back to pagination.total would conflate
        // "filtered total" with "system total" — confusing UX.
        const totalDentists = Number(summary?.total_count ?? pagination?.total ?? accounts.length);
        const activeDentists = Number(
            summary?.active_count ?? accounts.filter((account) => account.status === 'active').length
        );
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setHours(0, 0, 0, 0);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

        const newRegistrations = Number(
            summary?.new_registrations_7d
            ?? accounts.filter((account) => new Date(account.registration_date) >= sevenDaysAgo).length
        );
        // If we only have a filtered-view total (no `summary.total_count` from
        // backend), surface that to the UI so cards can label themselves.
        const isFilteredFallback = summary === undefined || summary === null;

        return { totalDentists, activeDentists, newRegistrations, isFilteredFallback };
    }, [accounts, pagination?.total, summary]);
    const subscriptionRequiresPaymentDetails = subscriptionDialog !== null
        && BILLING_SUBSCRIPTION_ACTIONS.has(subscriptionDialog.action);

    const submitSubscriptionAction = () => {
        if (!subscriptionDialog) {
            return;
        }

        const trimmedAmount = subscriptionForm.paymentAmount.trim();
        const parsedAmount = trimmedAmount === '' ? null : Number(trimmedAmount);
        if (parsedAmount !== null && (!Number.isFinite(parsedAmount) || parsedAmount <= 0)) {
            toast.error(t('admin.subscription.amountInvalid'));
            return;
        }

        subscriptionMutation.mutate({
            id: subscriptionDialog.account.id,
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

    if (authQuery.isLoading || (authQuery.data?.role === 'admin' && accountsQuery.isLoading)) {
        return <AdminDashboardLoadingState />;
    }

    if (accountsQuery.isError) {
        return (
            <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(219,234,254,0.55),transparent_34rem),linear-gradient(180deg,#f8fbff_0%,#f8fafc_42%,#f1f5f9_100%)]">
                <AdminHeader
                    active="dashboard"
                    onLogout={handleLogout}
                />
                <main className="p-4 sm:p-5 lg:p-6">
                    <AppErrorState
                        title={t('common.loadErrorTitle')}
                        description={getApiErrorMessage(accountsQuery.error, t('admin.error.loadAccountsFailed'))}
                        retryLabel={t('common.retry')}
                        onRetry={() => accountsQuery.refetch()}
                        className="min-h-[24rem] px-0 py-0"
                    />
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(219,234,254,0.55),transparent_34rem),linear-gradient(180deg,#f8fbff_0%,#f8fafc_42%,#f1f5f9_100%)]">
            <AdminHeader
                active="dashboard"
                onLogout={handleLogout}
            />

            <div className="p-3 sm:p-5 lg:p-6">
            <div className="mx-auto max-w-[1440px] space-y-5 lg:space-y-6">
                    <PageHeader title={t('admin.dashboardTitle')} description={t('admin.dashboardSubtitle')} />

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-6">
                        <Card className="interactive-card metric-hover-card metric-hover-slate rounded-2xl border-slate-200 bg-white shadow-sm shadow-slate-200/50">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">{t('admin.stats.totalDentists')}</CardTitle>
                                <Users className="h-4 w-4 text-slate-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold tracking-[-0.03em] text-slate-950">{stats.totalDentists}</div>
                            </CardContent>
                        </Card>

                        <Card className="interactive-card metric-hover-card metric-hover-emerald rounded-2xl border-emerald-100 bg-white shadow-sm shadow-emerald-100/50">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">{t('admin.stats.activeDentists')}</CardTitle>
                                <UserCheck className="h-4 w-4 text-emerald-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold tracking-[-0.03em] text-slate-950">{stats.activeDentists}</div>
                                <p className="text-xs text-muted-foreground">
                                    {stats.totalDentists === 0
                                        ? '0'
                                        : ((stats.activeDentists / stats.totalDentists) * 100).toFixed(0)}
                                    {t('admin.stats.percentOfTotal')}
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="interactive-card metric-hover-card metric-hover-blue rounded-2xl border-blue-100 bg-white shadow-sm shadow-blue-100/50">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">{t('admin.stats.newLast7Days')}</CardTitle>
                                <UserPlus className="h-4 w-4 text-blue-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold tracking-[-0.03em] text-slate-950">{stats.newRegistrations}</div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="overflow-hidden rounded-2xl bg-white">
                        <CardHeader className="pb-4">
                            {/* Title temporarily hidden per user request — the
                                page-level PageHeader above already announces
                                this is the dentists dashboard so the inner
                                card title was redundant. */}
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                                <Tabs
                                    value={viewMode}
                                    onValueChange={(value) => {
                                        setViewMode(value as 'active' | 'archive');
                                        setPage(1);
                                    }}
                                    className="self-start"
                                >
                                    <TabsList>
                                        <TabsTrigger value="active" className="gap-2">
                                            <UserCheck className="h-4 w-4" />
                                            {t('admin.viewActive')}
                                        </TabsTrigger>
                                        <TabsTrigger value="archive" className="gap-2">
                                            <Trash2 className="h-4 w-4" />
                                            {t('admin.viewArchive')}
                                        </TabsTrigger>
                                    </TabsList>
                                </Tabs>
                                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
                                    <div className="relative flex-1 sm:w-64">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                        <Input
                                            placeholder={t('admin.searchPlaceholder')}
                                            value={searchQuery}
                                            onChange={(event) => {
                                                setSearchQuery(event.target.value);
                                                setPage(1);
                                            }}
                                            className="h-9 rounded-xl border-slate-200 bg-white pl-10 shadow-xs"
                                            maxLength={INPUT_LIMITS.shortText}
                                        />
                                    </div>
                                    <Button className="w-full rounded-xl sm:w-auto" onClick={() => setShowCreateModal(true)}>
                                        <UserPlus className="w-4 h-4 sm:mr-2" />
                                        <span className="sm:inline">{t('admin.createButton')}</span>
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="px-4 pb-5 sm:px-5">
                            <DataTableShell>
                                <Table className={getDataTableClassName('standard')}>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>{t('admin.table.name')}</TableHead>
                                            <TableHead>{t('admin.table.email')}</TableHead>
                                            <TableHead>{t('admin.table.subscription')}</TableHead>
                                            <TableHead>{t('admin.table.registrationDate')}</TableHead>
                                            <TableHead>{t('admin.table.status')}</TableHead>
                                            <TableHead>{t('admin.table.lastLogin')}</TableHead>
                                            <TableHead className="text-right">{t('admin.table.actions')}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {accounts.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center text-slate-500 py-8">
                                                    {debouncedSearch
                                                        ? t('admin.empty.search', { query: debouncedSearch })
                                                        : viewMode === 'archive'
                                                            ? t('admin.empty.archive')
                                                            : t('admin.empty')}
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            accounts.map((account) => (
                                                <TableRow key={account.id}>
                                                    <TableCell
                                                        className="max-w-[18rem]"
                                                        title={`${t('common.doctorPrefix')} ${account.name}`}
                                                    >
                                                        <div className="flex items-center gap-2.5 min-w-0">
                                                            <Avatar>
                                                                {account.avatar_url ? (
                                                                    /* Avatar URL is user-uploaded and rendered cross-
                                                                       origin. `no-referrer` blocks admin-session URL
                                                                       leak to the avatar host via the Referer header. */
                                                                    <AvatarImage
                                                                        src={account.avatar_url}
                                                                        alt={account.name}
                                                                        referrerPolicy="no-referrer"
                                                                    />
                                                                ) : null}
                                                                <AvatarFallback className="bg-teal-50 text-teal-700 font-semibold">
                                                                    {getInitials(account.name)}
                                                                </AvatarFallback>
                                                            </Avatar>
                                                            <span className="truncate font-medium text-slate-900">
                                                                {t('common.doctorPrefix')} {truncateForUi(account.name, ADMIN_NAME_UI_LIMIT)}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="max-w-[18rem]">
                                                        <div className="truncate" title={account.email}>
                                                            {truncateForUi(account.email, ADMIN_EMAIL_UI_LIMIT)}
                                                        </div>
                                                        {account.email_verified ? (
                                                            <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                                                                <BadgeCheck className="h-3.5 w-3.5" />
                                                                {t('admin.emailVerified')}
                                                            </span>
                                                        ) : (
                                                            <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                                                                <ShieldAlert className="h-3.5 w-3.5" />
                                                                {t('admin.emailUnverified')}
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="min-w-[15rem]">
                                                        <div className="space-y-2">
                                                            <p className="text-sm font-medium text-slate-900">
                                                                {t('admin.subscription.planSummary', {
                                                                    plan: getSubscriptionPlanLabel(account.subscription, t),
                                                                    status: getSubscriptionStatusLabel(account.subscription, t),
                                                                })}
                                                            </p>
                                                            <p className="text-xs text-slate-600">
                                                                {account.subscription?.ends_at
                                                                    ? t('admin.subscription.paidUntil', {
                                                                        date: formatLocalizedDate(
                                                                            account.subscription.ends_at,
                                                                            locale,
                                                                            {
                                                                                year: 'numeric',
                                                                                month: 'short',
                                                                                day: 'numeric',
                                                                            }
                                                                        ),
                                                                    })
                                                                    : t('admin.subscription.notConfigured')}
                                                            </p>
                                                            <p className="text-xs text-slate-500">
                                                                {account.subscription?.staff_limit === null
                                                                    ? t('admin.subscription.staffUnlimited', {
                                                                        count: account.subscription?.active_staff_count ?? 0,
                                                                    })
                                                                    : t('admin.subscription.staffUsage', {
                                                                        count: account.subscription?.active_staff_count ?? 0,
                                                                        limit: account.subscription?.staff_limit ?? 0,
                                                                    })}
                                                            </p>
                                                            {account.subscription?.cancel_at_period_end ? (
                                                                <p className="text-xs font-medium text-amber-700">
                                                                    {t('admin.subscription.cancelAtPeriodEnd')}
                                                                </p>
                                                            ) : null}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        {formatLocalizedDate(account.registration_date, locale, {
                                                            year: 'numeric',
                                                            month: 'short',
                                                            day: 'numeric',
                                                        })}
                                                    </TableCell>
                                                    <TableCell>
                                                        {account.status === 'active' ? (
                                                            <Badge variant="outline" className="border-emerald-100 bg-emerald-50 text-emerald-700">{t('admin.status.active')}</Badge>
                                                        ) : null}
                                                        {account.status === 'blocked' ? (
                                                            <Badge variant="outline" className="border-amber-100 bg-amber-50 text-amber-700">{t('admin.status.blocked')}</Badge>
                                                        ) : null}
                                                        {account.status === 'deleted' ? (
                                                            <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-600">
                                                                {t('admin.status.deleted')}
                                                            </Badge>
                                                        ) : null}
                                                    </TableCell>
                                                    <TableCell>
                                                        {account.last_login
                                                            ? formatLocalizedDate(account.last_login, locale, {
                                                                year: 'numeric',
                                                                month: 'short',
                                                                day: 'numeric',
                                                            })
                                                            : t('patients.never')}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <DropdownMenu modal={false}>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    aria-label={t('admin.rowActions', { name: account.name })}
                                                                >
                                                                    <MoreVertical className="h-4 w-4" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuItem
                                                                    onClick={() =>
                                                                        router.push(`/admin/dentists/${account.id}/staff`)
                                                                    }
                                                                >
                                                                    <Users className="w-4 h-4 mr-2" />
                                                                    {t('admin.viewStaff')}
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => router.push(`/admin/dentists/${account.id}/billing`)}>
                                                                    <CreditCard className="w-4 h-4 mr-2" />
                                                                    {t('admin.billing.viewDetails')}
                                                                </DropdownMenuItem>
                                                                <DropdownMenuSeparator />
                                                                {account.status !== 'deleted' ? (
                                                                    <>
                                                                        <DropdownMenuItem
                                                                            onClick={() =>
                                                                                statusMutation.mutate({
                                                                                    id: account.id,
                                                                                    status:
                                                                                        account.status === 'blocked'
                                                                                            ? 'active'
                                                                                            : 'blocked',
                                                                                })
                                                                            }
                                                                            disabled={activeMutationRowId === account.id}
                                                                        >
                                                                            {account.status === 'blocked' ? (
                                                                                <>
                                                                                    <CheckCircle className="w-4 h-4 mr-2" />
                                                                                    {t('admin.activateAccount')}
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    <Ban className="w-4 h-4 mr-2" />
                                                                                    {t('admin.blockAccount')}
                                                                                </>
                                                                            )}
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuSeparator />
                                                                        {!account.email_verified ? (
                                                                            <DropdownMenuItem
                                                                                onClick={() =>
                                                                                    verifyMutation.mutate(account.id)
                                                                                }
                                                                                disabled={activeMutationRowId === account.id}
                                                                            >
                                                                                <MailCheck className="w-4 h-4 mr-2" />
                                                                                {t('admin.verifyEmail')}
                                                                            </DropdownMenuItem>
                                                                        ) : null}
                                                                        <DropdownMenuItem
                                                                            onClick={() => {
                                                                                setResetPasswordTarget({
                                                                                    id: account.id,
                                                                                    name: account.name,
                                                                                });
                                                                                setResetPasswordForm({
                                                                                    newPassword: '',
                                                                                    confirmPassword: '',
                                                                                });
                                                                            }}
                                                                            // Row-scoped: only the row that opened the
                                                                            // reset modal is disabled while its own
                                                                            // mutation runs. Status / verify / restore
                                                                            // already use this `activeMutationRowId`
                                                                            // pattern; this keeps reset consistent.
                                                                            disabled={resetMutation.isPending && resetPasswordTarget?.id === account.id}
                                                                        >
                                                                            <Key className="w-4 h-4 mr-2" />
                                                                            {t('admin.resetPassword')}
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuItem
                                                                            onClick={() => setDeleteTarget(account)}
                                                                            disabled={deleteMutation.isPending && (deleteMutation.variables === account.id || deleteTarget?.id === account.id)}
                                                                            className="text-red-600"
                                                                        >
                                                                            <Trash2 className="w-4 h-4 mr-2" />
                                                                            {t('admin.deleteAccount')}
                                                                        </DropdownMenuItem>
                                                                    </>
                                                                ) : (
                                                                    <DropdownMenuItem
                                                                        onClick={() => restoreMutation.mutate(account.id)}
                                                                        disabled={activeMutationRowId === account.id}
                                                                        className="text-emerald-600 focus:text-emerald-700"
                                                                    >
                                                                        <RotateCcw className="w-4 h-4 mr-2" />
                                                                        {t('admin.restoreAccount')}
                                                                    </DropdownMenuItem>
                                                                )}
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </DataTableShell>
                            {pagination && pagination.total > 0 ? (
                                <div className="mt-4 flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                                    <p>
                                        {t('admin.pagination.showing', {
                                            from:
                                                pagination.total === 0
                                                    ? 0
                                                    : (pagination.page - 1) * pagination.per_page + 1,
                                            to: Math.min(pagination.page * pagination.per_page, pagination.total),
                                            total: pagination.total,
                                        })}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setPage((current) => Math.max(1, current - 1))}
                                            disabled={pagination.page <= 1 || accountsQuery.isFetching}
                                        >
                                            {t('payments.pagination.previous')}
                                        </Button>
                                        <span className="inline-flex min-w-[132px] justify-center rounded-xl border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600 shadow-xs">
                                            {t('payments.pagination.pageOf', {
                                                page: pagination.page,
                                                total: pagination.total_pages,
                                            })}
                                        </span>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() =>
                                                setPage((current) =>
                                                    Math.min(pagination.total_pages, current + 1)
                                                )
                                            }
                                            disabled={
                                                pagination.page >= pagination.total_pages
                                                || accountsQuery.isFetching
                                            }
                                        >
                                            {t('payments.pagination.next')}
                                        </Button>
                                    </div>
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>
                </div>

                <Dialog open={showCreateModal} onOpenChange={handleCreateModalOpenChange}>
                    <DialogContent className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto p-5 sm:p-6">
                        <DialogHeader>
                            <DialogTitle>{t('admin.createAccountTitle')}</DialogTitle>
                            <DialogDescription className="sr-only">
                                {t('admin.createAccountTitle')}
                            </DialogDescription>
                        </DialogHeader>
                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                setCreateSubmitAttempted(true);

                                if (createDentistHasErrors) {
                                    toast.error(t('admin.form.fixErrors'));
                                    return;
                                }

                                createMutation.mutate();
                            }}
                            className="space-y-4"
                        >
                            <div className="space-y-2">
                                <Label htmlFor="dentistName">
                                    {t('admin.form.dentistName')} <span className="text-red-500">*</span>
                                </Label>
                                <div className="flex items-center gap-2">
                                    <span className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700">
                                        {t('common.doctorPrefix')}
                                    </span>
                                    <Input
                                        id="dentistName"
                                        placeholder={t('admin.form.dentistNamePlaceholder')}
                                        value={newDentist.name}
                                        onChange={(event) =>
                                            setNewDentist({ ...newDentist, name: event.target.value })
                                        }
                                        required
                                        maxLength={INPUT_LIMITS.personName}
                                        aria-invalid={Boolean(createSubmitAttempted && createDentistNameError)}
                                    />
                                </div>
                                {createSubmitAttempted && createDentistNameError ? (
                                    <p className="text-xs text-red-600">{createDentistNameError}</p>
                                ) : null}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="dentistEmail">
                                    {t('login.email')} <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    id="dentistEmail"
                                    type="email"
                                    placeholder={t('admin.form.emailPlaceholder')}
                                    value={newDentist.email}
                                    onChange={(event) =>
                                        setNewDentist({ ...newDentist, email: event.target.value })
                                    }
                                    required
                                    maxLength={INPUT_LIMITS.email}
                                    autoComplete="email"
                                    inputMode="email"
                                    aria-invalid={Boolean(createSubmitAttempted && createDentistEmailError)}
                                />
                                {createSubmitAttempted && createDentistEmailError ? (
                                    <p className="text-xs text-red-600">{createDentistEmailError}</p>
                                ) : null}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="practiceName">{t('admin.form.practiceName')}</Label>
                                <Input
                                    id="practiceName"
                                    placeholder={t('admin.form.practiceNamePlaceholder')}
                                    value={newDentist.practiceName}
                                    onChange={(event) =>
                                        setNewDentist({ ...newDentist, practiceName: event.target.value })
                                    }
                                    maxLength={INPUT_LIMITS.practiceName}
                                    aria-invalid={Boolean(createSubmitAttempted && createDentistPracticeNameError)}
                                />
                                {createSubmitAttempted && createDentistPracticeNameError ? (
                                    <p className="text-xs text-red-600">{createDentistPracticeNameError}</p>
                                ) : null}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password">
                                    {t('admin.form.initialPassword')} <span className="text-red-500">*</span>
                                </Label>
                                <PasswordInput
                                    id="password"
                                    placeholder={t('admin.form.passwordPlaceholder')}
                                    value={newDentist.password}
                                    onChange={(event) =>
                                        setNewDentist({ ...newDentist, password: event.target.value })
                                    }
                                    required
                                    minLength={8}
                                    maxLength={INPUT_LIMITS.password}
                                    autoComplete="new-password"
                                    aria-invalid={Boolean(createSubmitAttempted && createDentistPasswordError)}
                                    showLabel={t('login.showPassword')}
                                    hideLabel={t('login.hidePassword')}
                                />
                                {createSubmitAttempted && createDentistPasswordError ? (
                                    <p className="text-xs text-red-600">{createDentistPasswordError}</p>
                                ) : null}
                            </div>

                            <div className="flex flex-col-reverse gap-3 pt-4 sm:flex-row">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => handleCreateModalOpenChange(false)}
                                    className="flex-1"
                                >
                                    {t('common.cancel')}
                                </Button>
                                <Button
                                    type="submit"
                                    className="flex-1"
                                    disabled={createMutation.isPending}
                                >
                                    {createMutation.isPending ? t('admin.creatingAccount') : t('admin.createAccount')}
                                </Button>
                            </div>
                        </form>
                    </DialogContent>
                </Dialog>

                <Dialog
                    open={billingDetailsTarget !== null}
                    onOpenChange={(open) => {
                        if (!open) {
                            setBillingDetailsTarget(null);
                        }
                    }}
                >
                    <DialogContent className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto p-5 sm:max-w-4xl sm:p-6">
                        <DialogHeader>
                            <DialogTitle>
                                {billingDetailsTarget
                                    ? t('admin.billing.dialogTitle', { name: billingDetailsTarget.name })
                                    : t('admin.billing.viewDetails')}
                            </DialogTitle>
                            <DialogDescription className="sr-only">
                                {t('admin.billing.viewDetails')}
                            </DialogDescription>
                        </DialogHeader>

                        {billingDetailsQuery.isLoading ? (
                            <div className="space-y-3">
                                <Skeleton className="h-24 w-full rounded-xl" />
                                <Skeleton className="h-32 w-full rounded-xl" />
                                <Skeleton className="h-40 w-full rounded-xl" />
                            </div>
                        ) : billingDetailsQuery.isError ? (
                            <AppErrorState
                                title={t('common.loadErrorTitle')}
                                description={getApiErrorMessage(
                                    billingDetailsQuery.error,
                                    t('admin.billing.loadFailed')
                                )}
                                retryLabel={t('common.retry')}
                                onRetry={() => billingDetailsQuery.refetch()}
                                className="min-h-[16rem] px-0 py-0"
                            />
                        ) : billingDetailsQuery.data ? (
                            <div className="space-y-5">
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-xs font-medium uppercase text-slate-500">
                                            {t('admin.billing.currentPlan')}
                                        </p>
                                        <p className="mt-2 text-lg font-semibold text-slate-950">
                                            {getSubscriptionPlanLabel(billingDetailsQuery.data.subscription, t)}
                                        </p>
                                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                            <Badge
                                                variant="outline"
                                                className={getSubscriptionStatusBadgeClasses(billingDetailsQuery.data.subscription.status)}
                                            >
                                                {getSubscriptionStatusLabel(billingDetailsQuery.data.subscription, t)}
                                            </Badge>
                                            {billingDetailsQuery.data.subscription.cancel_at_period_end ? (
                                                <Badge variant="outline" className="border-amber-100 bg-amber-50 text-amber-700">
                                                    {t('admin.subscription.cancelAtPeriodEnd')}
                                                </Badge>
                                            ) : null}
                                        </div>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-xs font-medium uppercase text-slate-500">
                                            {t('admin.billing.endsAt')}
                                        </p>
                                        <p className="mt-2 text-lg font-semibold text-slate-950">
                                            {billingDetailsQuery.data.subscription.ends_at
                                                ? formatLocalizedDate(
                                                    billingDetailsQuery.data.subscription.ends_at,
                                                    locale,
                                                    { year: 'numeric', month: 'short', day: 'numeric' }
                                                )
                                                : t('admin.subscription.notConfigured')}
                                        </p>
                                        <p className="text-sm text-slate-600">
                                            {getBillingPeriodLabel(billingDetailsQuery.data.subscription.billing_period, t)}
                                        </p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-xs font-medium uppercase text-slate-500">
                                            {t('admin.billing.staff')}
                                        </p>
                                        <p className="mt-2 text-lg font-semibold text-slate-950">
                                            {t('admin.billing.staffCount', {
                                                active: billingDetailsQuery.data.staff.active,
                                                total: billingDetailsQuery.data.staff.total,
                                            })}
                                        </p>
                                        <p className="text-sm text-slate-600">
                                            {t('admin.billing.usageSummary', {
                                                patients: billingDetailsQuery.data.usage.patients,
                                                appointments: billingDetailsQuery.data.usage.appointments,
                                                payments: billingDetailsQuery.data.usage.payments,
                                            })}
                                        </p>
                                    </div>
                                </div>

                                {billingDetailsQuery.data.subscription.pending_change_effective_at ? (
                                    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                                        {t('admin.billing.pendingChangeAlert', {
                                            date: formatLocalizedDate(
                                                billingDetailsQuery.data.subscription.pending_change_effective_at,
                                                locale,
                                                { year: 'numeric', month: 'short', day: 'numeric' }
                                            ),
                                        })}
                                    </div>
                                ) : null}

                                <div className="space-y-4 rounded-xl border border-slate-200 p-4">
                                    <p className="text-sm font-semibold text-slate-900">
                                        {t('admin.billing.manualActions')}
                                    </p>

                                    <div className="space-y-2">
                                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                            {t('admin.billing.actionGroup.changePlan')}
                                        </p>
                                        {plansQuery.isLoading ? (
                                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                                <Skeleton className="h-36 rounded-xl" />
                                                <Skeleton className="h-36 rounded-xl" />
                                                <Skeleton className="h-36 rounded-xl" />
                                            </div>
                                        ) : plans.length > 0 ? (
                                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                                {plans.map((plan) => {
                                                    const currentPlan = billingDetailsQuery.data!.subscription.plan;
                                                    const currentPeriod = billingDetailsQuery.data!.subscription.billing_period;
                                                    const isCurrent = currentPlan === plan.code;
                                                    const isCurrentMonthly = isCurrent && currentPeriod === 'monthly';
                                                    const isCurrentYearly = isCurrent && currentPeriod === 'yearly';
                                                    const isCurrentTrial = isCurrent && plan.code === 'trial';
                                                    return (
                                                        <div
                                                            key={plan.code}
                                                            className={
                                                                'flex min-w-0 flex-col rounded-xl border p-3 transition ' +
                                                                (isCurrent
                                                                    ? 'border-teal-300 bg-teal-50/30 ring-1 ring-teal-200'
                                                                    : 'border-slate-200 bg-white hover:border-slate-300')
                                                            }
                                                        >
                                                            <div className="flex min-w-0 items-center justify-between gap-1.5">
                                                                <p className="truncate text-sm font-semibold text-slate-900">{plan.name}</p>
                                                                {isCurrent ? (
                                                                    <span
                                                                        className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-700"
                                                                        aria-label={t('admin.billing.planCard.current')}
                                                                    >
                                                                        <CheckCircle2 className="h-3 w-3" />
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                            <div className="mt-2 flex-1 space-y-1 text-sm">
                                                                {plan.code === 'trial' ? (
                                                                    <p className="text-slate-600">
                                                                        {t('admin.billing.planCard.trialDuration', { days: plan.trial_days ?? 30 })}
                                                                    </p>
                                                                ) : (
                                                                    <>
                                                                        <div className="flex min-w-0 items-baseline gap-1">
                                                                            <span className="truncate text-base font-semibold text-slate-950">
                                                                                {plan.monthly_price !== null
                                                                                    ? formatPlanPrice(plan.monthly_price, plan.currency, locale)
                                                                                    : '—'}
                                                                            </span>
                                                                            <span className="shrink-0 text-[11px] text-slate-500">
                                                                                /{t('admin.billing.planCard.monthShort')}
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex min-w-0 items-baseline gap-1">
                                                                            <span className="truncate text-sm text-slate-700">
                                                                                {plan.yearly_price !== null
                                                                                    ? formatPlanPrice(plan.yearly_price, plan.currency, locale)
                                                                                    : '—'}
                                                                            </span>
                                                                            <span className="shrink-0 text-[11px] text-slate-500">
                                                                                /{t('admin.billing.planCard.yearShort')}
                                                                            </span>
                                                                        </div>
                                                                    </>
                                                                )}
                                                            </div>
                                                            <div className="mt-3">
                                                                {plan.code === 'trial' ? (
                                                                    <Button
                                                                        type="button"
                                                                        size="sm"
                                                                        variant={isCurrentTrial ? 'outline' : 'default'}
                                                                        className="h-8 w-full px-2 text-xs"
                                                                        disabled={subscriptionMutation.isPending || isCurrentTrial}
                                                                        onClick={() => {
                                                                            openSubscriptionDialog(billingDetailsQuery.data!.dentist, 'set_trial');
                                                                            // Keep the billing modal open behind the
                                                                            // confirm so the admin retains context if
                                                                            // they cancel the subscription action.
                                                                        }}
                                                                    >
                                                                        {t('admin.billing.planCard.assignTrial')}
                                                                    </Button>
                                                                ) : (
                                                                    <div className="flex gap-1.5">
                                                                        <Button
                                                                            type="button"
                                                                            size="sm"
                                                                            variant={isCurrentMonthly ? 'outline' : 'default'}
                                                                            className="h-8 flex-1 min-w-0 px-2 text-xs"
                                                                            disabled={
                                                                                subscriptionMutation.isPending
                                                                                || plan.monthly_price === null
                                                                                || (plan.code !== 'basic' && plan.code !== 'pro')
                                                                            }
                                                                            onClick={() => {
                                                                                if (plan.code !== 'basic' && plan.code !== 'pro') return;
                                                                                openSubscriptionDialog(
                                                                                    billingDetailsQuery.data!.dentist,
                                                                                    `set_${plan.code}_monthly` as AdminDentistSubscriptionAction
                                                                                );
                                                                            }}
                                                                        >
                                                                            <span className="truncate">{t('admin.billing.planCard.monthly')}</span>
                                                                        </Button>
                                                                        <Button
                                                                            type="button"
                                                                            size="sm"
                                                                            variant={isCurrentYearly ? 'outline' : 'default'}
                                                                            className="h-8 flex-1 min-w-0 px-2 text-xs"
                                                                            disabled={
                                                                                subscriptionMutation.isPending
                                                                                || plan.yearly_price === null
                                                                                || (plan.code !== 'basic' && plan.code !== 'pro')
                                                                            }
                                                                            onClick={() => {
                                                                                if (plan.code !== 'basic' && plan.code !== 'pro') return;
                                                                                openSubscriptionDialog(
                                                                                    billingDetailsQuery.data!.dentist,
                                                                                    `set_${plan.code}_yearly` as AdminDentistSubscriptionAction
                                                                                );
                                                                            }}
                                                                        >
                                                                            <span className="truncate">{t('admin.billing.planCard.yearly')}</span>
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

                                    {([
                                        {
                                            groupKey: 'admin.billing.actionGroup.state',
                                            actions: ['mark_read_only', 'mark_active'] as AdminDentistSubscriptionAction[],
                                        },
                                        {
                                            groupKey: 'admin.billing.actionGroup.cancel',
                                            actions: ['cancel_at_period_end', 'cancel_now'] as AdminDentistSubscriptionAction[],
                                        },
                                    ]).map((group) => (
                                        <div key={group.groupKey} className="space-y-2">
                                            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                                {t(group.groupKey)}
                                            </p>
                                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                {group.actions.map((action) => (
                                                    <Button
                                                        key={action}
                                                        type="button"
                                                        variant={action === 'cancel_now' ? 'destructive' : 'outline'}
                                                        className="h-auto justify-start whitespace-normal py-2 text-left"
                                                        disabled={subscriptionMutation.isPending}
                                                        onClick={() => {
                                                            // Keep billing modal open behind the confirm.
                                                            openSubscriptionDialog(billingDetailsQuery.data!.dentist, action);
                                                        }}
                                                    >
                                                        {getSubscriptionActionLabel(action, t)}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="rounded-xl border border-slate-200">
                                    <div className="border-b border-slate-200 px-4 py-3">
                                        <p className="text-sm font-semibold text-slate-900">
                                            {t('admin.billing.paymentHistory')}
                                        </p>
                                    </div>
                                    {billingDetailsQuery.data.payments.length === 0 ? (
                                        <EmptyState icon={CreditCard} title={t('admin.billing.noPayments')} size="sm" />
                                    ) : (
                                        <div className="divide-y divide-slate-100">
                                            {billingDetailsQuery.data.payments.map((payment) => (
                                                <div
                                                    key={payment.id}
                                                    className="grid grid-cols-1 gap-2 px-4 py-3 text-sm sm:grid-cols-[1fr_auto]"
                                                >
                                                    <div>
                                                        <p className="font-medium text-slate-900">
                                                            {payment.plan_name} · {getBillingPeriodLabel(payment.billing_period, t)}
                                                        </p>
                                                        <p className="text-xs text-slate-500">
                                                            {payment.provider_order_id}
                                                            {payment.provider_payment_id
                                                                ? ` · ${payment.provider_payment_id}`
                                                                : ''}
                                                        </p>
                                                    </div>
                                                    <div className="flex flex-col items-start gap-1 sm:items-end">
                                                        <p className="font-semibold text-slate-900">
                                                            {formatBillingAmount(payment, locale)}
                                                        </p>
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            <Badge
                                                                variant="outline"
                                                                className={getPaymentStatusBadgeClasses(payment.status)}
                                                            >
                                                                {getPaymentStatusLabel(payment.status, t)}
                                                            </Badge>
                                                            {payment.paid_at ? (
                                                                <span className="text-xs text-slate-500">
                                                                    {formatLocalizedDate(payment.paid_at, locale, {
                                                                        year: 'numeric',
                                                                        month: 'short',
                                                                        day: 'numeric',
                                                                    })}
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : null}
                    </DialogContent>
                </Dialog>

                <Dialog
                    open={subscriptionDialog !== null}
                    onOpenChange={(open) => {
                        if (open) {
                            return;
                        }
                        // Mid-mutation close would lose the form values while
                        // the API call resolves — the success/error handler
                        // explicitly closes the dialog.
                        if (subscriptionMutation.isPending) return;

                        setSubscriptionDialog(null);
                        setSubscriptionForm(createEmptySubscriptionForm());
                    }}
                >
                    <DialogContent className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto p-5 sm:max-w-lg sm:p-6">
                        <DialogHeader>
                            <DialogTitle>
                                {subscriptionDialog
                                    ? t('admin.subscription.dialogTitle', {
                                        action: getSubscriptionActionLabel(subscriptionDialog.action, t),
                                        name: subscriptionDialog.account.name,
                                    })
                                    : t('admin.subscription.dialogFallback')}
                            </DialogTitle>
                            <DialogDescription className="sr-only">
                                {t('admin.billing.manualActions')}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            {subscriptionDialog ? (
                                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                                    <p className="font-medium text-slate-900">
                                        {t('common.doctorPrefix')} {subscriptionDialog.account.name}
                                    </p>
                                    <p className="mt-1">
                                        {t('admin.subscription.planSummary', {
                                            plan: getSubscriptionPlanLabel(subscriptionDialog.account.subscription, t),
                                            status: getSubscriptionStatusLabel(subscriptionDialog.account.subscription, t),
                                        })}
                                    </p>
                                    {/* Optional-chain — backend may return subscription: null on
                                        a brand-new dentist (no subscription created yet); without
                                        it `ends_at` access would throw and white-screen the
                                        modal. The conditional render below shields the inner
                                        date access too. */}
                                    {subscriptionDialog.account.subscription?.ends_at ? (
                                        <p className="mt-1 text-xs text-slate-600">
                                            {t('admin.subscription.paidUntil', {
                                                date: formatLocalizedDate(
                                                    subscriptionDialog.account.subscription.ends_at,
                                                    locale,
                                                    {
                                                        year: 'numeric',
                                                        month: 'short',
                                                        day: 'numeric',
                                                    }
                                                ),
                                            })}
                                        </p>
                                    ) : null}
                                </div>
                            ) : null}

                            {subscriptionDialog && BILLING_SUBSCRIPTION_ACTIONS.has(subscriptionDialog.action) ? (
                                <p className="text-sm text-slate-600">
                                    {t('admin.subscription.applyHint')}
                                </p>
                            ) : null}

                            {subscriptionRequiresPaymentDetails ? (
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="subscription-payment-method">
                                            {t('admin.subscription.paymentMethod')}
                                        </Label>
                                        <Select
                                            value={subscriptionForm.paymentMethod}
                                            onValueChange={(value) =>
                                                setSubscriptionForm((current) => ({
                                                    ...current,
                                                    paymentMethod: value as ManageSubscriptionForm['paymentMethod'],
                                                }))
                                            }
                                        >
                                            <SelectTrigger id="subscription-payment-method" className="w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="cash">
                                                    {t('admin.subscription.paymentMethod.cash')}
                                                </SelectItem>
                                                <SelectItem value="p2p">
                                                    {t('admin.subscription.paymentMethod.p2p')}
                                                </SelectItem>
                                                <SelectItem value="bank_transfer">
                                                    {t('admin.subscription.paymentMethod.bank_transfer')}
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="subscription-payment-amount">
                                            {t('admin.subscription.paymentAmount')}
                                        </Label>
                                        <Input
                                            id="subscription-payment-amount"
                                            inputMode="decimal"
                                            placeholder={t('admin.subscription.paymentAmountPlaceholder')}
                                            value={subscriptionForm.paymentAmount}
                                            onChange={(event) =>
                                                setSubscriptionForm((current) => ({
                                                    ...current,
                                                    paymentAmount: event.target.value,
                                                }))
                                            }
                                        />
                                    </div>
                                </div>
                            ) : null}

                            <div className="space-y-2">
                                <Label htmlFor="subscription-note">{t('admin.subscription.note')}</Label>
                                <Textarea
                                    id="subscription-note"
                                    placeholder={t('admin.subscription.notePlaceholder')}
                                    value={subscriptionForm.note}
                                    onChange={(event) =>
                                        setSubscriptionForm((current) => ({
                                            ...current,
                                            note: event.target.value,
                                        }))
                                    }
                                    maxLength={500}
                                />
                            </div>

                            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        setSubscriptionDialog(null);
                                        setSubscriptionForm(createEmptySubscriptionForm());
                                    }}
                                    className="flex-1"
                                    disabled={subscriptionMutation.isPending}
                                >
                                    {t('common.cancel')}
                                </Button>
                                <Button
                                    type="button"
                                    className="flex-1"
                                    onClick={submitSubscriptionAction}
                                    disabled={subscriptionMutation.isPending}
                                >
                                    {subscriptionMutation.isPending
                                        ? t('admin.subscription.processing')
                                        : subscriptionDialog
                                            ? getSubscriptionActionLabel(subscriptionDialog.action, t)
                                            : t('admin.subscription.dialogFallback')}
                                </Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>

                <ConfirmActionDialog
                    open={deleteTarget !== null}
                    onOpenChange={(open) => {
                        if (!open) {
                            setDeleteTarget(null);
                        }
                    }}
                    title={t('admin.deleteConfirmTitle')}
                    description={deleteTarget
                        ? t('admin.deleteConfirmDescription', { name: deleteTarget.name })
                        : t('admin.deleteConfirmDescriptionFallback')}
                    confirmLabel={t('admin.deleteAccount')}
                    pendingLabel={t('payments.deleting')}
                    cancelLabel={t('common.cancel')}
                    isPending={deleteMutation.isPending}
                    onConfirm={() => {
                        if (!deleteTarget) {
                            return;
                        }

                        deleteMutation.mutate(deleteTarget.id);
                    }}
                />

                <Dialog
                    open={resetPasswordTarget !== null}
                    onOpenChange={(open) => {
                        if (open) {
                            setResetPasswordSubmitAttempted(false);
                            return;
                        }
                        // Refuse to close mid-mutation.
                        if (resetMutation.isPending) return;

                        setResetPasswordTarget(null);
                        setResetPasswordSubmitAttempted(false);
                        setResetPasswordForm({
                            newPassword: '',
                            confirmPassword: '',
                        });
                    }}
                >
                    <DialogContent className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto p-5 sm:p-6">
                        <DialogHeader>
                            <DialogTitle>
                                {resetPasswordTarget
                                    ? t('admin.resetPasswordFor', { name: resetPasswordTarget.name })
                                    : t('admin.resetPassword')}
                            </DialogTitle>
                            <DialogDescription className="sr-only">
                                {t('admin.resetPassword')}
                            </DialogDescription>
                        </DialogHeader>
                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                setResetPasswordSubmitAttempted(true);

                                if (resetPasswordError) {
                                    toast.error(resetPasswordError);
                                    return;
                                }

                                if (resetPasswordConfirmationError) {
                                    toast.error(resetPasswordConfirmationError);
                                    return;
                                }

                                resetMutation.mutate();
                            }}
                            className="space-y-4"
                        >
                            <div className="space-y-2">
                                <Label htmlFor="resetPasswordNew">
                                    {t('admin.form.newPassword')} <span className="text-red-500">*</span>
                                </Label>
                                <PasswordInput
                                    id="resetPasswordNew"
                                    placeholder={t('admin.form.passwordPlaceholder')}
                                    value={resetPasswordForm.newPassword}
                                    onChange={(event) =>
                                        setResetPasswordForm({
                                            ...resetPasswordForm,
                                            newPassword: event.target.value,
                                        })
                                    }
                                    required
                                    minLength={8}
                                    maxLength={INPUT_LIMITS.password}
                                    autoComplete="new-password"
                                    showLabel={t('login.showPassword')}
                                    hideLabel={t('login.hidePassword')}
                                    aria-invalid={Boolean(resetPasswordSubmitAttempted && resetPasswordError)}
                                />
                                {resetPasswordSubmitAttempted && resetPasswordError ? (
                                    <p className="text-xs text-red-600">{resetPasswordError}</p>
                                ) : null}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="resetPasswordConfirm">
                                    {t('admin.form.confirmNewPassword')} <span className="text-red-500">*</span>
                                </Label>
                                <PasswordInput
                                    id="resetPasswordConfirm"
                                    placeholder={t('admin.form.confirmPasswordPlaceholder')}
                                    value={resetPasswordForm.confirmPassword}
                                    onChange={(event) =>
                                        setResetPasswordForm({
                                            ...resetPasswordForm,
                                            confirmPassword: event.target.value,
                                        })
                                    }
                                    required
                                    minLength={8}
                                    maxLength={INPUT_LIMITS.password}
                                    autoComplete="new-password"
                                    aria-invalid={Boolean(resetPasswordSubmitAttempted && resetPasswordConfirmationError)}
                                    showLabel={t('login.showPassword')}
                                    hideLabel={t('login.hidePassword')}
                                />
                                {resetPasswordSubmitAttempted && resetPasswordConfirmationError ? (
                                    <p className="text-xs text-red-600">{resetPasswordConfirmationError}</p>
                                ) : null}
                            </div>

                            <div className="flex flex-col-reverse gap-3 pt-4 sm:flex-row">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setResetPasswordTarget(null)}
                                    className="flex-1"
                                >
                                    {t('common.cancel')}
                                </Button>
                                <Button
                                    type="submit"
                                    className="flex-1"
                                    disabled={resetMutation.isPending}
                                >
                                    {resetMutation.isPending ? t('admin.resetting') : t('admin.resetPassword')}
                                </Button>
                            </div>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}
