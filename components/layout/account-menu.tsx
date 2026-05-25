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
                    className="flex h-11 items-center rounded-full border border-transparent bg-transparent px-0 shadow-none ring-0 transition-all hover:bg-transparent lg:space-x-3 lg:rounded-2xl lg:border-slate-200 lg:bg-white lg:px-3.5 lg:shadow-sm lg:shadow-slate-200/80 lg:ring-1 lg:ring-slate-100 lg:hover:border-teal-200 lg:hover:bg-teal-50/70 lg:hover:shadow-md lg:hover:shadow-teal-100/50 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 lg:focus-visible:border-teal-300 lg:focus-visible:bg-teal-50/70 lg:data-[state=open]:border-teal-300 lg:data-[state=open]:bg-teal-50/80 lg:data-[state=open]:shadow-md"
                    aria-label={t('menu.myAccount')}
                >
                    <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-teal-600 text-sm text-white shadow-sm shadow-teal-200">
                            {avatarLabel}
                        </AvatarFallback>
                    </Avatar>
                    <div className="hidden text-left lg:block">
                        <p className="text-sm font-medium text-slate-900">
                            {showDoctorPrefix ? `${t('common.doctorPrefix')} ` : ''}
                            {displayName}
                        </p>
                        {roleLabel ? <p className="text-xs text-slate-500">{roleLabel}</p> : null}
                    </div>
                    <ChevronDown className="hidden h-4 w-4 text-slate-500 lg:block" />
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
