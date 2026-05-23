'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore, type MouseEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import axios from 'axios';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/store';
import { getCurrentUser } from '@/lib/api/dentist';
import { canView, getModuleForPath, PERMISSION_DENIED_MESSAGE } from '@/lib/auth/permissions';
import {
    AUTH_SESSION_EXPIRED_EVENT,
    markSessionExpiredRedirect,
    resetSessionExpiredNotification,
} from '@/lib/auth/session-expiry';
import { useInstantLogout } from '@/lib/auth/use-instant-logout';
import { Skeleton } from '@/components/ui/skeleton';
import {
    LayoutDashboard,
    Users,
    Calendar,
    CreditCard,
    Languages,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useI18n } from '@/components/providers/i18n-provider';
import { SubscriptionBanner } from '@/components/layout/subscription-banner';
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
];

function useIsHydrated() {
    return useSyncExternalStore(
        () => () => undefined,
        () => true,
        () => false
    );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
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
        staleTime: 5 * 60_000,
    });
    const { locale, setLocale, t } = useI18n();
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
                markSessionExpiredRedirect();
                router.replace('/login');
                return;
            }

            if (status === 403) {
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
    }, [currentUser, isUserError, isUserLoading, router, userError]);

    useEffect(() => {
        if (!isMounted) {
            return undefined;
        }

        const handleSessionExpired = () => {
            queryClient.removeQueries({ queryKey: ['auth'] });
            logout();
            router.replace('/login');
        };

        window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);

        return () => {
            window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
        };
    }, [isMounted, logout, queryClient, router]);

    const displayName = currentUser?.name || dentistName || '';
    const canOpenSettings = currentUser ? currentUser.role === 'dentist' || currentUser.role === 'assistant' : true;
    const canOpenStaff = Boolean(currentUser && currentUser.role === 'dentist');
    const showHeaderSkeleton = !isMounted || isUserLoading;
    const handleNavigationClick = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
        const permissionModule = getModuleForPath(href);
        if (!permissionModule || canView(currentUser, permissionModule)) {
            return;
        }

        event.preventDefault();
        toast.error(PERMISSION_DENIED_MESSAGE);
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
                                        const permissionModule = getModuleForPath(item.href);
                                        const isLocked = Boolean(permissionModule && !canView(currentUser, permissionModule));
                                        return (
                                            <Link
                                                key={item.key}
                                                href={item.href}
                                                onClick={(event) => handleNavigationClick(event, item.href)}
                                                aria-disabled={isLocked}
                                                className={cn(
                                                    'flex h-9 items-center rounded-xl border px-3.5 text-sm font-semibold transition-colors',
                                                    isActive
                                                        ? 'border-teal-600 bg-teal-600 text-white shadow-sm shadow-teal-200/70'
                                                        : isLocked
                                                            ? 'border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-500'
                                                            : 'border-transparent text-slate-600 hover:bg-teal-50/80 hover:text-teal-700'
                                                )}
                                            >
                                                <Icon className="mr-2 h-4 w-4" />
                                                {t(item.key)}
                                            </Link>
                                        );
                                    })}
                                </nav>

                                {/* User Menu */}
                                <div className="flex items-center gap-1 sm:gap-2">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="flex h-9 items-center gap-1 rounded-xl px-2 text-slate-700 hover:bg-teal-50 hover:text-teal-700 sm:px-3 focus-visible:ring-0 focus-visible:border-transparent focus-visible:outline-none data-[state=open]:bg-teal-50 data-[state=open]:text-teal-700"
                                                aria-label={t('menu.language')}
                                            >
                                                <Languages className="w-4 h-4 mr-1" />
                                                <span className="text-xs font-semibold uppercase">{locale}</span>
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-48">
                                            <DropdownMenuLabel>{t('menu.language')}</DropdownMenuLabel>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuRadioGroup
                                                value={locale}
                                                onValueChange={(value) => setLocale(value as 'ru' | 'uz' | 'en')}
                                            >
                                                <DropdownMenuRadioItem value="ru">
                                                    {t('language.russian')}
                                                </DropdownMenuRadioItem>
                                                <DropdownMenuRadioItem value="uz">
                                                    {t('language.uzbek')}
                                                </DropdownMenuRadioItem>
                                                <DropdownMenuRadioItem value="en">
                                                    {t('language.english')}
                                                </DropdownMenuRadioItem>
                                            </DropdownMenuRadioGroup>
                                        </DropdownMenuContent>
                                    </DropdownMenu>

                                    <AccountMenu
                                        user={currentUser}
                                        fallbackName={displayName}
                                        onLogout={handleLogout}
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
                    <div className="md:hidden border-t border-slate-200/70 bg-white/80">
                        <div className="flex justify-around py-2 px-2">
                            <Skeleton className="h-12 w-16 rounded-md" />
                            <Skeleton className="h-12 w-16 rounded-md" />
                            <Skeleton className="h-12 w-16 rounded-md" />
                            <Skeleton className="h-12 w-16 rounded-md" />
                        </div>
                    </div>
                ) : (
                    <div className="md:hidden border-t border-slate-200/70 bg-white/80">
                        <nav className="flex gap-1 overflow-x-auto overflow-y-hidden px-2 py-2 no-scrollbar">
                            {navigation.map((item) => {
                                const isActive = isActiveRoute(item.href);
                                const Icon = item.icon;
                                const permissionModule = getModuleForPath(item.href);
                                const isLocked = Boolean(permissionModule && !canView(currentUser, permissionModule));
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

            <SubscriptionBanner
                locale={locale}
                subscription={currentUser?.subscription}
                t={t}
            />

            {/* Main Content */}
            <main className="mx-auto max-w-[1440px] px-3 py-4 sm:px-6 sm:py-8 lg:px-8">
                {children}
            </main>
        </div>
    );
}
