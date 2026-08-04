import { cookies } from 'next/headers';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { LOCALE_COOKIE_NAME, resolveLocale } from '@/lib/i18n/config';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

export async function ServerI18nProvider({ children }: { children: React.ReactNode }) {
    const cookieStore = await cookies();
    const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);

    return (
        <I18nProvider initialLocale={locale} initialDictionary={DICTIONARIES[locale]}>
            {children}
        </I18nProvider>
    );
}
