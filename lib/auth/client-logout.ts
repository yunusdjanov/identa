const CLIENT_LOGOUT_STORAGE_KEY = 'identa.clientLogoutStartedAt';
const CLIENT_LOGOUT_TTL_MS = 30_000;

export const CLIENT_LOGOUT_COOKIE_NAME = 'identa_client_logout';
export const CLIENT_LOGOUT_FINISHED_EVENT = 'identa:client-logout-finished';

function getLogoutCookieAttributes(maxAgeSeconds: number): string {
    const secure = typeof window !== 'undefined' && window.location.protocol === 'https:'
        ? '; Secure'
        : '';

    return `Path=/; Max-Age=${maxAgeSeconds}; SameSite=Strict${secure}`;
}

function setClientLogoutCookie(): void {
    if (typeof document === 'undefined') return;
    try {
        document.cookie = `${CLIENT_LOGOUT_COOKIE_NAME}=1; ${getLogoutCookieAttributes(
            CLIENT_LOGOUT_TTL_MS / 1000
        )}`;
    } catch {
        // Session storage remains the client-side fallback.
    }
}

function clearClientLogoutCookie(): void {
    if (typeof document === 'undefined') return;
    try {
        document.cookie = `${CLIENT_LOGOUT_COOKIE_NAME}=; ${getLogoutCookieAttributes(0)}`;
    } catch {
        // Best-effort cleanup; the cookie also expires after 30 seconds.
    }
}

function hasClientLogoutCookie(): boolean {
    if (typeof document === 'undefined') return false;
    try {
        return document.cookie
            .split(';')
            .some((cookie) => cookie.trim() === `${CLIENT_LOGOUT_COOKIE_NAME}=1`);
    } catch {
        return false;
    }
}

/**
 * Session storage can be unavailable in SSR, strict private mode, and
 * sandboxed WebViews. All callers degrade to the same-site cookie marker.
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

/**
 * Remove per-user tab state while preserving the short-lived marker that
 * prevents `/login` from racing a still-valid server session during logout.
 */
export function clearIdentaSessionStorageForLogout(): void {
    const storage = getStorage();
    if (!storage) return;

    try {
        const keysToRemove: string[] = [];
        for (let index = 0; index < storage.length; index += 1) {
            const key = storage.key(index);
            if (
                key
                && key !== CLIENT_LOGOUT_STORAGE_KEY
                && (key.startsWith('identa.') || key.startsWith('identa:'))
            ) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach((key) => storage.removeItem(key));
    } catch {
        // Strict private mode may reject storage enumeration/removal.
    }
}

export function markClientLogoutInProgress(): void {
    const storage = getStorage();
    if (storage) {
        try {
            storage.setItem(CLIENT_LOGOUT_STORAGE_KEY, String(Date.now()));
        } catch {
            // The cookie marker still protects the server-side redirect.
        }
    }
    setClientLogoutCookie();
}

export function clearClientLogoutInProgress(): void {
    const storage = getStorage();
    if (storage) {
        try {
            storage.removeItem(CLIENT_LOGOUT_STORAGE_KEY);
        } catch {
            // Same fall-through as the setter; non-fatal.
        }
    }
    clearClientLogoutCookie();

    if (typeof window !== 'undefined') {
        try {
            window.dispatchEvent(new Event(CLIENT_LOGOUT_FINISHED_EVENT));
        } catch {
            // Very old WebViews may refuse synthetic events; no listener
            // relies on this notification for correctness.
        }
    }
}

export function isClientLogoutInProgress(): boolean {
    const storage = getStorage();
    if (!storage) return hasClientLogoutCookie();

    let rawStartedAt: string | null;
    try {
        rawStartedAt = storage.getItem(CLIENT_LOGOUT_STORAGE_KEY);
    } catch {
        return hasClientLogoutCookie();
    }
    if (!rawStartedAt) return hasClientLogoutCookie();

    const startedAt = Number(rawStartedAt);
    if (!Number.isFinite(startedAt) || Date.now() - startedAt > CLIENT_LOGOUT_TTL_MS) {
        try {
            storage.removeItem(CLIENT_LOGOUT_STORAGE_KEY);
        } catch {
            // Best-effort cleanup; the cookie fallback remains bounded by TTL.
        }
        return hasClientLogoutCookie();
    }

    return true;
}
