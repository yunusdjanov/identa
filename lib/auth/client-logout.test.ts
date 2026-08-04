import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    CLIENT_LOGOUT_COOKIE_NAME,
    CLIENT_LOGOUT_FINISHED_EVENT,
    clearIdentaSessionStorageForLogout,
    clearClientLogoutInProgress,
    isClientLogoutInProgress,
    markClientLogoutInProgress,
} from '@/lib/auth/client-logout';

describe('client logout marker', () => {
    beforeEach(() => {
        window.sessionStorage.clear();
        document.cookie = `${CLIENT_LOGOUT_COOKIE_NAME}=; Path=/; Max-Age=0`;
        vi.useRealTimers();
    });

    it('marks logout in session storage and a same-site cookie', () => {
        markClientLogoutInProgress();

        expect(isClientLogoutInProgress()).toBe(true);
        expect(document.cookie).toContain(`${CLIENT_LOGOUT_COOKIE_NAME}=1`);
    });

    it('clears every logout marker and notifies mounted login pages', () => {
        const listener = vi.fn();
        window.addEventListener(CLIENT_LOGOUT_FINISHED_EVENT, listener);
        markClientLogoutInProgress();

        clearClientLogoutInProgress();

        expect(isClientLogoutInProgress()).toBe(false);
        expect(document.cookie).not.toContain(`${CLIENT_LOGOUT_COOKIE_NAME}=1`);
        expect(listener).toHaveBeenCalledOnce();
        window.removeEventListener(CLIENT_LOGOUT_FINISHED_EVENT, listener);
    });

    it('clears per-user identa session state but preserves the logout marker', () => {
        window.sessionStorage.setItem('identa.patients.list-state.v1', '{"searchQuery":"Ali"}');
        window.sessionStorage.setItem('identa:temporary-filter', 'patient-123');
        window.sessionStorage.setItem('third-party-key', 'keep');
        markClientLogoutInProgress();

        clearIdentaSessionStorageForLogout();

        expect(window.sessionStorage.getItem('identa.patients.list-state.v1')).toBeNull();
        expect(window.sessionStorage.getItem('identa:temporary-filter')).toBeNull();
        expect(window.sessionStorage.getItem('third-party-key')).toBe('keep');
        expect(isClientLogoutInProgress()).toBe(true);
    });
});
