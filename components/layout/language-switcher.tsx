'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/components/providers/i18n-provider';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
        return (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={cn(
                            'h-9 gap-1.5 rounded-xl px-2.5 text-slate-700 hover:bg-teal-50 hover:text-teal-700 focus-visible:ring-0 focus-visible:border-transparent focus-visible:outline-none data-[state=open]:bg-teal-50 data-[state=open]:text-teal-700',
                            className
                        )}
                        aria-label={t('menu.language')}
                    >
                        {showIcon ? <Languages className="h-4 w-4 text-slate-500" aria-hidden="true" /> : null}
                        <span className="text-xs font-semibold uppercase">{locale}</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuLabel>{t('menu.language')}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuRadioGroup
                        value={locale}
                        onValueChange={handleLocaleChange}
                    >
                        <DropdownMenuRadioItem value="ru">{t('language.russian')}</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="uz">{t('language.uzbek')}</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="en">{t('language.english')}</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                </DropdownMenuContent>
            </DropdownMenu>
        );
    }

    return (
        <div className={cn('inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white p-1', className)}>
            {showIcon ? <Languages className="h-4 w-4 text-gray-500 ml-1" aria-hidden="true" /> : null}
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
