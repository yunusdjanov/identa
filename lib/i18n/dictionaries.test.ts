import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

const LOCALES = ['ru', 'uz', 'en'] as const;

function placeholders(value: string): string {
    return (value.match(/\{\{[^}]+\}\}/g) ?? []).sort().join(',');
}

describe('i18n dictionaries integrity', () => {
    const { ru, uz, en } = DICTIONARIES;
    const ruKeys = Object.keys(ru);

    it('exposes the same key set in every locale', () => {
        const setRu = new Set(Object.keys(ru));
        const setUz = new Set(Object.keys(uz));
        const setEn = new Set(Object.keys(en));

        const report = {
            missingInUz: [...setRu].filter((k) => !setUz.has(k)),
            missingInEn: [...setRu].filter((k) => !setEn.has(k)),
            extraInUz: [...setUz].filter((k) => !setRu.has(k)),
            extraInEn: [...setEn].filter((k) => !setRu.has(k)),
        };

        expect(report).toEqual({ missingInUz: [], missingInEn: [], extraInUz: [], extraInEn: [] });
    });

    it('keeps {{placeholder}} tokens consistent across locales', () => {
        const mismatches = ruKeys.filter((key) => {
            const a = placeholders(ru[key]);
            const b = placeholders(uz[key]);
            const c = placeholders(en[key]);
            return !(a === b && b === c);
        });

        expect(mismatches).toEqual([]);
    });

    it('has no empty values', () => {
        const empty: string[] = [];
        for (const locale of LOCALES) {
            for (const [key, value] of Object.entries(DICTIONARIES[locale])) {
                if (!value || !value.trim()) {
                    empty.push(`${locale}:${key}`);
                }
            }
        }
        expect(empty).toEqual([]);
    });

    it('has no corrupted/mojibake values', () => {
        const corrupted: string[] = [];
        const mojibakePattern = /\?\?\?\?|\uFFFD|â€|Ã.|Ð.|Ñ.|вЂ/;
        for (const locale of LOCALES) {
            for (const [key, value] of Object.entries(DICTIONARIES[locale])) {
                if (mojibakePattern.test(value)) {
                    corrupted.push(`${locale}:${key}`);
                }
            }
        }
        expect(corrupted).toEqual([]);
    });

    it('does not leak the Uzbek okina (U+02BB) into English values', () => {
        // Catches accidental possessives like "dentistʻs" that should use a
        // plain ASCII apostrophe.
        const offenders = Object.entries(en)
            .filter(([, value]) => value.includes('ʻ'))
            .map(([key]) => key);
        expect(offenders).toEqual([]);
    });

    it('has no stray backtick characters in any value', () => {
        // Catches typos like "bo`yicha" where a backtick replaced the okina.
        const offenders: string[] = [];
        for (const locale of LOCALES) {
            for (const [key, value] of Object.entries(DICTIONARIES[locale])) {
                if (value.includes('`')) {
                    offenders.push(`${locale}:${key}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it('localizes oral photo slot and compact status labels', () => {
        expect(ru['patientDetail.oralPhoto.title']).toBe('Общие фото');
        expect(uz['patientDetail.oralPhoto.title']).toBe('Umumiy foto');
        expect(en['patientDetail.oralPhoto.title']).toBe('General Photos');
        expect(ru['patientDetail.oralPhoto.slot.smile']).toBe('Улыбка');
        expect(uz['patientDetail.oralPhoto.slot.smile']).toBe('Tabassum');
        expect(en['patientDetail.oralPhoto.slot.smile']).toBe('Smile');
        expect(ru['patientDetail.oralPhoto.status.empty']).toBe('Нет фото');
        expect(uz['patientDetail.oralPhoto.status.empty']).toBe("Rasm yo'q");
        expect(en['patientDetail.oralPhoto.status.empty']).toBe('No photo');
    });

    it('labels the finance section consistently across locales', () => {
        expect(ru['nav.payments']).toBe('Финансы');
        expect(uz['nav.payments']).toBe('Moliya');
        expect(en['nav.payments']).toBe('Finance');
        expect(ru['payments.title']).toBe('Финансы');
        expect(uz['payments.title']).toBe('Moliya');
        expect(en['payments.title']).toBe('Finance');
        expect(ru['settings.team.permissionPaymentsView']).toBe('Финансы: просмотр');
        expect(uz['settings.team.permissionPaymentsView']).toBe('Moliya: koʻrish');
        expect(en['settings.team.permissionPaymentsView']).toBe('Finance: view');
    });

    it('defines each key exactly once per locale in the source', () => {
        // The dictionaries are assembled from many `Object.assign` blocks where
        // a later definition silently overrides an earlier one. Duplicate keys
        // are the root cause of cross-language drift, so guard against them.
        const source = readFileSync(join(process.cwd(), 'lib', 'i18n', 'dictionaries.ts'), 'utf8');
        const occurrences: Record<string, Record<string, number>> = { ru: {}, uz: {}, en: {} };
        let current: string | null = null;

        for (const line of source.split('\n')) {
            const block = line.match(/^const (ru|uz|en)\b/) ?? line.match(/^Object\.assign\((ru|uz|en),/);
            if (block) {
                current = block[1];
                continue;
            }
            const entry = line.match(/^\s*'([^']*)':\s/);
            if (entry && current) {
                occurrences[current][entry[1]] = (occurrences[current][entry[1]] ?? 0) + 1;
            }
        }

        const duplicates: string[] = [];
        for (const locale of LOCALES) {
            for (const [key, count] of Object.entries(occurrences[locale])) {
                if (count > 1) {
                    duplicates.push(`${locale}:${key} (${count}x)`);
                }
            }
        }
        expect(duplicates).toEqual([]);
    });
});
