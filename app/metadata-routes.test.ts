import { describe, expect, it } from 'vitest';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';

describe('public metadata routes', () => {
    it('lets private HTML pages expose their noindex header while blocking API crawling', () => {
        const rules = robots().rules;
        const defaultRule = Array.isArray(rules) ? rules[0] : rules;

        expect(defaultRule).toMatchObject({
            userAgent: '*',
            allow: '/',
            disallow: ['/api/'],
        });
        expect(robots().sitemap).toBe('https://identa.uz/sitemap.xml');
    });

    it('lists only the canonical landing URL without a synthetic last-modified timestamp', () => {
        expect(sitemap()).toEqual([
            {
                url: 'https://identa.uz',
                changeFrequency: 'weekly',
                priority: 1,
            },
        ]);
    });
});
