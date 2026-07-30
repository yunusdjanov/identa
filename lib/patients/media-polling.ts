export const MEDIA_PROCESSING_POLL_MAX_DURATION_MS = 60_000;

export function resolveMediaProcessingPoll(
    isPending: boolean,
    startedAt: number | null,
    now: number,
    intervalMs: number
): { interval: number | false; startedAt: number | null } {
    if (!isPending) {
        return { interval: false, startedAt: null };
    }

    const resolvedStartedAt = startedAt ?? now;
    if (now - resolvedStartedAt >= MEDIA_PROCESSING_POLL_MAX_DURATION_MS) {
        return { interval: false, startedAt: resolvedStartedAt };
    }

    return { interval: intervalMs, startedAt: resolvedStartedAt };
}
