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
                'rounded-[1.75rem] border border-white/80 bg-gradient-to-br from-white via-blue-50/55 to-white p-5 shadow-sm shadow-slate-200/70 sm:p-6',
                className
            )}
        >
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 space-y-2">
                    {eyebrow ? (
                        <p className="text-xs font-bold uppercase tracking-[0.28em] text-blue-600">{eyebrow}</p>
                    ) : null}
                    <div className="space-y-1">
                        <h1 className="text-3xl font-bold tracking-[-0.04em] text-slate-950 sm:text-4xl">
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
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
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
                'rounded-[1.75rem] border border-slate-200/80 bg-white/95 p-5 shadow-sm shadow-slate-200/60 sm:p-6',
                className
            )}
        >
            {children}
        </section>
    );
}
