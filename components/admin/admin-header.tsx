'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, ClipboardList, SlidersHorizontal } from 'lucide-react';
import { Brand } from '@/components/branding/brand';
import { AccountMenu } from '@/components/layout/account-menu';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { cn } from '@/lib/utils';
import { useI18n } from '@/components/providers/i18n-provider';
import { getCurrentUser } from '@/lib/api/dentist';

type AdminHeaderSection = 'dashboard' | 'landing' | 'leads' | 'settings';

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
    { key: 'admin.nav.landing', href: '/admin/landing', section: 'landing', icon: SlidersHorizontal },
    { key: 'admin.nav.requests', href: '/admin/leads', section: 'leads', icon: ClipboardList },
];

export function AdminHeader({ active, isLoggingOut = false, onLogout }: AdminHeaderProps) {
    const { t } = useI18n();
    const authQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        retry: false,
        staleTime: 5 * 60_000,
    });

    return (
        <header className="sticky top-0 z-10 border-b border-blue-100/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,251,255,0.94)_100%)] shadow-sm shadow-slate-200/40 backdrop-blur-xl">
            <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
                <div className="flex h-16 items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center">
                        <Brand href="/admin" variant="text" priority textClassName="w-32 sm:w-36" />
                    </div>

                    <nav className="hidden items-center gap-1 rounded-2xl border border-slate-200/75 bg-white/75 p-1 shadow-sm shadow-slate-200/60 md:flex">
                        {adminNavigation.map((item) => {
                            const Icon = item.icon;
                            const isActive = item.section === active;

                            return (
                                <Link
                                    key={item.key}
                                    href={item.href}
                                    className={cn(
                                        'flex h-9 shrink-0 items-center rounded-xl border px-3.5 text-sm font-semibold transition-colors',
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

                    <div className="flex items-center gap-2">
                        <LanguageSwitcher variant="compact" />
                        <AccountMenu
                            user={authQuery.data}
                            isLoggingOut={isLoggingOut}
                            onLogout={onLogout}
                            settingsHref="/admin/settings"
                        />
                    </div>
                </div>
            </div>

            <div className="border-t border-slate-200/70 bg-white/80 md:hidden">
                <nav className="flex gap-1 overflow-x-auto px-4 py-2">
                    {adminNavigation.map((item) => {
                        const Icon = item.icon;
                        const isActive = item.section === active;

                        return (
                            <Link
                                key={item.key}
                                href={item.href}
                                className={cn(
                                    'flex h-10 shrink-0 items-center rounded-xl px-3 text-xs font-semibold transition-colors',
                                    isActive
                                        ? 'bg-blue-50 text-blue-700'
                                        : 'text-slate-600 hover:bg-blue-50/80 hover:text-blue-700'
                                )}
                            >
                                <Icon className="mr-2 h-4 w-4" />
                                {t(item.key)}
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </header>
    );
}
