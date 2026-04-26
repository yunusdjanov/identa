'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import { Clock3, Mail, Phone, ShieldCheck } from 'lucide-react';
import {
    createAssistant,
    deleteAssistant,
    listAssistants,
    resetAssistantPassword,
    updateAssistant,
    updateAssistantStatus,
} from '@/lib/api/dentist';
import { getApiErrorMessage, getDisplayableApiMessage } from '@/lib/api/client';
import type { ApiAssistantAccount, ApiSubscriptionSummary } from '@/lib/api/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
    INPUT_LIMITS,
    formatPhoneInputValue,
    getEmailValidationMessage,
    getPasswordValidationMessage,
    getPhoneValidationMessage,
    getTextValidationMessage,
    normalizePhoneForApi,
} from '@/lib/input-validation';
import { cn } from '@/lib/utils';

const PERMISSION_OPTIONS = [
    { code: 'patients.view', labelKey: 'settings.team.permissionPatientsView' },
    { code: 'patients.manage', labelKey: 'settings.team.permissionPatientsManage' },
    { code: 'appointments.view', labelKey: 'settings.team.permissionAppointmentsView' },
    { code: 'appointments.manage', labelKey: 'settings.team.permissionAppointmentsManage' },
    { code: 'odontogram.view', labelKey: 'settings.team.permissionOdontogramView' },
    { code: 'odontogram.manage', labelKey: 'settings.team.permissionOdontogramManage' },
    { code: 'treatments.view', labelKey: 'settings.team.permissionTreatmentsView' },
    { code: 'treatments.manage', labelKey: 'settings.team.permissionTreatmentsManage' },
    { code: 'patient_categories.view', labelKey: 'settings.team.permissionCategoriesView' },
    { code: 'patient_categories.manage', labelKey: 'settings.team.permissionCategoriesManage' },
] as const;
const PERMISSION_CODES = new Set(PERMISSION_OPTIONS.map((item) => item.code));

const DEFAULT_ASSISTANT_PERMISSIONS = [
    'patients.view',
    'patients.manage',
    'appointments.view',
    'appointments.manage',
    'odontogram.view',
    'odontogram.manage',
    'treatments.view',
    'treatments.manage',
    'patient_categories.view',
];

type StaffStatusFilter = 'active' | 'blocked' | 'deleted';

const STAFF_STATUS_FILTERS: Array<{ value: StaffStatusFilter; labelKey: string }> = [
    { value: 'active', labelKey: 'settings.team.statusActive' },
    { value: 'blocked', labelKey: 'settings.team.statusBlocked' },
    { value: 'deleted', labelKey: 'settings.team.statusDeleted' },
];

function isStaffStatusFilter(value: string | null): value is StaffStatusFilter {
    return value === 'active' || value === 'blocked' || value === 'deleted';
}

interface AssistantFormState {
    name: string;
    email: string;
    phone: string;
    password: string;
    passwordConfirmation: string;
    permissions: string[];
}

type AssistantFormFieldKey =
    | 'name'
    | 'email'
    | 'phone'
    | 'password'
    | 'password_confirmation'
    | 'permissions';

type AssistantFormFieldErrors = Partial<Record<AssistantFormFieldKey, string>>;

function createEmptyAssistantForm(): AssistantFormState {
    return {
        name: '',
        email: '',
        phone: '',
        password: '',
        passwordConfirmation: '',
        permissions: [...DEFAULT_ASSISTANT_PERMISSIONS],
    };
}

function TeamAccessLoadingSkeleton() {
    return (
        <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
                <div
                    key={`assistant-skeleton-${index}`}
                    className="rounded-lg border border-gray-200 p-4 space-y-3"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                            <Skeleton className="h-5 w-40" />
                            <Skeleton className="h-4 w-56" />
                            <Skeleton className="h-3 w-44" />
                        </div>
                        <Skeleton className="h-6 w-20 rounded-full" />
                    </div>
                    <Skeleton className="h-3 w-28" />
                    <div className="flex flex-wrap gap-2">
                        <Skeleton className="h-8 w-16" />
                        <Skeleton className="h-8 w-20" />
                        <Skeleton className="h-8 w-28" />
                        <Skeleton className="h-8 w-16" />
                    </div>
                </div>
            ))}
            <div className="flex items-center justify-end gap-2 pt-2">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-16" />
            </div>
        </div>
    );
}

interface TeamAccessTabProps {
    canManageTeam: boolean;
    subscription?: ApiSubscriptionSummary | null;
    t: (key: string, variables?: Record<string, string | number>) => string;
}

function formatDateTime(value: string | null): string {
    if (!value) {
        return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString();
}

function formatDateLabel(value: string | null): string | null {
    if (!value) {
        return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleDateString();
}

function getAssistantInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
        return '?';
    }

    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function getStaffStatusLabel(status: StaffStatusFilter, t: TeamAccessTabProps['t']): string {
    if (status === 'blocked') {
        return t('settings.team.statusBlocked');
    }

    if (status === 'deleted') {
        return t('settings.team.statusDeleted');
    }

    return t('settings.team.statusActive');
}

function getSubscriptionAccessSummary(
    subscription: ApiSubscriptionSummary | null | undefined,
    endsOn: string | null,
    t: TeamAccessTabProps['t']
): string {
    if (!subscription?.is_configured || !endsOn) {
        return t('settings.team.subscriptionPlanFallback');
    }

    if (subscription.status === 'trialing') {
        return t('settings.team.trialAccessUntil', { date: endsOn });
    }

    if (subscription.status === 'grace') {
        return t('settings.team.graceAccessUntil', { date: endsOn });
    }

    if (subscription.status === 'read_only') {
        return t('settings.team.readOnlyAccess');
    }

    return t('settings.team.accessUntil', { date: endsOn });
}

export function TeamAccessTab({ canManageTeam, subscription, t }: TeamAccessTabProps) {
    const queryClient = useQueryClient();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const requestedStatus = searchParams.get('staffStatus');
    const resolvedStatus: StaffStatusFilter = isStaffStatusFilter(requestedStatus) ? requestedStatus : 'active';
    const [search, setSearch] = useState('');
    const status = resolvedStatus;
    const [page, setPage] = useState(1);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingAssistant, setEditingAssistant] = useState<ApiAssistantAccount | null>(null);
    const [formState, setFormState] = useState<AssistantFormState>(createEmptyAssistantForm());
    const [formSubmitAttempted, setFormSubmitAttempted] = useState(false);
    const [formFieldErrors, setFormFieldErrors] = useState<AssistantFormFieldErrors>({});
    const [formGeneralError, setFormGeneralError] = useState<string | null>(null);
    const [resetTarget, setResetTarget] = useState<ApiAssistantAccount | null>(null);
    const [resetPasswordValue, setResetPasswordValue] = useState('');
    const [resetPasswordConfirmation, setResetPasswordConfirmation] = useState('');
    const [deleteTarget, setDeleteTarget] = useState<ApiAssistantAccount | null>(null);

    const assistantsQuery = useQuery({
        queryKey: ['settings', 'team-assistants', search, status, page],
        queryFn: () =>
            listAssistants({
                page,
                perPage: 10,
                sort: '-created_at',
                filter: {
                    search: search || undefined,
                    status,
                },
            }),
        enabled: canManageTeam,
    });

    const totalPages = assistantsQuery.data?.meta?.pagination?.total_pages ?? 1;
    const canPrev = page > 1;
    const canNext = page < totalPages;
    const staffLimit = subscription?.staff_limit ?? null;
    const activeStaffCount = subscription?.active_staff_count ?? 0;
    const isAtStaffLimit = staffLimit !== null && activeStaffCount >= staffLimit;
    const isReadOnly = subscription?.is_read_only === true;
    const subscriptionEndsOn = formatDateLabel(subscription?.ends_at ?? null);

    const updateStatusFilter = (nextStatus: StaffStatusFilter) => {
        setPage(1);

        const params = new URLSearchParams(searchParams.toString());
        params.set('staffStatus', nextStatus);
        const nextSearch = params.toString();
        router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname, { scroll: false });
    };

    const refreshTeamAccessData = () => {
        queryClient.invalidateQueries({ queryKey: ['settings', 'team-assistants'] });
        queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    };

    const setMutationErrors = (error: unknown, fallbackMessage: string) => {
        const extractedFieldErrors: AssistantFormFieldErrors = {};
        let extractedGeneralMessage: string | null = null;
        const fallbackErrorMessage = getApiErrorMessage(error, fallbackMessage);

        if (axios.isAxiosError(error)) {
            const responseData = error.response?.data as
                | {
                    message?: string;
                    errors?: Record<string, string[] | string>;
                    error?: { message?: string };
                }
                | undefined;

            const rawErrors = responseData?.errors;
            if (rawErrors) {
                for (const [rawField, messages] of Object.entries(rawErrors)) {
                    const firstRawMessage = Array.isArray(messages) ? messages[0] : messages;
                    const firstMessage = getDisplayableApiMessage(firstRawMessage, fallbackErrorMessage);
                    if (!firstMessage) {
                        continue;
                    }

                    if (rawField === 'staff_limit') {
                        extractedGeneralMessage = firstMessage;
                        continue;
                    }

                    if (rawField === 'name') {
                        extractedFieldErrors.name = firstMessage;
                        continue;
                    }

                    if (rawField === 'email') {
                        extractedFieldErrors.email = firstMessage;
                        continue;
                    }

                    if (rawField === 'phone') {
                        extractedFieldErrors.phone = firstMessage;
                        continue;
                    }

                    if (rawField === 'password') {
                        extractedFieldErrors.password = firstMessage;
                        continue;
                    }

                    if (rawField === 'password_confirmation') {
                        extractedFieldErrors.password_confirmation = firstMessage;
                        continue;
                    }

                    if (rawField === 'permissions' || rawField.startsWith('permissions.')) {
                        extractedFieldErrors.permissions = firstMessage;
                        continue;
                    }
                }
            }

            if (Object.keys(extractedFieldErrors).length === 0 && !extractedGeneralMessage) {
                extractedGeneralMessage =
                    getDisplayableApiMessage(responseData?.message)
                    || getDisplayableApiMessage(responseData?.error?.message)
                    || getDisplayableApiMessage(error.message)
                    || fallbackErrorMessage;
            }
        }
        else if (error instanceof Error) {
            extractedGeneralMessage = getDisplayableApiMessage(error.message, fallbackMessage);
        }
        else {
            extractedGeneralMessage = fallbackMessage;
        }

        setFormFieldErrors(extractedFieldErrors);
        setFormGeneralError(extractedGeneralMessage);
        setFormSubmitAttempted(true);
    };

    const createMutation = useMutation({
        mutationFn: createAssistant,
        onSuccess: () => {
            toast.success(t('settings.team.created'));
            setDialogOpen(false);
            setFormState(createEmptyAssistantForm());
            setFormFieldErrors({});
            setFormGeneralError(null);
            refreshTeamAccessData();
        },
        onError: (error) => {
            setMutationErrors(error, t('settings.team.createFailed'));
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof updateAssistant>[1] }) =>
            updateAssistant(id, payload),
        onSuccess: () => {
            toast.success(t('settings.team.updated'));
            setDialogOpen(false);
            setEditingAssistant(null);
            setFormState(createEmptyAssistantForm());
            setFormFieldErrors({});
            setFormGeneralError(null);
            refreshTeamAccessData();
        },
        onError: (error) => {
            setMutationErrors(error, t('settings.team.updateFailed'));
        },
    });

    const statusMutation = useMutation({
        mutationFn: ({ id, nextStatus }: { id: string; nextStatus: 'active' | 'blocked' }) =>
            updateAssistantStatus(id, nextStatus),
        onSuccess: () => {
            refreshTeamAccessData();
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('settings.team.statusUpdateFailed')));
        },
    });

    const resetPasswordMutation = useMutation({
        mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) =>
            resetAssistantPassword(id, {
                new_password: newPassword,
                new_password_confirmation: newPassword,
            }),
        onSuccess: () => {
            toast.success(t('settings.team.passwordResetSuccess'));
            setResetTarget(null);
            setResetPasswordValue('');
            setResetPasswordConfirmation('');
            refreshTeamAccessData();
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('settings.team.passwordResetFailed')));
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => deleteAssistant(id),
        onSuccess: () => {
            toast.success(t('settings.team.deleted'));
            setDeleteTarget(null);
            refreshTeamAccessData();
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('settings.team.deleteFailed')));
        },
    });

    const isCreateMode = editingAssistant === null;
    const isDialogSubmitting = createMutation.isPending || updateMutation.isPending;
    const nameError = getTextValidationMessage(formState.name, {
        label: t('settings.team.name'),
        required: true,
        min: 3,
        max: INPUT_LIMITS.personName,
    });
    const emailError = getEmailValidationMessage(formState.email, { required: true });
    const phoneError = getPhoneValidationMessage(formState.phone, { required: false });
    const passwordError = isCreateMode
        ? getPasswordValidationMessage(formState.password, { required: true })
        : null;
    const passwordConfirmationError = isCreateMode
        ? !formState.passwordConfirmation
            ? t('register.passwordConfirmRequired')
            : formState.password !== formState.passwordConfirmation
                ? t('register.passwordMismatch')
                : null
        : null;
    const formHasBasicErrors = useMemo(
        () => Boolean(nameError || emailError || phoneError || passwordError || passwordConfirmationError),
        [emailError, nameError, passwordConfirmationError, passwordError, phoneError]
    );

    const resetPasswordError = getPasswordValidationMessage(resetPasswordValue, { required: true });
    const resetPasswordConfirmationError = !resetPasswordConfirmation
        ? t('register.passwordConfirmRequired')
        : resetPasswordValue !== resetPasswordConfirmation
            ? t('register.passwordMismatch')
            : null;
    const shouldShowResetPasswordErrors = resetPasswordValue.length > 0 || resetPasswordConfirmation.length > 0;
    const resetHasErrors = Boolean(resetPasswordError || resetPasswordConfirmationError);

    const resolvedNameError = (formSubmitAttempted ? nameError : null) ?? formFieldErrors.name ?? null;
    const resolvedEmailError = (formSubmitAttempted ? emailError : null) ?? formFieldErrors.email ?? null;
    const resolvedPhoneError = (formSubmitAttempted ? phoneError : null) ?? formFieldErrors.phone ?? null;
    const resolvedPasswordError =
        (formSubmitAttempted ? passwordError : null) ?? formFieldErrors.password ?? null;
    const resolvedPasswordConfirmationError =
        (formSubmitAttempted ? passwordConfirmationError : null) ?? formFieldErrors.password_confirmation ?? null;
    const resolvedPermissionsError = formFieldErrors.permissions ?? null;

    const openCreateDialog = () => {
        setEditingAssistant(null);
        setFormState(createEmptyAssistantForm());
        setFormSubmitAttempted(false);
        setFormFieldErrors({});
        setFormGeneralError(null);
        setDialogOpen(true);
    };

    const openEditDialog = (assistant: ApiAssistantAccount) => {
        setEditingAssistant(assistant);
        setFormState({
            name: assistant.name,
            email: assistant.email,
            phone: formatPhoneInputValue(assistant.phone ?? ''),
            password: '',
            passwordConfirmation: '',
            permissions: assistant.assistant_permissions.filter((permission) =>
                PERMISSION_CODES.has(permission as (typeof PERMISSION_OPTIONS)[number]['code'])
            ),
        });
        setFormSubmitAttempted(false);
        setFormFieldErrors({});
        setFormGeneralError(null);
        setDialogOpen(true);
    };

    const togglePermission = (permission: string, checked: boolean) => {
        setFormState((prev) => ({
            ...prev,
            permissions: checked
                ? Array.from(new Set([...prev.permissions, permission]))
                : prev.permissions.filter((item) => item !== permission),
        }));
    };

    const submitAssistantForm = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setFormSubmitAttempted(true);
        setFormFieldErrors({});
        setFormGeneralError(null);
        if (formHasBasicErrors) {
            toast.error(t('settings.team.fixErrors'));
            return;
        }
        const normalizedPhone = formState.phone.trim()
            ? normalizePhoneForApi(formState.phone)
            : undefined;
        const apiPhone = normalizedPhone && normalizedPhone !== '+' ? normalizedPhone : undefined;

        if (isCreateMode) {
            createMutation.mutate({
                name: formState.name.trim(),
                email: formState.email.trim(),
                phone: apiPhone,
                password: formState.password,
                password_confirmation: formState.passwordConfirmation,
                permissions: formState.permissions,
            });
            return;
        }

        if (!editingAssistant) {
            return;
        }

        updateMutation.mutate({
            id: editingAssistant.id,
            payload: {
                name: formState.name.trim(),
                email: formState.email.trim(),
                phone: apiPhone,
                permissions: formState.permissions,
            },
        });
    };

    if (!canManageTeam) {
        return (
            <Card className="interactive-card overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-white via-white to-blue-50/25">
                <CardHeader className="space-y-4 pb-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <CardTitle className="text-base">{t('settings.team.title')}</CardTitle>
                        <Button
                            type="button"
                            className="rounded-xl"
                            variant="outline"
                            onClick={() => toast.error(t('errors.forbidden'))}
                        >
                            {t('settings.team.addAssistant')}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-sm text-gray-600">{t('settings.team.noAccess')}</p>
                    <div className="pointer-events-none opacity-70">
                        <TeamAccessLoadingSkeleton />
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <Card className="interactive-card overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-white via-white to-blue-50/25">
                <CardHeader className="space-y-4 pb-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <CardTitle className="text-base">{t('settings.team.title')}</CardTitle>
                        <Button
                            type="button"
                            className="rounded-xl"
                            onClick={openCreateDialog}
                            disabled={isReadOnly || isAtStaffLimit}
                        >
                            {t('settings.team.addAssistant')}
                        </Button>
                    </div>
                    {subscription?.is_configured ? (
                        <div
                            className={cn(
                                'rounded-2xl border px-4 py-3',
                                isAtStaffLimit
                                    ? 'border-amber-200 bg-amber-50'
                                    : 'border-blue-100 bg-blue-50/45'
                            )}
                        >
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                <div className="space-y-1">
                                    <p className="text-sm font-medium text-slate-900">
                                        {getSubscriptionAccessSummary(subscription, subscriptionEndsOn, t)}
                                    </p>
                                    {subscriptionEndsOn && subscription?.status !== 'read_only' ? (
                                        <p className="text-xs text-slate-600">
                                            {t('settings.team.accessDateLine', {
                                                date: subscriptionEndsOn,
                                            })}
                                        </p>
                                    ) : null}
                                </div>
                                <p className="text-xs text-slate-600">
                                    {staffLimit === null
                                        ? t('settings.team.staffUnlimited', {
                                            count: activeStaffCount,
                                        })
                                        : t('settings.team.staffUsage', {
                                            count: activeStaffCount,
                                            limit: staffLimit,
                                        })}
                                </p>
                            </div>
                            {isAtStaffLimit ? (
                                <p className="mt-2 text-xs font-medium text-amber-700">
                                    {t('settings.team.staffLimitReached')}
                                </p>
                            ) : null}
                            {isReadOnly ? (
                                <p className="mt-2 text-xs font-medium text-red-700">
                                    {t('settings.readOnlyNotice')}
                                </p>
                            ) : null}
                        </div>
                    ) : null}
                    <div className="flex flex-col gap-3 rounded-2xl border border-blue-100/80 bg-gradient-to-r from-white via-blue-50/30 to-white p-3 shadow-xs lg:flex-row lg:items-center lg:justify-between">
                        <Input
                            value={search}
                            onChange={(event) => {
                                setSearch(event.target.value);
                                setPage(1);
                            }}
                            placeholder={t('settings.team.searchPlaceholder')}
                            className="h-10 rounded-xl border-slate-200 bg-white/90 shadow-xs lg:max-w-md"
                        />
                        <Tabs
                            value={status}
                            onValueChange={(value) => updateStatusFilter(value as StaffStatusFilter)}
                            className="w-full lg:w-auto"
                        >
                            <TabsList className="grid h-10 w-full grid-cols-3 rounded-xl border border-slate-200 bg-white/90 p-1 shadow-xs lg:w-auto">
                                {STAFF_STATUS_FILTERS.map((item) => (
                                    <TabsTrigger
                                        key={item.value}
                                        value={item.value}
                                        className="rounded-lg px-3 text-xs sm:text-sm"
                                    >
                                        {t(item.labelKey)}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>
                    </div>
                </CardHeader>
                <CardContent className="px-4 pb-5 sm:px-5">
                    {assistantsQuery.isLoading ? (
                        <TeamAccessLoadingSkeleton />
                    ) : assistantsQuery.isError ? (
                        <p className="text-sm text-red-600">
                            {getApiErrorMessage(assistantsQuery.error, t('settings.team.loadFailed'))}
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {(assistantsQuery.data?.data ?? []).map((assistant) => {
                                const nextStatus = assistant.account_status === 'active' ? 'blocked' : 'active';
                                const statusLabel = getStaffStatusLabel(assistant.account_status, t);
                                return (
                                    <div
                                        key={assistant.id}
                                        className="interactive-card rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-xs hover:border-blue-100 hover:bg-blue-50/20 sm:p-5"
                                    >
                                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                            <div className="flex min-w-0 gap-3">
                                                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-sm font-bold text-blue-700 shadow-sm shadow-blue-100">
                                                    {getAssistantInitials(assistant.name)}
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="truncate font-semibold text-slate-950">{assistant.name}</p>
                                                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                                                        <span className="inline-flex min-w-0 items-center gap-1">
                                                            <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                                            <span className="truncate [overflow-wrap:anywhere]">{assistant.email}</span>
                                                        </span>
                                                        <span className="inline-flex items-center gap-1">
                                                            <Phone className="h-3.5 w-3.5 text-slate-400" />
                                                            {assistant.phone || '-'}
                                                        </span>
                                                    </div>
                                                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500">
                                                        <Clock3 className="h-3.5 w-3.5" />
                                                        {t('settings.team.lastLogin')}: {formatDateTime(assistant.last_login_at)}
                                                    </p>
                                                </div>
                                            </div>
                                            <Badge
                                                variant="outline"
                                                className={cn(
                                                    'w-fit shrink-0 rounded-full px-3 py-1 text-xs font-semibold',
                                                    assistant.account_status === 'active'
                                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                        : assistant.account_status === 'blocked'
                                                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                                                            : 'border-gray-200 bg-gray-100 text-gray-600'
                                                )}
                                            >
                                                {statusLabel}
                                            </Badge>
                                        </div>
                                        <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
                                            <p className="inline-flex items-center gap-2 text-xs font-medium text-slate-500">
                                                <ShieldCheck className="h-4 w-4 text-blue-500" />
                                                {t('settings.team.permissionsCount', {
                                                    count: assistant.assistant_permissions.length,
                                                })}
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => openEditDialog(assistant)}
                                                disabled={isReadOnly}
                                            >
                                                {t('common.edit')}
                                            </Button>
                                            {assistant.account_status !== 'deleted' ? (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() =>
                                                        statusMutation.mutate({
                                                            id: assistant.id,
                                                            nextStatus,
                                                        })
                                                    }
                                                    disabled={statusMutation.isPending || isReadOnly}
                                                >
                                                    {nextStatus === 'blocked'
                                                        ? t('settings.team.block')
                                                        : t('settings.team.activate')}
                                                </Button>
                                            ) : null}
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setResetTarget(assistant)}
                                                disabled={assistant.account_status === 'deleted' || isReadOnly}
                                            >
                                                {t('settings.team.resetPassword')}
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="destructive"
                                                size="sm"
                                                onClick={() => setDeleteTarget(assistant)}
                                                disabled={assistant.account_status === 'deleted' || isReadOnly}
                                            >
                                                {t('common.delete')}
                                            </Button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {(assistantsQuery.data?.data.length ?? 0) === 0 ? (
                                <p className="text-sm text-gray-500">{t('settings.team.empty')}</p>
                            ) : null}

                            <div className="flex items-center justify-end gap-2 pt-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={!canPrev}
                                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                                >
                                    {t('common.previous')}
                                </Button>
                                <span className="inline-flex min-w-[112px] justify-center rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 shadow-xs">
                                    {t('settings.logs.pageOf', { page, total: totalPages })}
                                </span>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={!canNext}
                                    onClick={() => setPage((prev) => prev + 1)}
                                >
                                    {t('common.next')}
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog
                open={dialogOpen}
                onOpenChange={(open) => {
                    setDialogOpen(open);
                    if (!open) {
                        setFormSubmitAttempted(false);
                        setFormFieldErrors({});
                        setFormGeneralError(null);
                    }
                }}
            >
                <DialogContent className="max-h-[calc(100dvh-1.5rem)] max-w-2xl overflow-y-auto p-5 sm:p-6">
                    <DialogHeader>
                        <DialogTitle>
                            {isCreateMode
                                ? t('settings.team.addAssistant')
                                : t('settings.team.editAssistant')}
                        </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submitAssistantForm} className="space-y-4">
                        {formSubmitAttempted && formGeneralError ? (
                            <p className="text-sm text-red-600">{formGeneralError}</p>
                        ) : null}
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="assistant-name">
                                    {t('settings.team.name')} <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    id="assistant-name"
                                    required
                                    value={formState.name}
                                    onChange={(event) =>
                                        setFormState((prev) => ({ ...prev, name: event.target.value }))
                                    }
                                    placeholder={t('settings.form.namePlaceholder')}
                                    minLength={3}
                                    maxLength={INPUT_LIMITS.personName}
                                    autoComplete="name"
                                    aria-invalid={Boolean(formSubmitAttempted && nameError)}
                                />
                                {resolvedNameError ? (
                                    <p className="text-xs text-red-600">{resolvedNameError}</p>
                                ) : null}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="assistant-email">
                                    {t('settings.team.email')} <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    id="assistant-email"
                                    type="email"
                                    required
                                    value={formState.email}
                                    onChange={(event) =>
                                        setFormState((prev) => ({ ...prev, email: event.target.value }))
                                    }
                                    placeholder={t('admin.form.emailPlaceholder')}
                                    maxLength={INPUT_LIMITS.email}
                                    inputMode="email"
                                    autoComplete="email"
                                    aria-invalid={Boolean(formSubmitAttempted && emailError)}
                                />
                                {resolvedEmailError ? (
                                    <p className="text-xs text-red-600">{resolvedEmailError}</p>
                                ) : null}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="assistant-phone">{t('settings.team.phone')}</Label>
                                <Input
                                    id="assistant-phone"
                                    type="tel"
                                    value={formState.phone}
                                    onChange={(event) =>
                                        setFormState((prev) => ({
                                            ...prev,
                                            phone: formatPhoneInputValue(event.target.value),
                                        }))
                                    }
                                    placeholder={t('settings.form.phonePlaceholder')}
                                    maxLength={INPUT_LIMITS.phoneFormatted}
                                    inputMode="tel"
                                    autoComplete="tel"
                                    aria-invalid={Boolean(formSubmitAttempted && phoneError)}
                                />
                                {resolvedPhoneError ? (
                                    <p className="text-xs text-red-600">{resolvedPhoneError}</p>
                                ) : null}
                            </div>
                            {isCreateMode ? (
                                <>
                                    <div className="space-y-2">
                                        <Label htmlFor="assistant-password">
                                            {t('settings.team.password')} <span className="text-red-500">*</span>
                                        </Label>
                                        <PasswordInput
                                            id="assistant-password"
                                            required
                                            value={formState.password}
                                            onChange={(event) =>
                                                setFormState((prev) => ({
                                                    ...prev,
                                                    password: event.target.value,
                                                }))
                                            }
                                            placeholder={t('admin.form.passwordPlaceholder')}
                                            minLength={8}
                                            maxLength={INPUT_LIMITS.password}
                                            autoComplete="new-password"
                                            aria-invalid={Boolean(formSubmitAttempted && passwordError)}
                                            showLabel={t('login.showPassword')}
                                            hideLabel={t('login.hidePassword')}
                                        />
                                        {resolvedPasswordError ? (
                                            <p className="text-xs text-red-600">{resolvedPasswordError}</p>
                                        ) : null}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="assistant-password-confirmation">
                                            {t('settings.team.passwordConfirm')} <span className="text-red-500">*</span>
                                        </Label>
                                        <PasswordInput
                                            id="assistant-password-confirmation"
                                            required
                                            value={formState.passwordConfirmation}
                                            onChange={(event) =>
                                                setFormState((prev) => ({
                                                    ...prev,
                                                    passwordConfirmation: event.target.value,
                                                }))
                                            }
                                            placeholder={t('admin.form.passwordPlaceholder')}
                                            minLength={8}
                                            maxLength={INPUT_LIMITS.password}
                                            autoComplete="new-password"
                                            aria-invalid={Boolean(formSubmitAttempted && passwordConfirmationError)}
                                            showLabel={t('login.showPassword')}
                                            hideLabel={t('login.hidePassword')}
                                        />
                                        {resolvedPasswordConfirmationError ? (
                                            <p className="text-xs text-red-600">{resolvedPasswordConfirmationError}</p>
                                        ) : null}
                                    </div>
                                </>
                            ) : null}
                        </div>
                        <div className="space-y-2">
                            <Label>{t('settings.team.permissions')}</Label>
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                {PERMISSION_OPTIONS.map((item) => {
                                    const checked = formState.permissions.includes(item.code);
                                    return (
                                        <label
                                            key={item.code}
                                            className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={(event) =>
                                                    togglePermission(item.code, event.target.checked)
                                                }
                                            />
                                            <span>{t(item.labelKey)}</span>
                                        </label>
                                    );
                                })}
                            </div>
                            {resolvedPermissionsError ? (
                                <p className="text-xs text-red-600">{resolvedPermissionsError}</p>
                            ) : null}
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setDialogOpen(false)}
                                disabled={isDialogSubmitting}
                            >
                                {t('common.cancel')}
                            </Button>
                            <Button
                                type="submit"
                                disabled={isDialogSubmitting || isReadOnly || (isCreateMode && isAtStaffLimit)}
                            >
                                {isDialogSubmitting
                                    ? t('common.saving')
                                    : isCreateMode
                                        ? t('settings.team.addAssistant')
                                        : t('common.saveChanges')}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog
                open={resetTarget !== null}
                onOpenChange={(open) => {
                    if (open) {
                        return;
                    }

                    setResetTarget(null);
                    setResetPasswordValue('');
                    setResetPasswordConfirmation('');
                }}
            >
                <DialogContent className="max-h-[calc(100dvh-1.5rem)] max-w-md overflow-y-auto p-5 sm:p-6">
                    <DialogHeader>
                        <DialogTitle>{t('settings.team.resetPassword')}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="assistant-reset-password">
                                    {t('settings.team.password')} <span className="text-red-500">*</span>
                                </Label>
                                <PasswordInput
                                    id="assistant-reset-password"
                                    value={resetPasswordValue}
                                    onChange={(event) => setResetPasswordValue(event.target.value)}
                                    required
                                    minLength={8}
                                    maxLength={INPUT_LIMITS.password}
                                    autoComplete="new-password"
                                    aria-invalid={Boolean(shouldShowResetPasswordErrors && resetPasswordError)}
                                    showLabel={t('login.showPassword')}
                                    hideLabel={t('login.hidePassword')}
                                />
                                {shouldShowResetPasswordErrors && resetPasswordError ? (
                                    <p className="text-xs text-red-600">{resetPasswordError}</p>
                                ) : null}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="assistant-reset-password-confirm">
                                    {t('settings.team.passwordConfirm')} <span className="text-red-500">*</span>
                                </Label>
                                <PasswordInput
                                    id="assistant-reset-password-confirm"
                                    value={resetPasswordConfirmation}
                                    onChange={(event) => setResetPasswordConfirmation(event.target.value)}
                                    required
                                    minLength={8}
                                    maxLength={INPUT_LIMITS.password}
                                    autoComplete="new-password"
                                    aria-invalid={Boolean(shouldShowResetPasswordErrors && resetPasswordConfirmationError)}
                                    showLabel={t('login.showPassword')}
                                    hideLabel={t('login.hidePassword')}
                                />
                                {shouldShowResetPasswordErrors && resetPasswordConfirmationError ? (
                                    <p className="text-xs text-red-600">{resetPasswordConfirmationError}</p>
                                ) : null}
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setResetTarget(null)}
                                disabled={resetPasswordMutation.isPending}
                            >
                                {t('common.cancel')}
                            </Button>
                            <Button
                                type="button"
                                disabled={
                                    resetHasErrors
                                    || resetPasswordMutation.isPending
                                    || !resetTarget
                                    || isReadOnly
                                }
                                onClick={() => {
                                    if (!resetTarget || resetHasErrors) {
                                        return;
                                    }
                                    resetPasswordMutation.mutate({
                                        id: resetTarget.id,
                                        newPassword: resetPasswordValue,
                                    });
                                }}
                            >
                                {resetPasswordMutation.isPending
                                    ? t('common.saving')
                                    : t('settings.team.resetPassword')}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <ConfirmActionDialog
                open={deleteTarget !== null}
                onOpenChange={(open) => !open && setDeleteTarget(null)}
                title={t('settings.team.deleteTitle')}
                description={t('settings.team.deleteDescription')}
                onConfirm={() => {
                    if (!deleteTarget) {
                        return;
                    }
                    deleteMutation.mutate(deleteTarget.id);
                }}
                confirmLabel={t('common.delete')}
                pendingLabel={t('common.saving')}
                cancelLabel={t('common.cancel')}
                isPending={deleteMutation.isPending}
            />
        </div>
    );
}
