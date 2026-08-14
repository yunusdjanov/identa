import { CATEGORIES } from '../_mock-data';

export interface MockPatientCategory {
    id: string;
    name: string;
    color: string;
    sort_order: number;
}

export function patientCategoryStore(): MockPatientCategory[] {
    return CATEGORIES as MockPatientCategory[];
}

/** Mirrors the patient-category FormRequest rules in local mock mode. */
export function normalizePatientCategoryPayload(
    body: Record<string, unknown>,
    ignoreId?: string
): { errors: Record<string, string[]>; payload: Omit<MockPatientCategory, 'id'> } {
    const errors: Record<string, string[]> = {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const color = body.color === undefined || body.color === null || body.color === ''
        ? '#CBD5E1'
        : body.color;
    const sortOrder = body.sort_order === undefined || body.sort_order === null
        ? 0
        : body.sort_order;

    if (name.length < 3 || name.length > 100) {
        errors.name = ['Name must contain 3 to 100 characters.'];
    }
    else if (patientCategoryStore().some((category) => category.id !== ignoreId && category.name === name)) {
        errors.name = ['The name has already been taken.'];
    }
    if (typeof color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
        errors.color = ['Color must be a six-digit hexadecimal value.'];
    }
    if (!Number.isInteger(sortOrder) || Number(sortOrder) < 0 || Number(sortOrder) > 999) {
        errors.sort_order = ['Sort order must be an integer from 0 to 999.'];
    }

    return {
        errors,
        payload: {
            name,
            color: typeof color === 'string' ? color : '#CBD5E1',
            sort_order: Number(sortOrder),
        },
    };
}
