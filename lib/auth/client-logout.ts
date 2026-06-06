const CLIENT_LOGOUT_STORAGE_KEY = 'identa.clientLogoutStartedAt';
const CLIENT_LOGOUT_TTL_MS = 30_000;

export const CLIENT_LOGOUT_FINISHED_EVENT = 'identa:client-logout-finished';

/**
 * Resolve sessionStorage, defending against the *several* runtime contexts in
 * which `window.sessionStorage` is either unavailable or throws on access:
 *
 *   - SSR pre-hydration (`window` undefined).
 *   - Some incognito + strict-policy combinations (Chrome's "Block all cookies",
 *     Safari ITP, Firefox "Strict" tracking protection on cross-site iframes)
 *     throw `SecurityError` even on the property *getter* — so wrapping
 *     `storage.getItem` alone isn't enough; the `window.sessionStorage`
 *     lookup itself must be guarded.
 *   - Embedded WebViews / sandboxed iframes where the storage quota is zero
 *     and even `setItem` of a 1-byte value throws.
 *
 * Every access goes through this helper so a single try/catch swallows all
 * three. Returning `null` makes every caller fall back to the "logout flag
 * unavailable → assume not in progress" branch — the worst case is the bounce-
 * prevention briefly misfires, which is strictly better than the page crashing
 * out to the 500 boundary. (Pre-hardening, an unguarded `getItem` inside the
 * lazy `useState` initializer on `/login` was throwing in incognito with
 * strict policy, surfacing as "Раздел не открылся" / `/login 500`.)
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

export function markClientLogoutInProgress(): void {
    const storage = getStorage();
    if (!storage) return;
    try {
        storage.setItem(CLIENT_LOGOUT_STORAGE_KEY, String(Date.now()));
    } catch {
        // Quota / SecurityError — the bounce-prevention will silently degrade
        // but logout still navigates via the hard redirect.
    }
}

export function clearClientLogoutInProgress(): void {
    const storage = getStorage();
    if (!storage) return;
    try {
        storage.removeItem(CLIENT_LOGOUT_STORAGE_KEY);
    } catch {
        // Same fall-through as the setter — non-fatal.
    }
    if (typeof window !== 'undefined') {
        try {
            window.dispatchEvent(new Event(CLIENT_LOGOUT_FINISHED_EVENT));
        } catch {
            // Very old WebViews can refuse to dispatch synthetic events;
            // safe to ignore since no listener relies on it for correctness.
        }
    }
}

export function isClientLogoutInProgress(): boolean {
    const storage = getStorage();
    if (!storage) return false;

    let rawStartedAt: string | null;
    try {
        rawStartedAt = storage.getItem(CLIENT_LOGOUT_STORAGE_KEY);
    } catch {
        return false;
    }
    if (!rawStartedAt) return false;

    const startedAt = Number(rawStartedAt);
    if (!Number.isFinite(startedAt) || Date.now() - startedAt > CLIENT_LOGOUT_TTL_MS) {
        try {
            storage.removeItem(CLIENT_LOGOUT_STORAGE_KEY);
        } catch {
            // Best-effort cleanup; nothing else hinges on this succeeding.
        }
        return false;
    }

    return true;
}
