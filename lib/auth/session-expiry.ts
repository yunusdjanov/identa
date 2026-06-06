export const AUTH_SESSION_EXPIRED_EVENT = 'identa:auth-session-expired';
const AUTH_REDIRECT_REASON_KEY = 'identa.auth.redirect-reason';
const AUTH_REDIRECT_REASON_SESSION_EXPIRED = 'session-expired';

let hasNotifiedSessionExpiry = false;

/**
 * sessionStorage can throw on the property getter (not just on get/setItem)
 * in incognito-with-strict-policy, sandboxed iframes, and some embedded
 * WebViews. Every access here is wrapped so the auth flows degrade to a
 * no-op instead of throwing out to the route error boundary — the bug this
 * guards against surfaced as `/login` rendering the global 500 page on a
 * clean visit, because `consumeAuthRedirectReason()` runs inside a login-page
 * `useEffect` and its bare `getItem` propagated the SecurityError up.
 */
function getStorage(): Storage | null {
    if (typeof window === 'undefined') {
        return null;
    }
    try {
        return window.sessionStorage;
    } catch {
        return null;
    }
}

export function markSessionExpiredRedirect(): void {
    const storage = getStorage();
    if (!storage) return;
    try {
        storage.setItem(AUTH_REDIRECT_REASON_KEY, AUTH_REDIRECT_REASON_SESSION_EXPIRED);
    } catch {
        // Quota / SecurityError — the session-expired toast just won't fire
        // on the next /login mount; non-fatal.
    }
}

export function consumeAuthRedirectReason(): string | null {
    const storage = getStorage();
    if (!storage) return null;

    let value: string | null;
    try {
        value = storage.getItem(AUTH_REDIRECT_REASON_KEY);
    } catch {
        return null;
    }
    if (value !== null) {
        try {
            storage.removeItem(AUTH_REDIRECT_REASON_KEY);
        } catch {
            // Best-effort cleanup.
        }
    }

    return value;
}

export function notifySessionExpired(): void {
    if (typeof window === 'undefined' || hasNotifiedSessionExpiry) {
        return;
    }

    hasNotifiedSessionExpiry = true;
    markSessionExpiredRedirect();
    try {
        window.dispatchEvent(new CustomEvent(AUTH_SESSION_EXPIRED_EVENT));
    } catch {
        // Synthetic-event dispatch can fail in very old WebViews; ignore.
    }
}

export function resetSessionExpiredNotification(): void {
    hasNotifiedSessionExpiry = false;
}

export function isSessionExpiredRedirectReason(reason: string | null): boolean {
    return reason === AUTH_REDIRECT_REASON_SESSION_EXPIRED;
}
