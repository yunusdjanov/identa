'use client';

import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/components/providers/i18n-provider';

type MetricSummaryTone = 'teal' | 'emerald' | 'amber' | 'yellow' | 'red' | 'slate';

interface MetricSummaryCardProps {
    label: string;
    value: string;
    tone?: MetricSummaryTone;
    valueTone?: MetricSummaryTone;
    compact?: boolean;
    tabular?: boolean;
    className?: string;
    /**
     * When true, render a locked-state placeholder instead of `value`.
     * The card keeps its label + tone so users see "this metric exists
     * but you don't have access" rather than the metric vanishing.
     * Mirrors the dashboard `LockedStatCard` pattern (Lock icon +
     * locale-aware "No access" label).
     */
    locked?: boolean;
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

export function getBalanceMetricTone(_balance: number): MetricSummaryTone {
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
    locked = false,
}: MetricSummaryCardProps) {
    const resolvedValueTone = valueTone ?? tone;
    const { t } = useI18n();

    if (locked) {
        // Locked state: render a muted card with the same label so the
        // grid keeps its shape, but swap the value slot for a Lock icon
        // + "No access" copy. Borders/background go to slate so the card
        // visually reads as "disabled" without disappearing.
        return (
            <div
                className={cn(
                    'rounded-2xl border border-slate-200/70 bg-white p-3 shadow-sm',
                    className
                )}
                aria-label={`${label}: ${t('dashboard.lockedKpi.label')}`}
            >
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
                <div className={cn(
                    'mt-1 flex items-center gap-1.5 font-semibold text-slate-300',
                    compact ? 'text-sm' : 'text-lg'
                )}>
                    <Lock className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4', 'shrink-0')} aria-hidden="true" />
                    <span className="truncate">{t('dashboard.lockedKpi.label')}</span>
                </div>
            </div>
        );
    }

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
