import { TREATMENTS } from '../../../_mock-data';

export type MockTreatment = Record<string, unknown> & {
    id: string;
    patient_id: string;
    treatment_type: string;
    treatment_date: string;
};

export const mockTreatmentStore = TREATMENTS as unknown as MockTreatment[];

const MAX_AMOUNT = 9_999_999_999.99;
const SORT_FIELDS = new Set(['treatment_date', 'created_at', 'cost', 'tooth_number']);
type ValidationErrors = Record<string, string[]>;

function hasOwn(value: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
}

function nullableTrimmedString(
    body: Record<string, unknown>,
    field: string,
    max: number,
    errors: ValidationErrors,
    payload: Record<string, unknown>
): void {
    if (!hasOwn(body, field)) return;
    if (body[field] !== null && typeof body[field] !== 'string') {
        errors[field] = [`${field} must be a string.`];
        return;
    }
    const value = typeof body[field] === 'string' ? body[field].trim() : '';
    if (value.length > max) {
        errors[field] = [`${field} may not exceed ${max} characters.`];
        return;
    }
    payload[field] = value || null;
}

function numericField(
    body: Record<string, unknown>,
    field: string,
    errors: ValidationErrors,
    payload: Record<string, unknown>
): void {
    if (!hasOwn(body, field)) return;
    if (body[field] === null) {
        payload[field] = null;
        return;
    }
    const value = Number(body[field]);
    if (!Number.isFinite(value) || value < 0 || value > MAX_AMOUNT) {
        errors[field] = [`${field} must be between 0 and ${MAX_AMOUNT}.`];
        return;
    }
    payload[field] = value;
}

export function normalizeTreatmentPayload(body: Record<string, unknown>) {
    const errors: ValidationErrors = {};
    const payload: Record<string, unknown> = {};
    const treatmentType = typeof body.treatment_type === 'string' ? body.treatment_type.trim() : '';
    if (treatmentType.length < 2 || treatmentType.length > 255) {
        errors.treatment_type = ['treatment_type must contain between 2 and 255 characters.'];
    } else {
        payload.treatment_type = treatmentType;
    }

    const treatmentDate = typeof body.treatment_date === 'string' ? body.treatment_date.trim() : '';
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(treatmentDate)
        ? new Date(`${treatmentDate}T00:00:00Z`)
        : new Date(Number.NaN);
    const today = new Date();
    today.setUTCHours(23, 59, 59, 999);
    if (
        Number.isNaN(parsedDate.getTime())
        || parsedDate.toISOString().slice(0, 10) !== treatmentDate
        || parsedDate > today
    ) {
        errors.treatment_date = ['treatment_date must be a valid date on or before today.'];
    } else {
        payload.treatment_date = treatmentDate;
    }

    nullableTrimmedString(body, 'description', 5000, errors, payload);
    nullableTrimmedString(body, 'comment', 5000, errors, payload);
    nullableTrimmedString(body, 'notes', 5000, errors, payload);

    const hasToothInput = hasOwn(body, 'teeth') || hasOwn(body, 'tooth_number');
    if (hasToothInput) {
        const rawTeeth = body.teeth;
        const rawPrimary = body.tooth_number;
        if (rawTeeth !== undefined && rawTeeth !== null && !Array.isArray(rawTeeth)) {
            errors.teeth = ['teeth must be an array.'];
        }
        const candidates = Array.isArray(rawTeeth) ? [...rawTeeth] : [];
        if (rawPrimary !== undefined && rawPrimary !== null && rawPrimary !== '') candidates.push(rawPrimary);
        const teeth = candidates.map(Number);
        if (teeth.some((tooth) => !Number.isInteger(tooth) || tooth < 1 || tooth > 32)) {
            errors.teeth = ['Each tooth must be an integer from 1 to 32.'];
        } else {
            const normalized = [...new Set(teeth)].sort((left, right) => left - right);
            if (Array.isArray(rawTeeth) && new Set(rawTeeth.map(Number)).size !== rawTeeth.length) {
                errors.teeth = ['teeth must not contain duplicates.'];
            } else {
                payload.teeth = normalized;
                payload.tooth_number = rawPrimary !== undefined && rawPrimary !== null && rawPrimary !== ''
                    ? Number(rawPrimary)
                    : normalized[0] ?? null;
            }
        }
    }

    numericField(body, 'cost', errors, payload);
    numericField(body, 'debt_amount', errors, payload);
    numericField(body, 'paid_amount', errors, payload);
    if (hasOwn(body, 'currency')) {
        const currency = typeof body.currency === 'string' ? body.currency.trim().toUpperCase() : '';
        if (!['UZS', 'USD'].includes(currency)) errors.currency = ['currency must be UZS or USD.'];
        else payload.currency = currency;
    }

    return { errors, payload };
}

export function scrubTreatmentFinancials(treatment: MockTreatment, canViewFinancials: boolean): MockTreatment {
    if (canViewFinancials) return treatment;
    return { ...treatment, cost: null, debt_amount: null, paid_amount: null, balance: null, currency: null };
}

function parseBoolean(value: string | null, defaultValue: boolean): boolean | null {
    if (value === null) return defaultValue;
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return null;
}

export function parseTreatmentListQuery(url: URL, canViewFinancials: boolean) {
    const errors: ValidationErrors = {};
    const page = Number(url.searchParams.get('page') ?? '1');
    const perPage = Number(url.searchParams.get('per_page') ?? '15');
    const includeImages = parseBoolean(url.searchParams.get('include_images'), true);
    const includeSummary = parseBoolean(url.searchParams.get('include_summary'), false);
    const sort = (url.searchParams.get('sort') ?? '-treatment_date,-created_at').trim();
    const sortSegments = sort.split(',').map((segment) => segment.trim()).filter(Boolean);

    if (!Number.isInteger(page) || page < 1 || page > 1_000_000) errors.page = ['page must be from 1 to 1000000.'];
    if (!Number.isInteger(perPage) || perPage < 1 || perPage > 500) errors.per_page = ['per_page must be from 1 to 500.'];
    if (includeImages === null) errors.include_images = ['include_images must be boolean.'];
    if (includeSummary === null) errors.include_summary = ['include_summary must be boolean.'];
    if (
        sort.length === 0 || sort.length > 160 || sortSegments.length > SORT_FIELDS.size
        || sortSegments.some((segment) => !/^-?[a-z_]+$/.test(segment) || !SORT_FIELDS.has(segment.replace(/^-/, '')))
        || (!canViewFinancials && sortSegments.some((segment) => segment.replace(/^-/, '') === 'cost'))
    ) errors.sort = ['sort is invalid.'];

    return {
        errors,
        page,
        perPage,
        includeImages: includeImages ?? true,
        includeSummary: includeSummary ?? false,
        sortSegments,
    };
}

export function sortTreatments(items: MockTreatment[], segments: string[]): MockTreatment[] {
    return [...items].sort((left, right) => {
        for (const segment of segments) {
            const descending = segment.startsWith('-');
            const field = segment.replace(/^-/, '');
            const leftValue = field === 'cost' ? Number(left.debt_amount ?? left.cost ?? 0) : left[field];
            const rightValue = field === 'cost' ? Number(right.debt_amount ?? right.cost ?? 0) : right[field];
            const compared = String(leftValue ?? '').localeCompare(String(rightValue ?? ''), undefined, { numeric: true });
            if (compared !== 0) return descending ? -compared : compared;
        }
        return 0;
    });
}

export function treatmentSummary(items: MockTreatment[]) {
    const totalsByCurrency = Object.fromEntries(['UZS', 'USD'].map((currency) => {
        const currencyItems = items.filter((item) => (item.currency ?? 'UZS') === currency);
        const totalDebt = currencyItems.reduce((sum, item) => sum + Number(item.debt_amount ?? item.cost ?? 0), 0);
        const totalPaid = currencyItems.reduce((sum, item) => sum + Number(item.paid_amount ?? 0), 0);
        return [currency, { total_debt: totalDebt, total_paid: totalPaid, total_balance: totalDebt - totalPaid }];
    })) as Record<string, { total_debt: number; total_paid: number; total_balance: number }>;
    return {
        total_count: items.length,
        total_debt: totalsByCurrency.UZS.total_debt,
        total_paid: totalsByCurrency.UZS.total_paid,
        total_balance: totalsByCurrency.UZS.total_balance,
        totals_by_currency: totalsByCurrency,
    };
}
