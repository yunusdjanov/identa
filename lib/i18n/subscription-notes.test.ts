import { describe, it, expect } from 'vitest';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';
import { SYSTEM_NOTE_I18N_KEYS, localizeSubscriptionNote } from '@/lib/i18n/subscription-notes';

const LOCALES = ['ru', 'uz', 'en'] as const;

describe('localizeSubscriptionNote', () => {
    it('maps every known system note to a key that exists in every locale', () => {
        const missing: string[] = [];
        for (const locale of LOCALES) {
            const dict = DICTIONARIES[locale];
            for (const key of Object.values(SYSTEM_NOTE_I18N_KEYS)) {
                if (!dict[key] || !dict[key].trim()) {
                    missing.push(`${locale}:${key}`);
                }
            }
        }
        expect(missing).toEqual([]);
    });

    it('translates a known system literal into the requested locale', () => {
        const ru = (key: string) => DICTIONARIES.ru[key] ?? `__MISSING__:${key}`;
        const out = localizeSubscriptionNote('Public self-service registration', ru);
        expect(out).toBe(DICTIONARIES.ru['admin.billing.note.system.selfRegistration']);
        expect(out).not.toContain('__MISSING__');
    });

    it('passes admin free-text through unchanged', () => {
        const identity = (key: string) => key;
        const freeText = 'Скидка по договорённости';
        expect(localizeSubscriptionNote(freeText, identity)).toBe(freeText);
    });

    it('returns an empty string for null/undefined/empty notes', () => {
        const identity = (key: string) => key;
        expect(localizeSubscriptionNote(null, identity)).toBe('');
        expect(localizeSubscriptionNote(undefined, identity)).toBe('');
        expect(localizeSubscriptionNote('', identity)).toBe('');
    });
});
