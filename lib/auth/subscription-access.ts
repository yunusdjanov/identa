// Pub-sub bridge between the axios response interceptor (which sees the 403
// `subscription_read_only` first) and the React Query client (which needs to
// invalidate `auth/me` + billing queries so the UI reflects the new state).
//
// We don't import the QueryClient directly in the interceptor because the
// interceptor is set up before the React tree mounts; the provider mounts the
// QueryClient and then registers a handler here.

type Handler = () => void;

const handlers = new Set<Handler>();

// Debounce window: when multiple parallel queries 403 at the same time
// (typical when an admin revokes a subscription mid-session and 6 cached
// queries all refresh at once), we'd otherwise fan out N handler calls
// in a tight loop. The handler triggers `invalidateQueries` which kicks
// off MORE refetches — which can themselves 403 — feedback loop with
// burst behavior. Dedupe to one notification per 500ms so the cascade
// is bounded and predictable.
const DEBOUNCE_MS = 500;
let lastNotifiedAt = 0;

export function registerSubscriptionAccessRevokedHandler(handler: Handler): () => void {
    handlers.add(handler);
    return () => {
        handlers.delete(handler);
    };
}

export function notifySubscriptionAccessRevoked(): void {
    const now = Date.now();
    if (now - lastNotifiedAt < DEBOUNCE_MS) {
        return;
    }
    lastNotifiedAt = now;

    for (const handler of handlers) {
        try {
            handler();
        } catch {
            // Handlers must not throw — swallow so one bad subscriber
            // doesn't break the rest of the chain.
        }
    }
}

/**
 * Test-only helper to reset the debounce so unit tests can fire
 * notifications back-to-back without waiting real wall-clock time.
 */
export function __resetSubscriptionAccessDebounceForTests(): void {
    lastNotifiedAt = 0;
}
