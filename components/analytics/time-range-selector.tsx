'use client';

import { useCallback, useId, useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/components/providers/i18n-provider';

/**
 * Time range presets used across the analytics page.
 *
 * All ranges anchor to "now" and look back. `ytd` is the only one that
 * doesn't have a fixed length — it spans from the first day of the current
 * calendar year through today. Callers that compute period totals should
 * use `getRangeBounds()` rather than hardcoding day counts.
 */
export type AnalyticsRange = '7d' | '30d' | '90d' | '180d' | '365d' | 'ytd';

const ANALYTICS_RANGES: readonly AnalyticsRange[] = ['7d', '30d', '90d', '180d', '365d', 'ytd'] as const;

export const DEFAULT_ANALYTICS_RANGE: AnalyticsRange = '180d';

/**
 * Resolve a range key into [start, end] Date pair. `end` is "now" for all
 * fixed-length ranges; `start` walks back by the implied window. For `ytd`
 * the start clamps to Jan 1 of the current calendar year.
 *
 * The pair is inclusive of `start` and inclusive of `end`. Consumers that
 * group by month should treat `start` as the first instant of that day.
 */
export function getRangeBounds(range: AnalyticsRange, now: Date = new Date()): { start: Date; end: Date } {
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    if (range === 'ytd') {
        const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        return { start, end };
    }
    const days = range === '7d' ? 7
        : range === '30d' ? 30
            : range === '90d' ? 90
                : range === '180d' ? 180
                    : 365;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1), 0, 0, 0, 0);
    return { start, end };
}

/**
 * For delta computation, return the "previous" period of the same length,
 * immediately preceding the current period's start. For YTD the previous
 * period spans the same number of days from one year ago (so a user opening
 * the page on Mar 15 compares Jan 1 - Mar 15 vs Jan 1 - Mar 15 of last year).
 */
export function getPreviousRangeBounds(range: AnalyticsRange, now: Date = new Date()): { start: Date; end: Date } {
    const current = getRangeBounds(range, now);
    if (range === 'ytd') {
        const start = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
        const end = new Date(
            now.getFullYear() - 1,
            now.getMonth(),
            now.getDate(),
            23, 59, 59, 999
        );
        return { start, end };
    }
    const periodMs = current.end.getTime() - current.start.getTime();
    const end = new Date(current.start.getTime() - 1);
    const start = new Date(end.getTime() - periodMs);
    return { start, end };
}

export interface TimeRangeSelectorProps {
    value: AnalyticsRange;
    onChange: (next: AnalyticsRange) => void;
    /**
     * Optional label rendered before the pill row. Defaults to the
     * `analytics.range.label` i18n string ("Range" / "Период" / "Davr").
     * Pass `null` to hide the label entirely.
     */
    label?: string | null;
    /**
     * Compact mode: smaller pills, no label, used in tight headers. The
     * default is non-compact so the selector reads as a clear control.
     */
    compact?: boolean;
}

export function TimeRangeSelector({
    value,
    onChange,
    label,
    compact = false,
}: TimeRangeSelectorProps) {
    const { t } = useI18n();
    const groupId = useId();
    const resolvedLabel = label === undefined ? t('analytics.range.label') : label;
    const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);

    // ARIA radiogroups expect Arrow-Left/Right (and Up/Down on vertical
    // groups) to cycle the active option without leaving the group. Without
    // this handler, a keyboard-only user has to Tab through each pill —
    // which collides with the standard "Tab leaves the group" semantics.
    // We also wrap around at the ends so the user doesn't lose orientation.
    const handleKeyDown = useCallback(
        (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const len = ANALYTICS_RANGES.length;
            const direction = event.key === 'ArrowRight' ? 1 : -1;
            const nextIndex = (index + direction + len) % len;
            const nextRange = ANALYTICS_RANGES[nextIndex];
            onChange(nextRange);
            // Move focus to the newly active radio so screen readers
            // announce the change and keyboard users see the focus ring
            // follow their arrow press.
            buttonsRef.current[nextIndex]?.focus();
        },
        [onChange]
    );

    return (
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            {resolvedLabel ? (
                <span
                    id={`${groupId}-label`}
                    className="text-xs font-semibold uppercase tracking-wider text-slate-500"
                >
                    {resolvedLabel}
                </span>
            ) : null}
            <div
                role="radiogroup"
                aria-labelledby={resolvedLabel ? `${groupId}-label` : undefined}
                className={cn(
                    'inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm shadow-slate-200/40',
                    compact ? 'p-0.5' : ''
                )}
            >
                {ANALYTICS_RANGES.map((range, index) => {
                    const active = range === value;
                    return (
                        <button
                            key={range}
                            ref={(el) => {
                                buttonsRef.current[index] = el;
                            }}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            // `tabIndex` follows the WAI-ARIA radiogroup pattern:
                            // only the active radio is in the tab order so the
                            // Tab key skips the group, then Arrow keys move
                            // within it.
                            tabIndex={active ? 0 : -1}
                            onClick={() => onChange(range)}
                            onKeyDown={(event) => handleKeyDown(event, index)}
                            className={cn(
                                'rounded-lg font-semibold transition',
                                compact
                                    ? 'px-2 py-1 text-[11px]'
                                    : 'px-2.5 py-1.5 text-xs sm:px-3',
                                active
                                    ? 'bg-slate-900 text-white shadow-sm'
                                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                            )}
                        >
                            {t(`analytics.range.${range}`)}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
