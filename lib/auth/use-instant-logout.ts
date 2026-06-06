'use client';

import { useQueryClient } from '@tanstack/react-query';
import { logoutSession } from '@/lib/api/dentist';
import { useAuthStore } from '@/lib/store';
import { markClientLogoutInProgress } from '@/lib/auth/client-logout';
import { postAuthBroadcast } from '@/lib/auth/auth-broadcast';

/**
 * Per-tab logout helper.
 *
 * The bulletproof contract (every step matters — removing any one of
 * them re-opens a documented user-visible regression):
 *
 *   1. **Switch the UI to the logout overlay first.** AppLayout reads
 *      `isLoggingOut` from zustand and replaces the entire authenticated
 *      tree with `<LogoutLoadingScreen/>`. From this moment forward no
 *      mounted component can trigger a redirect, a refetch, or write to
 *      the React Query cache — they're all unmounted.
 *
 *   2. **Cancel and clear React Query.** `cancelQueries` aborts the
 *      already-in-flight `auth/me` refetch (focus refetch is common); a
 *      late 200 from it would otherwise repopulate the cache after we
 *      clear, and on the login page that data triggers the auto-redirect
 *      to /dashboard. `clear()` then drops every cached tenant payload
 *      so the next user doesn't see the previous one's data flash on
 *      shared-device login.
 *
 *   3. **Persist a sessionStorage flag and reset zustand.** The flag is
 *      what `/login` reads on mount to disable its `auth/me` query and
 *      suppress the auto-redirect for the lifetime of the redirect
 *      window. Zustand reset makes `isAuthenticated` false, doubling
 *      the gate on the query's `enabled`.
 *
 *   4. **Broadcast logout to sibling tabs.** They mirror the cleanup
 *      via their AppLayout's auth-broadcast subscriber.
 *
 *   5. **Race the backend logout against a 1.5s timeout.** We wait for
 *      Set-Cookie clearing so the next /auth/me on /login can't return
 *      a still-valid cookie — but we don't block longer than 1.5s in
 *      case Railway is cold-starting. The local state is already
 *      cleared either way.
 *
 *   6. **Hard navigate via `location.replace` with a 200ms fallback to
 *      `location.href`.** `replace` doesn't add a history entry (so
 *      Back can't return to /dashboard). The fallback covers the
 *      pathological case where an extension or onbeforeunload handler
 *      cancels the first navigation.
 */
export function useInstantLogout(loginPath = '/login') {
    const queryClient = useQueryClient();
    const logout = useAuthStore((state) => state.logout);
    const setLoggingOut = useAuthStore((state) => state.setLoggingOut);

    return async () => {
        // 1. Flip the UI to the overlay synchronously. Everything else
        //    can now race without affecting what the user sees.
        setLoggingOut(true);

        // 2. Kill in-flight queries before clearing cache so a late 200
        //    can't repopulate ['auth','me'] and bounce the login page.
        try {
            await queryClient.cancelQueries({ queryKey: ['auth', 'me'] });
        } catch {
            // cancelQueries throws synchronously if a fetch isn't
            // cancellable; doesn't matter — clear() below still wipes it.
        }
        queryClient.clear();

        // 3a. Cross-tab + cross-component flag. Login page initial state
        //     reads `isClientLogoutInProgress()` and disables the
        //     auth/me query.
        markClientLogoutInProgress();

        // 3b. Drop identa-namespaced localStorage so per-user UI state
        //     (last-opened tabs, panel toggles) doesn't leak to the next
        //     user on a shared device. SessionStorage is intentionally
        //     untouched — the `clientLogoutStartedAt` flag lives there.
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
            // Private-mode quota errors — safe to ignore.
        }

        // 3c. Reset zustand auth state. After this, `isAuthenticated`
        //     is false; doubled with the sessionStorage flag, the login
        //     page's `enabled` gate is `false && true = false`.
        logout();

        // 4. Notify sibling tabs. BroadcastChannel doesn't echo to this
        //    tab, so the local navigation isn't affected.
        postAuthBroadcast({ type: 'logout' });

        // 5. Race the server-side session revoke against a 1.5s deadline
        //    so we don't strand the user on the overlay if Railway cold-
        //    starts. After this, the cookie is either cleared (Sanctum
        //    set Expires=past) or about to be on the next request.
        await Promise.race([
            logoutSession().catch(() => undefined),
            new Promise<void>((resolve) => {
                window.setTimeout(resolve, 1500);
            }),
        ]);

        // 6. Hard navigate. `replace()` doesn't add a history entry so
        //    Back can't go back to /dashboard. The 200ms backup catches
        //    the pathological case where the first call is cancelled
        //    (some browser extensions / onbeforeunload handlers do
        //    this). If we're already at /login by then it's a no-op.
        if (typeof window !== 'undefined') {
            window.location.replace(loginPath);
            window.setTimeout(() => {
                if (!window.location.pathname.startsWith(loginPath)) {
                    window.location.href = loginPath;
                }
            }, 200);
        }
    };
}
