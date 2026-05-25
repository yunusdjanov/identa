import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
    icon?: LucideIcon;
    title: string;
    description?: string;
    action?: React.ReactNode;
    tone?: 'neutral' | 'success' | 'warning';
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

const toneClasses = {
    neutral: {
        iconBg: 'bg-slate-100 text-slate-400',
        iconRing: 'ring-1 ring-slate-200/60',
    },
    success: {
        iconBg: 'bg-emerald-50 text-emerald-500',
        iconRing: 'ring-1 ring-emerald-100',
    },
    warning: {
        iconBg: 'bg-yellow-50 text-yellow-600',
        iconRing: 'ring-1 ring-yellow-100',
    },
} as const;

const sizeClasses = {
    sm: {
        wrapper: 'gap-2 px-4 py-6',
        iconBox: 'h-10 w-10',
        icon: 'h-5 w-5',
        title: 'text-sm font-semibold',
        description: 'text-xs',
    },
    md: {
        wrapper: 'gap-3 px-6 py-10',
        iconBox: 'h-12 w-12',
        icon: 'h-6 w-6',
        title: 'text-base font-semibold',
        description: 'text-sm',
    },
    lg: {
        wrapper: 'gap-4 px-8 py-14',
        iconBox: 'h-16 w-16',
        icon: 'h-8 w-8',
        title: 'text-lg font-bold',
        description: 'text-sm',
    },
} as const;

export function EmptyState({
    icon: Icon,
    title,
    description,
    action,
    tone = 'neutral',
    size = 'md',
    className,
}: EmptyStateProps) {
    const tones = toneClasses[tone];
    const sizes = sizeClasses[size];

    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center text-center',
                sizes.wrapper,
                className
            )}
        >
            {Icon ? (
                <span className={cn('flex items-center justify-center rounded-full', sizes.iconBox, tones.iconBg, tones.iconRing)}>
                    <Icon className={sizes.icon} />
                </span>
            ) : null}
            <h3 className={cn('text-slate-900', sizes.title)}>{title}</h3>
            {description ? (
                <p className={cn('max-w-md text-slate-500', sizes.description)}>{description}</p>
            ) : null}
            {action ? <div className="mt-1">{action}</div> : null}
        </div>
    );
}
