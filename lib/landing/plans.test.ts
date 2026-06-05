import { describe, it, expect } from 'vitest';
import { buildPlanFeatures, planPriceLabel, FALLBACK_PLANS } from '@/lib/landing/plans';
import { LANDING_CONTENT } from '@/lib/landing/content';

const ruF = LANDING_CONTENT.ru.pricing.feature;
const uzF = LANDING_CONTENT.uz.pricing.feature;
const enF = LANDING_CONTENT.en.pricing.feature;

describe('buildPlanFeatures', () => {
    it('uses the correct Russian plural form per count (one / few / many)', () => {
        // trial: staff 1 -> "сотрудник" (one); images 2 -> "снимка" (few)
        expect(buildPlanFeatures(FALLBACK_PLANS.trial, 'ru', ruF)).toEqual([
            'Доктор + 1 сотрудник',
            '2 снимка на запись',
            'Загрузка до 3 МБ',
            'Выгрузка недоступна',
        ]);
        // pro: staff 5 -> "сотрудников" (many); images 10 -> "снимков" (many)
        expect(buildPlanFeatures(FALLBACK_PLANS.pro, 'ru', ruF)).toEqual([
            'Доктор + 5 сотрудников',
            '10 снимков на запись',
            'Загрузка до 8 МБ',
            'Выгрузка доступна',
        ]);
    });

    it('appends the PayX line only to the Basic plan', () => {
        const basic = buildPlanFeatures(FALLBACK_PLANS.basic, 'ru', ruF);
        expect(basic[0]).toBe('Доктор + 3 сотрудника'); // few form
        expect(basic).toContain(ruF.payx);
        expect(buildPlanFeatures(FALLBACK_PLANS.trial, 'ru', ruF)).not.toContain(ruF.payx);
        expect(buildPlanFeatures(FALLBACK_PLANS.pro, 'ru', ruF)).not.toContain(ruF.payx);
    });

    it('uses English singular vs plural', () => {
        expect(buildPlanFeatures(FALLBACK_PLANS.trial, 'en', enF)[0]).toBe('Doctor + 1 staff member');
        expect(buildPlanFeatures(FALLBACK_PLANS.basic, 'en', enF)[0]).toBe('Doctor + 3 staff members');
        expect(buildPlanFeatures(FALLBACK_PLANS.trial, 'en', enF)[1]).toBe('2 images per entry');
    });

    it('uses invariant Uzbek nouns', () => {
        const uz = buildPlanFeatures(FALLBACK_PLANS.trial, 'uz', uzF);
        expect(uz[0]).toBe('Shifokor + 1 xodim');
        expect(uz[1]).toBe('Har yozuv uchun 2 ta rasm');
        expect(uz[2]).toBe('Yuklash 3 MB gacha');
        expect(uz[3]).toBe(uzF.exportOff);
    });

    it('reflects edited DB limits (drift-proof)', () => {
        const edited = { ...FALLBACK_PLANS.pro, staff_limit: 8, entry_image_limit: 20, upload_max_mb: 12, can_export: false };
        const f = buildPlanFeatures(edited, 'ru', ruF);
        expect(f[0]).toBe('Доктор + 8 сотрудников');
        expect(f[1]).toBe('20 снимков на запись');
        expect(f[2]).toBe('Загрузка до 12 МБ');
        expect(f[3]).toBe('Выгрузка недоступна');
    });
});

describe('planPriceLabel', () => {
    it('shows the trial duration with no period suffix', () => {
        expect(planPriceLabel(FALLBACK_PLANS.trial, ruF)).toEqual({ amount: '30 дней', period: null });
        expect(planPriceLabel(FALLBACK_PLANS.trial, enF)).toEqual({ amount: '30 days', period: null });
    });

    it('shows the real monthly/yearly price with grouped digits + currency/period', () => {
        // basic 120000/mo, 1200000/yr and pro 200000/mo, 2000000/yr mirror the seeded DB defaults.
        expect(planPriceLabel(FALLBACK_PLANS.basic, ruF, { yearly: false })).toEqual({ amount: '120 000', period: 'сум/мес' });
        expect(planPriceLabel(FALLBACK_PLANS.basic, ruF, { yearly: true })).toEqual({ amount: '1 200 000', period: 'сум/год' });
        expect(planPriceLabel(FALLBACK_PLANS.pro, uzF, { yearly: false })).toEqual({ amount: '200 000', period: "so'm/oy" });
        expect(planPriceLabel(FALLBACK_PLANS.pro, enF, { yearly: true })).toEqual({ amount: '2 000 000', period: 'UZS/yr' });
    });

    it('falls back to the "price in app" label when the price is unset', () => {
        const noPrice = { ...FALLBACK_PLANS.basic, monthly_price: null, yearly_price: null };
        expect(planPriceLabel(noPrice, ruF)).toEqual({ amount: 'Цена в кабинете', period: null });
        expect(planPriceLabel(noPrice, enF)).toEqual({ amount: 'Price in app', period: null });
    });
});
