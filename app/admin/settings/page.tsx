'use client';

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getApiErrorMessage } from '@/lib/api/client';
import { getCurrentUser, logoutSession } from '@/lib/api/dentist';
import { toast } from 'sonner';
import { ArrowLeft, Lock, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/providers/i18n-provider';

function AdminSettingsLoadingSkeleton() {
    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
            <div className="max-w-4xl mx-auto space-y-8">
                <div className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10" />
                    <div className="space-y-2">
                        <Skeleton className="h-9 w-56" />
                        <Skeleton className="h-4 w-52" />
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <Skeleton className="h-6 w-28" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {Array.from({ length: 3 }).map((_, index) => (
                            <div key={index} className="space-y-2">
                                <Skeleton className="h-3 w-16" />
                                <Skeleton className="h-4 w-48" />
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <Skeleton className="h-6 w-24" />
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-3 w-4/5" />
                        <Skeleton className="h-10 w-24" />
                    </CardContent>
                </Card>
            </div>
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

    if (authQuery.isError || !authQuery.data) {
        return (
            <div className="p-8 space-y-4">
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
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
            <div className="max-w-4xl mx-auto space-y-8">
                <div className="flex items-center gap-4">
                    <Link href="/admin">
                        <Button variant="outline" size="icon">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">{t('admin.settings.title')}</h1>
                        <p className="text-gray-500 mt-1">{t('admin.settings.subtitle')}</p>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center">
                            <User className="w-4 h-4 mr-2" />
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

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center">
                            <Lock className="w-4 h-4 mr-2" />
                            {t('settings.tab.security')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="text-sm text-gray-600">
                            {t('admin.settings.securityInfo')}
                        </p>
                        <p className="text-xs text-gray-500">
                            {t('admin.settings.securityHint')}
                        </p>
                        <Button variant="outline" onClick={() => logoutMutation.mutate()}>
                            {logoutMutation.isPending ? t('menu.loggingOut') : t('menu.logout')}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
