import type { AnalyticsRange } from '@/components/analytics/time-range-selector';
import { monthKeyFromLocal } from '@/lib/analytics/date-bounds';

/**
 * Chart bucket strategy — daily for short windows, monthly for long ones.
 *
 * The old implementation always returned ≥6 monthly buckets, so selecting
 * "7 days" gave the user a chart with 5 months of out-of-range data. The
 * KPIs above honored the range while the chart didn't — cognitive
 * dissonance. We now pick the granularity that gives a useful number of
 * bars without misrepresenting the period.
 *
 * - 7d / 30d → daily buckets
 * - 90d → weekly buckets
 * - 180d / 365d / ytd → monthly buckets
 *
 * Each bucket exposes:
 * - `key` — opaque identifier for grouping treatments / patients / etc.
 * - `label` — short string for the X-axis (e.g. "Mon 12", "W23", "May").
 * - `match(value)` — predicate used by call sites to decide if a record
 *   belongs in this bucket. Encapsulating the parse logic keeps each page
 *   from re-implementing it.
 */
export interface ChartBucket {
    key: string;
    label: string;
    match: (value: string | null | undefined) => boolean;
}

function pad2(n: number): string {
    return String(n).padStart(2, '0');
}

function dayKey(date: Date): string {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function dayLabel(date: Date, locale: string): string {
    return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

function weekKey(date: Date): string {
    // ISO week number — Monday is day 1.
    const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
    return `${tmp.getUTCFullYear()}-W${pad2(week)}`;
}

function weekLabel(date: Date): string {
    const k = weekKey(date);
    return `W${k.slice(-2)}`;
}

function monthLabel(date: Date, locale: string): string {
    return date.toLocaleDateString(locale, { month: 'short' });
}

/**
 * Parse a date-only or full-ISO string back to a Date in **local** time.
 * Mirrors `parseLocalDate` from `date-bounds.ts` but inlined here to keep
 * this module dependency-light (callers commonly grab both helpers and we
 * want the bundler to drop the unused one).
 */
function parse(value: string | null | undefined): Date | null {
    if (!value) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [y, m, d] = value.split('-').map(Number);
        return new Date(y, m - 1, d, 0, 0, 0, 0);
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function buildChartBuckets(
    range: AnalyticsRange,
    bounds: { start: Date; end: Date },
    locale: string = 'en-US'
): ChartBucket[] {
    if (range === '7d' || range === '30d') {
        // Daily buckets, walking from start to end.
        const buckets: ChartBucket[] = [];
        const cursor = new Date(bounds.start);
        while (cursor <= bounds.end) {
            const k = dayKey(cursor);
            const lbl = dayLabel(cursor, locale);
            buckets.push({
                key: k,
                label: lbl,
                match: (value) => {
                    const d = parse(value);
                    return d !== null && dayKey(d) === k;
                },
            });
            cursor.setDate(cursor.getDate() + 1);
        }
        return buckets;
    }

    if (range === '90d') {
        // Weekly buckets. Anchor on the Monday of each ISO week between start and end.
        const buckets: ChartBucket[] = [];
        const cursor = new Date(bounds.start);
        // Walk forward in 7-day steps. Each step's week-key bucket captures
        // every record whose week-key matches — covers irregular start days.
        const seen = new Set<string>();
        while (cursor <= bounds.end) {
            const k = weekKey(cursor);
            if (!seen.has(k)) {
                seen.add(k);
                buckets.push({
                    key: k,
                    label: weekLabel(cursor),
                    match: (value) => {
                        const d = parse(value);
                        return d !== null && weekKey(d) === k;
                    },
                });
            }
            cursor.setDate(cursor.getDate() + 7);
        }
        return buckets;
    }

    // Monthly buckets — 180d, 365d, ytd.
    const buckets: ChartBucket[] = [];
    const cursor = new Date(bounds.start.getFullYear(), bounds.start.getMonth(), 1);
    const endMonth = new Date(bounds.end.getFullYear(), bounds.end.getMonth(), 1);
    while (cursor <= endMonth) {
        const k = monthKeyFromLocal(cursor);
        const cursorSnapshot = new Date(cursor);
        buckets.push({
            key: k,
            label: monthLabel(cursorSnapshot, locale),
            match: (value) => {
                const d = parse(value);
                return d !== null && monthKeyFromLocal(d) === k;
            },
        });
        cursor.setMonth(cursor.getMonth() + 1);
    }
    return buckets;
}
