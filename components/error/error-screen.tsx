'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ArrowLeft, Home, RefreshCw } from 'lucide-react';
import { Brand } from '@/components/branding/brand';
import { Button } from '@/components/ui/button';
import {
    DEFAULT_LOCALE,
    LOCALE_COOKIE_NAME,
    resolveLocale,
    type AppLocale,
} from '@/lib/i18n/config';

type ErrorScreenKind = 'not-found' | 'route-error' | 'global-error' | 'forbidden';

interface ErrorScreenProps {
    kind: ErrorScreenKind;
    digest?: string;
    onRetry?: () => void;
    localeOverride?: AppLocale;
}

interface ErrorCopy {
    code: string;
    eyebrow: string;
    title: string;
    description: string;
    primaryLabel: string;
    primaryHref?: string;
    secondaryLabel?: string;
    secondaryHref?: string;
}

// Error boundaries (especially global-error) render outside the I18nProvider
// tree, so this screen cannot use the `t()` hook. Copy is kept self-contained
// per locale and selected from the `identa_locale` cookie, which is always
// readable on the client regardless of provider state.
const ERROR_COPY: Record<AppLocale, Record<ErrorScreenKind, ErrorCopy>> = {
    ru: {
        'not-found': {
            code: '404',
            eyebrow: 'Страница не найдена',
            title: 'Такой страницы нет',
            description: 'Адрес мог измениться или быть набран с ошибкой. Вернитесь на главную страницу и откройте нужный раздел заново.',
            primaryLabel: 'На главную',
            secondaryLabel: 'Войти',
            secondaryHref: '/login',
        },
        'route-error': {
            code: '500',
            eyebrow: 'Ошибка загрузки',
            title: 'Раздел не открылся',
            description: 'Что-то пошло не так при загрузке страницы. Попробуйте ещё раз или вернитесь на главную.',
            primaryLabel: 'Повторить',
            secondaryLabel: 'На главную',
            secondaryHref: '/',
        },
        'global-error': {
            code: '500',
            eyebrow: 'Системная ошибка',
            title: 'Identa не смогла запуститься',
            description: 'Обновите страницу. Если ошибка повторится, передайте код ошибки поддержке.',
            primaryLabel: 'Обновить',
            secondaryLabel: 'На главную',
            secondaryHref: '/',
        },
        forbidden: {
            code: '403',
            eyebrow: 'Доступ закрыт',
            title: 'У вас нет доступа',
            description: 'Этот раздел или действие закрыты для вашей роли. Вернитесь в кабинет или попросите владельца изменить права доступа.',
            primaryLabel: 'В кабинет',
            primaryHref: '/dashboard',
            secondaryLabel: 'На главную',
            secondaryHref: '/',
        },
    },
    uz: {
        'not-found': {
            code: '404',
            eyebrow: 'Sahifa topilmadi',
            title: 'Bunday sahifa yoʻq',
            description: 'Manzil oʻzgargan yoki xato kiritilgan boʻlishi mumkin. Bosh sahifaga qaytib, kerakli boʻlimni qaytadan oching.',
            primaryLabel: 'Bosh sahifaga',
            secondaryLabel: 'Kirish',
            secondaryHref: '/login',
        },
        'route-error': {
            code: '500',
            eyebrow: 'Yuklashda xato',
            title: 'Boʻlim ochilmadi',
            description: 'Sahifani yuklashda nimadir xato ketdi. Qaytadan urinib koʻring yoki bosh sahifaga qayting.',
            primaryLabel: 'Qayta urinish',
            secondaryLabel: 'Bosh sahifaga',
            secondaryHref: '/',
        },
        'global-error': {
            code: '500',
            eyebrow: 'Tizim xatosi',
            title: 'Identa ishga tushmadi',
            description: 'Sahifani yangilang. Xato takrorlansa, xato kodini qoʻllab-quvvatlash xizmatiga yuboring.',
            primaryLabel: 'Yangilash',
            secondaryLabel: 'Bosh sahifaga',
            secondaryHref: '/',
        },
        forbidden: {
            code: '403',
            eyebrow: 'Kirish yopiq',
            title: 'Sizda ruxsat yoʻq',
            description: 'Bu boʻlim yoki amal sizning rolingiz uchun yopiq. Boshqaruv paneliga qayting yoki akkaunt egasidan ruxsatlarni oʻzgartirishni soʻrang.',
            primaryLabel: 'Boshqaruv paneliga',
            primaryHref: '/dashboard',
            secondaryLabel: 'Bosh sahifaga',
            secondaryHref: '/',
        },
    },
    en: {
        'not-found': {
            code: '404',
            eyebrow: 'Page not found',
            title: "This page doesn't exist",
            description: 'The address may have changed or been mistyped. Return to the home page and open the section again.',
            primaryLabel: 'Go home',
            secondaryLabel: 'Sign in',
            secondaryHref: '/login',
        },
        'route-error': {
            code: '500',
            eyebrow: 'Loading error',
            title: 'This section failed to open',
            description: 'Something went wrong while loading the page. Try again or return to the home page.',
            primaryLabel: 'Try again',
            secondaryLabel: 'Go home',
            secondaryHref: '/',
        },
        'global-error': {
            code: '500',
            eyebrow: 'System error',
            title: 'Identa failed to start',
            description: 'Refresh the page. If the error repeats, share the error code with support.',
            primaryLabel: 'Refresh',
            secondaryLabel: 'Go home',
            secondaryHref: '/',
        },
        forbidden: {
            code: '403',
            eyebrow: 'Access denied',
            title: "You don't have access",
            description: 'This section or action is closed for your role. Return to the dashboard or ask the owner to change your permissions.',
            primaryLabel: 'To dashboard',
            primaryHref: '/dashboard',
            secondaryLabel: 'Go home',
            secondaryHref: '/',
        },
    },
};

const ERROR_CODE_LABEL: Record<AppLocale, string> = {
    ru: 'Код ошибки:',
    uz: 'Xato kodi:',
    en: 'Error code:',
};

function readLocaleFromCookie(): AppLocale {
    if (typeof document === 'undefined') {
        return DEFAULT_LOCALE;
    }
    const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE_NAME}=([^;]+)`));
    return resolveLocale(match ? decodeURIComponent(match[1]) : null);
}

export function useErrorLocale(): AppLocale {
    return useSyncExternalStore(
        () => () => undefined,
        readLocaleFromCookie,
        () => DEFAULT_LOCALE,
    );
}

export function ErrorScreen({ kind, digest, onRetry, localeOverride }: ErrorScreenProps) {
    // Resolve the locale from the cookie via useSyncExternalStore: server render
    // uses DEFAULT_LOCALE, the client reads the real locale. This keeps the
    // screen self-contained (works in global-error, outside the I18nProvider)
    // without a setState-in-effect or hydration mismatch.
    const cookieLocale = useErrorLocale();
    const locale = localeOverride ?? cookieLocale;

    const copy = ERROR_COPY[locale][kind];
    const canRetry = typeof onRetry === 'function';

    return (
        <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#edf6f8] px-4 py-10 text-slate-950">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_11%_18%,rgba(13,148,136,0.26),transparent_31%),radial-gradient(circle_at_88%_20%,rgba(37,99,235,0.21),transparent_30%),linear-gradient(135deg,#dff3f1_0%,#f7fbfc_42%,#e3efff_100%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.38)_0%,rgba(255,255,255,0.12)_48%,rgba(224,242,254,0.22)_100%)]" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-300 to-transparent" />

            <section className="relative w-full max-w-2xl text-center">
                <div className="mx-auto mb-9 flex justify-center">
                    <Brand href="/" variant="text" priority textClassName="w-40 sm:w-44" />
                </div>

                <div className="rounded-3xl border border-white/80 bg-white/85 px-6 py-9 shadow-2xl shadow-slate-950/12 backdrop-blur-md sm:px-12 sm:py-12">
                    <div className="mx-auto inline-flex items-center gap-2.5 rounded-full border border-teal-200 bg-teal-50/90 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-teal-700 shadow-sm shadow-teal-900/5">
                        <span className="rounded-full bg-slate-950 px-3.5 py-1.5 font-mono text-base leading-none text-white shadow-sm shadow-slate-950/15">
                            {copy.code}
                        </span>
                        {copy.eyebrow}
                    </div>

                    <h1 className="mt-5 text-balance text-3xl font-black tracking-[-0.045em] text-slate-950 sm:text-4xl">
                        {copy.title}
                    </h1>
                    <p className="mx-auto mt-3 max-w-md text-pretty text-sm leading-6 text-slate-600 sm:text-base">
                        {copy.description}
                    </p>

                    {digest ? (
                        <p className="mx-auto mt-5 max-w-md rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                            {ERROR_CODE_LABEL[locale]} <span className="font-mono font-semibold text-slate-700">{digest}</span>
                        </p>
                    ) : null}

                    <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                        {canRetry ? (
                            <Button
                                type="button"
                                onClick={onRetry}
                                className="h-10 rounded-2xl bg-slate-950 px-5 text-white shadow-lg shadow-slate-950/10"
                            >
                                <RefreshCw className="h-4 w-4" />
                                {copy.primaryLabel}
                            </Button>
                        ) : (
                            <Button
                                asChild
                                className="h-10 rounded-2xl bg-slate-950 px-5 text-white shadow-lg shadow-slate-950/10"
                            >
                                <Link href={copy.primaryHref ?? '/'}>
                                    <Home className="h-4 w-4" />
                                    {copy.primaryLabel}
                                </Link>
                            </Button>
                        )}

                        {copy.secondaryHref && copy.secondaryLabel ? (
                            <Button
                                asChild
                                variant="outline"
                                className="h-10 rounded-2xl border-slate-200 bg-white px-5 text-slate-900"
                            >
                                <Link href={copy.secondaryHref}>
                                    <ArrowLeft className="h-4 w-4" />
                                    {copy.secondaryLabel}
                                </Link>
                            </Button>
                        ) : null}
                    </div>
                </div>
            </section>
        </main>
    );
}
