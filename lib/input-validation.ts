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
    medicalAllergies: 40,
    medicalMedications: 120,
    medicalHistory: 300,
    shortText: 255,
    longText: 2000,
    password: 255,
} as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UZBEKISTAN_COUNTRY_CODE = '998';
const UZBEKISTAN_LOCAL_DIGITS = INPUT_LIMITS.phoneDigitsUz - UZBEKISTAN_COUNTRY_CODE.length;
const UZBEKISTAN_PHONE_GROUPS = [2, 3, 2, 2] as const;
const COMMON_PASSWORDS = new Set([
    '12345678',
    '123456789',
    '11111111',
    'admin123',
    'letmein123',
    'password',
    'password1',
    'password123',
    'qwerty123',
    'qwertyui',
    'welcome1',
]);
const VALIDATION_MESSAGES: Record<AppLocale, Record<string, string>> = {
    ru: {
        'validation.phone.required': 'Номер телефона обязателен.',
        'validation.phone.minDigits': 'Номер телефона должен содержать минимум {{min}} цифр.',
        'validation.phone.maxDigits': 'Номер телефона должен содержать максимум {{max}} цифр.',
        'validation.email.required': 'Email обязателен.',
        'validation.email.maxLength': 'Email должен содержать не более {{max}} символов.',
        'validation.email.invalid': 'Введите корректный email.',
        'validation.password.required': 'Пароль обязателен.',
        'validation.password.minLength': 'Пароль должен содержать минимум {{min}} символов.',
        'validation.password.maxLength': 'Пароль должен содержать не более {{max}} символов.',
        'validation.password.tooCommon': 'Пароль слишком простой. Выберите более надежный вариант.',
        'validation.password.letterNumber': 'Пароль должен содержать хотя бы одну букву и одну цифру.',
        'validation.text.required': 'Поле "{{label}}" обязательно.',
        'validation.text.minLength': 'Поле "{{label}}" должно содержать минимум {{min}} символа.',
        'validation.text.maxLength': 'Поле "{{label}}" должно содержать не более {{max}} символов.',
    },
    uz: {
        'validation.phone.required': 'Telefon raqami majburiy.',
        'validation.phone.minDigits': 'Telefon raqamida kamida {{min}} ta raqam bo‘lishi kerak.',
        'validation.phone.maxDigits': 'Telefon raqamida ko‘pi bilan {{max}} ta raqam bo‘lishi kerak.',
        'validation.email.required': 'Email majburiy.',
        'validation.email.maxLength': 'Email uzunligi {{max}} ta belgidan oshmasligi kerak.',
        'validation.email.invalid': 'To‘g‘ri email manzilini kiriting.',
        'validation.password.required': 'Parol majburiy.',
        'validation.password.minLength': 'Parol kamida {{min}} ta belgidan iborat bo‘lishi kerak.',
        'validation.password.maxLength': 'Parol {{max}} ta belgidan oshmasligi kerak.',
        'validation.password.tooCommon': 'Parol juda sodda. Kuchliroq variant tanlang.',
        'validation.password.letterNumber': 'Parolda kamida bitta harf va bitta raqam bo‘lishi kerak.',
        'validation.text.required': '"{{label}}" maydoni majburiy.',
        'validation.text.minLength': '"{{label}}" maydoni kamida {{min}} ta belgidan iborat bo‘lishi kerak.',
        'validation.text.maxLength': '"{{label}}" maydoni {{max}} ta belgidan oshmasligi kerak.',
    },
    en: {
        'validation.phone.required': 'Phone number is required.',
        'validation.phone.minDigits': 'Phone must contain at least {{min}} digits.',
        'validation.phone.maxDigits': 'Phone must contain at most {{max}} digits.',
        'validation.email.required': 'Email is required.',
        'validation.email.maxLength': 'Email must be at most {{max}} characters.',
        'validation.email.invalid': 'Enter a valid email address.',
        'validation.password.required': 'Password is required.',
        'validation.password.minLength': 'Password must be at least {{min}} characters.',
        'validation.password.maxLength': 'Password must be at most {{max}} characters.',
        'validation.password.tooCommon': 'This password is too easy to guess. Choose a stronger one.',
        'validation.password.letterNumber': 'Password must include at least one letter and one number.',
        'validation.text.required': '{{label}} is required.',
        'validation.text.minLength': '{{label}} must be at least {{min}} characters.',
        'validation.text.maxLength': '{{label}} must be at most {{max}} characters.',
    },
};
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
    const active = VALIDATION_MESSAGES[validationLocale];
    const fallback = VALIDATION_MESSAGES.en;
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

export function getPasswordValidationMessage(value: string, options?: { required?: boolean }): string | null {
    const required = options?.required ?? false;
    const trimmed = value.trim();

    if (!trimmed) {
        return required ? vt('validation.password.required') : null;
    }

    if (trimmed.length < 8) {
        return vt('validation.password.minLength', { min: 8 });
    }

    if (trimmed.length > INPUT_LIMITS.password) {
        return vt('validation.password.maxLength', { max: INPUT_LIMITS.password });
    }

    const normalized = trimmed.toLowerCase();
    if (COMMON_PASSWORDS.has(normalized)) {
        return vt('validation.password.tooCommon');
    }

    if (!/[a-z]/i.test(trimmed) || !/\d/.test(trimmed)) {
        return vt('validation.password.letterNumber');
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
