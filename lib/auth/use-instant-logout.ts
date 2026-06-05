'use client';

import { useQueryClient } from '@tanstack/react-query';
import { logoutSession } from '@/lib/api/dentist';
import { useAuthStore } from '@/lib/store';
import { markClientLogoutInProgress } from '@/lib/auth/client-logout';
import { postAuthBroadcast } from '@/lib/auth/auth-broadcast';

export function useInstantLogout(loginPath = '/login') {
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

        // Fire the server-side logout best-effort. The local session is
        // already cleared, so the cookie/Sanctum revocation is just for
        // server hygiene; we don't block the redirect on it.
        void logoutSession().catch(() => undefined);

        // **Hard navigation** instead of router.replace. The Next.js soft
        // router can race the dropdown's focus restoration on some
        // browsers and silently no-op — "click logout, nothing happens"
        // — and it leaves bundled-in singletons (BroadcastChannel
        // listeners, Sentry breadcrumbs, in-flight queries) alive in
        // memory. window.location.replace forces a full document load,
        // which: guarantees the navigation actually happens, drops all
        // residual React state, kills any in-flight /auth/me request that
        // could repopulate the cache before /login mounts, and matches
        // how Stripe / GitHub / Vercel handle their own logouts. Cost is
        // a ~200-400ms full reload — acceptable for a once-per-session
        // action.
        if (typeof window !== 'undefined') {
            window.location.replace(loginPath);
        }
    };
}
