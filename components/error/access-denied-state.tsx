'use client';

import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AccessDeniedStateProps {
    title: string;
    description: string;
    eyebrow?: string;
    actionLabel?: string;
    actionHref?: string;
    className?: string;
}

export function AccessDeniedState({
    title,
    description,
    eyebrow = 'Доступ закрыт',
    actionLabel = 'В кабинет',
    actionHref = '/dashboard',
    className,
}: AccessDeniedStateProps) {
    return (
        <section className={cn('flex min-h-[24rem] items-center justify-center px-3 py-8', className)}>
            <div className="relative w-full max-w-3xl overflow-hidden rounded-[2rem] border border-cyan-100 bg-gradient-to-br from-white via-white to-cyan-50/70 p-6 shadow-xl shadow-cyan-950/5 sm:p-8">
                <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-cyan-100/80 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-20 left-10 h-36 w-36 rounded-full bg-teal-100/55 blur-3xl" />

                <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start">
                    <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-cyan-100 bg-white text-cyan-700 shadow-sm shadow-cyan-100">
                        <ShieldAlert className="h-6 w-6" />
                    </span>

                    <div className="min-w-0 flex-1">
                        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-100 bg-cyan-50 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-cyan-700">
                            <span className="rounded-full bg-slate-950 px-2 py-0.5 font-mono text-[11px] text-white">
                                403
                            </span>
                            {eyebrow}
                        </div>
                        <h2 className="mt-3 text-2xl font-black tracking-[-0.035em] text-slate-950 sm:text-3xl">
                            {title}
                        </h2>
                        <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
                            {description}
                        </p>

                        <div className="mt-6">
                            <Button asChild className="h-11 rounded-2xl bg-slate-950 px-5 text-white">
                                <Link href={actionHref}>{actionLabel}</Link>
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
