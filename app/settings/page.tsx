'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-shell';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getCurrentUser, getProfile, updateProfile } from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import { toast } from 'sonner';
import { User, Building2, Clock, Lock } from 'lucide-react';
import { PasswordSecurityCard } from '@/components/settings/password-security-card';
import type { DentistProfile } from '@/lib/types';
import type { ApiSubscriptionSummary } from '@/lib/api/types';
import { useI18n } from '@/components/providers/i18n-provider';
import {
    INPUT_LIMITS,
    formatPhoneInputValue,
    getEmailValidationMessage,
    getPhoneValidationMessage,
    getTextValidationMessage,
    normalizePhoneForApi,
} from '@/lib/input-validation';
import { isValidTimeInput, sanitizeTimeInput } from '@/lib/utils';
import { formatLocalizedDate } from '@/lib/i18n/date';
import { DEFAULT_APPOINTMENT_WORKING_HOURS } from '@/lib/appointments/time-slots';

const defaultProfile: DentistProfile = {
    id: '',
    name: '',
    email: '',
    phone: '',
    practiceName: '',
    licenseNumber: '',
    address: '',
    workingHours: {
        start: DEFAULT_APPOINTMENT_WORKING_HOURS.start,
        end: DEFAULT_APPOINTMENT_WORKING_HOURS.end,
    },
    defaultAppointmentDuration: 30,
};

function mapProfileToForm(profile: Awaited<ReturnType<typeof getProfile>>): DentistProfile {
    return {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        phone: formatPhoneInputValue(profile.phone ?? ''),
        practiceName: profile.practice_name ?? '',
        licenseNumber: profile.license_number ?? '',
        address: profile.address ?? '',
        workingHours: {
            start: profile.working_hours.start ?? DEFAULT_APPOINTMENT_WORKING_HOURS.start,
            end: profile.working_hours.end ?? DEFAULT_APPOINTMENT_WORKING_HOURS.end,
        },
        defaultAppointmentDuration: profile.default_appointment_duration || 30,
    };
}

function getSubscriptionSummary(
    subscription: ApiSubscriptionSummary | null | undefined,
    endsOn: string | null,
    t: (key: string, variables?: Record<string, string | number>) => string
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

function getSubscriptionBadgeClass(status: ApiSubscriptionSummary['status']): string {
    return {
        none: 'border-slate-300 text-slate-700',
        trialing: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
        active: 'bg-green-100 text-green-800 hover:bg-green-100',
        grace: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
        read_only: 'bg-red-100 text-red-800 hover:bg-red-100',
    }[status];
}

function SettingsLoadingSkeleton() {
    return (
        <div className="space-y-8">
            <div className="space-y-2">
                <Skeleton className="h-9 w-40" />
                <Skeleton className="h-4 w-64" />
            </div>

            <div className="space-y-6">
                <div className="flex gap-2 overflow-x-auto overflow-y-hidden no-scrollbar">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton key={index} className="h-10 w-28 shrink-0" />
                    ))}
                </div>

                <Card>
                    <CardHeader>
                        <Skeleton className="h-6 w-44" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {Array.from({ length: 4 }).map((_, index) => (
                                <div key={index} className="space-y-2">
                                    <Skeleton className="h-4 w-24" />
                                    <Skeleton className="h-10 w-full" />
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-end">
                            <Skeleton className="h-10 w-32" />
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default function SettingsPage() {
    const { t, locale } = useI18n();
    const currentUserQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        staleTime: 5 * 60_000,
    });
    const isDentist = currentUserQuery.data?.role === 'dentist';
    const isAssistant = currentUserQuery.data?.role === 'assistant';
    const canViewSettings = Boolean(currentUserQuery.data && (isDentist || isAssistant));
    const canManageSettings = Boolean(currentUserQuery.data && isDentist);

    const profileQuery = useQuery({
        queryKey: ['settings', 'profile'],
        queryFn: getProfile,
        enabled: canManageSettings,
    });

    const [profileDraft, setProfileDraft] = useState<DentistProfile | null>(null);
    const [profileSubmitAttempted, setProfileSubmitAttempted] = useState(false);
    const [practiceSubmitAttempted, setPracticeSubmitAttempted] = useState(false);

    const profileMutation = useMutation({
        mutationFn: updateProfile,
        onSuccess: () => {
            toast.success(t('settings.profileUpdated'));
            setProfileDraft(null);
            profileQuery.refetch();
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('settings.profileUpdateFailed')));
        },
    });

    const profile = profileDraft ?? (profileQuery.data ? mapProfileToForm(profileQuery.data) : defaultProfile);
    const profileNameError = getTextValidationMessage(profile.name, {
        label: t('settings.fullName'),
        required: true,
        min: 3,
        max: INPUT_LIMITS.personName,
    });
    const profileEmailError = getEmailValidationMessage(profile.email, { required: true });
    const profilePhoneError = getPhoneValidationMessage(profile.phone, { required: false });
    const profileHasErrors = Boolean(profileNameError || profileEmailError || profilePhoneError);
    const practiceNameError = getTextValidationMessage(profile.practiceName ?? '', {
        label: t('settings.practiceName'),
        min: 3,
        max: INPUT_LIMITS.practiceName,
    });
    const practiceAddressError = getTextValidationMessage(profile.address ?? '', {
        label: t('settings.address'),
        min: 3,
        max: INPUT_LIMITS.address,
    });
    const practiceHasErrors = Boolean(practiceNameError || practiceAddressError);
    const workingHoursStartError = !isValidTimeInput(profile.workingHours.start)
        ? t('settings.timeInvalid')
        : null;
    const workingHoursEndError = !isValidTimeInput(profile.workingHours.end)
        ? t('settings.timeInvalid')
        : null;
    const workingHoursHasErrors = Boolean(workingHoursStartError || workingHoursEndError);
    const subscription = currentUserQuery.data?.subscription ?? null;
    const subscriptionEndsOn = subscription?.ends_at
        ? formatLocalizedDate(subscription.ends_at, locale, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        })
        : null;
    const subscriptionSummary = getSubscriptionSummary(subscription, subscriptionEndsOn, t);
    const subscriptionStatusLabel = subscription
        ? t(`subscription.status.${subscription.status}`)
        : t('subscription.status.none');

    const updatePartialProfile = (payload: Parameters<typeof updateProfile>[0]) => {
        profileMutation.mutate(payload);
    };

    const handleProfileUpdate = (event: React.FormEvent) => {
        event.preventDefault();
        setProfileSubmitAttempted(true);
        if (!canManageSettings) {
            toast.error(t('settings.readOnlyNotice'));
            return;
        }
        if (profileHasErrors) {
            toast.error(t('settings.profileFixErrors'));
            return;
        }

        updatePartialProfile({
            name: profile.name.trim(),
            email: profile.email.trim(),
            phone: profile.phone ? normalizePhoneForApi(profile.phone) : undefined,
            license_number: profile.licenseNumber,
        });
    };

    const handlePracticeUpdate = (event: React.FormEvent) => {
        event.preventDefault();
        setPracticeSubmitAttempted(true);
        if (!canManageSettings) {
            toast.error(t('settings.readOnlyNotice'));
            return;
        }
        if (practiceHasErrors) {
            toast.error(t('settings.practiceFixErrors'));
            return;
        }

        updatePartialProfile({
            practice_name: (profile.practiceName ?? '').trim(),
            address: (profile.address ?? '').trim(),
        });
    };

    const handleWorkingHoursUpdate = (event: React.FormEvent) => {
        event.preventDefault();
        if (!canManageSettings) {
            toast.error(t('settings.readOnlyNotice'));
            return;
        }
        if (workingHoursHasErrors) {
            toast.error(t('settings.timeInvalid'));
            return;
        }
        updatePartialProfile({
            working_hours_start: profile.workingHours.start,
            working_hours_end: profile.workingHours.end,
            default_appointment_duration: profile.defaultAppointmentDuration,
        });
    };

    if (currentUserQuery.isLoading || (canManageSettings && profileQuery.isLoading)) {
        return <SettingsLoadingSkeleton />;
    }

    if (currentUserQuery.isError) {
        return (
            <div className="space-y-4">
                <p className="text-sm text-red-600">
                    {getApiErrorMessage(currentUserQuery.error, t('settings.loadFailed'))}
                </p>
                <Button variant="outline" onClick={() => currentUserQuery.refetch()}>
                    {t('common.retry')}
                </Button>
            </div>
        );
    }

    if (!canViewSettings) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>{t('settings.title')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-gray-600">{t('settings.noAccess')}</p>
                </CardContent>
            </Card>
        );
    }

    if (profileQuery.isError) {
        return (
            <div className="space-y-4">
                <p className="text-sm text-red-600">
                    {getApiErrorMessage(profileQuery.error, t('settings.loadFailed'))}
                </p>
                <Button variant="outline" onClick={() => profileQuery.refetch()}>
                    {t('common.retry')}
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <PageHeader
                title={t('settings.title')}
                description={(
                    <>
                        {t('settings.subtitle')}
                        {!canManageSettings ? (
                            <span className="mt-2 block text-sm text-amber-600">{t('settings.readOnlyNotice')}</span>
                        ) : null}
                    </>
                )}
            />

            <Card className="interactive-card">
                <CardHeader className="space-y-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <CardTitle>{t('settings.subscriptionTitle')}</CardTitle>
                            <p className="mt-1 text-sm text-gray-500">
                                {t('settings.subscriptionDescription')}
                            </p>
                        </div>
                        <Badge
                            variant="outline"
                            className={subscription ? getSubscriptionBadgeClass(subscription.status) : getSubscriptionBadgeClass('none')}
                        >
                            {subscriptionStatusLabel}
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="space-y-2">
                    <p className="text-base font-medium text-slate-900">{subscriptionSummary}</p>
                    {subscription?.cancel_at_period_end && subscriptionEndsOn ? (
                        <p className="text-sm text-amber-700">
                            {t('subscription.banner.cancelScheduledDescription', { date: subscriptionEndsOn })}
                        </p>
                    ) : null}
                </CardContent>
            </Card>

            <Tabs defaultValue={isDentist ? 'profile' : 'security'} className="space-y-6">
                <div className="overflow-x-auto overflow-y-hidden no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
                    <TabsList className="inline-flex w-full sm:w-auto min-w-max">
                        {isDentist ? (
                            <>
                                <TabsTrigger value="profile" className="flex-shrink-0">
                                    <User className="w-4 h-4 sm:mr-2" />
                                    <span className="hidden sm:inline">{t('settings.tab.profile')}</span>
                                </TabsTrigger>
                                <TabsTrigger value="practice" className="flex-shrink-0">
                                    <Building2 className="w-4 h-4 sm:mr-2" />
                                    <span className="hidden sm:inline">{t('settings.tab.practice')}</span>
                                </TabsTrigger>
                                <TabsTrigger value="hours" className="flex-shrink-0">
                                    <Clock className="w-4 h-4 sm:mr-2" />
                                    <span className="hidden sm:inline">{t('settings.tab.hours')}</span>
                                </TabsTrigger>
                            </>
                        ) : null}
                        <TabsTrigger value="security" className="flex-shrink-0">
                            <Lock className="w-4 h-4 sm:mr-2" />
                            <span className="hidden sm:inline">{t('settings.tab.security')}</span>
                        </TabsTrigger>
                    </TabsList>
                </div>

                {isDentist ? (
                    <TabsContent value="profile">
                    <Card className="interactive-card">
                        <CardHeader>
                            <CardTitle>{t('settings.personalInfo')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleProfileUpdate} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="name">
                                            {t('settings.fullName')} <span className="text-red-500">*</span>
                                        </Label>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-gray-700 bg-gray-100 px-3 py-2 rounded-md border border-gray-300">
                                                {t('common.doctorPrefix')}
                                            </span>
                                            <Input
                                                id="name"
                                                required
                                                value={profile.name.replace(/^Dr\.\s*/i, '')}
                                                onChange={(event) =>
                                                    setProfileDraft({ ...profile, name: event.target.value })
                                                }
                                                placeholder={t('settings.form.namePlaceholder')}
                                                maxLength={INPUT_LIMITS.personName}
                                                aria-invalid={Boolean(profileSubmitAttempted && profileNameError)}
                                            />
                                        </div>
                                        {profileSubmitAttempted && profileNameError ? (
                                            <p className="text-xs text-red-600">{profileNameError}</p>
                                        ) : null}
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="email">
                                            {t('login.email')} <span className="text-red-500">*</span>
                                        </Label>
                                        <Input
                                            id="email"
                                            type="email"
                                            required
                                            value={profile.email}
                                            onChange={(event) =>
                                                setProfileDraft({ ...profile, email: event.target.value })
                                            }
                                            maxLength={INPUT_LIMITS.email}
                                            autoComplete="email"
                                            inputMode="email"
                                            aria-invalid={Boolean(profileSubmitAttempted && profileEmailError)}
                                        />
                                        {profileSubmitAttempted && profileEmailError ? (
                                            <p className="text-xs text-red-600">{profileEmailError}</p>
                                        ) : null}
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="phone">{t('settings.phone')}</Label>
                                        <Input
                                            id="phone"
                                            value={profile.phone}
                                            onChange={(event) =>
                                                setProfileDraft({
                                                    ...profile,
                                                    phone: formatPhoneInputValue(event.target.value),
                                                })
                                            }
                                            type="tel"
                                            placeholder={t('settings.form.phonePlaceholder')}
                                            maxLength={INPUT_LIMITS.phoneFormatted}
                                            inputMode="tel"
                                            autoComplete="tel"
                                            aria-invalid={Boolean(profileSubmitAttempted && profilePhoneError)}
                                        />
                                        {profileSubmitAttempted && profilePhoneError ? (
                                            <p className="text-xs text-red-600">{profilePhoneError}</p>
                                        ) : null}
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="license">{t('settings.licenseNumber')}</Label>
                                        <Input
                                            id="license"
                                            value={profile.licenseNumber || ''}
                                            onChange={(event) =>
                                                setProfileDraft({ ...profile, licenseNumber: event.target.value })
                                            }
                                            maxLength={INPUT_LIMITS.licenseNumber}
                                        />
                                    </div>
                                </div>

                                <div className="flex justify-end">
                                    <Button type="submit" disabled={profileMutation.isPending || !canManageSettings}>
                                        {profileMutation.isPending ? t('common.saving') : t('common.saveChanges')}
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                    </TabsContent>
                ) : null}

                {isDentist ? (
                    <TabsContent value="practice">
                    <Card className="interactive-card">
                        <CardHeader>
                            <CardTitle>{t('settings.practiceInfo')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handlePracticeUpdate} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="practiceName">{t('settings.practiceName')}</Label>
                                    <Input
                                        id="practiceName"
                                        value={profile.practiceName}
                                        onChange={(event) =>
                                            setProfileDraft({ ...profile, practiceName: event.target.value })
                                        }
                                        maxLength={INPUT_LIMITS.practiceName}
                                        aria-invalid={Boolean(practiceSubmitAttempted && practiceNameError)}
                                    />
                                    {practiceSubmitAttempted && practiceNameError ? (
                                        <p className="text-xs text-red-600">{practiceNameError}</p>
                                    ) : null}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="address">{t('settings.address')}</Label>
                                    <Textarea
                                        id="address"
                                        value={profile.address || ''}
                                        onChange={(event) =>
                                            setProfileDraft({ ...profile, address: event.target.value })
                                        }
                                        rows={3}
                                        maxLength={INPUT_LIMITS.address}
                                        aria-invalid={Boolean(practiceSubmitAttempted && practiceAddressError)}
                                    />
                                    {practiceSubmitAttempted && practiceAddressError ? (
                                        <p className="text-xs text-red-600">{practiceAddressError}</p>
                                    ) : null}
                                </div>

                                <div className="flex justify-end">
                                    <Button type="submit" disabled={profileMutation.isPending || !canManageSettings}>
                                        {profileMutation.isPending ? t('common.saving') : t('common.saveChanges')}
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                    </TabsContent>
                ) : null}

                {isDentist ? (
                    <TabsContent value="hours">
                    <Card className="interactive-card">
                        <CardHeader>
                            <CardTitle>{t('settings.workingHoursAndAppointments')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleWorkingHoursUpdate} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="startTime">{t('settings.startTime')}</Label>
                                        <Input
                                            id="startTime"
                                            type="text"
                                            inputMode="text"
                                            maxLength={5}
                                            value={profile.workingHours.start}
                                            onChange={(event) =>
                                                setProfileDraft({
                                                    ...profile,
                                                    workingHours: {
                                                        ...profile.workingHours,
                                                        start: sanitizeTimeInput(event.target.value),
                                                    },
                                                })
                                            }
                                            placeholder={DEFAULT_APPOINTMENT_WORKING_HOURS.start}
                                            aria-invalid={Boolean(workingHoursStartError)}
                                        />
                                        {workingHoursStartError ? (
                                            <p className="text-xs text-red-600">{workingHoursStartError}</p>
                                        ) : null}
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="endTime">{t('settings.endTime')}</Label>
                                        <Input
                                            id="endTime"
                                            type="text"
                                            inputMode="text"
                                            maxLength={5}
                                            value={profile.workingHours.end}
                                            onChange={(event) =>
                                                setProfileDraft({
                                                    ...profile,
                                                    workingHours: {
                                                        ...profile.workingHours,
                                                        end: sanitizeTimeInput(event.target.value),
                                                    },
                                                })
                                            }
                                            placeholder={DEFAULT_APPOINTMENT_WORKING_HOURS.end}
                                            aria-invalid={Boolean(workingHoursEndError)}
                                        />
                                        {workingHoursEndError ? (
                                            <p className="text-xs text-red-600">{workingHoursEndError}</p>
                                        ) : null}
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="duration">{t('settings.defaultAppointmentDuration')}</Label>
                                        <Select
                                            value={String(profile.defaultAppointmentDuration)}
                                            onValueChange={(value) =>
                                                setProfileDraft({
                                                    ...profile,
                                                    defaultAppointmentDuration: Number(value),
                                                })
                                            }
                                        >
                                            <SelectTrigger id="duration" className="w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="15">{t('appointments.minutesShort', { count: 15 })}</SelectItem>
                                                <SelectItem value="30">{t('appointments.minutesShort', { count: 30 })}</SelectItem>
                                                <SelectItem value="45">{t('appointments.minutesShort', { count: 45 })}</SelectItem>
                                                <SelectItem value="60">{t('settings.duration.oneHour')}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                    <p className="text-sm text-blue-800">
                                        <strong>{t('settings.currentSchedule')}</strong> {profile.workingHours.start} - {profile.workingHours.end}
                                    </p>
                                    <p className="text-sm text-blue-600 mt-1">
                                        {t('settings.appointmentsDurationHint', {
                                            count: profile.defaultAppointmentDuration,
                                        })}
                                    </p>
                                </div>

                                <div className="flex justify-end">
                                    <Button type="submit" disabled={profileMutation.isPending || !canManageSettings || workingHoursHasErrors}>
                                        {profileMutation.isPending ? t('common.saving') : t('common.saveChanges')}
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                    </TabsContent>
                ) : null}

                <TabsContent value="security">
                    {currentUserQuery.data ? (
                        <PasswordSecurityCard user={currentUserQuery.data} className="interactive-card" />
                    ) : null}
                </TabsContent>
            </Tabs>
        </div>
    );
}
