'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, CreditCard, LineChart, Receipt } from 'lucide-react';
import { Brand } from '@/components/branding/brand';
import { AccountMenu } from '@/components/layout/account-menu';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { cn } from '@/lib/utils';
import { useI18n } from '@/components/providers/i18n-provider';
import { getCurrentUser } from '@/lib/api/dentist';
import { queryKeys } from '@/lib/query-keys';

type AdminHeaderSection = 'dashboard' | 'analytics' | 'plans' | 'payments' | 'settings';

interface AdminHeaderProps {
    active: AdminHeaderSection;
    isLoggingOut?: boolean;
    onLogout: () => void;
}

const adminNavigation: Array<{
    key: string;
    href: string;
    section: AdminHeaderSection;
    icon: typeof BarChart3;
}> = [
    { key: 'admin.nav.dashboard', href: '/admin', section: 'dashboard', icon: BarChart3 },
    // Analytics sits between Dashboard (Accounts) and Plans because it summarises
    // dentist sign-up + plan-mix data — a natural drilldown for an admin who's
    // just scanned the accounts list and wants to see the macro picture before
    // diving into per-plan or per-payment screens.
    { key: 'admin.nav.analytics', href: '/admin/analytics', section: 'analytics', icon: LineChart },
    { key: 'admin.nav.plans', href: '/admin/plans', section: 'plans', icon: CreditCard },
    { key: 'admin.nav.payments', href: '/admin/payments', section: 'payments', icon: Receipt },
];

export function AdminHeader({ active, isLoggingOut = false, onLogout }: AdminHeaderProps) {
    const { t } = useI18n();
    const authQuery = useQuery({
        queryKey: queryKeys.auth.me(),
        queryFn: getCurrentUser,
        retry: false,
        staleTime: 5 * 60_000,
    });

    return (
        <>
            <header className="fixed inset-x-0 top-0 z-50 border-b border-teal-100/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,251,255,0.94)_100%)] shadow-sm shadow-slate-200/40 backdrop-blur-xl">
                <div className="mx-auto max-w-[1440px] px-3 sm:px-6 lg:px-8">
                    <div className="flex h-14 items-center justify-between gap-3 sm:h-16 sm:gap-4">
                        <div className="flex min-w-0 items-center">
                            <Brand href="/admin" variant="text" priority textClassName="w-28 sm:w-36" />
                        </div>

                        <nav
                            aria-label={t('admin.nav.primary')}
                            className="hidden items-center gap-1 rounded-2xl border border-slate-200/75 bg-white/75 p-1 shadow-sm shadow-slate-200/60 md:flex"
                        >
                            {adminNavigation.map((item) => {
                                const Icon = item.icon;
                                const isActive = item.section === active;

                                return (
                                    <Link
                                        key={item.key}
                                        href={item.href}
                                        aria-current={isActive ? 'page' : undefined}
                                        className={cn(
                                            'flex h-9 shrink-0 items-center rounded-xl border px-3.5 text-sm font-semibold transition-colors',
                                            isActive
                                                ? 'border-teal-600 bg-teal-600 text-white shadow-sm shadow-teal-200/70'
                                                : 'border-transparent text-slate-600 hover:bg-teal-50/80 hover:text-teal-700'
                                        )}
                                    >
                                        <Icon aria-hidden="true" className="mr-2 h-4 w-4" />
                                        {t(item.key)}
                                    </Link>
                                );
                            })}
                        </nav>

                        <div className="flex items-center gap-2">
                            <LanguageSwitcher variant="compact" />
                            <AccountMenu
                                user={authQuery.data}
                                isLoggingOut={isLoggingOut}
                                onLogout={onLogout}
                                settingsHref="/admin/settings"
                                billingHref={null}
                            />
                        </div>
                    </div>
                </div>

                <div className="border-t border-slate-200/70 bg-white md:hidden">
                    <nav
                        aria-label={t('admin.nav.primary')}
                        className="flex gap-1 overflow-x-auto overflow-y-hidden px-2 py-2 no-scrollbar"
                    >
                        {adminNavigation.map((item) => {
                            const Icon = item.icon;
                            const isActive = item.section === active;

                            return (
                                <Link
                                    key={item.key}
                                    href={item.href}
                                    aria-current={isActive ? 'page' : undefined}
                                    className={cn(
                                        'flex h-10 min-w-max shrink-0 items-center rounded-xl px-3 text-xs font-semibold transition-colors',
                                        isActive
                                            ? 'bg-teal-50 text-teal-700'
                                            : 'text-slate-600 hover:bg-teal-50/80 hover:text-teal-700'
                                    )}
                                >
                                    <Icon aria-hidden="true" className="mr-2 h-4 w-4" />
                                    {t(item.key)}
                                </Link>
                            );
                        })}
                    </nav>
                </div>
            </header>
            <div data-admin-header-spacer aria-hidden="true" className="h-[7.5rem] md:h-16" />
        </>
    );
}
