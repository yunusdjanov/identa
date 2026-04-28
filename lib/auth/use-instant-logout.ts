'use client';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { logoutSession } from '@/lib/api/dentist';
import { useAuthStore } from '@/lib/store';
import { markClientLogoutInProgress } from '@/lib/auth/client-logout';

export function useInstantLogout(loginPath = '/login') {
    const router = useRouter();
    const queryClient = useQueryClient();
    const logout = useAuthStore((state) => state.logout);

    return () => {
        markClientLogoutInProgress();
        queryClient.removeQueries({ queryKey: ['auth'] });
        logout();
        router.replace(loginPath);

        void logoutSession()
            .then(() => {
                queryClient.removeQueries({ queryKey: ['auth'] });
            })
            .catch(() => {
                // The local session is already cleared. Keep the short-lived guard
                // so the login page does not bounce back while the cookie expires.
            });
    };
}
