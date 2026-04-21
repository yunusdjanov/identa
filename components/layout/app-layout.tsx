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
    const canOpenSettings = currentUser ? currentUser.role === 'dentist' : true;
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
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
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
                                <div className="flex items-center">
                                    <Brand
                                        href="/dashboard"
                                        variant="text"
                                        textClassName="w-24 sm:w-28"
                                    />
                                </div>

                                {/* Navigation */}
                                <nav className="hidden md:flex space-x-1">
                                    {visibleNavigation.map((item) => {
                                        const isActive = isActiveRoute(item.href);
                                        const Icon = item.icon;
                                        return (
                                            <Link
                                                key={item.key}
                                                href={item.href}
                                                className={cn(
                                                    'flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors',
                                                    isActive
                                                        ? 'bg-blue-50 text-blue-700'
                                                        : 'text-gray-700 hover:bg-gray-100'
                                                )}
                                            >
                                                <Icon className="w-4 h-4 mr-2" />
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
                                                className="flex items-center gap-1 px-2 sm:px-3 text-gray-700 hover:bg-gray-100 focus-visible:ring-0 focus-visible:border-transparent focus-visible:outline-none data-[state=open]:bg-gray-100"
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
                                                className="flex items-center space-x-2 sm:space-x-3 hover:bg-gray-100 px-2 sm:px-4 focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:border-transparent data-[state=open]:bg-gray-100"
                                            >
                                                <Avatar className="w-8 h-8">
                                                    <AvatarFallback className="bg-blue-600 text-white text-sm">
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
                    <div className="md:hidden border-t border-gray-200">
                        <div className="flex justify-around py-2 px-2">
                            <Skeleton className="h-12 w-16 rounded-md" />
                            <Skeleton className="h-12 w-16 rounded-md" />
                            <Skeleton className="h-12 w-16 rounded-md" />
                            <Skeleton className="h-12 w-16 rounded-md" />
                        </div>
                    </div>
                ) : (
                    <div className="md:hidden border-t border-gray-200">
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
                                            isActive ? 'text-blue-700' : 'text-gray-600'
                                        )}
                                    >
                                        <Icon className="w-5 h-5 mb-1" />
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
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {children}
            </main>
        </div>
    );
}


