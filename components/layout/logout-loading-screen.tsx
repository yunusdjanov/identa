'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/components/providers/i18n-provider';

/**
 * Full-screen "Logging out..." overlay rendered the instant the user
 * clicks Logout. Stays on screen until the hard navigation to /login
 * actually lands — which guarantees:
 *
 *   1. Visual feedback. The previous behaviour ("click logout, nothing
 *      happens for ~800ms while the network call goes out") was the
 *      single biggest UX complaint.
 *   2. Bounce-back immunity. While this is rendered, the rest of the
 *      authenticated tree (AppLayout, dashboard, queries) is unmounted.
 *      An in-flight /auth/me refetch can no longer write to React state
 *      that triggers a redirect to /dashboard.
 *   3. Hard-nav fail-safe. If the primary `window.location.replace` is
 *      somehow blocked by the browser, the embedded fallback assigns
 *      `window.location.href` 200ms later — see use-instant-logout.ts.
 *
 * Deliberately framework-agnostic in spirit (no React Query, no zustand,
 * no router) so even a worst-case partial failure during logout still
 * shows *something* to the user.
 */
export function LogoutLoadingScreen() {
    const { t } = useI18n();
    // Tiny entrance delay so a sub-100ms logout (cached cookie) doesn't
    // flash the overlay. After 80ms it fades in via opacity.
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const id = window.setTimeout(() => setVisible(true), 80);
        return () => window.clearTimeout(id);
    }, []);

    return (
        <div
            role="status"
            aria-live="polite"
            className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4 bg-white"
            style={{
                opacity: visible ? 1 : 0,
                transition: 'opacity 180ms ease-out',
            }}
        >
            <span
                aria-hidden="true"
                className="block h-10 w-10 animate-spin rounded-full border-[3px] border-slate-200 border-t-teal-600"
            />
            <p className="text-sm font-medium text-slate-600">
                {t('menu.loggingOut')}
            </p>
        </div>
    );
}
