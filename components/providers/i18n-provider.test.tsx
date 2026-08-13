import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, useI18n } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

function LocaleProbe() {
    const { locale, setLocale, t } = useI18n();

    return (
        <>
            <p>{locale}:{t('menu.language')}</p>
            <button type="button" onClick={() => setLocale('uz')}>switch</button>
        </>
    );
}

describe('I18nProvider locale switching', () => {
    beforeEach(() => {
        document.cookie = 'identa_locale=en; path=/';
        document.documentElement.lang = 'en';
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
        document.cookie = 'identa_locale=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    });

    it('changes locale and dictionary atomically after the dictionary loads', async () => {
        let resolveFetch!: (value: Response) => void;
        vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => {
            resolveFetch = resolve;
        })));

        render(
            <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
                <LocaleProbe />
            </I18nProvider>
        );

        fireEvent.click(screen.getByRole('button', { name: 'switch' }));

        expect(screen.getByText('en:Language')).toBeInTheDocument();
        expect(document.documentElement.lang).toBe('en');

        await act(async () => {
            resolveFetch(new Response(JSON.stringify({ dictionary: DICTIONARIES.uz }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }));
        });

        expect(screen.getByText('uz:Til')).toBeInTheDocument();
        expect(document.documentElement.lang).toBe('uz');
    });

    it('keeps the current locale when the requested dictionary fails', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

        render(
            <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
                <LocaleProbe />
            </I18nProvider>
        );

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'switch' }));
        });

        expect(screen.getByText('en:Language')).toBeInTheDocument();
        expect(document.documentElement.lang).toBe('en');
    });
});
