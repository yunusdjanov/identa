import { cn } from '@/lib/utils';

type MetricSummaryTone = 'teal' | 'emerald' | 'amber' | 'yellow' | 'red' | 'slate';

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
    teal: {
        card: 'metric-hover-teal border-teal-100 shadow-teal-100/60',
        label: 'text-teal-700',
        value: 'text-teal-900',
    },
    emerald: {
        card: 'metric-hover-emerald border-emerald-100 shadow-emerald-100/60',
        label: 'text-emerald-600',
        value: 'text-emerald-700',
    },
    amber: {
        card: 'metric-hover-amber border-amber-100 shadow-amber-100/60',
        label: 'text-amber-600',
        value: 'text-amber-700',
    },
    yellow: {
        card: 'metric-hover-amber border-yellow-200 shadow-yellow-100/60',
        label: 'text-yellow-700',
        value: 'text-yellow-800',
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
    return 'yellow';
}

export function MetricSummaryCard({
    label,
    value,
    tone = 'teal',
    valueTone,
    compact = false,
    tabular = false,
    className,
}: MetricSummaryCardProps) {
    const resolvedValueTone = valueTone ?? tone;

    return (
        <div
            className={cn(
                'interactive-card metric-hover-card rounded-2xl border bg-white p-3 shadow-sm',
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
