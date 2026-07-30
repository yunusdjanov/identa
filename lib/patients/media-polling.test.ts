import { describe, expect, it } from 'vitest';

import {
    MEDIA_PROCESSING_POLL_MAX_DURATION_MS,
    resolveMediaProcessingPoll,
} from '@/lib/patients/media-polling';

describe('resolveMediaProcessingPoll', () => {
    it('starts polling pending media and stops after the bounded window', () => {
        const first = resolveMediaProcessingPoll(true, null, 1_000, 2_500);
        expect(first).toEqual({ interval: 2_500, startedAt: 1_000 });

        expect(resolveMediaProcessingPoll(
            true,
            first.startedAt,
            1_000 + MEDIA_PROCESSING_POLL_MAX_DURATION_MS,
            2_500
        ).interval).toBe(false);
    });

    it('resets the polling window once media is no longer pending', () => {
        expect(resolveMediaProcessingPoll(false, 1_000, 2_000, 2_500)).toEqual({
            interval: false,
            startedAt: null,
        });
    });
});
