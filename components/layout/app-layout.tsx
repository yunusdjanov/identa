'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore, type MouseEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import axios from 'axios';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/store';
import { getCurrentUser } from '@/lib/api/dentist';
import { canView, canViewAnalytics, getModuleForPath } from '@/lib/auth/permissions';
import {
    AUTH_SESSION_EXPIRED_EVENT,
    markSessionExpiredRedirect,
    resetSessionExpiredNotification,
} from '@/lib/auth/session-expiry';
import { subscribeAuthBroadcast } from '@/lib/auth/auth-broadcast';
import { useInstantLogout } from '@/lib/auth/use-instant-logout';
import { Skeleton } from '@/components/ui/skeleton';
import {
    BarChart3,
    LayoutDashboard,
    Users,
    Calendar,
    CreditCard,
} from 'lucide-react';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { useI18n } from '@/components/providers/i18n-provider';
import { SubscriptionBanner } from '@/components/layout/subscription-banner';
import { EmailVerificationBanner } from '@/components/layout/email-verification-banner';
import { LogoutLoadingScreen } from '@/components/layout/logout-loading-screen';
import { Brand } from '@/components/branding/brand';
import { AccountMenu } from '@/components/layout/account-menu';
import { toast } from 'sonner';

const navigation = [
    { key: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard },
    {
        key: 'nav.patients',
        href: '/patients',
        icon: Users,
    },
    {
        key: 'nav.appointments',
        href: '/appointments',
        icon: Calendar,
    },
    {
        key: 'nav.payments',
        href: '/payments',
        icon: CreditCard,
    },
    {
        key: 'menu.analytics',
        href: '/analytics',
        icon: BarChart3,
    },
];

function useIsHydrated() {
    return useSyncExternalStore(
        () => () => undefined,
        () => true,
        () => false
    );
}

/**
 * Outer shell: ONLY reads the `isLoggingOut` flag. Splitting the
 * conditional return into its own component keeps Rules of Hooks
 * happy — the inner `AppLayoutBody` can call as many hooks as it
 * needs (useQuery, useEffect, etc.) without React losing track of
 * the order when the flag flips. The previous in-line `if (...)
 * return` skipped every hook below it on the very next render,
 * which surfaced as "Rendered fewer hooks than during the previous
 * render" — visible to the user as a 500 from `error.tsx` after
 * login or logout.
 */
export function AppLayout({ children }: { children: React.ReactNode }) {
    const isLoggingOut = useAuthStore((state) => state.isLoggingOut);
    if (isLoggingOut) {
        return <LogoutLoadingScreen />;
    }
    return <AppLayoutBody>{children}</AppLayoutBody>;
}

function AppLayoutBody({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { dentistName, logout } = useAuthStore();
    const handleLogout = useInstantLogout('/login');

    const {
        data: currentUser,
        isLoading: isUserLoading,
        isError: isUserError,
        error: userError,
    } = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        retry: false,
        // 30s staleTime + refetch-on-focus is the security-conscious
        // refresh cadence for permission data. The previous 5-minute
        // window meant a dentist owner who removed an assistant's
        // payments.view in the middle of a session left the assistant
        // staring at a UI that still gated on the old permissions for up
        // to 5 minutes. Every other auth/me consumer shares this query
        // via the shared queryKey — when this top-level query refreshes
        // on focus, all consumers receive the new permission set.
        staleTime: 30_000,
        refetchOnWindowFocus: true,
    });
    const { locale, t } = useI18n();
    const isMounted = useIsHydrated();

    // Check if current path matches navigation item
    const isActiveRoute = (href: string) => {
        if (href === '/dashboard') {
            return pathname === '/dashboard';
        }
        return pathname.startsWith(href);
    };

    useEffect(() => {
        if (isUserError && !isUserLoading) {
            const status = axios.isAxiosError(userError) ? userError.response?.status : undefined;

            if (status === 401) {
                // Session truly expired (token revoked, cookie cleared).
                // Wipe cache + zustand state parity with 403 handler — the
                // previous fix only handled 403 (account_inactive) and
                // left 401 with just the redirect, which left stale
                // tenant data in cache until the next user logged in.
                markSessionExpiredRedirect();
                queryClient.clear();
                logout();
                router.replace('/login');
                return;
            }

            if (status === 403) {
                // 403 on `/auth/me` typically means `account_inactive`
                // (blocked / soft-deleted). Wipe React Query + zustand
                // auth state before redirect — without this, the cached
                // patient/appointment/payment data persists for the next
                // user (or the same user re-logging in) and the stale
                // zustand `isAuthenticated:true` survives a back-button
                // press to flash protected UI before refetch.
                queryClient.clear();
                logout();
                router.replace('/login');
                return;
            }
        }

        if (currentUser && currentUser.role !== 'dentist' && currentUser.role !== 'assistant') {
            router.push(currentUser.role === 'admin' ? '/admin' : '/login');
        }

        if (currentUser) {
            resetSessionExpiredNotification();
        }

        // Forced password rotation. When the admin (or dentist owner)
        // resets a user's password, `must_change_password` is set true and
        // the user is expected to set a new password before continuing.
        // Without this gate the user can navigate freely using the
        // admin-chosen transient credential indefinitely — the flag is
        // technically observed by the Settings → Security card UI but is
        // never enforced as a redirect. Pin the user to /settings until
        // they clear the flag (the change-password API does so server-side).
        if (
            currentUser
            && currentUser.must_change_password
            && pathname !== '/settings'
        ) {
            router.replace('/settings?forceReset=1');
        }
    }, [currentUser, isUserError, isUserLoading, pathname, router, userError]);

    useEffect(() => {
        if (!isMounted) {
            return undefined;
        }

        const handleSessionExpired = () => {
            // Full cache wipe (parity with manual logout — AF6). Previously
            // we only removed the ['auth'] subtree, leaving patient /
            // appointment / payment data cached. If the next user to log in
            // on this browser was a different tenant, their first page
            // renders flashed the previous tenant's data until the new
            // query resolved — a cross-tenant leak window. `clear()`
            // closes it.
            queryClient.clear();
            logout();
            router.replace('/login');
        };

        window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);

        // FA-A10: multi-tab logout sync. When a sibling tab fires
        // `useInstantLogout`, this tab mirrors the cleanup so a kiosk
        // user can't ALT+tab to another already-open tab and continue
        // browsing the previous session's protected UI. We reuse the
        // session-expired handler intentionally — its cleanup contract
        // (clear cache, zustand reset, redirect to /login) is exactly
        // what we want for a remote logout signal.
        const unsubscribeBroadcast = subscribeAuthBroadcast((message) => {
            if (message.type === 'logout') {
                handleSessionExpired();
            } else if (message.type === 'login') {
                // Sibling tab signed in — refresh `/auth/me` so any
                // pages this tab is showing pick up the new identity
                // (the cookie was already rotated server-side).
                queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
            }
        });

        return () => {
            window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
            unsubscribeBroadcast();
        };
    }, [isMounted, logout, queryClient, router]);

    const displayName = currentUser?.name || dentistName || '';
    const canOpenSettings = currentUser ? currentUser.role === 'dentist' || currentUser.role === 'assistant' : true;
    const canOpenStaff = Boolean(currentUser && currentUser.role === 'dentist');
    // Billing is owner-only — assistants must not see the practice's subscription/payments.
    const canOpenBilling = Boolean(currentUser && currentUser.role === 'dentist');
    // Block downstream page mounts while the forced-password redirect is in
    // flight. The redirect is queued in the useEffect above, but without
    // this guard the destination page (e.g. /patients) would mount one
    // frame, fire its `useQuery` hooks, and cache restricted data the user
    // briefly saw before being bounced to /settings. Returning early here
    // means the children component tree never instantiates, so no fetches
    // race the redirect.
    const isForcedResetRedirectPending = Boolean(
        currentUser
        && currentUser.must_change_password
        && pathname !== '/settings'
    );
    const showHeaderSkeleton = !isMounted || isUserLoading;
    const isNavLocked = (href: string): boolean => {
        if (href === '/analytics') {
            // /analytics is gated by the OR of patients/appointments/payments
            // view permissions. Without this check the analytics tab read as
            // unlocked for zero-permission assistants and bumped them into a
            // mostly-empty AccessDeniedState on click.
            return !canViewAnalytics(currentUser);
        }
        const permissionModule = getModuleForPath(href);
        return Boolean(permissionModule && !canView(currentUser, permissionModule));
    };
    const handleNavigationClick = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
        if (!isNavLocked(href)) {
            return;
        }

        event.preventDefault();
        toast.error(t('permissions.deniedDescription'));
    };

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(209,228,255,0.7),transparent_34rem),linear-gradient(180deg,#eaf1f8_0%,#e8edf5_45%,#e2e8f0_100%)]">
            {/* Header */}
            <header className="sticky top-0 z-10 border-b border-teal-100/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,251,255,0.94)_100%)] shadow-sm shadow-slate-200/40 backdrop-blur-xl">
                <div className="mx-auto max-w-[1440px] px-3 sm:px-6 lg:px-8">
                    <div className="flex h-14 items-center justify-between gap-3 sm:h-16 sm:gap-4">
                        {showHeaderSkeleton ? (
                            <>
                                <Skeleton className="h-9 w-32 rounded-md" />
                                <div className="hidden md:flex items-center gap-2">
                                    <Skeleton className="h-9 w-28 rounded-md" />
                                    <Skeleton className="h-9 w-24 rounded-md" />
                                    <Skeleton className="h-9 w-32 rounded-md" />
                                    <Skeleton className="h-9 w-24 rounded-md" />
                                </div>
                                <div className="flex items-center gap-2">
                                    <Skeleton className="h-8 w-16 rounded-md" />
                                    <Skeleton className="h-10 w-36 rounded-md hidden sm:block" />
                                    <Skeleton className="h-10 w-10 rounded-full sm:hidden" />
                                </div>
                            </>
                        ) : (
                            <>
                                {/* Logo */}
                                <div className="flex min-w-0 items-center">
                                    <Brand
                                        href="/dashboard"
                                        variant="text"
                                        priority
                                        textClassName="w-28 sm:w-36"
                                    />
                                </div>

                                {/* Navigation */}
                                <nav className="hidden items-center gap-1 rounded-2xl border border-slate-200/75 bg-white/75 p-1 shadow-sm shadow-slate-200/60 md:flex">
                                    {navigation.map((item) => {
                                        const isActive = isActiveRoute(item.href);
                                        const Icon = item.icon;
                                        const isLocked = isNavLocked(item.href);
                                        return (
                                            <Link
                                                key={item.key}
                                                href={item.href}
                                                onClick={(event) => handleNavigationClick(event, item.href)}
                                                aria-disabled={isLocked}
                                                className={cn(
                                                    'flex h-9 items-center rounded-xl border px-2.5 text-sm font-semibold transition-colors lg:px-3.5',
                                                    isActive
                                                        ? 'border-teal-600 bg-teal-600 text-white shadow-sm shadow-teal-200/70'
                                                        : isLocked
                                                            ? 'border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-500'
                                                            : 'border-transparent text-slate-600 hover:bg-teal-50/80 hover:text-teal-700'
                                                )}
                                            >
                                                <Icon className="h-4 w-4 lg:mr-2" />
                                                <span className="hidden lg:inline">{t(item.key)}</span>
                                            </Link>
                                        );
                                    })}
                                </nav>

                                {/* User Menu */}
                                <div className="flex items-center gap-1 sm:gap-2">
                                    <LanguageSwitcher variant="compact" />

                                    <AccountMenu
                                        user={currentUser}
                                        fallbackName={displayName}
                                        onLogout={handleLogout}
                                        billingHref={canOpenBilling ? '/billing' : null}
                                        settingsHref={canOpenSettings ? '/settings' : null}
                                        staffHref={canOpenStaff ? '/staff' : null}
                                    />
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Mobile Navigation */}
                {showHeaderSkeleton ? (
                    <div className="md:hidden border-t border-slate-200/70 bg-white">
                        <div className="flex justify-around py-2 px-2">
                            <Skeleton className="h-12 w-16 rounded-md" />
                            <Skeleton className="h-12 w-16 rounded-md" />
                            <Skeleton className="h-12 w-16 rounded-md" />
                            <Skeleton className="h-12 w-16 rounded-md" />
                        </div>
                    </div>
                ) : (
                    <div className="md:hidden border-t border-slate-200/70 bg-white">
                        <nav className="flex justify-center gap-1 overflow-x-auto overflow-y-hidden px-2 py-2 no-scrollbar">
                            {navigation.map((item) => {
                                const isActive = isActiveRoute(item.href);
                                const Icon = item.icon;
                                const isLocked = isNavLocked(item.href);
                                return (
                                    <Link
                                        key={item.key}
                                        href={item.href}
                                        onClick={(event) => handleNavigationClick(event, item.href)}
                                        aria-disabled={isLocked}
                                        className={cn(
                                            'flex min-w-[72px] shrink-0 flex-col items-center rounded-xl px-2 py-2 text-[11px] font-semibold transition-colors',
                                            isActive
                                                ? 'bg-teal-50/85 text-teal-700'
                                                : isLocked
                                                    ? 'text-slate-400 hover:bg-slate-50'
                                                    : 'text-slate-600 hover:bg-teal-50/70 hover:text-teal-700'
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'mb-1 rounded-xl p-1.5',
                                                isActive ? 'bg-teal-50 text-teal-700' : 'text-slate-500'
                                            )}
                                        >
                                            <Icon className="h-4 w-4" />
                                        </span>
                                        <span className="max-w-[4.4rem] truncate">{t(item.key)}</span>
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>
                )}
            </header>

            <EmailVerificationBanner />

            <SubscriptionBanner
                locale={locale}
                subscription={currentUser?.subscription}
                t={t}
            />

            {/* Main Content */}
            <main className="mx-auto max-w-[1440px] px-3 py-4 sm:px-6 sm:py-8 lg:px-8">
                {isForcedResetRedirectPending ? null : children}
            </main>
        </div>
    );
}
