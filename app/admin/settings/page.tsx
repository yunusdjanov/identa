'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Lock, MessageSquare, Settings2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/components/providers/i18n-provider';
import { getApiErrorMessage } from '@/lib/api/client';
import {
    getAdminLandingSettings,
    getCurrentUser,
    listAdminLeadRequests,
    logoutSession,
    updateAdminLandingSettings,
    updateAdminLeadRequestStatus,
} from '@/lib/api/dentist';
import type { AdminLeadRequestStatus } from '@/lib/api/dentist';
import type { ApiLandingSettings } from '@/lib/api/types';

type AdminLocale = 'ru' | 'uz' | 'en';

interface AdminLandingCopy {
    landing: {
        title: string;
        description: string;
        trialPrice: string;
        monthlyPrice: string;
        yearlyPrice: string;
        telegramUrl: string;
        optional: string;
        save: string;
        saving: string;
        saved: string;
        fixErrors: string;
        required: string;
        invalidAmount: string;
        invalidUrl: string;
    };
    leads: {
        title: string;
        description: string;
        empty: string;
        requestedAt: string;
        clinic: string;
        city: string;
        note: string;
        phone: string;
        markNew: string;
        markContacted: string;
        markClosed: string;
        updated: string;
        updateFailed: string;
        statuses: Record<AdminLeadRequestStatus, string>;
    };
}

interface LandingSettingsFormState {
    trialPriceAmount: string;
    monthlyPriceAmount: string;
    yearlyPriceAmount: string;
    telegramContactUrl: string;
}

const ADMIN_LANDING_COPY: Record<AdminLocale, AdminLandingCopy> = {
    uz: {
        landing: {
            title: 'Landing tariflari va kontaktlar',
            description: "Landingdagi narxlar va Telegram havolasi shu yerdan boshqariladi.",
            trialPrice: 'Trial narxi',
            monthlyPrice: 'Oylik tarif narxi',
            yearlyPrice: 'Yillik tarif narxi',
            telegramUrl: 'Telegram havolasi',
            optional: 'ixtiyoriy',
            save: 'Saqlash',
            saving: 'Saqlanmoqda...',
            saved: 'Landing sozlamalari saqlandi.',
            fixErrors: "Maydonlarni to'g'ri to'ldiring.",
            required: 'Majburiy maydon',
            invalidAmount: "Butun va musbat bo'lmagan son kiriting.",
            invalidUrl: "To'g'ri URL kiriting.",
        },
        leads: {
            title: "Kelgan so'rovlar",
            description: "Landing formasi orqali yuborilgan barcha so'rovlar shu yerga tushadi.",
            empty: "Hozircha so'rovlar yo'q.",
            requestedAt: 'Yuborilgan vaqti',
            clinic: 'Klinika',
            city: 'Shahar',
            note: 'Izoh',
            phone: 'Telefon',
            markNew: 'Yangi',
            markContacted: "Bog'langan",
            markClosed: 'Yopilgan',
            updated: "So'rov statusi yangilandi.",
            updateFailed: "So'rov statusini yangilab bo'lmadi.",
            statuses: {
                new: 'Yangi',
                contacted: "Bog'langan",
                closed: 'Yopilgan',
            },
        },
    },
    ru: {
        landing: {
            title: 'Тарифы лендинга и контакты',
            description: 'Здесь управляются цены на лендинге и ссылка на Telegram.',
            trialPrice: 'Цена trial',
            monthlyPrice: 'Цена месячного тарифа',
            yearlyPrice: 'Цена годового тарифа',
            telegramUrl: 'Ссылка Telegram',
            optional: 'необязательно',
            save: 'Сохранить',
            saving: 'Сохранение...',
            saved: 'Настройки лендинга сохранены.',
            fixErrors: 'Проверьте заполнение полей.',
            required: 'Обязательное поле',
            invalidAmount: 'Введите целое неотрицательное число.',
            invalidUrl: 'Введите корректный URL.',
        },
        leads: {
            title: 'Входящие заявки',
            description: 'Все заявки, отправленные через форму лендинга, попадают сюда.',
            empty: 'Пока заявок нет.',
            requestedAt: 'Отправлено',
            clinic: 'Клиника',
            city: 'Город',
            note: 'Комментарий',
            phone: 'Телефон',
            markNew: 'Новая',
            markContacted: 'Связались',
            markClosed: 'Закрыта',
            updated: 'Статус заявки обновлён.',
            updateFailed: 'Не удалось обновить статус заявки.',
            statuses: {
                new: 'Новая',
                contacted: 'Связались',
                closed: 'Закрыта',
            },
        },
    },
    en: {
        landing: {
            title: 'Landing pricing and contacts',
            description: 'Manage landing page prices and the Telegram contact link here.',
            trialPrice: 'Trial price',
            monthlyPrice: 'Monthly plan price',
            yearlyPrice: 'Yearly plan price',
            telegramUrl: 'Telegram URL',
            optional: 'optional',
            save: 'Save',
            saving: 'Saving...',
            saved: 'Landing settings saved.',
            fixErrors: 'Please review the form fields.',
            required: 'Required field',
            invalidAmount: 'Enter a whole non-negative number.',
            invalidUrl: 'Enter a valid URL.',
        },
        leads: {
            title: 'Incoming requests',
            description: 'All requests submitted through the landing page form appear here.',
            empty: 'No requests yet.',
            requestedAt: 'Submitted at',
            clinic: 'Clinic',
            city: 'City',
            note: 'Note',
            phone: 'Phone',
            markNew: 'New',
            markContacted: 'Contacted',
            markClosed: 'Closed',
            updated: 'Lead request status updated.',
            updateFailed: 'Could not update the lead request status.',
            statuses: {
                new: 'New',
                contacted: 'Contacted',
                closed: 'Closed',
            },
        },
    },
};

const ADMIN_RU_COPY: AdminLandingCopy = {
    landing: {
        title: 'Тарифы лендинга и контакты',
        description: 'Здесь управляются цены на лендинге и ссылка на Telegram.',
        trialPrice: 'Цена пробного периода',
        monthlyPrice: 'Цена месячного тарифа',
        yearlyPrice: 'Цена годового тарифа',
        telegramUrl: 'Ссылка Telegram',
        optional: 'необязательно',
        save: 'Сохранить',
        saving: 'Сохранение...',
        saved: 'Настройки лендинга сохранены.',
        fixErrors: 'Проверьте заполнение полей.',
        required: 'Обязательное поле',
        invalidAmount: 'Введите целое неотрицательное число.',
        invalidUrl: 'Введите корректный URL.',
    },
    leads: {
        title: 'Входящие заявки',
        description: 'Все заявки, отправленные через форму лендинга, попадают сюда.',
        empty: 'Пока заявок нет.',
        requestedAt: 'Отправлено',
        clinic: 'Клиника',
        city: 'Город',
        note: 'Комментарий',
        phone: 'Телефон',
        markNew: 'Новая',
        markContacted: 'Связались',
        markClosed: 'Закрыта',
        updated: 'Статус заявки обновлен.',
        updateFailed: 'Не удалось обновить статус заявки.',
        statuses: {
            new: 'Новая',
            contacted: 'Связались',
            closed: 'Закрыта',
        },
    },
};

function mapSettingsToForm(settings: ApiLandingSettings): LandingSettingsFormState {
    return {
        trialPriceAmount: String(settings.trial_price_amount),
        monthlyPriceAmount: String(settings.monthly_price_amount),
        yearlyPriceAmount: String(settings.yearly_price_amount),
        telegramContactUrl: settings.telegram_contact_url ?? '',
    };
}

function formatDateTime(value: string | null, locale: AdminLocale): string {
    if (!value) {
        return '—';
    }

    try {
        return new Intl.DateTimeFormat(locale === 'uz' ? 'uz-UZ' : locale === 'ru' ? 'ru-RU' : 'en-US', {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(new Date(value));
    } catch {
        return value;
    }
}

function getStatusClasses(status: AdminLeadRequestStatus): string {
    switch (status) {
        case 'contacted':
            return 'bg-blue-50 text-blue-700 border-blue-200';
        case 'closed':
            return 'bg-slate-100 text-slate-700 border-slate-200';
        default:
            return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
}

function AdminSettingsLoadingSkeleton() {
    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(219,234,254,0.55),transparent_34rem),linear-gradient(180deg,#f8fbff_0%,#f8fafc_42%,#f1f5f9_100%)] p-4 sm:p-6 lg:p-8">
            <div className="mx-auto max-w-5xl space-y-8">
                <div className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10" />
                    <div className="space-y-2">
                        <Skeleton className="h-9 w-56" />
                        <Skeleton className="h-4 w-52" />
                    </div>
                </div>

                {Array.from({ length: 4 }).map((_, index) => (
                    <Card key={index}>
                        <CardHeader>
                            <Skeleton className="h-6 w-40" />
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-12 w-full" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}

export default function AdminSettingsPage() {
    const { locale, t } = useI18n();
    const adminLocale = (locale as AdminLocale) ?? 'en';
    const copy = adminLocale === 'ru' ? ADMIN_RU_COPY : ADMIN_LANDING_COPY[adminLocale] ?? ADMIN_LANDING_COPY.en;
    const router = useRouter();
    const queryClient = useQueryClient();
    const [settingsDraft, setSettingsDraft] = useState<Partial<LandingSettingsFormState>>({});
    const authQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        retry: false,
    });

    const settingsQuery = useQuery({
        queryKey: ['admin', 'landing-settings'],
        queryFn: getAdminLandingSettings,
        enabled: authQuery.data?.role === 'admin',
    });

    const leadRequestsQuery = useQuery({
        queryKey: ['admin', 'lead-requests'],
        queryFn: () => listAdminLeadRequests({ page: 1, perPage: 20 }),
        enabled: authQuery.data?.role === 'admin',
    });

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

    const landingSettingsMutation = useMutation({
        mutationFn: updateAdminLandingSettings,
        onSuccess: (data) => {
            queryClient.setQueryData(['admin', 'landing-settings'], data);
            setSettingsDraft({});
            toast.success(copy.landing.saved);
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, copy.landing.fixErrors));
        },
    });

    const leadStatusMutation = useMutation({
        mutationFn: ({ id, status }: { id: string; status: AdminLeadRequestStatus }) =>
            updateAdminLeadRequestStatus(id, status),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['admin', 'lead-requests'] });
            toast.success(copy.leads.updated);
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, copy.leads.updateFailed));
        },
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

    const baseSettingsForm = useMemo(
        () =>
            settingsQuery.data
                ? mapSettingsToForm(settingsQuery.data)
                : {
                      trialPriceAmount: '',
                      monthlyPriceAmount: '',
                      yearlyPriceAmount: '',
                      telegramContactUrl: '',
                  },
        [settingsQuery.data]
    );

    const settingsForm = useMemo(
        () => ({
            trialPriceAmount: settingsDraft.trialPriceAmount ?? baseSettingsForm.trialPriceAmount,
            monthlyPriceAmount: settingsDraft.monthlyPriceAmount ?? baseSettingsForm.monthlyPriceAmount,
            yearlyPriceAmount: settingsDraft.yearlyPriceAmount ?? baseSettingsForm.yearlyPriceAmount,
            telegramContactUrl: settingsDraft.telegramContactUrl ?? baseSettingsForm.telegramContactUrl,
        }),
        [baseSettingsForm, settingsDraft]
    );

    const settingsErrors = useMemo(() => {
        const validateAmount = (value: string): string | null => {
            if (value.trim() === '') {
                return copy.landing.required;
            }

            const parsed = Number(value);

            if (!Number.isInteger(parsed) || parsed < 0) {
                return copy.landing.invalidAmount;
            }

            return null;
        };

        let telegramError: string | null = null;

        if (settingsForm.telegramContactUrl.trim() !== '') {
            try {
                new URL(settingsForm.telegramContactUrl.trim());
            } catch {
                telegramError = copy.landing.invalidUrl;
            }
        }

        return {
            trialPriceAmount: validateAmount(settingsForm.trialPriceAmount),
            monthlyPriceAmount: validateAmount(settingsForm.monthlyPriceAmount),
            yearlyPriceAmount: validateAmount(settingsForm.yearlyPriceAmount),
            telegramContactUrl: telegramError,
        };
    }, [copy.landing, settingsForm]);

    const hasSettingsErrors = Object.values(settingsErrors).some(Boolean);

    const handleSaveLandingSettings = () => {
        if (hasSettingsErrors) {
            toast.error(copy.landing.fixErrors);
            return;
        }

        landingSettingsMutation.mutate({
            trial_price_amount: Number(settingsForm.trialPriceAmount),
            monthly_price_amount: Number(settingsForm.monthlyPriceAmount),
            yearly_price_amount: Number(settingsForm.yearlyPriceAmount),
            telegram_contact_url: settingsForm.telegramContactUrl.trim() || null,
        });
    };

    if (authQuery.isLoading) {
        return <AdminSettingsLoadingSkeleton />;
    }

    if (authQuery.isError || !authQuery.data) {
        return (
            <div className="space-y-4 p-8">
                <p className="text-sm text-red-600">
                    {getApiErrorMessage(authQuery.error, t('admin.settings.loadFailed'))}
                </p>
                <Button variant="outline" onClick={() => authQuery.refetch()}>
                    {t('common.retry')}
                </Button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(219,234,254,0.55),transparent_34rem),linear-gradient(180deg,#f8fbff_0%,#f8fafc_42%,#f1f5f9_100%)] p-4 sm:p-6 lg:p-8">
            <div className="mx-auto max-w-5xl space-y-8">
                <PageHeader
                    title={t('admin.settings.title')}
                    description={t('admin.settings.subtitle')}
                    actions={(
                        <Button variant="outline" asChild>
                            <Link href="/admin">
                                <ArrowLeft className="h-4 w-4" />
                                {t('admin.dashboardTitle')}
                            </Link>
                        </Button>
                    )}
                />

                <Card className="interactive-card">
                    <CardHeader>
                        <CardTitle className="flex items-center">
                            <User className="mr-2 h-4 w-4" />
                            {t('admin.settings.account')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div>
                            <p className="text-xs text-gray-500">{t('settings.fullName')}</p>
                            <p className="text-sm font-medium">{authQuery.data.name}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">{t('login.email')}</p>
                            <p className="text-sm font-medium">{authQuery.data.email}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">{t('admin.settings.role')}</p>
                            <p className="text-sm font-medium capitalize">{authQuery.data.role}</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="interactive-card">
                    <CardHeader>
                        <CardTitle className="flex items-center">
                            <Settings2 className="mr-2 h-4 w-4" />
                            {copy.landing.title}
                        </CardTitle>
                        <p className="text-sm text-gray-500">{copy.landing.description}</p>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        {settingsQuery.isLoading ? (
                            <div className="space-y-3">
                                <Skeleton className="h-12 w-full" />
                                <Skeleton className="h-12 w-full" />
                                <Skeleton className="h-12 w-full" />
                                <Skeleton className="h-12 w-full" />
                            </div>
                        ) : (
                            <>
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-800">
                                            {copy.landing.trialPrice} <span className="text-red-500">*</span>
                                        </label>
                                        <Input
                                            value={settingsForm.trialPriceAmount}
                                            onChange={(event) =>
                                                setSettingsDraft((current) => ({
                                                    ...current,
                                                    trialPriceAmount: event.target.value,
                                                }))
                                            }
                                            inputMode="numeric"
                                            aria-invalid={Boolean(settingsErrors.trialPriceAmount)}
                                        />
                                        {settingsErrors.trialPriceAmount ? (
                                            <p className="text-xs text-red-600">{settingsErrors.trialPriceAmount}</p>
                                        ) : null}
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-800">
                                            {copy.landing.monthlyPrice} <span className="text-red-500">*</span>
                                        </label>
                                        <Input
                                            value={settingsForm.monthlyPriceAmount}
                                            onChange={(event) =>
                                                setSettingsDraft((current) => ({
                                                    ...current,
                                                    monthlyPriceAmount: event.target.value,
                                                }))
                                            }
                                            inputMode="numeric"
                                            aria-invalid={Boolean(settingsErrors.monthlyPriceAmount)}
                                        />
                                        {settingsErrors.monthlyPriceAmount ? (
                                            <p className="text-xs text-red-600">{settingsErrors.monthlyPriceAmount}</p>
                                        ) : null}
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-800">
                                            {copy.landing.yearlyPrice} <span className="text-red-500">*</span>
                                        </label>
                                        <Input
                                            value={settingsForm.yearlyPriceAmount}
                                            onChange={(event) =>
                                                setSettingsDraft((current) => ({
                                                    ...current,
                                                    yearlyPriceAmount: event.target.value,
                                                }))
                                            }
                                            inputMode="numeric"
                                            aria-invalid={Boolean(settingsErrors.yearlyPriceAmount)}
                                        />
                                        {settingsErrors.yearlyPriceAmount ? (
                                            <p className="text-xs text-red-600">{settingsErrors.yearlyPriceAmount}</p>
                                        ) : null}
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-800">
                                            {copy.landing.telegramUrl}{' '}
                                            <span className="text-slate-400">({copy.landing.optional})</span>
                                        </label>
                                        <Input
                                            value={settingsForm.telegramContactUrl}
                                            onChange={(event) =>
                                                setSettingsDraft((current) => ({
                                                    ...current,
                                                    telegramContactUrl: event.target.value,
                                                }))
                                            }
                                            aria-invalid={Boolean(settingsErrors.telegramContactUrl)}
                                            placeholder="https://t.me/your_account"
                                        />
                                        {settingsErrors.telegramContactUrl ? (
                                            <p className="text-xs text-red-600">{settingsErrors.telegramContactUrl}</p>
                                        ) : null}
                                    </div>
                                </div>

                                <div className="flex justify-end">
                                    <Button
                                        onClick={handleSaveLandingSettings}
                                        disabled={landingSettingsMutation.isPending || settingsQuery.isLoading}
                                    >
                                        {landingSettingsMutation.isPending
                                            ? copy.landing.saving
                                            : copy.landing.save}
                                    </Button>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>

                <Card className="interactive-card">
                    <CardHeader>
                        <CardTitle className="flex items-center">
                            <MessageSquare className="mr-2 h-4 w-4" />
                            {copy.leads.title}
                        </CardTitle>
                        <p className="text-sm text-gray-500">{copy.leads.description}</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {leadRequestsQuery.isLoading ? (
                            <div className="space-y-3">
                                <Skeleton className="h-24 w-full" />
                                <Skeleton className="h-24 w-full" />
                            </div>
                        ) : leadRequestsQuery.data?.data.length ? (
                            leadRequestsQuery.data.data.map((leadRequest) => (
                                <div
                                    key={leadRequest.id}
                                    className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                                >
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="text-base font-semibold text-slate-950">{leadRequest.name}</h3>
                                                <span
                                                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusClasses(
                                                        leadRequest.status
                                                    )}`}
                                                >
                                                    {copy.leads.statuses[leadRequest.status]}
                                                </span>
                                            </div>
                                            <p className="mt-1 text-sm text-slate-600">
                                                {copy.leads.phone}: {leadRequest.phone}
                                            </p>
                                            <p className="text-sm text-slate-600">
                                                {copy.leads.clinic}: {leadRequest.clinic_name}
                                            </p>
                                            <p className="text-sm text-slate-600">
                                                {copy.leads.city}: {leadRequest.city}
                                            </p>
                                            {leadRequest.note ? (
                                                <p className="mt-2 text-sm text-slate-600">
                                                    {copy.leads.note}: {leadRequest.note}
                                                </p>
                                            ) : null}
                                            <p className="mt-2 text-xs text-slate-500">
                                                {copy.leads.requestedAt}: {formatDateTime(leadRequest.created_at, adminLocale)}
                                            </p>
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                size="sm"
                                                variant={leadRequest.status === 'new' ? 'default' : 'outline'}
                                                disabled={leadStatusMutation.isPending}
                                                onClick={() =>
                                                    leadStatusMutation.mutate({
                                                        id: leadRequest.id,
                                                        status: 'new',
                                                    })
                                                }
                                            >
                                                {copy.leads.markNew}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant={leadRequest.status === 'contacted' ? 'default' : 'outline'}
                                                disabled={leadStatusMutation.isPending}
                                                onClick={() =>
                                                    leadStatusMutation.mutate({
                                                        id: leadRequest.id,
                                                        status: 'contacted',
                                                    })
                                                }
                                            >
                                                {copy.leads.markContacted}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant={leadRequest.status === 'closed' ? 'default' : 'outline'}
                                                disabled={leadStatusMutation.isPending}
                                                onClick={() =>
                                                    leadStatusMutation.mutate({
                                                        id: leadRequest.id,
                                                        status: 'closed',
                                                    })
                                                }
                                            >
                                                {copy.leads.markClosed}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="text-sm text-slate-500">{copy.leads.empty}</p>
                        )}
                    </CardContent>
                </Card>

                <Card className="interactive-card">
                    <CardHeader>
                        <CardTitle className="flex items-center">
                            <Lock className="mr-2 h-4 w-4" />
                            {t('settings.tab.security')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="text-sm text-gray-600">{t('admin.settings.securityInfo')}</p>
                        <p className="text-xs text-gray-500">{t('admin.settings.securityHint')}</p>
                        <Button variant="outline" onClick={() => logoutMutation.mutate()}>
                            {logoutMutation.isPending ? t('menu.loggingOut') : t('menu.logout')}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
