'use client';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { logoutSession } from '@/lib/api/dentist';
import { useAuthStore } from '@/lib/store';
import { markClientLogoutInProgress } from '@/lib/auth/client-logout';
import { postAuthBroadcast } from '@/lib/auth/auth-broadcast';

export function useInstantLogout(loginPath = '/login') {
    const router = useRouter();
    const queryClient = useQueryClient();
    const logout = useAuthStore((state) => state.logout);

    return () => {
        markClientLogoutInProgress();
        // Drop EVERY cached query, not just `['auth']`. If user A logs out
        // and user B logs in on the same browser without a hard reload, A's
        // patient / appointment / payment data would otherwise flash on
        // screen before B's refetch lands — possibly cross-tenant data
        // exposure on shared kiosks.
        queryClient.clear();
        // Clear `identa.*` localStorage flags carrying per-user UI state
        // (last-opened tabs, panel toggles, etc.). Individually these are
        // not PII — `identa.staff.activeTab` is just 'access' vs 'logs'
        // and `identa:patient-history-snapshot-odontogram-open` is a UI
        // toggle. But persisting them across users on a shared device
        // leaks UX preferences AND, in future code, could leak more. The
        // safer default is to wipe everything under the `identa` prefix
        // on logout.
        try {
            const keysToRemove: string[] = [];
            for (let i = 0; i < window.localStorage.length; i += 1) {
                const key = window.localStorage.key(i);
                if (key && (key.startsWith('identa.') || key.startsWith('identa:'))) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach((key) => window.localStorage.removeItem(key));
        } catch {
            // Ignore storage errors — private-mode browsers may block access.
        }
        logout();
        // Notify sibling tabs BEFORE the network call — they should
        // mirror the redirect even if the server-side logout request
        // never lands. FA-A10 multi-tab sync.
        postAuthBroadcast({ type: 'logout' });
        router.replace(loginPath);

        void logoutSession().catch(() => {
            // The local session is already cleared. Keep the short-lived guard
            // so the login page does not bounce back while the cookie expires.
            // Don't re-clear the cache on resolve either: the user may have
            // already re-logged in by the time `logoutSession` resolves
            // (e.g. fast click-through, slow network), and a second
            // `queryClient.clear()` here would wipe the freshly-seeded
            // `['auth', 'me']` data set by login.onSuccess.
        });
    };
}
