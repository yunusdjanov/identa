import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface PageHeaderProps {
    title: ReactNode;
    description?: ReactNode;
    eyebrow?: ReactNode;
    actions?: ReactNode;
    className?: string;
}

export function PageHeader({ title, description, eyebrow, actions, className }: PageHeaderProps) {
    return (
        <section
            className={cn(
                'overflow-hidden rounded-[1.5rem] border border-white/80 bg-gradient-to-br from-white via-blue-50/55 to-white p-4 shadow-sm shadow-slate-200/70 sm:rounded-[1.75rem] sm:p-6',
                className
            )}
        >
            <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 space-y-2">
                    {eyebrow ? (
                        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-blue-600 sm:text-xs sm:tracking-[0.28em]">
                            {eyebrow}
                        </p>
                    ) : null}
                    <div className="space-y-1">
                        <h1 className="break-words text-[1.8rem] font-bold leading-tight tracking-[-0.04em] text-slate-950 sm:text-4xl">
                            {title}
                        </h1>
                        {description ? (
                            <p className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                                {description}
                            </p>
                        ) : null}
                    </div>
                </div>
                {actions ? (
                    <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                        {actions}
                    </div>
                ) : null}
            </div>
        </section>
    );
}

export function SectionPanel({
    className,
    children,
}: {
    className?: string;
    children: ReactNode;
}) {
    return (
        <section
            className={cn(
                'min-w-0 overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-white/95 p-4 shadow-sm shadow-slate-200/60 sm:rounded-[1.75rem] sm:p-6',
                className
            )}
        >
            {children}
        </section>
    );
}
