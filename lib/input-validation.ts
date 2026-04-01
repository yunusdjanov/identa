import { DICTIONARIES } from '@/lib/i18n/dictionaries';
import { resolveLocale, type AppLocale } from '@/lib/i18n/config';

export const INPUT_LIMITS = {
    personName: 255,
    email: 255,
    phoneFormatted: 17,
    phoneDigitsUz: 12,
    address: 255,
    practiceName: 255,
    licenseNumber: 50,
    categoryName: 100,
    shortText: 255,
    longText: 2000,
    password: 255,
} as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UZBEKISTAN_COUNTRY_CODE = '998';
const UZBEKISTAN_LOCAL_DIGITS = INPUT_LIMITS.phoneDigitsUz - UZBEKISTAN_COUNTRY_CODE.length;
const UZBEKISTAN_PHONE_GROUPS = [2, 3, 2, 2] as const;
let validationLocale: AppLocale = 'en';

function interpolate(template: string, variables?: Record<string, string | number>): string {
    if (!variables) {
        return template;
    }

    return template.replace(/\{\{(\w+)\}\}/g, (match, token) => {
        if (!(token in variables)) {
            return match;
        }

        return String(variables[token]);
    });
}

function vt(key: string, variables?: Record<string, string | number>): string {
    const active = DICTIONARIES[validationLocale];
    const fallback = DICTIONARIES.en;
    const template = active[key] ?? fallback[key] ?? key;
    return interpolate(template, variables);
}

export function setValidationLocale(locale: string | null | undefined): void {
    validationLocale = resolveLocale(locale);
}

export function normalizePhoneForApi(value: string): string {
    const digits = value.replace(/\D/g, '');
    if (!digits) {
        return '';
    }

    return `+${digits}`;
}

export function formatPhoneInputValue(value: string): string {
    const digits = value.replace(/\D/g, '');
    if (!digits) {
        return '';
    }

    // Preserve partial country code typing: 9 -> +9, 99 -> +99, 998 -> +998.
    if (UZBEKISTAN_COUNTRY_CODE.startsWith(digits)) {
        return `+${digits}`;
    }

    const digitsWithCountryCode = digits.startsWith(UZBEKISTAN_COUNTRY_CODE)
        ? digits
        : `${UZBEKISTAN_COUNTRY_CODE}${digits.slice(0, UZBEKISTAN_LOCAL_DIGITS)}`;

    const normalizedDigits = digitsWithCountryCode.slice(0, INPUT_LIMITS.phoneDigitsUz);
    const localDigits = normalizedDigits.slice(UZBEKISTAN_COUNTRY_CODE.length);

    const groupedParts = [UZBEKISTAN_COUNTRY_CODE];
    let offset = 0;

    for (const groupSize of UZBEKISTAN_PHONE_GROUPS) {
        const nextChunk = localDigits.slice(offset, offset + groupSize);
        if (!nextChunk) {
            break;
        }
        groupedParts.push(nextChunk);
        offset += groupSize;
    }

    return `+${groupedParts.join(' ')}`;
}

export function getPhoneValidationMessage(value: string, options?: { required?: boolean }): string | null {
    const required = options?.required ?? false;
    const normalized = normalizePhoneForApi(value);

    if (!normalized) {
        return required ? vt('validation.phone.required') : null;
    }

    const digits = normalized.slice(1);
    if (digits.length < 9) {
        return vt('validation.phone.minDigits', { min: 9 });
    }

    if (digits.length > 15) {
        return vt('validation.phone.maxDigits', { max: 15 });
    }

    return null;
}

export function getEmailValidationMessage(value: string, options?: { required?: boolean }): string | null {
    const required = options?.required ?? false;
    const trimmed = value.trim();

    if (!trimmed) {
        return required ? vt('validation.email.required') : null;
    }

    if (trimmed.length > INPUT_LIMITS.email) {
        return vt('validation.email.maxLength', { max: INPUT_LIMITS.email });
    }

    if (!EMAIL_PATTERN.test(trimmed)) {
        return vt('validation.email.invalid');
    }

    return null;
}

export function getTextValidationMessage(
    value: string,
    options: {
        label: string;
        required?: boolean;
        min?: number;
        max?: number;
    }
): string | null {
    const label = options.label;
    const required = options.required ?? false;
    const min = options.min;
    const max = options.max;
    const trimmed = value.trim();

    if (!trimmed) {
        return required ? vt('validation.text.required', { label }) : null;
    }

    if (min !== undefined && trimmed.length < min) {
        return vt('validation.text.minLength', { label, min });
    }

    if (max !== undefined && trimmed.length > max) {
        return vt('validation.text.maxLength', { label, max });
    }

    return null;
}
