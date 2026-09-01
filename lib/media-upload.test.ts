import { describe, expect, it } from 'vitest';
import { isSupportedImageUpload } from '@/lib/media-upload';

describe('isSupportedImageUpload', () => {
    it.each(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])(
        'accepts the supported %s MIME type',
        (type) => {
            expect(isSupportedImageUpload({ name: 'photo.unknown', type })).toBe(true);
        }
    );

    it.each(['photo.jpg', 'photo.JPEG', 'photo.png', 'photo.webp'])(
        'uses the supported extension when the browser omits the MIME type: %s',
        (name) => {
            expect(isSupportedImageUpload({ name, type: '' })).toBe(true);
        }
    );

    it.each([
        { name: 'renamed.jpg', type: 'image/svg+xml' },
        { name: 'renamed.png', type: 'image/gif' },
        { name: 'photo.webp', type: 'application/octet-stream' },
    ])('rejects a declared unsupported MIME type even with a supported extension', (file) => {
        expect(isSupportedImageUpload(file)).toBe(false);
    });

    it('rejects an unsupported extension when the MIME type is absent', () => {
        expect(isSupportedImageUpload({ name: 'photo.svg', type: '' })).toBe(false);
    });
});
