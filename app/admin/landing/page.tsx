'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { AdminHeader } from '@/components/admin/admin-header';
import { AdminLandingSettingsPanel } from '@/components/admin/landing-admin-panels';
import { PageHeader } from '@/components/ui/page-shell';
import { AppErrorState } from '@/components/error/app-error-state';
import { AdminLandingPanelSkeleton } from '@/components/layout/page-loading-skeletons';
import { getApiErrorMessage } from '@/lib/api/client';
import { getCurrentUser } from '@/lib/api/dentist';
import { useInstantLogout } from '@/lib/auth/use-instant-logout';
import { useI18n } from '@/components/providers/i18n-provider';

export default function AdminLandingPage() {
    const { t } = useI18n();
    const router = useRouter();
    const handleLogout = useInstantLogout('/admin/login');

    const authQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        retry: false,
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

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(219,234,254,0.55),transparent_34rem),linear-gradient(180deg,#f8fbff_0%,#f8fafc_42%,#f1f5f9_100%)]">
            <AdminHeader
                active="landing"
                onLogout={handleLogout}
            />

            <main className="p-4 sm:p-5 lg:p-6">
                <div className="mx-auto max-w-5xl space-y-5 lg:space-y-6">
                    <PageHeader title={t('admin.landing.title')} description={t('admin.landing.subtitle')} />

                    {authQuery.isLoading ? (
                        <AdminLandingPanelSkeleton />
                    ) : authQuery.isError ? (
                        <AppErrorState
                            title={t('common.loadErrorTitle')}
                            description={getApiErrorMessage(authQuery.error, t('admin.settings.loadFailed'))}
                            retryLabel={t('common.retry')}
                            onRetry={() => authQuery.refetch()}
                            className="min-h-[20rem] px-0 py-0"
                        />
                    ) : authQuery.data?.role === 'admin' ? (
                        <AdminLandingSettingsPanel />
                    ) : null}
                </div>
            </main>
        </div>
    );
}
