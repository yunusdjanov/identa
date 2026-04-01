import { AxiosError } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiMutationRequest, getApiErrorMessage } from '@/lib/api/client';
import {
    AUTH_SESSION_EXPIRED_EVENT,
    consumeAuthRedirectReason,
    resetSessionExpiredNotification,
} from '@/lib/auth/session-expiry';

const originalFetch = global.fetch;

afterEach(() => {
    global.fetch = originalFetch;
    window.sessionStorage.clear();
    resetSessionExpiredNotification();
});

describe('getApiErrorMessage', () => {
    it('returns first validation error when present', () => {
        const error = new AxiosError(
            'Request failed',
            '422',
            undefined,
            undefined,
            {
                data: {
                    message: 'Validation failed.',
                    errors: {
                        email: ['Email is invalid.'],
                        password: ['Password is required.'],
                    },
                },
                status: 422,
                statusText: 'Unprocessable Entity',
                headers: {},
                config: {} as never,
            }
        );

        expect(getApiErrorMessage(error, 'Fallback')).toBe('Email is invalid.');
    });

    it('falls back to backend message then error message', () => {
        const responseMessageError = new AxiosError(
            'Request failed',
            '400',
            undefined,
            undefined,
            {
                data: {
                    message: 'Bad request payload.',
                },
                status: 400,
                statusText: 'Bad Request',
                headers: {},
                config: {} as never,
            }
        );

        expect(getApiErrorMessage(responseMessageError, 'Fallback')).toBe('Bad request payload.');

        const plainAxiosError = new AxiosError('Network down');
        expect(getApiErrorMessage(plainAxiosError, 'Fallback')).toBe(
            'Connection problem. Check your network and try again.'
        );
    });

    it('reads nested backend error payloads', () => {
        const nestedErrorMessage = new AxiosError(
            'Request failed',
            '403',
            undefined,
            undefined,
            {
                data: {
                    error: {
                        message: 'Localized forbidden message.',
                    },
                },
                status: 403,
                statusText: 'Forbidden',
                headers: {},
                config: {} as never,
            }
        );

        expect(getApiErrorMessage(nestedErrorMessage, 'Fallback')).toBe('Localized forbidden message.');
    });

    it('maps structured backend permission codes to localized frontend messages', () => {
        const forbiddenError = new AxiosError(
            'Request failed',
            '403',
            undefined,
            undefined,
            {
                data: {
                    error: {
                        code: 'forbidden',
                        message: 'api.auth.forbidden',
                    },
                },
                status: 403,
                statusText: 'Forbidden',
                headers: {},
                config: {} as never,
            }
        );

        expect(getApiErrorMessage(forbiddenError, 'Fallback')).toBe('You do not have permission to perform this action.');
    });

    it('handles generic and unknown errors', () => {
        expect(getApiErrorMessage(new Error('Boom'), 'Fallback')).toBe('Boom');
        expect(getApiErrorMessage('not-an-error', 'Fallback')).toBe('Fallback');
    });

    it('uses the fallback for expired sessions instead of exposing raw auth messages', () => {
        const error = new AxiosError(
            'Request failed',
            '401',
            undefined,
            undefined,
            {
                data: {
                    message: 'auth.unauthenticated',
                },
                status: 401,
                statusText: 'Unauthorized',
                headers: {},
                config: {} as never,
            }
        );

        expect(getApiErrorMessage(error, 'Session expired fallback')).toBe('Your session expired. Please sign in again.');
    });

    it('falls back for raw backend translation keys and generic network messages', () => {
        const rawKeyError = new AxiosError(
            'Request failed',
            '400',
            undefined,
            undefined,
            {
                data: {
                    message: 'api.unknown.error_key',
                },
                status: 400,
                statusText: 'Bad Request',
                headers: {},
                config: {} as never,
            }
        );

        expect(getApiErrorMessage(rawKeyError, 'Friendly fallback')).toBe('Friendly fallback');
        expect(getApiErrorMessage(new AxiosError('Network Error'), 'Friendly fallback')).toBe(
            'Connection problem. Check your network and try again.'
        );
    });

    it('returns a localized generic server message for 5xx responses', () => {
        const error = new AxiosError(
            'Request failed',
            '500',
            undefined,
            undefined,
            {
                data: {
                    message: 'Internal Server Error',
                },
                status: 500,
                statusText: 'Server Error',
                headers: {},
                config: {} as never,
            }
        );

        expect(getApiErrorMessage(error, 'Friendly fallback')).toBe('Server error. Please try again later.');
    });
});

describe('apiMutationRequest', () => {
    it('throws a safe message for non-JSON error responses', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            text: async () => 'Internal Server Error',
        }) as typeof fetch;

        await expect(
            apiMutationRequest('/test', {
                method: 'POST',
                body: { key: 'value' },
            })
        ).rejects.toThrow('Internal Server Error');
    });

    it('returns an empty payload for malformed non-empty success responses', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            text: async () => 'not-json',
        }) as typeof fetch;

        await expect(
            apiMutationRequest('/test', {
                method: 'PATCH',
                body: { key: 'value' },
            })
        ).resolves.toEqual({});
    });

    it('broadcasts session expiry for 401 responses', async () => {
        const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
            text: async () => JSON.stringify({ message: 'auth.unauthenticated' }),
        }) as typeof fetch;

        await expect(
            apiMutationRequest('/protected', {
                method: 'POST',
            })
        ).rejects.toThrow('auth.unauthenticated');

        expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: AUTH_SESSION_EXPIRED_EVENT }));
        expect(consumeAuthRedirectReason()).toBe('session-expired');
    });
});
