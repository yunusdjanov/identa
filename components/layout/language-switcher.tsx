'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/components/providers/i18n-provider';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type LocaleCode = 'ru' | 'uz' | 'en';

const LOCALE_OPTIONS: Array<{ code: LocaleCode; flag: string; native: string; subLabelKey: string }> = [
    { code: 'ru', flag: '🇷🇺', native: 'Русский', subLabelKey: 'language.russian' },
    { code: 'uz', flag: '🇺🇿', native: 'O‘zbekcha', subLabelKey: 'language.uzbek' },
    { code: 'en', flag: '🇬🇧', native: 'English', subLabelKey: 'language.english' },
];

interface LanguageSwitcherProps {
    className?: string;
    showIcon?: boolean;
    variant?: 'inline' | 'compact';
    refreshOnChange?: boolean;
}

export function LanguageSwitcher({
    className,
    showIcon = true,
    variant = 'inline',
    refreshOnChange = false,
}: LanguageSwitcherProps) {
    const router = useRouter();
    const [, startTransition] = useTransition();
    const { locale, setLocale, t } = useI18n();
    const handleLocaleChange = (value: string) => {
        setLocale(value as 'ru' | 'uz' | 'en');

        if (refreshOnChange) {
            startTransition(() => {
                router.refresh();
            });
        }
    };

    if (variant === 'compact') {
        const currentLocaleOption = LOCALE_OPTIONS.find((opt) => opt.code === locale) ?? LOCALE_OPTIONS[0];

        return (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={cn(
                            'h-9 gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-slate-700 shadow-sm transition-all hover:border-teal-200 hover:bg-teal-50/60 hover:text-teal-700 hover:shadow-md focus-visible:ring-0 focus-visible:border-teal-300 focus-visible:outline-none data-[state=open]:border-teal-300 data-[state=open]:bg-teal-50 data-[state=open]:text-teal-700 data-[state=open]:shadow-md',
                            className
                        )}
                        aria-label={t('menu.language')}
                    >
                        {showIcon ? <Languages className="h-4 w-4 text-slate-500" aria-hidden="true" /> : null}
                        <span className="text-base leading-none" aria-hidden="true">{currentLocaleOption.flag}</span>
                        <span className="text-xs font-semibold uppercase tracking-wide">{locale}</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={6} className="w-56 rounded-xl border-slate-200 p-1.5 shadow-lg">
                    <DropdownMenuLabel className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        {t('menu.language')}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="my-1 bg-slate-100" />
                    {LOCALE_OPTIONS.map((option) => {
                        const isActive = locale === option.code;
                        return (
                            <DropdownMenuItem
                                key={option.code}
                                onSelect={() => handleLocaleChange(option.code)}
                                className={cn(
                                    'group flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors',
                                    isActive
                                        ? 'bg-teal-50 text-teal-800 focus:bg-teal-50 focus:text-teal-800'
                                        : 'text-slate-700 focus:bg-slate-50 focus:text-slate-900'
                                )}
                            >
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-lg leading-none group-data-[active=true]:bg-teal-100" aria-hidden="true">
                                    {option.flag}
                                </span>
                                <div className="flex min-w-0 flex-1 flex-col">
                                    <span className={cn('truncate text-sm font-semibold leading-tight', isActive ? 'text-teal-900' : 'text-slate-900')}>
                                        {option.native}
                                    </span>
                                    <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                                        {option.code}
                                    </span>
                                </div>
                                {isActive ? (
                                    <Check className="h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
                                ) : null}
                            </DropdownMenuItem>
                        );
                    })}
                </DropdownMenuContent>
            </DropdownMenu>
        );
    }

    return (
        <div className={cn('inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white p-1', className)}>
            {showIcon ? <Languages className="h-4 w-4 text-slate-500 ml-1" aria-hidden="true" /> : null}
            <Button
                type="button"
                size="sm"
                variant={locale === 'ru' ? 'default' : 'ghost'}
                className="h-7 px-2 text-xs"
                onClick={() => handleLocaleChange('ru')}
            >
                {t('language.russian')}
            </Button>
            <Button
                type="button"
                size="sm"
                variant={locale === 'uz' ? 'default' : 'ghost'}
                className="h-7 px-2 text-xs"
                onClick={() => handleLocaleChange('uz')}
            >
                {t('language.uzbek')}
            </Button>
            <Button
                type="button"
                size="sm"
                variant={locale === 'en' ? 'default' : 'ghost'}
                className="h-7 px-2 text-xs"
                onClick={() => handleLocaleChange('en')}
            >
                {t('language.english')}
            </Button>
        </div>
    );
}
