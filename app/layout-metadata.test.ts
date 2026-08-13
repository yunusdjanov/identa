import { describe, expect, it } from 'vitest';
import { metadata as authMetadata } from '@/app/(auth)/layout';
import { metadata as protectedMetadata } from '@/app/(protected)/layout';
import { metadata as adminMetadata } from '@/app/admin/layout';

describe('non-public route metadata boundaries', () => {
    it.each([
        ['auth', authMetadata],
        ['protected', protectedMetadata],
        ['admin', adminMetadata],
    ])('%s routes are noindex and do not inherit landing social metadata', (_name, metadata) => {
        expect(metadata.robots).toMatchObject({
            index: false,
            follow: false,
            noarchive: true,
        });
        expect(metadata.openGraph).toBeNull();
        expect(metadata.twitter).toBeNull();
    });

    it.each([
        ['protected', protectedMetadata],
        ['admin', adminMetadata],
    ])('%s routes clear the landing canonical URL', (_name, metadata) => {
        expect(metadata.alternates).toMatchObject({ canonical: null });
    });
});
