'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    type AdminDentistSubscriptionAction,
    createAdminDentist,
    deleteAdminDentist,
    getCurrentUser,
    listAdminDentists,
    manageAdminDentistSubscription,
    logoutSession,
    resetAdminDentistPassword,
    updateAdminDentistStatus,
} from '@/lib/api/dentist';
import type { ApiAdminDentist, ApiSubscriptionSummary } from '@/lib/api/types';
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
    Settings,
    LogOut,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    INPUT_LIMITS,
    getEmailValidationMessage,
    getPasswordValidationMessage,
    getTextValidationMessage,
} from '@/lib/input-validation';
import { truncateForUi } from '@/lib/utils';
import { useI18n } from '@/components/providers/i18n-provider';
import { formatLocalizedDate } from '@/lib/i18n/date';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { Brand } from '@/components/branding/brand';

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

function AdminDashboardLoadingSkeleton() {
    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(219,234,254,0.55),transparent_34rem),linear-gradient(180deg,#f8fbff_0%,#f8fafc_42%,#f1f5f9_100%)]">
            <header className="border-b border-blue-100/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,251,255,0.94)_100%)]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex h-16 items-center justify-between">
                        <Skeleton className="h-10 w-36 rounded-md" />
                        <div className="flex items-center gap-3">
                            <Skeleton className="h-10 w-16" />
                            <Skeleton className="h-10 w-28" />
                            <Skeleton className="h-10 w-24" />
                        </div>
                    </div>
                </div>
            </header>

            <div className="p-4 sm:p-6 lg:p-8">
                <div className="max-w-7xl mx-auto space-y-8">
                    <div className="space-y-2">
                        <Skeleton className="h-9 w-72" />
                        <Skeleton className="h-4 w-80" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {Array.from({ length: 3 }).map((_, index) => (
                            <Card key={index}>
                                <CardHeader className="pb-2">
                                    <Skeleton className="h-4 w-28" />
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    <Skeleton className="h-8 w-20" />
                                    <Skeleton className="h-3 w-24" />
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    <Card>
                        <CardHeader>
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                <Skeleton className="h-6 w-36" />
                                <div className="flex items-center gap-3 w-full sm:w-auto">
                                    <Skeleton className="h-10 w-64" />
                                    <Skeleton className="h-10 w-28" />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {Array.from({ length: 6 }).map((_, index) => (
                                <div key={index} className="grid grid-cols-7 gap-3 items-center">
                                    <Skeleton className="h-4 w-24" />
                                    <Skeleton className="h-4 w-36" />
                                    <Skeleton className="h-4 w-28" />
                                    <Skeleton className="h-4 w-24" />
                                    <Skeleton className="h-6 w-20" />
                                    <Skeleton className="h-4 w-20" />
                                    <Skeleton className="h-8 w-8 justify-self-end" />
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

export default function AdminDashboardPage() {
    const { t, locale } = useI18n();
    const router = useRouter();
    const queryClient = useQueryClient();
    const [searchQuery, setSearchQuery] = useState('');
    const [page, setPage] = useState(1);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [resetPasswordTarget, setResetPasswordTarget] = useState<{ id: string; name: string } | null>(
        null
    );
    const [subscriptionDialog, setSubscriptionDialog] = useState<SubscriptionDialogState | null>(null);
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
    const normalizedSearch = searchQuery.trim();

    const accountsQuery = useQuery({
        queryKey: ['admin', 'dentists', page, normalizedSearch],
        queryFn: () =>
            listAdminDentists({
                page,
                perPage: ADMIN_DENTISTS_PER_PAGE,
                filter: {
                    search: normalizedSearch || undefined,
                },
            }),
        enabled: authQuery.data?.role === 'admin',
        placeholderData: (previousData) => previousData,
    });

    useEffect(() => {
        if (authQuery.isError && !authQuery.isLoading) {
            router.push('/admin/login');
            return;
        }

        if (authQuery.data && authQuery.data.role !== 'admin') {
            router.push('/dashboard');
        }
    }, [authQuery.data, authQuery.isError, authQuery.isLoading, router]);

    const logoutMutation = useMutation({
        mutationFn: logoutSession,
        onSettled: () => {
            queryClient.removeQueries({ queryKey: ['auth'] });
            router.push('/admin/login');
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('admin.error.logoutFailed')));
        },
    });

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
        mutationFn: ({ id, status }: { id: string; status: 'active' | 'blocked' }) =>
            updateAdminDentistStatus(id, status),
        onSuccess: (account) => {
            toast.success(
                account.status === 'blocked'
                    ? t('admin.toast.accountBlocked')
                    : t('admin.toast.accountActivated')
            );
            queryClient.invalidateQueries({ queryKey: ['admin', 'dentists'] });
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
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('admin.error.subscriptionUpdateFailed')));
        },
    });

    const resetMutation = useMutation({
        mutationFn: () => {
            if (!resetPasswordTarget) {
                throw new Error(t('admin.error.selectDentistBeforeReset'));
            }

            return resetAdminDentistPassword(resetPasswordTarget.id, {
                new_password: resetPasswordForm.newPassword,
                new_password_confirmation: resetPasswordForm.confirmPassword,
            });
        },
        onSuccess: () => {
            toast.success(t('admin.toast.passwordReset'));
            setResetPasswordTarget(null);
            setResetPasswordForm({
                newPassword: '',
                confirmPassword: '',
            });
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('admin.error.resetPasswordFailed')));
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => deleteAdminDentist(id),
        onSuccess: () => {
            toast.success(t('admin.toast.accountDeleted'));
            queryClient.invalidateQueries({ queryKey: ['admin', 'dentists'] });
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('admin.error.deleteAccountFailed')));
        },
    });

    const accounts = useMemo(() => accountsQuery.data?.data ?? [], [accountsQuery.data]);
    const pagination = accountsQuery.data?.meta?.pagination;
    const summary = accountsQuery.data?.meta?.summary;

    const stats = useMemo(() => {
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

        return { totalDentists, activeDentists, newRegistrations };
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
        return <AdminDashboardLoadingSkeleton />;
    }

    if (accountsQuery.isError) {
        return (
            <div className="p-8 space-y-4">
                <p className="text-sm text-red-600">
                    {getApiErrorMessage(accountsQuery.error, t('admin.error.loadAccountsFailed'))}
                </p>
                <Button variant="outline" onClick={() => accountsQuery.refetch()}>
                    {t('common.retry')}
                </Button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(219,234,254,0.55),transparent_34rem),linear-gradient(180deg,#f8fbff_0%,#f8fafc_42%,#f1f5f9_100%)]">
            <header className="sticky top-0 z-10 border-b border-blue-100/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,251,255,0.94)_100%)] shadow-sm shadow-slate-200/40 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex min-h-16 flex-col gap-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                        <Brand href="/admin" variant="text" priority textClassName="w-32 sm:w-36" />
                        <div className="flex flex-wrap items-center gap-2">
                            <LanguageSwitcher variant="compact" />
                            <Button variant="outline" className="rounded-2xl bg-white/80 shadow-sm shadow-slate-200/60" asChild>
                                <Link href="/admin/settings">
                                    <Settings className="w-4 h-4 mr-2" />
                                    {t('menu.settings')}
                                </Link>
                            </Button>
                            <Button
                                variant="outline"
                                className="rounded-2xl bg-white/80 shadow-sm shadow-slate-200/60"
                                onClick={() => logoutMutation.mutate()}
                            >
                                <LogOut className="w-4 h-4 mr-2" />
                                {logoutMutation.isPending ? t('menu.loggingOut') : t('menu.logout')}
                            </Button>
                        </div>
                    </div>
                </div>
            </header>

            <div className="p-4 sm:p-6 lg:p-8">
                <div className="max-w-7xl mx-auto space-y-8">
                    <PageHeader title={t('admin.dashboardTitle')} description={t('admin.dashboardSubtitle')} />

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="rounded-[1.5rem] border-blue-100 bg-gradient-to-br from-white to-blue-50/70 shadow-sm shadow-blue-100/50">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">{t('admin.stats.totalDentists')}</CardTitle>
                                <Users className="h-4 w-4 text-blue-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold tracking-[-0.04em] text-slate-950">{stats.totalDentists}</div>
                            </CardContent>
                        </Card>

                        <Card className="rounded-[1.5rem] border-emerald-100 bg-gradient-to-br from-white to-emerald-50/70 shadow-sm shadow-emerald-100/50">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">{t('admin.stats.activeDentists')}</CardTitle>
                                <UserCheck className="h-4 w-4 text-emerald-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold tracking-[-0.04em] text-slate-950">{stats.activeDentists}</div>
                                <p className="text-xs text-muted-foreground">
                                    {stats.totalDentists === 0
                                        ? '0'
                                        : ((stats.activeDentists / stats.totalDentists) * 100).toFixed(0)}
                                    {t('admin.stats.percentOfTotal')}
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="rounded-[1.5rem] border-sky-100 bg-gradient-to-br from-white to-sky-50/70 shadow-sm shadow-sky-100/50">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">{t('admin.stats.newLast7Days')}</CardTitle>
                                <UserPlus className="h-4 w-4 text-sky-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold tracking-[-0.04em] text-slate-950">{stats.newRegistrations}</div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="overflow-hidden rounded-[1.5rem] bg-white/95">
                        <CardHeader className="pb-4">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                <CardTitle className="text-base">{t('admin.accountsTitle')}</CardTitle>
                                <div className="flex items-center gap-3 w-full sm:w-auto">
                                    <div className="relative flex-1 sm:w-64">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <Input
                                            placeholder={t('admin.searchPlaceholder')}
                                            value={searchQuery}
                                            onChange={(event) => {
                                                setSearchQuery(event.target.value);
                                                setPage(1);
                                            }}
                                            className="h-10 rounded-xl border-slate-200 bg-white/90 pl-10 shadow-xs"
                                            maxLength={INPUT_LIMITS.shortText}
                                        />
                                    </div>
                                    <Button className="rounded-xl" onClick={() => setShowCreateModal(true)}>
                                        <UserPlus className="w-4 h-4 sm:mr-2" />
                                        <span className="hidden sm:inline">{t('admin.createButton')}</span>
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
                                                <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                                                    {t('admin.empty')}
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            accounts.map((account) => (
                                                <TableRow key={account.id}>
                                                    <TableCell
                                                        className="max-w-[16rem] font-medium truncate"
                                                        title={`${t('common.doctorPrefix')} ${account.name}`}
                                                    >
                                                        {t('common.doctorPrefix')} {truncateForUi(account.name, ADMIN_NAME_UI_LIMIT)}
                                                    </TableCell>
                                                    <TableCell className="max-w-[18rem] truncate" title={account.email}>
                                                        {truncateForUi(account.email, ADMIN_EMAIL_UI_LIMIT)}
                                                    </TableCell>
                                                    <TableCell className="min-w-[15rem]">
                                                        <div className="space-y-2">
                                                            <p className="text-sm font-medium text-gray-900">
                                                                {t('admin.subscription.planSummary', {
                                                                    plan: getSubscriptionPlanLabel(account.subscription, t),
                                                                    status: getSubscriptionStatusLabel(account.subscription, t),
                                                                })}
                                                            </p>
                                                            <p className="text-xs text-gray-600">
                                                                {account.subscription.ends_at
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
                                                            <p className="text-xs text-gray-500">
                                                                {account.subscription.staff_limit === null
                                                                    ? t('admin.subscription.staffUnlimited', {
                                                                        count: account.subscription.active_staff_count,
                                                                    })
                                                                    : t('admin.subscription.staffUsage', {
                                                                        count: account.subscription.active_staff_count,
                                                                        limit: account.subscription.staff_limit,
                                                                    })}
                                                            </p>
                                                            {account.subscription.cancel_at_period_end ? (
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
                                                            <Badge className="bg-green-500">{t('admin.status.active')}</Badge>
                                                        ) : null}
                                                        {account.status === 'blocked' ? (
                                                            <Badge className="bg-red-500">{t('admin.status.blocked')}</Badge>
                                                        ) : null}
                                                        {account.status === 'deleted' ? (
                                                            <Badge variant="outline" className="text-gray-500">
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
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon">
                                                                    <MoreVertical className="h-4 w-4" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
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
                                                                            disabled={statusMutation.isPending}
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
                                                                        <DropdownMenuItem
                                                                            onClick={() =>
                                                                                openSubscriptionDialog(
                                                                                    account,
                                                                                    'apply_monthly'
                                                                                )
                                                                            }
                                                                            disabled={subscriptionMutation.isPending}
                                                                        >
                                                                            {t('admin.subscription.action.apply_monthly')}
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuItem
                                                                            onClick={() =>
                                                                                openSubscriptionDialog(
                                                                                    account,
                                                                                    'apply_yearly'
                                                                                )
                                                                            }
                                                                            disabled={subscriptionMutation.isPending}
                                                                        >
                                                                            {t('admin.subscription.action.apply_yearly')}
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuItem
                                                                            onClick={() =>
                                                                                openSubscriptionDialog(
                                                                                    account,
                                                                                    'cancel_at_period_end'
                                                                                )
                                                                            }
                                                                            disabled={subscriptionMutation.isPending}
                                                                        >
                                                                            {t('admin.subscription.action.cancel_at_period_end')}
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuItem
                                                                            onClick={() =>
                                                                                openSubscriptionDialog(
                                                                                    account,
                                                                                    'cancel_now'
                                                                                )
                                                                            }
                                                                            disabled={subscriptionMutation.isPending}
                                                                            className="text-red-600"
                                                                        >
                                                                            {t('admin.subscription.action.cancel_now')}
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuSeparator />
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
                                                                            disabled={resetMutation.isPending}
                                                                        >
                                                                            <Key className="w-4 h-4 mr-2" />
                                                                            {t('admin.resetPassword')}
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuItem
                                                                            onClick={() => deleteMutation.mutate(account.id)}
                                                                            disabled={deleteMutation.isPending}
                                                                            className="text-red-600"
                                                                        >
                                                                            <Trash2 className="w-4 h-4 mr-2" />
                                                                            {t('admin.deleteAccount')}
                                                                        </DropdownMenuItem>
                                                                    </>
                                                                ) : (
                                                                    <DropdownMenuItem disabled>
                                                                        {t('admin.accountDeleted')}
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
                            {pagination ? (
                                <div className="mt-4 flex flex-col gap-3 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
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
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{t('admin.createAccountTitle')}</DialogTitle>
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
                                    <span className="text-sm font-medium text-gray-700 bg-gray-100 px-3 py-2 rounded-md border">
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

                            <div className="flex gap-3 pt-4">
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
                    open={subscriptionDialog !== null}
                    onOpenChange={(open) => {
                        if (open) {
                            return;
                        }

                        setSubscriptionDialog(null);
                        setSubscriptionForm(createEmptySubscriptionForm());
                    }}
                >
                    <DialogContent className="sm:max-w-lg">
                        <DialogHeader>
                            <DialogTitle>
                                {subscriptionDialog
                                    ? t('admin.subscription.dialogTitle', {
                                        action: getSubscriptionActionLabel(subscriptionDialog.action, t),
                                        name: subscriptionDialog.account.name,
                                    })
                                    : t('admin.subscription.dialogFallback')}
                            </DialogTitle>
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
                                    {subscriptionDialog.account.subscription.ends_at ? (
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

                            <div className="flex gap-3 pt-2">
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

                <Dialog
                    open={resetPasswordTarget !== null}
                    onOpenChange={(open) => {
                        if (open) {
                            setResetPasswordSubmitAttempted(false);
                            return;
                        }

                        setResetPasswordTarget(null);
                        setResetPasswordSubmitAttempted(false);
                        setResetPasswordForm({
                            newPassword: '',
                            confirmPassword: '',
                        });
                    }}
                >
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>
                                {resetPasswordTarget
                                    ? t('admin.resetPasswordFor', { name: resetPasswordTarget.name })
                                    : t('admin.resetPassword')}
                            </DialogTitle>
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

                            <div className="flex gap-3 pt-4">
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
