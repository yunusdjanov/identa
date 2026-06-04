'use client';

import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { useI18n } from '@/components/providers/i18n-provider';
import { cn } from '@/lib/utils';

/**
 * Direction-of-good for a KPI determines the delta colour mapping.
 *
 * - `positive`: higher is better (revenue, patients, completion %).
 *   ↑ green, ↓ red.
 * - `negative`: lower is better (debt, no-show rate, refund $).
 *   ↑ red, ↓ green.
 * - `neutral`: don't colour the delta (e.g. a tracking metric where direction
 *   is context-dependent).
 */
export type KpiTone = 'positive' | 'negative' | 'neutral';

export interface KpiCardProps {
    /** Short label rendered in the eyebrow. e.g. "Revenue". */
    label: string;
    /** One-line description shown beneath the value. e.g. "Total this period". */
    description?: string;
    /**
     * Primary value, already formatted for the user's locale. The card does
     * not format numbers itself — callers pass strings so they can choose
     * currency formatting, percentage formatting, etc.
     */
    value: string;
    /**
     * Previous-period value for delta computation. Optional — if omitted
     * the delta row is hidden. Pass `null` when previous data is genuinely
     * unavailable (so the card can show a "no baseline" hint).
     */
    deltaPercent?: number | null;
    /** Which way is "good" — used for the delta colour. Default 'positive'. */
    tone?: KpiTone;
    /** Optional icon rendered top-right inside a soft badge. */
    icon?: LucideIcon;
    /**
     * Optional accent color for the icon badge. Use to differentiate KPIs
     * at a glance (e.g. revenue = teal, debt = rose, patients = blue).
     * Pass any Tailwind colour token name without the shade — the card
     * applies the 50/600 pair.
     */
    accent?: 'teal' | 'rose' | 'blue' | 'amber' | 'slate' | 'emerald';
    /**
     * Optional secondary footnote rendered under the delta. Used to surface
     * micro-context like "Includes refunded payments" — kept short.
     */
    footnote?: string;
}

const ACCENT_TOKENS: Record<NonNullable<KpiCardProps['accent']>, { bg: string; fg: string }> = {
    teal: { bg: 'bg-teal-50', fg: 'text-teal-600' },
    rose: { bg: 'bg-rose-50', fg: 'text-rose-600' },
    blue: { bg: 'bg-blue-50', fg: 'text-blue-600' },
    amber: { bg: 'bg-amber-50', fg: 'text-amber-600' },
    slate: { bg: 'bg-slate-100', fg: 'text-slate-600' },
    emerald: { bg: 'bg-emerald-50', fg: 'text-emerald-600' },
};

function getDeltaVisual(deltaPercent: number, tone: KpiTone): { Icon: LucideIcon; cls: string } {
    if (deltaPercent === 0) {
        return { Icon: Minus, cls: 'text-slate-500 bg-slate-100' };
    }
    const isUp = deltaPercent > 0;
    if (tone === 'neutral') {
        return { Icon: isUp ? ArrowUpRight : ArrowDownRight, cls: 'text-slate-700 bg-slate-100' };
    }
    // For positive-tone KPIs (revenue, patients), up = good = green;
    // for negative-tone KPIs (debt, no-show), up = bad = red.
    const isGood = tone === 'positive' ? isUp : !isUp;
    return {
        Icon: isUp ? ArrowUpRight : ArrowDownRight,
        cls: isGood
            ? 'text-emerald-700 bg-emerald-50'
            : 'text-rose-700 bg-rose-50',
    };
}

function formatDeltaPercent(value: number): string {
    if (!Number.isFinite(value)) return '0%';
    const sign = value > 0 ? '+' : '';
    // Always integer percent. The previous "1 decimal under 100, integer
    // above" rule produced "+99.4%" sitting next to "+102%" which read
    // inconsistently. A flat integer also reads quicker at a glance and
    // matches the Stripe / Linear pattern.
    return `${sign}${Math.round(value)}%`;
}

export function KpiCard({
    label,
    description,
    value,
    deltaPercent,
    tone = 'positive',
    icon: Icon,
    accent = 'slate',
    footnote,
}: KpiCardProps) {
    const { t } = useI18n();
    const accentTokens = ACCENT_TOKENS[accent];
    const showDelta = deltaPercent !== undefined;
    const hasBaseline = deltaPercent !== null && deltaPercent !== undefined;
    const deltaVisual = hasBaseline ? getDeltaVisual(deltaPercent, tone) : null;

    return (
        <div className="relative flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40 transition hover:border-slate-300 hover:shadow-md">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        {label}
                    </p>
                    {description ? (
                        <p className="text-[11px] text-slate-400">{description}</p>
                    ) : null}
                </div>
                {Icon ? (
                    <span
                        aria-hidden="true"
                        className={cn(
                            'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl',
                            accentTokens.bg,
                            accentTokens.fg
                        )}
                    >
                        <Icon className="h-5 w-5" />
                    </span>
                ) : null}
            </div>

            <p className="text-2xl font-bold tracking-[-0.02em] text-slate-950 tabular-nums sm:text-[26px]">
                {value}
            </p>

            {showDelta ? (
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    {hasBaseline && deltaVisual ? (
                        <>
                            <span
                                className={cn(
                                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold tabular-nums',
                                    deltaVisual.cls
                                )}
                            >
                                <deltaVisual.Icon className="h-3 w-3" aria-hidden="true" />
                                {formatDeltaPercent(deltaPercent)}
                            </span>
                            <span className="text-slate-500">{t('analytics.delta.vs')}</span>
                        </>
                    ) : (
                        <span className="text-slate-400">{t('analytics.delta.noBaseline')}</span>
                    )}
                </div>
            ) : null}

            {footnote ? (
                <p className="text-[10px] text-slate-400">{footnote}</p>
            ) : null}
        </div>
    );
}
