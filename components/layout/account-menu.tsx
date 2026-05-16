'use client';

import { useRouter } from 'next/navigation';
import { ChevronDown, CreditCard, LogOut, Settings, Users } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useI18n } from '@/components/providers/i18n-provider';
import type { ApiUser } from '@/lib/api/types';

interface AccountMenuProps {
    user?: ApiUser | null;
    fallbackName?: string;
    isLoggingOut?: boolean;
    onLogout: () => void;
    settingsHref?: string | null;
    staffHref?: string | null;
    billingHref?: string | null;
}

function getInitial(name: string): string {
    return name.trim().split(/\s+/)[0]?.[0]?.toUpperCase() || '?';
}

export function AccountMenu({
    user,
    fallbackName = '',
    isLoggingOut = false,
    onLogout,
    settingsHref = '/settings',
    staffHref = null,
    billingHref = '/billing',
}: AccountMenuProps) {
    const router = useRouter();
    const { t } = useI18n();
    const displayName = user?.name || fallbackName || t('menu.myAccount');
    const showDoctorPrefix = user?.role === 'dentist' || (!user && Boolean(fallbackName));
    const roleLabel =
        user?.role === 'admin'
            ? t('admin.brandSubtitle')
            : user?.role === 'assistant'
                ? t('role.assistant')
                : user?.role === 'dentist'
                    ? t('role.dentist')
                    : null;
    const avatarLabel = `${showDoctorPrefix ? t('common.doctorPrefix') : ''}${getInitial(displayName)}`;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    className="flex h-11 items-center space-x-2 rounded-2xl border border-transparent bg-white/75 px-2.5 shadow-sm shadow-slate-200/50 transition-colors hover:border-transparent hover:bg-blue-50/70 sm:space-x-3 sm:px-3.5 focus:border-transparent focus:outline-none focus:ring-0 focus-visible:border-transparent focus-visible:bg-blue-50/70 focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=open]:border-transparent data-[state=open]:bg-blue-50/80"
                    aria-label={t('menu.myAccount')}
                >
                    <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-blue-600 text-sm text-white shadow-sm shadow-blue-200">
                            {avatarLabel}
                        </AvatarFallback>
                    </Avatar>
                    <div className="hidden text-left md:block">
                        <p className="text-sm font-medium text-slate-900">
                            {showDoctorPrefix ? `${t('common.doctorPrefix')} ` : ''}
                            {displayName}
                        </p>
                        {roleLabel ? <p className="text-xs text-slate-500">{roleLabel}</p> : null}
                    </div>
                    <ChevronDown className="hidden h-4 w-4 text-slate-500 sm:block" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{t('menu.myAccount')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {staffHref ? (
                    <>
                        <DropdownMenuItem onClick={() => router.push(staffHref)}>
                            <Users className="mr-2 h-4 w-4" />
                            {t('menu.staff')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                    </>
                ) : null}
                {billingHref ? (
                    <>
                        <DropdownMenuItem onClick={() => router.push(billingHref)}>
                            <CreditCard className="mr-2 h-4 w-4" />
                            {t('menu.billing')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                    </>
                ) : null}
                {settingsHref ? (
                    <>
                        <DropdownMenuItem onClick={() => router.push(settingsHref)}>
                            <Settings className="mr-2 h-4 w-4" />
                            {t('menu.settings')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                    </>
                ) : null}
                <DropdownMenuItem onClick={onLogout} disabled={isLoggingOut}>
                    <LogOut className="mr-2 h-4 w-4" />
                    {isLoggingOut ? t('menu.loggingOut') : t('menu.logout')}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
