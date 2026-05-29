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
import type { TranslationDictionary } from '@/lib/i18n/dictionaries';
import { setValidationLocale } from '@/lib/input-validation';
import { setActiveDisplayLocale } from '@/lib/i18n/date';

type TranslationValue = string | number;
const EMPTY_DICTIONARY: TranslationDictionary = {};

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
        const template = EMPTY_DICTIONARY[key] ?? key;
        return interpolate(template, variables);
    },
};

async function loadDictionary(locale: AppLocale): Promise<TranslationDictionary | null> {
    try {
        const response = await fetch(`/api/i18n/${locale}`, {
            cache: 'force-cache',
            headers: {
                Accept: 'application/json',
            },
        });

        if (!response.ok) {
            return null;
        }

        const payload = await response.json() as { dictionary?: TranslationDictionary };
        return payload.dictionary ?? null;
    } catch {
        return null;
    }
}

export function I18nProvider({
    children,
    initialLocale,
    initialDictionary = EMPTY_DICTIONARY,
}: {
    children: React.ReactNode;
    initialLocale?: AppLocale;
    initialDictionary?: TranslationDictionary;
}) {
    const [locale, setLocaleState] = useState<AppLocale>(resolveLocale(initialLocale ?? DEFAULT_LOCALE));
    const [dictionary, setDictionary] = useState<TranslationDictionary>(initialDictionary);

    useEffect(() => {
        setValidationLocale(locale);
        setActiveDisplayLocale(locale);
        document.documentElement.lang = locale;
        document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
    }, [locale]);

    const setLocale = useCallback((nextLocale: AppLocale) => {
        const resolvedLocale = resolveLocale(nextLocale);
        document.cookie = `${LOCALE_COOKIE_NAME}=${resolvedLocale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
        setLocaleState(resolvedLocale);

        void loadDictionary(resolvedLocale).then((nextDictionary) => {
            if (nextDictionary) {
                setDictionary(nextDictionary);
            }
        });
    }, []);

    const t = useCallback(
        (key: string, variables?: Record<string, TranslationValue>) => {
            const template = dictionary[key] ?? key;
            return interpolate(template, variables);
        },
        [dictionary]
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
