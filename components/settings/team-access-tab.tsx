'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import { Clock3, Mail, Phone, ShieldCheck, Users } from 'lucide-react';
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
    DialogDescription,
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
import { normalizeAssistantPermissions } from '@/lib/auth/permissions';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useI18n } from '@/components/providers/i18n-provider';
import { formatLocalizedDate, formatLocalizedDateTime } from '@/lib/i18n/date';
import type { AppLocale } from '@/lib/i18n/config';

const PERMISSION_OPTIONS = [
    { code: 'patients.view', labelKey: 'settings.team.permissionPatientsView' },
    { code: 'patients.manage', labelKey: 'settings.team.permissionPatientsManage' },
    { code: 'appointments.view', labelKey: 'settings.team.permissionAppointmentsView' },
    { code: 'appointments.manage', labelKey: 'settings.team.permissionAppointmentsManage' },
    { code: 'payments.view', labelKey: 'settings.team.permissionPaymentsView' },
    { code: 'payments.manage', labelKey: 'settings.team.permissionPaymentsManage' },
] as const;
const PERMISSION_CODES = new Set(PERMISSION_OPTIONS.map((item) => item.code));
const MANAGE_TO_VIEW_PERMISSION: Record<string, string> = {
    'patients.manage': 'patients.view',
    'appointments.manage': 'appointments.view',
    'payments.manage': 'payments.view',
};
const VIEW_TO_MANAGE_PERMISSION: Record<string, string> = {
    'patients.view': 'patients.manage',
    'appointments.view': 'appointments.manage',
    'payments.view': 'payments.manage',
};

const DEFAULT_ASSISTANT_PERMISSIONS: string[] = [];

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
        permissions: normalizeAssistantPermissions(DEFAULT_ASSISTANT_PERMISSIONS),
    };
}

function TeamAccessLoadingSkeleton() {
    return (
        <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
                <div
                    key={`assistant-skeleton-${index}`}
                    className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs sm:p-5"
                >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 gap-3">
                            <Skeleton className="h-11 w-11 shrink-0 rounded-2xl" />
                            <div className="min-w-0 space-y-2">
                                <Skeleton className="h-5 w-40 max-w-full rounded-xl" />
                                <Skeleton className="h-4 w-56 max-w-full rounded-xl" />
                                <Skeleton className="h-3 w-44 max-w-full rounded-xl" />
                            </div>
                        </div>
                        <Skeleton className="h-6 w-20 rounded-full" />
                    </div>
                    <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
                        <Skeleton className="h-4 w-36 rounded-xl" />
                        <div className="flex flex-wrap gap-2">
                            <Skeleton className="h-8 w-16 rounded-lg" />
                            <Skeleton className="h-8 w-20 rounded-lg" />
                            <Skeleton className="h-8 w-28 rounded-lg" />
                            <Skeleton className="h-8 w-16 rounded-lg" />
                        </div>
                    </div>
                </div>
            ))}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                <Skeleton className="h-8 w-20 rounded-lg" />
                <Skeleton className="h-7 w-28 rounded-xl" />
                <Skeleton className="h-8 w-16 rounded-lg" />
            </div>
        </div>
    );
}

interface TeamAccessTabProps {
    canManageTeam: boolean;
    subscription?: ApiSubscriptionSummary | null;
    t: (key: string, variables?: Record<string, string | number>) => string;
}

function formatDateTime(value: string | null, locale: AppLocale): string {
    if (!value) {
        return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return formatLocalizedDateTime(date, locale);
}

function formatDateLabel(value: string | null, locale: AppLocale): string | null {
    if (!value) {
        return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return formatLocalizedDate(date, locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
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
    const { locale } = useI18n();
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
    const hasResults = (assistantsQuery.data?.data.length ?? 0) > 0;
    // Status filters stay enabled (the global standard for segmented filters);
    // instead the empty state is context-aware so e.g. the "Blocked" tab with no
    // blocked staff reads clearly rather than like "you have no staff at all".
    const emptyStateMessage = search.trim()
        ? t('settings.team.emptySearch')
        : status === 'blocked'
            ? t('settings.team.emptyBlocked')
            : status === 'deleted'
                ? t('settings.team.emptyDeleted')
                : t('settings.team.emptyActive');
    const staffLimit = subscription?.staff_limit ?? null;
    const activeStaffCount = subscription?.active_staff_count ?? 0;
    const isAtStaffLimit = staffLimit !== null && activeStaffCount >= staffLimit;
    const isReadOnly = subscription?.is_read_only === true;
    const subscriptionEndsOn = formatDateLabel(subscription?.ends_at ?? null, locale);

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
    const permissionsError = isCreateMode && formState.permissions.length === 0
        ? t('settings.team.permissionsRequired')
        : null;
    const formHasBasicErrors = useMemo(
        () => Boolean(nameError || emailError || phoneError || passwordError || passwordConfirmationError || permissionsError),
        [emailError, nameError, passwordConfirmationError, passwordError, permissionsError, phoneError]
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
    const resolvedPermissionsError =
        (formSubmitAttempted ? permissionsError : null) ?? formFieldErrors.permissions ?? null;

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
            permissions: normalizeAssistantPermissions(
                assistant.assistant_permissions.filter((permission) =>
                    PERMISSION_CODES.has(permission as (typeof PERMISSION_OPTIONS)[number]['code'])
                )
            ),
        });
        setFormSubmitAttempted(false);
        setFormFieldErrors({});
        setFormGeneralError(null);
        setDialogOpen(true);
    };

    const togglePermission = (permission: string, checked: boolean) => {
        setFormState((prev) => {
            const nextPermissions = new Set(prev.permissions);

            if (checked) {
                nextPermissions.add(permission);
                const viewPermission = MANAGE_TO_VIEW_PERMISSION[permission];
                if (viewPermission) {
                    nextPermissions.add(viewPermission);
                }
            } else {
                nextPermissions.delete(permission);
                const managePermission = VIEW_TO_MANAGE_PERMISSION[permission];
                if (managePermission) {
                    nextPermissions.delete(managePermission);
                }
            }

            return {
                ...prev,
                permissions: normalizeAssistantPermissions(Array.from(nextPermissions)),
            };
        });
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
            <Card className="interactive-card overflow-hidden rounded-2xl bg-white">
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
                    <p className="text-sm text-slate-600">{t('settings.team.noAccess')}</p>
                    <div className="pointer-events-none opacity-70">
                        <TeamAccessLoadingSkeleton />
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <Card className="interactive-card overflow-hidden rounded-2xl bg-white">
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
                                    : 'border-teal-100 bg-teal-50/45'
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
                    <div className="flex flex-col gap-3 rounded-2xl border border-teal-100/80 bg-white p-3 shadow-xs lg:flex-row lg:items-center lg:justify-between">
                        <Input
                            aria-label={t('settings.team.searchPlaceholder')}
                            value={search}
                            onChange={(event) => {
                                setSearch(event.target.value);
                                setPage(1);
                            }}
                            placeholder={t('settings.team.searchPlaceholder')}
                            className="h-9 rounded-xl border-slate-200 bg-white shadow-xs lg:max-w-md"
                        />
                        <Tabs
                            value={status}
                            onValueChange={(value) => updateStatusFilter(value as StaffStatusFilter)}
                            className="w-full min-w-0 overflow-x-auto no-scrollbar lg:w-auto"
                        >
                            <TabsList className="inline-flex h-10 w-max min-w-full rounded-xl border border-slate-200 bg-white p-1 shadow-xs lg:min-w-0">
                                {STAFF_STATUS_FILTERS.map((item) => (
                                    <TabsTrigger
                                        key={item.value}
                                        value={item.value}
                                        className="min-w-max rounded-lg px-3 text-xs sm:text-sm"
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
                                        className="interactive-card rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs sm:p-5"
                                    >
                                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                            <div className="flex min-w-0 gap-3">
                                                <Avatar className="h-11 w-11 rounded-2xl shadow-sm shadow-teal-100">
                                                    <AvatarImage
                                                        src={assistant.avatar_url ?? undefined}
                                                        alt={assistant.name}
                                                    />
                                                    <AvatarFallback className="rounded-2xl bg-teal-50 text-sm font-bold text-teal-700">
                                                        {getAssistantInitials(assistant.name)}
                                                    </AvatarFallback>
                                                </Avatar>
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
                                                        {t('settings.team.lastLogin')}:{' '}
                                                        {formatDateTime(assistant.last_login_at, locale)}
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
                                                            : 'border-slate-200 bg-slate-100 text-slate-600'
                                                )}
                                            >
                                                {statusLabel}
                                            </Badge>
                                        </div>
                                        <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
                                            <p className="inline-flex items-center gap-2 text-xs font-medium text-slate-500">
                                                <ShieldCheck className="h-4 w-4 text-teal-500" />
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

                            {hasResults ? (
                                <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
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
                            ) : (
                                <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 px-6 py-10 text-center">
                                    <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                                        <Users className="h-6 w-6" />
                                    </span>
                                    <p className="text-sm font-medium text-slate-600">{emptyStateMessage}</p>
                                </div>
                            )}
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
                        <DialogDescription className="sr-only">
                            {isCreateMode
                                ? t('settings.team.addAssistant')
                                : t('settings.team.editAssistant')}
                        </DialogDescription>
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
                                    const requiredViewPermission = MANAGE_TO_VIEW_PERMISSION[item.code];
                                    const disabled = Boolean(
                                        requiredViewPermission
                                        && !formState.permissions.includes(requiredViewPermission)
                                    );
                                    return (
                                        <label
                                            key={item.code}
                                            className={cn(
                                                'flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm',
                                                disabled && 'bg-slate-50 text-slate-400'
                                            )}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                disabled={disabled}
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
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full sm:w-auto"
                                onClick={() => setDialogOpen(false)}
                                disabled={isDialogSubmitting}
                            >
                                {t('common.cancel')}
                            </Button>
                            <Button
                                type="submit"
                                className="w-full sm:w-auto"
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
                        <DialogDescription className="sr-only">
                            {t('settings.team.resetPassword')}
                        </DialogDescription>
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
