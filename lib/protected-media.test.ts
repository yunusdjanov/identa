import { describe, expect, it } from 'vitest';

import { getProtectedMediaThumbnailUrl } from '@/lib/protected-media';

describe('getProtectedMediaThumbnailUrl', () => {
    it('can fall back to the approved full image while variants are still missing', () => {
        expect(getProtectedMediaThumbnailUrl({
            scanStatus: 'approved',
            thumbnailUrl: 'https://storage.example/thumb.webp',
            thumbnailReady: false,
            previewUrl: 'https://storage.example/preview.webp',
            previewReady: false,
            url: 'https://storage.example/photo.webp',
            allowFullFallback: true,
        })).toBe('https://storage.example/photo.webp');
    });

    it('does not expose rejected media through the full image fallback', () => {
        expect(getProtectedMediaThumbnailUrl({
            scanStatus: 'rejected',
            thumbnailReady: false,
            previewReady: false,
            url: 'https://storage.example/photo.webp',
            allowFullFallback: true,
        })).toBeNull();
    });
});
