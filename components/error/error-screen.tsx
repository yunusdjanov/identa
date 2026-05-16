'use client';

import Link from 'next/link';
import { ArrowLeft, Home, RefreshCw } from 'lucide-react';
import { Brand } from '@/components/branding/brand';
import { Button } from '@/components/ui/button';

type ErrorScreenKind = 'not-found' | 'route-error' | 'global-error' | 'forbidden';

interface ErrorScreenProps {
    kind: ErrorScreenKind;
    digest?: string;
    onRetry?: () => void;
}

const ERROR_COPY: Record<
    ErrorScreenKind,
    {
        code: string;
        eyebrow: string;
        title: string;
        description: string;
        primaryLabel: string;
        primaryHref?: string;
        secondaryLabel?: string;
        secondaryHref?: string;
    }
> = {
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
};

export function ErrorScreen({ kind, digest, onRetry }: ErrorScreenProps) {
    const copy = ERROR_COPY[kind];
    const canRetry = typeof onRetry === 'function';

    return (
        <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#edf6f8] px-4 py-10 text-slate-950">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_11%_18%,rgba(13,148,136,0.26),transparent_31%),radial-gradient(circle_at_88%_20%,rgba(37,99,235,0.21),transparent_30%),linear-gradient(135deg,#dff3f1_0%,#f7fbfc_42%,#e3efff_100%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.38)_0%,rgba(255,255,255,0.12)_48%,rgba(224,242,254,0.22)_100%)]" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent" />

            <section className="relative w-full max-w-2xl text-center">
                <div className="mx-auto mb-9 flex justify-center">
                    <Brand href="/" variant="text" priority textClassName="w-40 sm:w-44" />
                </div>

                <div className="rounded-[2rem] border border-white/80 bg-white/82 px-6 py-9 shadow-2xl shadow-slate-950/12 backdrop-blur-md sm:px-12 sm:py-12">
                    <div className="mx-auto inline-flex items-center gap-2.5 rounded-full border border-cyan-200 bg-cyan-50/90 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-cyan-700 shadow-sm shadow-cyan-900/5">
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
                            Код ошибки: <span className="font-mono font-semibold text-slate-700">{digest}</span>
                        </p>
                    ) : null}

                    <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                        {canRetry ? (
                            <Button
                                type="button"
                                onClick={onRetry}
                                className="h-11 rounded-2xl bg-slate-950 px-5 text-white shadow-lg shadow-slate-950/10"
                            >
                                <RefreshCw className="h-4 w-4" />
                                {copy.primaryLabel}
                            </Button>
                        ) : (
                            <Button
                                asChild
                                className="h-11 rounded-2xl bg-slate-950 px-5 text-white shadow-lg shadow-slate-950/10"
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
                                className="h-11 rounded-2xl border-slate-200 bg-white px-5 text-slate-900"
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
