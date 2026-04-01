'use client';

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
}

export function LanguageSwitcher({
    className,
    showIcon = true,
    variant = 'inline',
}: LanguageSwitcherProps) {
    const { locale, setLocale, t } = useI18n();

    if (variant === 'compact') {
        return (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={cn(
                            'h-8 gap-1.5 rounded-md px-2.5 text-gray-700 hover:bg-gray-100 focus-visible:ring-0 focus-visible:border-transparent focus-visible:outline-none data-[state=open]:bg-gray-100',
                            className
                        )}
                        aria-label={t('menu.language')}
                    >
                        {showIcon ? <Languages className="h-4 w-4 text-gray-500" aria-hidden="true" /> : null}
                        <span className="text-xs font-semibold uppercase">{locale}</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuLabel>{t('menu.language')}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuRadioGroup
                        value={locale}
                        onValueChange={(value) => setLocale(value as 'ru' | 'uz' | 'en')}
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
                onClick={() => setLocale('ru')}
            >
                {t('language.russian')}
            </Button>
            <Button
                type="button"
                size="sm"
                variant={locale === 'uz' ? 'default' : 'ghost'}
                className="h-7 px-2 text-xs"
                onClick={() => setLocale('uz')}
            >
                {t('language.uzbek')}
            </Button>
            <Button
                type="button"
                size="sm"
                variant={locale === 'en' ? 'default' : 'ghost'}
                className="h-7 px-2 text-xs"
                onClick={() => setLocale('en')}
            >
                {t('language.english')}
            </Button>
        </div>
    );
}
