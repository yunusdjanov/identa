'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { QueryProvider } from '@/components/providers/query-provider';
import { LogoutLoadingScreen } from '@/components/layout/logout-loading-screen';
import { AdminDashboardLoadingState } from '@/components/layout/page-loading-skeletons';
import { getCurrentUser } from '@/lib/api/dentist';
import { queryKeys } from '@/lib/query-keys';
import { useAuthStore } from '@/lib/store';
import { RouteTitleSync } from '@/components/layout/route-title-sync';

function AdminAccessGate({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const isLoginPage = pathname === '/admin/login';
    const authQuery = useQuery({
        queryKey: queryKeys.auth.me(),
        queryFn: getCurrentUser,
        retry: false,
        enabled: !isLoginPage,
        staleTime: 5 * 60_000,
    });

    useEffect(() => {
        if (isLoginPage || authQuery.isLoading) {
            return;
        }
        if (authQuery.isError || !authQuery.data) {
            router.replace('/admin/login');
            return;
        }
        if (authQuery.data.role !== 'admin') {
            router.replace('/dashboard');
            return;
        }
        if (authQuery.data.must_change_password && pathname !== '/admin/settings') {
            router.replace('/admin/settings?forceReset=1');
        }
    }, [
        authQuery.data,
        authQuery.isError,
        authQuery.isLoading,
        isLoginPage,
        pathname,
        router,
    ]);

    if (isLoginPage) {
        return <>{children}</>;
    }

    const canRender = authQuery.data?.role === 'admin'
        && (!authQuery.data.must_change_password || pathname === '/admin/settings');

    return canRender ? <>{children}</> : <AdminDashboardLoadingState />;
}

function AdminLayoutShell({ children }: { children: React.ReactNode }) {
    const isLoggingOut = useAuthStore((state) => state.isLoggingOut);
    if (isLoggingOut) {
        return <LogoutLoadingScreen />;
    }
    return <AdminAccessGate>{children}</AdminAccessGate>;
}

export function AdminLayoutClient({ children }: { children: React.ReactNode }) {
    return (
        <QueryProvider>
            <RouteTitleSync scope="admin" />
            <AdminLayoutShell>{children}</AdminLayoutShell>
        </QueryProvider>
    );
}
