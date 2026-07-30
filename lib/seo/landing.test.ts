import { describe, expect, it } from 'vitest';
import {
    FAQ_STRUCTURED_DATA,
    LANDING_METADATA,
    LANDING_SEO_DESCRIPTION,
    LANDING_SEO_TITLE,
    SOFTWARE_APPLICATION_STRUCTURED_DATA,
} from '@/lib/seo/landing';
import {
    SOCIAL_IMAGE_PATH,
    SOCIAL_IMAGE_SIZE,
    absoluteSiteUrl,
    normalizeSiteUrl,
    serializeJsonLd,
} from '@/lib/seo/site';

describe('landing SEO', () => {
    it('uses a concise absolute title and description', () => {
        expect(LANDING_METADATA.title).toEqual({ absolute: LANDING_SEO_TITLE });
        expect(LANDING_SEO_TITLE.length).toBeLessThanOrEqual(60);
        expect(LANDING_SEO_DESCRIPTION.length).toBeGreaterThanOrEqual(120);
        expect(LANDING_SEO_DESCRIPTION.length).toBeLessThanOrEqual(160);
        expect(LANDING_METADATA.alternates?.canonical).toBe('/');
    });

    it('ships a large social preview instead of the portrait logo', () => {
        expect((LANDING_METADATA.twitter as { card?: string } | undefined)?.card).toBe('summary_large_image');
        expect(LANDING_METADATA.openGraph?.images).toEqual([
            expect.objectContaining({
                url: SOCIAL_IMAGE_PATH,
                width: SOCIAL_IMAGE_SIZE.width,
                height: SOCIAL_IMAGE_SIZE.height,
            }),
        ]);
    });

    it('keeps structured data accurate and aligned with visible FAQ content', () => {
        expect(SOFTWARE_APPLICATION_STRUCTURED_DATA.name).toBe('Identa');
        expect(SOFTWARE_APPLICATION_STRUCTURED_DATA.offers.price).toBe(0);
        expect(SOFTWARE_APPLICATION_STRUCTURED_DATA).not.toHaveProperty('aggregateRating');
        expect(FAQ_STRUCTURED_DATA.mainEntity.length).toBeGreaterThan(0);
        expect(FAQ_STRUCTURED_DATA.mainEntity.every((item) => item.name && item.acceptedAnswer.text)).toBe(true);
    });

    it('normalizes public URLs and safely serializes JSON-LD', () => {
        expect(normalizeSiteUrl('https://identa.uz/marketing/')).toBe('https://identa.uz');
        expect(normalizeSiteUrl('javascript:alert(1)')).toBe('https://identa.uz');
        expect(absoluteSiteUrl('/register')).toBe('https://identa.uz/register');
        expect(serializeJsonLd({ value: '</script>' })).not.toContain('</script>');
        expect(serializeJsonLd({ value: '</script>' })).toContain('\\u003c/script>');
    });
});
