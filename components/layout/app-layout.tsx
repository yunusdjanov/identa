'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import axios from 'axios';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/store';
import { getApiErrorMessage } from '@/lib/api/client';
import { getCurrentUser, logoutSession } from '@/lib/api/dentist';
import {
    AUTH_SESSION_EXPIRED_EVENT,
    markSessionExpiredRedirect,
    resetSessionExpiredNotification,
} from '@/lib/auth/session-expiry';
import { Skeleton } from '@/components/ui/skeleton';
import {
    LayoutDashboard,
    Users,
    Calendar,
    CreditCard,
    Settings,
    LogOut,
    ChevronDown,
    Languages,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { useI18n } from '@/components/providers/i18n-provider';
import { SubscriptionBanner } from '@/components/layout/subscription-banner';
import { Brand } from '@/components/branding/brand';

const navigation = [
    { key: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard },
    {
        key: 'nav.patients',
        href: '/patients',
        icon: Users,
        assistantPermissions: ['patients.view', 'patients.manage'],
    },
    {
        key: 'nav.appointments',
        href: '/appointments',
        icon: Calendar,
        assistantPermissions: ['appointments.view', 'appointments.manage'],
    },
    {
        key: 'nav.payments',
        href: '/payments',
        icon: CreditCard,
        assistantPermissions: ['treatments.view', 'treatments.manage'],
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

    const logoutMutation = useMutation({
        mutationFn: logoutSession,
        onSettled: () => {
            queryClient.removeQueries({ queryKey: ['auth'] });
            logout();
            router.push('/login');
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('toast.logoutFailed')));
        },
    });

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

    const handleLogout = () => {
        logoutMutation.mutate();
    };

    const displayName = currentUser?.name || dentistName || '';
    const showDoctorPrefix = currentUser ? currentUser.role === 'dentist' : Boolean(dentistName);
    const roleLabelKey =
        currentUser?.role === 'assistant'
            ? 'role.assistant'
            : currentUser?.role === 'dentist'
              ? 'role.dentist'
              : null;
    const canOpenSettings = currentUser ? currentUser.role === 'dentist' || currentUser.role === 'assistant' : true;
    const assistantPermissions = new Set(currentUser?.assistant_permissions ?? []);
    const canManageTeam = Boolean(currentUser && (currentUser.role === 'dentist' || assistantPermissions.has('team.manage')));
    const canViewAuditLogs = Boolean(
        currentUser && (currentUser.role === 'dentist' || assistantPermissions.has('audit_logs.view'))
    );
    const canOpenStaff = Boolean(currentUser && (canManageTeam || canViewAuditLogs));
    const visibleNavigation = navigation.filter((item) => {
        if (!currentUser || currentUser.role === 'dentist') {
            return true;
        }

        if (currentUser.role !== 'assistant') {
            return false;
        }

        return !item.assistantPermissions
            || item.assistantPermissions.some((permission) => assistantPermissions.has(permission));
    });
    const showHeaderSkeleton = !isMounted || isUserLoading;

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(219,234,254,0.55),transparent_34rem),linear-gradient(180deg,#f8fbff_0%,#f8fafc_42%,#f1f5f9_100%)]">
            {/* Header */}
            <header className="sticky top-0 z-10 border-b border-blue-100/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,251,255,0.94)_100%)] shadow-sm shadow-slate-200/40 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex h-16 items-center justify-between gap-4">
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
                                        textClassName="w-32 sm:w-36"
                                    />
                                </div>

                                {/* Navigation */}
                                <nav className="hidden items-center gap-1 rounded-2xl border border-slate-200/75 bg-white/75 p-1 shadow-sm shadow-slate-200/60 md:flex">
                                    {visibleNavigation.map((item) => {
                                        const isActive = isActiveRoute(item.href);
                                        const Icon = item.icon;
                                        return (
                                            <Link
                                                key={item.key}
                                                href={item.href}
                                                className={cn(
                                                    'flex h-9 items-center rounded-xl border px-3.5 text-sm font-semibold transition-colors',
                                                    isActive
                                                        ? 'border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-200/70'
                                                        : 'border-transparent text-slate-600 hover:bg-blue-50/80 hover:text-blue-700'
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
                                                className="flex h-9 items-center gap-1 rounded-xl px-2 text-slate-700 hover:bg-blue-50 hover:text-blue-700 sm:px-3 focus-visible:ring-0 focus-visible:border-transparent focus-visible:outline-none data-[state=open]:bg-blue-50 data-[state=open]:text-blue-700"
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

                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                className="flex h-11 items-center space-x-2 rounded-2xl border border-slate-200/80 bg-white/80 px-2.5 shadow-sm shadow-slate-200/60 hover:border-blue-100 hover:bg-white sm:space-x-3 sm:px-3.5 focus-visible:ring-0 focus-visible:border-blue-100 focus-visible:outline-none data-[state=open]:border-blue-100 data-[state=open]:bg-white"
                                            >
                                                <Avatar className="w-8 h-8">
                                                    <AvatarFallback className="bg-blue-600 text-white text-sm shadow-sm shadow-blue-200">
                                                        {(() => {
                                                            const firstInitial = displayName.split(' ')[0]?.[0] || '?';
                                                            return `${showDoctorPrefix ? t('common.doctorPrefix') : ''}${firstInitial}`;
                                                        })()}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="hidden md:block text-left">
                                                    <p className="text-sm font-medium text-gray-900">
                                                        {showDoctorPrefix ? `${t('common.doctorPrefix')} ` : ''}
                                                        {displayName || t('menu.myAccount')}
                                                    </p>
                                                    {roleLabelKey ? <p className="text-xs text-gray-500">{t(roleLabelKey)}</p> : null}
                                                </div>
                                                <ChevronDown className="w-4 h-4 text-gray-500 hidden sm:block" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-56">
                                            <DropdownMenuLabel>{t('menu.myAccount')}</DropdownMenuLabel>
                                            <DropdownMenuSeparator />
                                            {canOpenStaff ? (
                                                <>
                                                    <DropdownMenuItem onClick={() => router.push('/staff')}>
                                                        <Users className="w-4 h-4 mr-2" />
                                                        {t('menu.staff')}
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                </>
                                            ) : null}
                                            {canOpenSettings ? (
                                                <>
                                                    <DropdownMenuItem onClick={() => router.push('/settings')}>
                                                        <Settings className="w-4 h-4 mr-2" />
                                                        {t('menu.settings')}
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                </>
                                            ) : null}
                                            <DropdownMenuItem onClick={handleLogout} disabled={logoutMutation.isPending}>
                                                <LogOut className="w-4 h-4 mr-2" />
                                                {logoutMutation.isPending ? t('menu.loggingOut') : t('menu.logout')}
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
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
                        <nav className="flex justify-around py-2">
                            {visibleNavigation.map((item) => {
                                const isActive = isActiveRoute(item.href);
                                const Icon = item.icon;
                                return (
                                    <Link
                                        key={item.key}
                                        href={item.href}
                                        className={cn(
                                            'flex flex-col items-center px-3 py-2 text-xs font-medium',
                                            isActive ? 'text-blue-700' : 'text-slate-600'
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'mb-1 rounded-xl p-1.5',
                                                isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-500'
                                            )}
                                        >
                                            <Icon className="h-4 w-4" />
                                        </span>
                                        {t(item.key)}
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
            <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
                {children}
            </main>
        </div>
    );
}


