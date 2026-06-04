/**
 * Date utilities shared by the analytics pages.
 *
 * **Why a dedicated module?** The dentist and admin analytics pages both
 * bucket records by month and check "is this date inside the selected
 * range?" Both used to do this with naive `new Date(string)` calls, which
 * is correct for full ISO timestamps but wrong for date-only strings
 * (`YYYY-MM-DD`). The backend mixes both shapes: `created_at` is a full
 * ISO, but `treatment_date`, `appointment_date`, `registration_date` come
 * back as date-only. `new Date('2026-05-30')` parses as **UTC** midnight;
 * for a viewer in UTC+5 (Uzbekistan) that resolves to `2026-05-29 19:00`
 * local — bumping records on the last day of a range into the previous
 * bucket. These helpers parse date-only strings as **local** midnight so
 * the bucketing matches what the user sees in the table.
 */

/**
 * Match `YYYY-MM-DD` exactly. Anything with a `T`, timezone, or fractional
 * seconds falls through to the default `Date` parser.
 */
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse a date string into a Date.
 * - `YYYY-MM-DD` → local midnight of that calendar day.
 * - Anything else → delegated to `new Date(value)` (ISO, RFC2822, etc.).
 *
 * Returns `null` when the input is null/undefined/empty/unparseable, so
 * callers can short-circuit without re-checking `isNaN`.
 */
function parseLocalDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    if (DATE_ONLY_RE.test(value)) {
        const [y, m, d] = value.split('-').map(Number);
        return new Date(y, m - 1, d, 0, 0, 0, 0);
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Inclusive bounds check that treats date-only strings as local-midnight.
 * Used to assign records to a selected range.
 */
export function withinLocalBounds(value: string | null | undefined, start: Date, end: Date): boolean {
    const d = parseLocalDate(value);
    if (d === null) return false;
    return d >= start && d <= end;
}

/**
 * Return `YYYY-MM` for the **local** year/month of a Date. Pairs with
 * `parseLocalDate` so both ends of a month-bucket comparison use the same
 * frame of reference.
 */
export function monthKeyFromLocal(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
