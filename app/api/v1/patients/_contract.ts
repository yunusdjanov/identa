import { CATEGORIES } from '../_mock-data';

const PHONE_RX = /^\+\d{9,15}$/;
const VALID_GENDERS = new Set(['male', 'female']);

type PatientPayload = Record<string, unknown>;

function nullableTrimmedText(value: unknown): string | null {
    return typeof value === 'string' ? value.trim() || null : null;
}

function validDateOnOrBeforeToday(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime())
        && date.toISOString().slice(0, 10) === value
        && value <= new Date().toISOString().slice(0, 10);
}

/** Mirrors StorePatientRequest/UpdatePatientRequest for local mock routes. */
export function normalizePatientPayload(
    body: Record<string, unknown>,
    options?: { preserveMissingOptionalFields?: boolean }
): {
    errors: Record<string, string[]>;
    payload: PatientPayload;
} {
    const errors: Record<string, string[]> = {};
    const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const secondaryPhone = nullableTrimmedText(body.secondary_phone);
    const address = nullableTrimmedText(body.address);
    const medicalHistory = nullableTrimmedText(body.medical_history);
    const allergies = nullableTrimmedText(body.allergies);
    const currentMedications = nullableTrimmedText(body.current_medications);
    const dateOfBirth = nullableTrimmedText(body.date_of_birth);
    const gender = nullableTrimmedText(body.gender);
    const categoryId = nullableTrimmedText(body.category_id);

    if (fullName.length < 3 || fullName.length > 255) {
        errors.full_name = ['Full name must contain 3 to 255 characters.'];
    }
    if (phone.length > 50 || !PHONE_RX.test(phone)) {
        errors.phone = ['Phone must be in E.164 format (+998901234567).'];
    }
    if (secondaryPhone !== null && (secondaryPhone.length > 50 || !PHONE_RX.test(secondaryPhone))) {
        errors.secondary_phone = ['Secondary phone must be in E.164 format.'];
    }
    if (address !== null && (address.length < 3 || address.length > 255)) {
        errors.address = ['Address must contain 3 to 255 characters.'];
    }
    if (dateOfBirth !== null && !validDateOnOrBeforeToday(dateOfBirth)) {
        errors.date_of_birth = ['Date of birth must be a valid date on or before today.'];
    }
    if (gender !== null && !VALID_GENDERS.has(gender)) {
        errors.gender = ['Gender must be one of: male, female.'];
    }
    if (medicalHistory !== null && medicalHistory.length > 300) {
        errors.medical_history = ['Medical history may not exceed 300 characters.'];
    }
    if (allergies !== null && allergies.length > 40) {
        errors.allergies = ['Allergies may not exceed 40 characters.'];
    }
    if (currentMedications !== null && currentMedications.length > 120) {
        errors.current_medications = ['Current medications may not exceed 120 characters.'];
    }

    const category = categoryId === null
        ? null
        : CATEGORIES.find((candidate) => candidate.id === categoryId);
    if (categoryId !== null && !category) {
        errors.category_id = ['The selected patient category is invalid.'];
    }

    const payload: PatientPayload = { full_name: fullName, phone };
    const optionalFields: Array<[string, unknown]> = [
        ['secondary_phone', secondaryPhone],
        ['address', address],
        ['date_of_birth', dateOfBirth],
        ['gender', gender],
        ['medical_history', medicalHistory],
        ['allergies', allergies],
        ['current_medications', currentMedications],
        ['categories', category ? [category] : []],
    ];
    for (const [field, value] of optionalFields) {
        const requestField = field === 'categories' ? 'category_id' : field;
        if (!options?.preserveMissingOptionalFields || Object.hasOwn(body, requestField)) {
            payload[field] = value;
        }
    }

    return { errors, payload };
}
