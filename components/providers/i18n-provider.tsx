'use client';

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
import {
    DEFAULT_LOCALE,
    LOCALE_COOKIE_MAX_AGE_SECONDS,
    LOCALE_COOKIE_NAME,
    resolveLocale,
    type AppLocale,
} from '@/lib/i18n/config';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';
import { setValidationLocale } from '@/lib/input-validation';

type TranslationValue = string | number;

interface I18nContextValue {
    locale: AppLocale;
    setLocale: (nextLocale: AppLocale) => void;
    t: (key: string, variables?: Record<string, TranslationValue>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function interpolate(template: string, variables?: Record<string, TranslationValue>): string {
    if (!variables) {
        return template;
    }

    return template.replace(/\{\{(\w+)\}\}/g, (match, token) => {
        if (!(token in variables)) {
            return match;
        }

        return String(variables[token]);
    });
}

const FALLBACK_CONTEXT: I18nContextValue = {
    locale: DEFAULT_LOCALE,
    setLocale: () => undefined,
    t: (key, variables) => {
        const fallback = DICTIONARIES[DEFAULT_LOCALE];
        const template = fallback[key] ?? key;
        return interpolate(template, variables);
    },
};

export function I18nProvider({
    children,
    initialLocale,
}: {
    children: React.ReactNode;
    initialLocale?: AppLocale;
}) {
    const [locale, setLocaleState] = useState<AppLocale>(resolveLocale(initialLocale ?? DEFAULT_LOCALE));

    useEffect(() => {
        setValidationLocale(locale);
        document.documentElement.lang = locale;
        document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
    }, [locale]);

    const setLocale = useCallback((nextLocale: AppLocale) => {
        setLocaleState(resolveLocale(nextLocale));
    }, []);

    const t = useCallback(
        (key: string, variables?: Record<string, TranslationValue>) => {
            const active = DICTIONARIES[locale];
            const fallback = DICTIONARIES[DEFAULT_LOCALE];
            const template = active[key] ?? fallback[key] ?? key;
            return interpolate(template, variables);
        },
        [locale]
    );

    const contextValue = useMemo(
        () => ({
            locale,
            setLocale,
            t,
        }),
        [locale, setLocale, t]
    );

    return (
        <I18nContext.Provider value={contextValue}>
            {children}
        </I18nContext.Provider>
    );
}

export function useI18n(): I18nContextValue {
    const context = useContext(I18nContext);
    return context ?? FALLBACK_CONTEXT;
}
