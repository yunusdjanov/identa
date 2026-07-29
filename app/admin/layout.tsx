'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { QueryProvider } from '@/components/providers/query-provider';
import { LogoutLoadingScreen } from '@/components/layout/logout-loading-screen';
import { AdminDashboardLoadingState } from '@/components/layout/page-loading-skeletons';
import { getCurrentUser } from '@/lib/api/dentist';
import { useAuthStore } from '@/lib/store';

function AdminAccessGate({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const isLoginPage = pathname === '/admin/login';
    const authQuery = useQuery({
        queryKey: ['auth', 'me'],
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

/**
 * Same logout-overlay short-circuit as `AppLayout`. Every admin page
 * sits under this layout, so flipping `isLoggingOut` in zustand from
 * any admin page's "Sign out" handler swaps the entire admin tree to
 * the full-screen overlay until the hard navigation lands — no admin
 * page effect / query can race the redirect.
 */
function AdminLayoutShell({ children }: { children: React.ReactNode }) {
    const isLoggingOut = useAuthStore((state) => state.isLoggingOut);
    if (isLoggingOut) {
        return <LogoutLoadingScreen />;
    }
    return <AdminAccessGate>{children}</AdminAccessGate>;
}

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <QueryProvider>
            <AdminLayoutShell>{children}</AdminLayoutShell>
        </QueryProvider>
    );
}
