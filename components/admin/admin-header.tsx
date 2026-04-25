'use client';

import Link from 'next/link';
import { BarChart3, ClipboardList, LogOut, Settings, SlidersHorizontal } from 'lucide-react';
import { Brand } from '@/components/branding/brand';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useI18n } from '@/components/providers/i18n-provider';

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
    { key: 'admin.nav.settings', href: '/admin/settings', section: 'settings', icon: Settings },
];

export function AdminHeader({ active, isLoggingOut = false, onLogout }: AdminHeaderProps) {
    const { t } = useI18n();

    return (
        <header className="sticky top-0 z-10 border-b border-blue-100/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,251,255,0.94)_100%)] shadow-sm shadow-slate-200/40 backdrop-blur-xl">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex min-h-16 flex-col gap-3 py-2 lg:flex-row lg:items-center lg:justify-between">
                    <Brand href="/admin" variant="text" priority textClassName="w-36 sm:w-40" />

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:justify-end">
                        <nav className="flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-slate-200/75 bg-white/75 p-1 shadow-sm shadow-slate-200/60">
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
                            <Button
                                variant="outline"
                                className="rounded-2xl bg-white/80 shadow-sm shadow-slate-200/60"
                                onClick={onLogout}
                            >
                                <LogOut className="mr-2 h-4 w-4" />
                                {isLoggingOut ? t('menu.loggingOut') : t('menu.logout')}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
}
