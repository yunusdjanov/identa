'use client';

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AdminHeader } from '@/components/admin/admin-header';
import { AdminLeadRequestsPanel } from '@/components/admin/landing-admin-panels';
import { PageHeader } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { getApiErrorMessage } from '@/lib/api/client';
import { getCurrentUser, logoutSession } from '@/lib/api/dentist';
import { useI18n } from '@/components/providers/i18n-provider';

export default function AdminLeadsPage() {
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

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(219,234,254,0.55),transparent_34rem),linear-gradient(180deg,#f8fbff_0%,#f8fafc_42%,#f1f5f9_100%)]">
            <AdminHeader
                active="leads"
                isLoggingOut={logoutMutation.isPending}
                onLogout={() => logoutMutation.mutate()}
            />

            <main className="p-4 sm:p-5 lg:p-6">
                <div className="mx-auto max-w-5xl space-y-5 lg:space-y-6">
                    <PageHeader title={t('admin.leads.title')} description={t('admin.leads.subtitle')} />

                    {authQuery.isError ? (
                        <div className="space-y-4">
                            <p className="text-sm text-red-600">
                                {getApiErrorMessage(authQuery.error, t('admin.settings.loadFailed'))}
                            </p>
                            <Button variant="outline" onClick={() => authQuery.refetch()}>
                                {t('common.retry')}
                            </Button>
                        </div>
                    ) : authQuery.data?.role === 'admin' ? (
                        <AdminLeadRequestsPanel />
                    ) : null}
                </div>
            </main>
        </div>
    );
}
