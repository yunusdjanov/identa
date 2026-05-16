import type { ApiMediaScanStatus } from '@/lib/api/types';

export function isProtectedMediaApproved(scanStatus?: ApiMediaScanStatus | string | null): boolean {
    return !scanStatus || scanStatus === 'approved';
}

export function getProtectedMediaThumbnailUrl({
    scanStatus,
    thumbnailUrl,
    thumbnailReady,
    previewUrl,
    previewReady,
    url,
    allowFullFallback = false,
}: {
    scanStatus?: ApiMediaScanStatus | string | null;
    thumbnailUrl?: string | null;
    thumbnailReady?: boolean;
    previewUrl?: string | null;
    previewReady?: boolean;
    url?: string | null;
    allowFullFallback?: boolean;
}): string | null {
    if (!isProtectedMediaApproved(scanStatus)) {
        return null;
    }

    if (thumbnailReady === false) {
        if (previewReady === true) {
            return previewUrl ?? null;
        }

        return allowFullFallback ? url ?? null : null;
    }

    return thumbnailUrl ?? previewUrl ?? (allowFullFallback ? url ?? null : null);
}

export function getProtectedMediaPreviewUrl({
    scanStatus,
    previewUrl,
    url,
}: {
    scanStatus?: ApiMediaScanStatus | string | null;
    previewUrl?: string | null;
    url?: string | null;
}): string | null {
    if (!isProtectedMediaApproved(scanStatus)) {
        return null;
    }

    return previewUrl ?? url ?? null;
}

export function getProtectedMediaCrossOrigin(src?: string | null): 'use-credentials' | undefined {
    if (!src) {
        return undefined;
    }

    const normalized = src.trim();
    if (
        normalized === ''
        || normalized.startsWith('blob:')
        || normalized.startsWith('data:')
        || normalized.startsWith('file:')
    ) {
        return undefined;
    }

    try {
        const resolvedUrl = typeof window !== 'undefined'
            ? new URL(normalized, window.location.origin)
            : new URL(normalized, 'http://localhost');

        if (resolvedUrl.protocol !== 'http:' && resolvedUrl.protocol !== 'https:') {
            return undefined;
        }

        const host = resolvedUrl.hostname.toLowerCase();
        const hasSignedStorageQuery = resolvedUrl.searchParams.has('X-Amz-Signature')
            || resolvedUrl.searchParams.has('X-Amz-Credential')
            || resolvedUrl.searchParams.has('X-Amz-Algorithm');

        if (hasSignedStorageQuery || host.endsWith('.r2.cloudflarestorage.com') || host.endsWith('.r2.dev')) {
            return undefined;
        }

        if (typeof window !== 'undefined' && resolvedUrl.origin === window.location.origin) {
            return undefined;
        }

        return 'use-credentials';
    }
    catch {
        return undefined;
    }
}
