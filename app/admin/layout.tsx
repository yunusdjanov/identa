'use client';

import { QueryProvider } from '@/components/providers/query-provider';
import { LogoutLoadingScreen } from '@/components/layout/logout-loading-screen';
import { useAuthStore } from '@/lib/store';

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
    return <>{children}</>;
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
