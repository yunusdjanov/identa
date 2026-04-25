import axios from 'axios';
import type { AppLocale } from '@/lib/i18n/config';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';
import { LOCALE_COOKIE_NAME } from '@/lib/i18n/config';
import { notifySessionExpired } from '@/lib/auth/session-expiry';

const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8001/api';
const normalizedApiUrl = configuredApiUrl.replace(/\/+$/, '');
const apiRootUrl = normalizedApiUrl.endsWith('/api')
    ? normalizedApiUrl
    : `${normalizedApiUrl}/api`;

function isLoopbackHost(hostname: string): boolean {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

function alignLoopbackHost(url: string): string {
    if (typeof window === 'undefined') {
        return url;
    }

    try {
        const parsed = new URL(url);
        const runtimeHost = window.location.hostname;

        if (isLoopbackHost(parsed.hostname) && isLoopbackHost(runtimeHost) && parsed.hostname !== runtimeHost) {
            parsed.hostname = runtimeHost;
        }

        return parsed.toString().replace(/\/+$/, '');
    }
    catch {
        return url;
    }
}

function resolveApiRootUrl(): string {
    return alignLoopbackHost(apiRootUrl);
}

export const apiClient = axios.create({
    baseURL: `${apiRootUrl}/v1`,
    withCredentials: true,
    withXSRFToken: true,
    headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
    },
});

function isSessionExpiredStatus(status: number | undefined): boolean {
    return status === 401 || status === 419;
}

function shouldBroadcastSessionExpiry(path: string | undefined): boolean {
    if (!path) {
        return true;
    }

    return !path.includes('/auth/login')
        && !path.includes('/auth/forgot-password')
        && !path.includes('/auth/reset-password');
}

function handleAuthExpiry(status: number | undefined, path?: string): void {
    if (typeof window === 'undefined') {
        return;
    }

    if (isSessionExpiredStatus(status) && shouldBroadcastSessionExpiry(path)) {
        notifySessionExpired();
    }
}

function getXsrfTokenFromCookie(): string | null {
    if (typeof document === 'undefined') {
        return null;
    }

    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    if (!match) {
        return null;
    }

    try {
        return decodeURIComponent(match[1]);
    }
    catch {
        return null;
    }
}

function getCookieValue(name: string): string | null {
    if (typeof document === 'undefined') {
        return null;
    }

    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escapedName}=([^;]+)`));
    if (!match) {
        return null;
    }

    try {
        return decodeURIComponent(match[1]);
    }
    catch {
        return null;
    }
}

function normalizeLocale(value: string | null | undefined): string | null {
    if (!value) {
        return null;
    }

    const normalized = value.trim().toLowerCase().replace('_', '-');
    if (normalized === '') {
        return null;
    }

    const primaryLocale = normalized.split('-')[0];
    if (primaryLocale === 'ru' || primaryLocale === 'uz' || primaryLocale === 'en') {
        return primaryLocale;
    }

    return null;
}

function resolveApiLocale(): string | null {
    const fromCookie = normalizeLocale(getCookieValue(LOCALE_COOKIE_NAME));
    if (fromCookie !== null) {
        return fromCookie;
    }

    if (typeof document !== 'undefined') {
        const fromDocument = normalizeLocale(document.documentElement.lang);
        if (fromDocument !== null) {
            return fromDocument;
        }
    }

    return null;
}

function getResolvedLocale(): AppLocale {
    const locale = resolveApiLocale();
    if (locale === 'ru' || locale === 'uz' || locale === 'en') {
        return locale;
    }

    return 'en';
}

function getLocalizedClientMessage(key: string, fallback: string): string {
    const locale = getResolvedLocale();
    return DICTIONARIES[locale]?.[key] ?? DICTIONARIES.en[key] ?? fallback;
}

function looksLikeTranslationKey(value: string | null | undefined): boolean {
    if (!value) {
        return false;
    }

    return /^[a-z0-9_]+(?:\.[a-z0-9_]+)+$/i.test(value.trim());
}

function isGenericNetworkMessage(value: string | null | undefined): boolean {
    if (!value) {
        return false;
    }

    const normalized = value.trim().toLowerCase();
    return normalized === 'network error'
        || normalized === 'failed to fetch'
        || normalized === 'load failed'
        || normalized === 'fetch failed'
        || normalized === 'network request failed';
}

function isGenericAxiosWrapperMessage(value: string | null | undefined): boolean {
    if (!value) {
        return false;
    }

    const normalized = value.trim().toLowerCase();
    return normalized === 'request failed'
        || normalized.startsWith('request failed with status code ');
}

function isGenericValidationMessage(value: string | null | undefined): boolean {
    if (!value) {
        return false;
    }

    const normalized = value.trim().toLowerCase();
    return normalized === 'the given data was invalid.'
        || normalized === 'the given data was invalid';
}

function looksLikeMojibakeMessage(value: string | null | undefined): boolean {
    if (!value) {
        return false;
    }

    const mojibakeMarkers = [
        'Рў',
        'РЈ',
        'Рќ',
        'Р’',
        'Р°',
        'Р±',
        'Рґ',
        'Рµ',
        'Рё',
        'Р»',
        'РЅ',
        'Рї',
        'Рѕ',
        'РС',
        'СЃ',
        'С‚',
        'СЊ',
        'С€',
        'С‹',
        'Ð',
        'Ñ',
        'вЂ',
        '�',
    ];

    return mojibakeMarkers.some((marker) => value.includes(marker));
}

export function getDisplayableApiMessage(
    value: string | null | undefined,
    fallback = ''
): string {
    const trimmed = value?.trim();
    if (
        !trimmed
        || looksLikeTranslationKey(trimmed)
        || looksLikeMojibakeMessage(trimmed)
        || isGenericAxiosWrapperMessage(trimmed)
        || isGenericValidationMessage(trimmed)
    ) {
        return fallback;
    }

    return trimmed;
}

apiClient.interceptors.request.use((config) => {
    if (typeof window !== 'undefined') {
        config.baseURL = `${resolveApiRootUrl()}/v1`;
    }

    const locale = resolveApiLocale();
    if (locale !== null) {
        config.headers = config.headers ?? {};
        config.headers['X-Locale'] = locale;
    }

    const method = config.method?.toLowerCase();
    const isMutatingMethod = method === 'post' || method === 'put' || method === 'patch' || method === 'delete';

    if (isMutatingMethod) {
        const token = csrfToken ?? getXsrfTokenFromCookie();
        if (token) {
            config.headers = config.headers ?? {};
            config.headers['X-CSRF-TOKEN'] = token;
        }
    }

    return config;
});

apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (axios.isAxiosError(error)) {
            handleAuthExpiry(error.response?.status, error.config?.url);
        }

        return Promise.reject(error);
    }
);

let csrfCookiePromise: Promise<void> | null = null;
let csrfCookieEnsured = false;
let csrfToken: string | null = null;

export function invalidateCsrfCookie(): void {
    csrfCookieEnsured = false;
    csrfToken = null;
}

export async function ensureCsrfCookie(options?: { force?: boolean }): Promise<void> {
    const force = options?.force ?? false;

    // If a previous call already ensured CSRF and we were not explicitly invalidated,
    // avoid extra round-trips.
    if (!force && csrfCookieEnsured) {
        return;
    }

    if (!csrfCookiePromise) {
        csrfCookiePromise = axios
            .get<{ token?: string }>(`${resolveApiRootUrl()}/v1/auth/csrf-token`, {
                withCredentials: true,
                headers: {
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
            })
            .then(({ data }) => {
                csrfToken = typeof data?.token === 'string' && data.token !== '' ? data.token : null;
                csrfCookieEnsured = true;
            })
            .finally(() => {
                csrfCookiePromise = null;
            });
    }

    await csrfCookiePromise;
}

export async function withCsrfRetry<T>(operation: () => Promise<T>): Promise<T> {
    await ensureCsrfCookie();

    try {
        return await operation();
    }
    catch (error) {
        if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 419)) {
            invalidateCsrfCookie();
            await ensureCsrfCookie({ force: true });
            try {
                return await operation();
            }
            catch (retryError) {
                if (axios.isAxiosError(retryError)) {
                    handleAuthExpiry(retryError.response?.status, retryError.config?.url);
                }

                throw retryError;
            }
        }

        throw error;
    }
}

export async function apiMutationRequest<TResponse>(
    path: string,
    options: {
        method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
        body?: unknown;
    }
): Promise<TResponse> {
    const token = csrfToken ?? getXsrfTokenFromCookie();
    const locale = resolveApiLocale();
    const response = await fetch(`${resolveApiRootUrl()}/v1${path}`, {
        method: options.method,
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            ...(locale ? { 'X-Locale': locale } : {}),
            ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { 'X-CSRF-TOKEN': token } : {}),
        },
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });

    const responseText = await response.text();
    let parsedBody: TResponse | { message?: string } | undefined;

    if (responseText) {
        try {
            parsedBody = JSON.parse(responseText) as TResponse | { message?: string };
        }
        catch {
            parsedBody = undefined;
        }
    }

    if (!response.ok) {
        handleAuthExpiry(response.status, path);
        const message =
            (parsedBody as { message?: string } | undefined)?.message
            ?? (responseText || undefined)
            ?? `Request failed with status ${response.status}.`;
        throw new Error(message);
    }

    return (parsedBody ?? ({} as TResponse)) as TResponse;
}

export function getApiErrorMessage(error: unknown, fallback = 'Request failed.'): string {
    if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const responseData = error.response?.data as
            | { message?: string; errors?: Record<string, string[]>; error?: { code?: string; message?: string } }
            | undefined;

        const firstValidationError = responseData?.errors
            ? Object.values(responseData.errors)[0]?.[0]
            : undefined;
        const nestedErrorCode = responseData?.error?.code;
        const nestedErrorMessage = responseData?.error?.message;

        if (isSessionExpiredStatus(status)) {
            return getLocalizedClientMessage('errors.sessionExpired', fallback);
        }

        if (nestedErrorCode === 'forbidden') {
            return getLocalizedClientMessage('errors.forbidden', fallback);
        }

        if (nestedErrorCode === 'account_inactive') {
            return getLocalizedClientMessage('errors.accountInactive', fallback);
        }

        if (nestedErrorCode === 'unauthorized') {
            return getLocalizedClientMessage('errors.unauthorized', fallback);
        }

        const displayableValidationError = getDisplayableApiMessage(firstValidationError);
        if (displayableValidationError) {
            return displayableValidationError;
        }

        if (!error.response || isGenericNetworkMessage(error.message)) {
            return getLocalizedClientMessage('errors.network', fallback);
        }

        if (status !== undefined && status >= 500) {
            return getLocalizedClientMessage('errors.server', fallback);
        }

        const displayableResponseMessage = getDisplayableApiMessage(responseData?.message);
        if (displayableResponseMessage) {
            return displayableResponseMessage;
        }

        const displayableNestedErrorMessage = getDisplayableApiMessage(nestedErrorMessage);
        if (displayableNestedErrorMessage) {
            return displayableNestedErrorMessage;
        }

        if (
            error.message
            && getDisplayableApiMessage(error.message)
            && !isGenericNetworkMessage(error.message)
            && !isGenericAxiosWrapperMessage(error.message)
        ) {
            return error.message;
        }

        return fallback;
    }

    if (error instanceof Error) {
        if (isGenericNetworkMessage(error.message)) {
            return getLocalizedClientMessage('errors.network', fallback);
        }

        return getDisplayableApiMessage(error.message, fallback);
    }

    return fallback;
}
