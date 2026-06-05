import type { LandingLocale, LandingDictionary } from '@/lib/landing/content';

export type LandingPlanCode = 'trial' | 'basic' | 'pro';

export interface LandingPlan {
    code: LandingPlanCode;
    staff_limit: number;
    entry_image_limit: number;
    upload_max_mb: number;
    can_export: boolean;
    trial_days: number | null;
    monthly_price: number | null;
    yearly_price: number | null;
    currency: string;
}

type PlanFeatureCopy = LandingDictionary['pricing']['feature'];

// Mirrors the seeded DB defaults. Used only if the public plans endpoint is
// unreachable at render time, so the landing always shows correct numbers.
export const FALLBACK_PLANS: Record<LandingPlanCode, LandingPlan> = {
    trial: { code: 'trial', staff_limit: 1, entry_image_limit: 2, upload_max_mb: 3, can_export: false, trial_days: 30, monthly_price: null, yearly_price: null, currency: 'UZS' },
    basic: { code: 'basic', staff_limit: 3, entry_image_limit: 5, upload_max_mb: 5, can_export: false, trial_days: null, monthly_price: 120000, yearly_price: 1200000, currency: 'UZS' },
    pro: { code: 'pro', staff_limit: 5, entry_image_limit: 10, upload_max_mb: 8, can_export: true, trial_days: null, monthly_price: 200000, yearly_price: 2000000, currency: 'UZS' },
};

const FALLBACK_LIST: LandingPlan[] = [FALLBACK_PLANS.trial, FALLBACK_PLANS.basic, FALLBACK_PLANS.pro];

function isPlanCode(value: unknown): value is LandingPlanCode {
    return value === 'trial' || value === 'basic' || value === 'pro';
}

function toLandingPlan(raw: unknown): LandingPlan | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (!isPlanCode(r.code)) return null;
    return {
        code: r.code,
        staff_limit: Number(r.staff_limit ?? 0),
        entry_image_limit: Number(r.entry_image_limit ?? 0),
        upload_max_mb: Number(r.upload_max_mb ?? 0),
        can_export: Boolean(r.can_export),
        trial_days: r.trial_days == null ? null : Number(r.trial_days),
        monthly_price: r.monthly_price == null ? null : Number(r.monthly_price),
        yearly_price: r.yearly_price == null ? null : Number(r.yearly_price),
        currency: typeof r.currency === 'string' ? r.currency : 'UZS',
    };
}

function serverApiRoot(): string {
    return process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8001/api';
}

/**
 * Server-side fetch of the public plans for the landing. Always resolves to a
 * usable list — falls back to the seeded defaults on any error so the page
 * never breaks. Cached for 5 minutes (admin edits propagate on the next
 * revalidation).
 */
export async function getLandingPlans(): Promise<LandingPlan[]> {
    try {
        const res = await fetch(`${serverApiRoot()}/v1/landing/plans`, {
            headers: { Accept: 'application/json' },
            next: { revalidate: 300 },
            // Bound the request so a slow or unreachable backend can never hang
            // the landing render (or the static build): abort after 3s and fall
            // back to the seeded defaults below.
            signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) return FALLBACK_LIST;
        const json = (await res.json()) as { data?: unknown };
        const data = Array.isArray(json.data) ? json.data : [];
        const plans = data.map(toLandingPlan).filter((p): p is LandingPlan => p !== null);
        return plans.length > 0 ? plans : FALLBACK_LIST;
    } catch {
        return FALLBACK_LIST;
    }
}

function pluralForm(n: number, forms: string[], locale: LandingLocale): string {
    if (forms.length === 0) return '';
    if (locale === 'ru') {
        const mod10 = n % 10;
        const mod100 = n % 100;
        if (mod10 === 1 && mod100 !== 11) return forms[0];
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1] ?? forms[0];
        return forms[2] ?? forms[forms.length - 1];
    }
    if (locale === 'en') {
        return n === 1 ? forms[0] : forms[1] ?? forms[0];
    }
    return forms[0]; // uz: number-invariant noun
}

function formatMb(mb: number): string {
    return Number.isInteger(mb) ? String(mb) : String(Math.round(mb * 100) / 100);
}

/** Localized feature lines built from the DB plan limits. */
export function buildPlanFeatures(plan: LandingPlan, locale: LandingLocale, f: PlanFeatureCopy): string[] {
    const features = [
        f.staff
            .replace('{n}', String(plan.staff_limit))
            .replace('{noun}', pluralForm(plan.staff_limit, f.staffForms, locale)),
        f.images
            .replace('{n}', String(plan.entry_image_limit))
            .replace('{noun}', pluralForm(plan.entry_image_limit, f.imageForms, locale)),
        f.upload.replace('{mb}', formatMb(plan.upload_max_mb)),
        plan.can_export ? f.exportOn : f.exportOff,
    ];
    if (plan.code === 'basic') {
        features.push(f.payx);
    }
    return features;
}

/** The big amount + the small unit/period shown under it. */
export interface PlanPriceDisplay {
    /** Large emphasized text: the number, the trial duration, or the fallback. */
    amount: string;
    /** Small muted suffix (currency + period), e.g. "сум/мес". Null when there
     *  is no per-period unit (trial duration or the "price in app" fallback). */
    period: string | null;
}

/** Group thousands with a regular space: 1200000 -> "1 200 000". */
function formatPriceAmount(value: number): string {
    return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Localized price for a plan card. Trial shows its duration; paid plans show the
 * real monthly/yearly price (from the DB) with grouped digits and a currency +
 * period suffix. If the price is unset, it gracefully falls back to the
 * "price in app" label so the card never shows a broken value.
 */
export function planPriceLabel(
    plan: LandingPlan,
    f: PlanFeatureCopy,
    opts: { yearly: boolean } = { yearly: false },
): PlanPriceDisplay {
    if (plan.code === 'trial' && plan.trial_days != null) {
        return { amount: f.trialPrice.replace('{days}', String(plan.trial_days)), period: null };
    }
    const price = opts.yearly ? plan.yearly_price : plan.monthly_price;
    if (price == null || price <= 0) {
        return { amount: f.priceInApp, period: null };
    }
    return {
        amount: formatPriceAmount(price),
        period: `${f.currencySuffix}${opts.yearly ? f.perYear : f.perMonth}`,
    };
}
