import type { AppLocale } from '@/lib/i18n/config';

const UZ_WEEKDAYS_LONG = [
    'yakshanba',
    'dushanba',
    'seshanba',
    'chorshanba',
    'payshanba',
    'juma',
    'shanba',
] as const;

const UZ_WEEKDAYS_SHORT = [
    'Yak',
    'Du',
    'Se',
    'Cho',
    'Pa',
    'Ju',
    'Sha',
] as const;

const UZ_MONTHS_LONG = [
    'yanvar',
    'fevral',
    'mart',
    'aprel',
    'may',
    'iyun',
    'iyul',
    'avgust',
    'sentyabr',
    'oktyabr',
    'noyabr',
    'dekabr',
] as const;

const UZ_MONTHS_SHORT = [
    'yan',
    'fev',
    'mar',
    'apr',
    'may',
    'iyn',
    'iyl',
    'avg',
    'sen',
    'okt',
    'noy',
    'dek',
] as const;

function toDate(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value);
}

function formatUzbekDate(date: Date, options: Intl.DateTimeFormatOptions): string {
    const parts: string[] = [];

    if (options.weekday) {
        parts.push(options.weekday === 'short' ? UZ_WEEKDAYS_SHORT[date.getDay()] : UZ_WEEKDAYS_LONG[date.getDay()]);
    }

    if (options.day) {
        parts.push(options.day === '2-digit' ? String(date.getDate()).padStart(2, '0') : String(date.getDate()));
    }

    if (options.month) {
        if (options.month === 'long') {
            parts.push(UZ_MONTHS_LONG[date.getMonth()]);
        } else if (options.month === 'short') {
            parts.push(UZ_MONTHS_SHORT[date.getMonth()]);
        } else if (options.month === '2-digit') {
            parts.push(String(date.getMonth() + 1).padStart(2, '0'));
        } else {
            parts.push(String(date.getMonth() + 1));
        }
    }

    if (options.year) {
        parts.push(options.year === '2-digit' ? String(date.getFullYear()).slice(-2) : String(date.getFullYear()));
    }

    if (parts.length === 0) {
        return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
    }

    if (options.weekday) {
        const [weekday, ...rest] = parts;
        return rest.length > 0 ? `${weekday}, ${rest.join(' ')}` : weekday;
    }

    return parts.join(' ');
}

function localeToTag(locale: AppLocale): string {
    if (locale === 'ru') {
        return 'ru-RU';
    }
    if (locale === 'uz') {
        return 'uz-Latn-UZ';
    }
    return 'en-US';
}

export function formatLocalizedDate(
    value: Date | string,
    locale: AppLocale,
    options: Intl.DateTimeFormatOptions
): string {
    const date = toDate(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    if (locale === 'uz') {
        return formatUzbekDate(date, options);
    }

    return date.toLocaleDateString(localeToTag(locale), options);
}

