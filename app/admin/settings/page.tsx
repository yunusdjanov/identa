'use client';

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { User } from 'lucide-react';
import { AdminHeader } from '@/components/admin/admin-header';
import { PasswordSecurityCard } from '@/components/settings/password-security-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/components/providers/i18n-provider';
import { getApiErrorMessage } from '@/lib/api/client';
import { getCurrentUser, logoutSession } from '@/lib/api/dentist';

function AdminSettingsLoadingSkeleton() {
    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(219,234,254,0.55),transparent_34rem),linear-gradient(180deg,#f8fbff_0%,#f8fafc_42%,#f1f5f9_100%)]">
            <div className="border-b border-blue-100/70 bg-white/90 px-4 py-3 sm:px-6 lg:px-8">
                <div className="mx-auto flex max-w-7xl items-center justify-between">
                    <Skeleton className="h-10 w-36 rounded-md" />
                    <Skeleton className="h-10 w-80 rounded-2xl" />
                </div>
            </div>
            <main className="p-4 sm:p-5 lg:p-6">
                <div className="mx-auto max-w-5xl space-y-5 lg:space-y-6">
                    <div className="space-y-2">
                        <Skeleton className="h-9 w-64" />
                        <Skeleton className="h-4 w-72" />
                    </div>
                    <Card>
                        <CardHeader>
                            <Skeleton className="h-6 w-32" />
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Skeleton className="h-4 w-48" />
                            <Skeleton className="h-4 w-64" />
                            <Skeleton className="h-4 w-36" />
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <Skeleton className="h-6 w-44" />
                        </CardHeader>
                        <CardContent>
                            <Skeleton className="h-20 w-full" />
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    );
}

export default function AdminSettingsPage() {
    const { t } = useI18n();
    const router = useRouter();
    const queryClient = useQueryClient();

    const authQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        retry: false,
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
        return <AdminSettingsLoadingSkeleton />;
    }

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(219,234,254,0.55),transparent_34rem),linear-gradient(180deg,#f8fbff_0%,#f8fafc_42%,#f1f5f9_100%)]">
            <AdminHeader
                active="settings"
                isLoggingOut={logoutMutation.isPending}
                onLogout={() => logoutMutation.mutate()}
            />

        <main className="p-4 sm:p-5 lg:p-6">
            <div className="mx-auto max-w-5xl space-y-5 lg:space-y-6">
                    <PageHeader title={t('admin.settings.title')} description={t('admin.settings.subtitle')} />

                    {authQuery.isError || !authQuery.data ? (
                        <div className="space-y-4">
                            <p className="text-sm text-red-600">
                                {getApiErrorMessage(authQuery.error, t('admin.settings.loadFailed'))}
                            </p>
                            <Button variant="outline" onClick={() => authQuery.refetch()}>
                                {t('common.retry')}
                            </Button>
                        </div>
                    ) : authQuery.data.role === 'admin' ? (
                        <>
                            <Card className="interactive-card rounded-[1.5rem] bg-white/95">
                                <CardHeader>
                                    <CardTitle className="flex items-center">
                                        <User className="mr-2 h-4 w-4" />
                                        {t('admin.settings.account')}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="grid gap-4 sm:grid-cols-3">
                                    <div>
                                        <p className="text-xs text-slate-500">{t('settings.fullName')}</p>
                                        <p className="text-sm font-semibold text-slate-950">{authQuery.data.name}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500">{t('login.email')}</p>
                                        <p className="text-sm font-semibold text-slate-950">{authQuery.data.email}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500">{t('admin.settings.role')}</p>
                                        <p className="text-sm font-semibold capitalize text-slate-950">
                                            {authQuery.data.role}
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>

                            <PasswordSecurityCard user={authQuery.data} className="interactive-card rounded-[1.5rem]" />
                        </>
                    ) : null}
                </div>
            </main>
        </div>
    );
}
