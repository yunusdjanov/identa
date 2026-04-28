const CLIENT_LOGOUT_STORAGE_KEY = 'identa.clientLogoutStartedAt';
const CLIENT_LOGOUT_TTL_MS = 30_000;

export const CLIENT_LOGOUT_FINISHED_EVENT = 'identa:client-logout-finished';

function getStorage() {
    if (typeof window === 'undefined') {
        return null;
    }

    return window.sessionStorage;
}

export function markClientLogoutInProgress() {
    const storage = getStorage();
    if (!storage) {
        return;
    }

    storage.setItem(CLIENT_LOGOUT_STORAGE_KEY, String(Date.now()));
}

export function clearClientLogoutInProgress() {
    const storage = getStorage();
    if (!storage) {
        return;
    }

    storage.removeItem(CLIENT_LOGOUT_STORAGE_KEY);
    window.dispatchEvent(new Event(CLIENT_LOGOUT_FINISHED_EVENT));
}

export function isClientLogoutInProgress() {
    const storage = getStorage();
    if (!storage) {
        return false;
    }

    const rawStartedAt = storage.getItem(CLIENT_LOGOUT_STORAGE_KEY);
    if (!rawStartedAt) {
        return false;
    }

    const startedAt = Number(rawStartedAt);
    if (!Number.isFinite(startedAt) || Date.now() - startedAt > CLIENT_LOGOUT_TTL_MS) {
        storage.removeItem(CLIENT_LOGOUT_STORAGE_KEY);
        return false;
    }

    return true;
}
