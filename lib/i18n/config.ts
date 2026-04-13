export const SUPPORTED_LOCALES = ['ru', 'uz', 'en'] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = 'ru';
export const LOCALE_COOKIE_NAME = 'identa_locale';
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function isSupportedLocale(value: string | null | undefined): value is AppLocale {
    return value === 'ru' || value === 'uz' || value === 'en';
}

export function resolveLocale(value: string | null | undefined): AppLocale {
    if (isSupportedLocale(value)) {
        return value;
    }

    return DEFAULT_LOCALE;
}
