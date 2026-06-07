'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { User } from 'lucide-react';
import { AdminHeader } from '@/components/admin/admin-header';
import { PasswordSecurityCard } from '@/components/settings/password-security-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AdminSettingsLoadingState } from '@/components/layout/page-loading-skeletons';
import { PageHeader } from '@/components/ui/page-shell';
import { AppErrorState } from '@/components/error/app-error-state';
import { useI18n } from '@/components/providers/i18n-provider';
import { getApiErrorMessage } from '@/lib/api/client';
import { getCurrentUser, updateProfile } from '@/lib/api/dentist';
import { useDirtyFormWarning } from '@/lib/hooks/use-dirty-form-warning';
import { useInstantLogout } from '@/lib/auth/use-instant-logout';
import {
    INPUT_LIMITS,
    getEmailValidationMessage,
    getTextValidationMessage,
} from '@/lib/input-validation';

interface AdminAccountDraft {
    name: string;
    email: string;
}

// The inline `AdminSettingsLoadingSkeleton` was removed in favour of the
// shared `AdminSettingsLoadingState`. The inline version drew a different
// header pattern and used plain `h-4` body lines where the real page
// renders a 2-column form-field grid — produced a visible jump on each
// auth-query revalidation.

export default function AdminSettingsPage() {
    const { t } = useI18n();
    const router = useRouter();
    const queryClient = useQueryClient();
    const handleLogout = useInstantLogout('/admin/login');
    const [accountDraft, setAccountDraft] = useState<AdminAccountDraft | null>(null);
    const [accountSubmitAttempted, setAccountSubmitAttempted] = useState(false);

    const authQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        retry: false,
    });
    const account = accountDraft ?? (authQuery.data ? {
        name: authQuery.data.name,
        email: authQuery.data.email,
    } : {
        name: '',
        email: '',
    });
    const accountNameError = getTextValidationMessage(account.name, {
        label: t('settings.fullName'),
        required: true,
        min: 3,
        max: INPUT_LIMITS.personName,
    });
    const accountEmailError = getEmailValidationMessage(account.email, { required: true });
    const accountHasErrors = Boolean(accountNameError || accountEmailError);

    const accountMutation = useMutation({
        mutationFn: updateProfile,
        onSuccess: () => {
            toast.success(t('settings.profileUpdated'));
            setAccountDraft(null);
            setAccountSubmitAttempted(false);
            void authQuery.refetch();
            void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('settings.profileUpdateFailed')));
        },
    });

    const handleAccountUpdate = (event: FormEvent) => {
        event.preventDefault();
        setAccountSubmitAttempted(true);

        if (accountHasErrors) {
            toast.error(t('settings.profileFixErrors'));
            return;
        }

        accountMutation.mutate({
            name: account.name.trim(),
            email: account.email.trim(),
        });
    };

    // Detect unsaved edits so the browser surfaces a confirmation on tab close
    // / hard navigation. Soft client-side navigation can't be intercepted via
    // beforeunload but admin is unlikely to leave by accident in-app.
    const isDirty = accountDraft !== null
        && authQuery.data !== undefined
        && (accountDraft.name !== authQuery.data.name || accountDraft.email !== authQuery.data.email);

    // Shared dirty-form warning — extracted from this page into a hook
    // so edit-patient and add-appointment dialogs can re-use the same
    // contract (FA-X7 G9).
    useDirtyFormWarning(isDirty);

    useEffect(() => {
        if (authQuery.isError && !authQuery.isLoading) {
            router.push('/admin/login');
            return;
        }

        if (authQuery.data && authQuery.data.role !== 'admin') {
            router.push('/dashboard');
        }
    }, [authQuery.data, authQuery.isError, authQuery.isLoading, router]);

    if (authQuery.isLoading) {
        return <AdminSettingsLoadingState />;
    }

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(219,234,254,0.55),transparent_34rem),linear-gradient(180deg,#f8fbff_0%,#f8fafc_42%,#f1f5f9_100%)]">
            <AdminHeader
                active="settings"
                onLogout={handleLogout}
            />

        <main className="px-3 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
            <div className="mx-auto max-w-[1440px] space-y-5 lg:space-y-6">
                    <PageHeader title={t('admin.settings.title')} description={t('admin.settings.subtitle')} />

                    {authQuery.isError || !authQuery.data ? (
                        <AppErrorState
                            title={t('common.loadErrorTitle')}
                            description={getApiErrorMessage(authQuery.error, t('admin.settings.loadFailed'))}
                            retryLabel={t('common.retry')}
                            onRetry={() => authQuery.refetch()}
                            className="min-h-[20rem] px-0 py-0"
                        />
                    ) : authQuery.data.role === 'admin' ? (
                        <>
                            <Card className="interactive-card rounded-2xl bg-white">
                                <CardHeader>
                                    <CardTitle className="flex items-center">
                                        <User className="mr-2 h-4 w-4" />
                                        {t('admin.settings.account')}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <form onSubmit={handleAccountUpdate} className="space-y-4">
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div className="space-y-2">
                                                <Label htmlFor="admin-name">
                                                    {t('settings.fullName')} <span className="text-red-500">*</span>
                                                </Label>
                                                <Input
                                                    id="admin-name"
                                                    required
                                                    value={account.name}
                                                    onChange={(event) =>
                                                        setAccountDraft((current) => ({
                                                            email: current?.email ?? account.email,
                                                            name: event.target.value,
                                                        }))
                                                    }
                                                    maxLength={INPUT_LIMITS.personName}
                                                    autoComplete="name"
                                                    aria-invalid={Boolean(accountSubmitAttempted && accountNameError)}
                                                />
                                                {accountSubmitAttempted && accountNameError ? (
                                                    <p className="text-xs text-red-600">{accountNameError}</p>
                                                ) : null}
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="admin-email">
                                                    {t('login.email')} <span className="text-red-500">*</span>
                                                </Label>
                                                <Input
                                                    id="admin-email"
                                                    type="email"
                                                    required
                                                    value={account.email}
                                                    onChange={(event) =>
                                                        setAccountDraft((current) => ({
                                                            name: current?.name ?? account.name,
                                                            email: event.target.value,
                                                        }))
                                                    }
                                                    maxLength={INPUT_LIMITS.email}
                                                    autoComplete="email"
                                                    inputMode="email"
                                                    aria-invalid={Boolean(accountSubmitAttempted && accountEmailError)}
                                                />
                                                {accountSubmitAttempted && accountEmailError ? (
                                                    <p className="text-xs text-red-600">{accountEmailError}</p>
                                                ) : null}
                                            </div>
                                        </div>

                                        <div className="flex justify-end">
                                            <Button
                                                type="submit"
                                                className="w-full rounded-xl sm:w-auto"
                                                disabled={accountMutation.isPending}
                                            >
                                                {accountMutation.isPending ? t('common.saving') : t('common.saveChanges')}
                                            </Button>
                                        </div>
                                    </form>
                                </CardContent>
                            </Card>

                            <PasswordSecurityCard user={authQuery.data} className="interactive-card rounded-2xl" />
                        </>
                    ) : null}
                </div>
            </main>
        </div>
    );
}
