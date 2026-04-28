import { cn } from '@/lib/utils';

type MetricSummaryTone = 'blue' | 'emerald' | 'red' | 'slate';

interface MetricSummaryCardProps {
    label: string;
    value: string;
    tone?: MetricSummaryTone;
    valueTone?: MetricSummaryTone;
    compact?: boolean;
    tabular?: boolean;
    className?: string;
}

const toneClasses: Record<MetricSummaryTone, { card: string; label: string; value: string }> = {
    blue: {
        card: 'metric-hover-blue border-blue-100 shadow-blue-100/60',
        label: 'text-blue-700',
        value: 'text-blue-900',
    },
    emerald: {
        card: 'metric-hover-emerald border-emerald-100 shadow-emerald-100/60',
        label: 'text-emerald-600',
        value: 'text-emerald-700',
    },
    red: {
        card: 'metric-hover-red border-red-100 shadow-red-100/60',
        label: 'text-red-600',
        value: 'text-red-700',
    },
    slate: {
        card: 'metric-hover-slate border-slate-200 shadow-slate-200/60',
        label: 'text-slate-500',
        value: 'text-slate-700',
    },
};

export function getBalanceMetricTone(balance: number): MetricSummaryTone {
    if (balance > 0) {
        return 'red';
    }

    if (balance < 0) {
        return 'emerald';
    }

    return 'slate';
}

export function MetricSummaryCard({
    label,
    value,
    tone = 'blue',
    valueTone,
    compact = false,
    tabular = false,
    className,
}: MetricSummaryCardProps) {
    const resolvedValueTone = valueTone ?? tone;

    return (
        <div
            className={cn(
                'interactive-card metric-hover-card rounded-2xl border bg-white/95 p-3 shadow-sm',
                toneClasses[tone].card,
                className
            )}
        >
            <p className={cn('text-xs font-medium uppercase tracking-wide', toneClasses[tone].label)}>{label}</p>
            <p
                className={cn(
                    'mt-1 font-semibold',
                    compact ? 'text-sm' : 'text-lg',
                    tabular && 'whitespace-nowrap tabular-nums',
                    toneClasses[resolvedValueTone].value
                )}
            >
                {value}
            </p>
        </div>
    );
}
