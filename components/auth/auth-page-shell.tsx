'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Brand } from '@/components/branding/brand';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { useI18n } from '@/components/providers/i18n-provider';

export function AuthPageShell({ children }: { children: ReactNode }) {
    const { t } = useI18n();

    return (
        <main className="relative min-h-screen overflow-x-hidden bg-[#e5f5f5] text-slate-950">
            <div className="auth-teal-gradient pointer-events-none absolute inset-0" />
            <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-4 sm:px-6 lg:px-8">
                <header className="flex min-h-12 items-center justify-between gap-3">
                    <Brand href="/" variant="text" priority textClassName="w-36 sm:w-40" />
                    <div className="flex min-w-0 items-center gap-2">
                        <Link
                            href="/"
                            className="hidden min-h-9 items-center rounded-full border border-slate-200/80 bg-white/60 px-4 text-sm font-semibold text-slate-700 shadow-sm shadow-cyan-950/5 backdrop-blur transition hover:bg-white/90 hover:text-slate-950 sm:inline-flex"
                        >
                            {t('auth.backToHome')}
                        </Link>
                        <LanguageSwitcher
                            variant="compact"
                            className="bg-white/70 text-slate-800 shadow-sm shadow-cyan-950/5 ring-1 ring-slate-200/80 backdrop-blur hover:bg-white/90 data-[state=open]:bg-white"
                        />
                    </div>
                </header>

                <section className="flex flex-1 items-center justify-center py-6 sm:py-8 lg:py-10">
                    <div className="w-full max-w-[408px]">
                        {children}
                    </div>
                </section>
            </div>
        </main>
    );
}
