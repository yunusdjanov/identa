export const AUTH_SESSION_EXPIRED_EVENT = 'identa:auth-session-expired';
const AUTH_REDIRECT_REASON_KEY = 'identa.auth.redirect-reason';
const AUTH_REDIRECT_REASON_SESSION_EXPIRED = 'session-expired';

let hasNotifiedSessionExpiry = false;

export function markSessionExpiredRedirect(): void {
    if (typeof window === 'undefined') {
        return;
    }

    window.sessionStorage.setItem(AUTH_REDIRECT_REASON_KEY, AUTH_REDIRECT_REASON_SESSION_EXPIRED);
}

export function consumeAuthRedirectReason(): string | null {
    if (typeof window === 'undefined') {
        return null;
    }

    const value = window.sessionStorage.getItem(AUTH_REDIRECT_REASON_KEY);
    if (value !== null) {
        window.sessionStorage.removeItem(AUTH_REDIRECT_REASON_KEY);
    }

    return value;
}

export function notifySessionExpired(): void {
    if (typeof window === 'undefined' || hasNotifiedSessionExpiry) {
        return;
    }

    hasNotifiedSessionExpiry = true;
    markSessionExpiredRedirect();
    window.dispatchEvent(new CustomEvent(AUTH_SESSION_EXPIRED_EVENT));
}

export function resetSessionExpiredNotification(): void {
    hasNotifiedSessionExpiry = false;
}

export function isSessionExpiredRedirectReason(reason: string | null): boolean {
    return reason === AUTH_REDIRECT_REASON_SESSION_EXPIRED;
}
