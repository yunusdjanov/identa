'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AppErrorStateProps {
    title: string;
    description: string;
    onRetry?: () => void;
    retryLabel?: string;
    backHref?: string;
    backLabel?: string;
    className?: string;
}

export function AppErrorState({
    title,
    description,
    onRetry,
    retryLabel,
    backHref,
    backLabel,
    className,
}: AppErrorStateProps) {
    return (
        <section className={cn('flex min-h-[24rem] items-center justify-center px-3 py-8', className)}>
            <div className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-teal-100 bg-gradient-to-br from-white via-white to-teal-100/65 p-6 shadow-xl shadow-teal-950/5 sm:p-8">
                <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-teal-100/70 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-20 left-10 h-36 w-36 rounded-full bg-teal-100/50 blur-3xl" />

                <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start">
                    <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-teal-100 bg-white text-teal-600 shadow-sm shadow-teal-100">
                        <AlertTriangle className="h-6 w-6" />
                    </span>

                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-black uppercase tracking-[0.24em] text-teal-600">Identa</p>
                        <h2 className="mt-2 text-2xl font-black tracking-[-0.035em] text-slate-950 sm:text-3xl">
                            {title}
                        </h2>
                        <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
                            {description}
                        </p>

                        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                            {onRetry ? (
                                <Button onClick={onRetry} className="h-10 rounded-2xl bg-slate-950 px-5 text-white">
                                    <RefreshCw className="h-4 w-4" />
                                    {retryLabel}
                                </Button>
                            ) : null}

                            {backHref && backLabel ? (
                                <Button
                                    asChild
                                    variant="outline"
                                    className="h-10 rounded-2xl border-slate-200 bg-white px-5"
                                >
                                    <Link href={backHref}>
                                        <ArrowLeft className="h-4 w-4" />
                                        {backLabel}
                                    </Link>
                                </Button>
                            ) : null}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
