import axios from 'axios';
import type { AppLocale } from '@/lib/i18n/config';
import { LOCALE_COOKIE_NAME } from '@/lib/i18n/config';
import { notifySessionExpired } from '@/lib/auth/session-expiry';

const CLIENT_ERROR_MESSAGES: Record<AppLocale, Record<string, string>> = {
    ru: {
        'errors.sessionExpired': 'Сессия истекла. Войдите снова.',
        'errors.forbidden': 'У вас нет доступа к этому действию.',
        'errors.accountInactive': 'Ваш аккаунт неактивен. Обратитесь к администратору.',
        'errors.unauthorized': 'Не удалось выполнить действие. Войдите снова.',
        'errors.rateLimited': 'Слишком много попыток. Подождите немного и попробуйте снова.',
        'errors.network': 'Проблема с подключением. Проверьте сеть и повторите попытку.',
        'errors.server': 'Ошибка сервера. Повторите попытку позже.',
    },
    uz: {
        'errors.sessionExpired': 'Sessiya tugadi. Qayta kiring.',
        'errors.forbidden': 'Bu amalni bajarish uchun ruxsat yo‘q.',
        'errors.accountInactive': "Akkauntingiz faol emas. Administrator bilan bog'laning.",
        'errors.unauthorized': 'Amalni bajarib bo‘lmadi. Qayta kiring.',
        'errors.rateLimited': "Juda ko'p urinish bo'ldi. Biroz kutib, qayta urinib ko'ring.",
        'errors.network': "Ulanish bilan muammo. Tarmoqni tekshirib, qayta urinib ko'ring.",
        'errors.server': 'Server xatosi. Keyinroq qayta urinib ko‘ring.',
    },
    en: {
        'errors.sessionExpired': 'Your session expired. Please sign in again.',
        'errors.forbidden': 'You do not have permission to perform this action.',
        'errors.accountInactive': 'Your account is inactive. Please contact support.',
        'errors.unauthorized': 'Unable to complete this action. Please sign in again.',
        'errors.subscription_read_only': 'Your plan has expired. Renew your plan to make changes.',
        'errors.plan_staff_limit_reached': 'Your current plan staff limit has been reached.',
        'errors.plan_entry_image_limit_reached': 'This entry has reached the image limit for your plan.',
        'errors.plan_upload_size_exceeded': 'This file is larger than your current plan allows.',
        'errors.plan_feature_not_available': 'This feature is not available on your current plan.',
        'errors.rateLimited': 'Too many attempts. Please wait a moment and try again.',
        'errors.network': 'Connection problem. Check your network and try again.',
        'errors.server': 'Server error. Please try again later.',
    },
};

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

    // Skip session-expiry broadcast for paths where a 401 is expected
    // and self-handled (login / reset flows) OR where the request is
    // explicitly tearing down the session and the broadcast would
    // mistakenly fire AFTER a fresh login already completed. The
    // `/auth/logout` exclusion closes the race documented in Phase 1
    // M5: rapid logout → re-login could see the in-flight logout's
    // 401 response notify session-expired AFTER the new login set its
    // own state, kicking the user back to /login.
    return !path.includes('/auth/login')
        && !path.includes('/auth/logout')
        && !path.includes('/auth/forgot-password')
        && !path.includes('/auth/reset-password')
        && !path.includes('/auth/me');
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
    return CLIENT_ERROR_MESSAGES[locale]?.[key] ?? CLIENT_ERROR_MESSAGES.en[key] ?? fallback;
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

const SKIP_AUTH_EXPIRY_BROADCAST_CONFIG_KEY = '__identaSkipAuthExpiryBroadcast';

let suppressAuthExpiryBroadcastDepth = 0;

function shouldSkipAuthExpiryBroadcast(config: unknown): boolean {
    return Boolean(
        config
        && typeof config === 'object'
        && (config as Record<string, unknown>)[SKIP_AUTH_EXPIRY_BROADCAST_CONFIG_KEY] === true
    );
}

apiClient.interceptors.request.use((config) => {
    if (typeof window !== 'undefined') {
        config.baseURL = `${resolveApiRootUrl()}/v1`;
    }

    if (suppressAuthExpiryBroadcastDepth > 0) {
        (config as unknown as Record<string, unknown>)[SKIP_AUTH_EXPIRY_BROADCAST_CONFIG_KEY] = true;
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
            if (!shouldSkipAuthExpiryBroadcast(error.config)) {
                handleAuthExpiry(error.response?.status, error.config?.url ?? error.response?.config?.url);
            }

            // When the backend returns 403 with code `subscription_read_only`
            // (admin revoked, refund cascade, sub expired mid-session), notify
            // the QueryClient so it can refresh auth/me + billing queries and
            // the UI flips from "full access" to read-only without a manual
            // reload. The handler is registered in QueryProvider.
            if (error.response?.status === 403) {
                const code = readNestedErrorCode(error.response?.data);
                if (code === 'subscription_read_only') {
                    // Dynamic import keeps this file independent of the React
                    // tree during SSR — the handler list is a module-level Set
                    // and is harmless to call before the provider mounts.
                    void import('@/lib/auth/subscription-access').then(({ notifySubscriptionAccessRevoked }) => {
                        notifySubscriptionAccessRevoked();
                    });
                }
            }

            // Forward 5xx + network failures to Sentry. Backend-side Sentry
            // sees only Laravel exceptions; if the failure happens at the
            // CDN / proxy / DNS layer the only signal is on the client. We
            // skip auth/csrf paths (those throw normally during session
            // expiry) and 4xx (those are user-error, not infra). Use
            // dynamic import so SSR/build doesn't pull in the SDK.
            const status = error.response?.status;
            const isInfraFailure = status === undefined
                || status === 0
                || (status >= 500 && status < 600);
            const urlPath = error.config?.url ?? '';
            const isAuthChurn = typeof urlPath === 'string'
                && (urlPath.includes('/auth/login')
                    || urlPath.includes('/auth/csrf-token')
                    || urlPath.includes('/auth/me'));
            if (isInfraFailure && !isAuthChurn && typeof window !== 'undefined') {
                void import('@sentry/nextjs').then((Sentry) => {
                    Sentry.captureException(error, {
                        tags: {
                            source: 'axios-interceptor',
                            status: String(status ?? 'network-error'),
                        },
                        extra: {
                            url: urlPath,
                            method: error.config?.method,
                        },
                    });
                }).catch(() => {
                    // Sentry not configured — swallow, no fallback needed.
                });
            }
        }

        return Promise.reject(error);
    }
);

function readNestedErrorCode(data: unknown): string | null {
    if (!data || typeof data !== 'object') return null;
    const record = data as Record<string, unknown>;
    const error = record.error;
    if (error && typeof error === 'object' && 'code' in error) {
        const code = (error as Record<string, unknown>).code;
        return typeof code === 'string' ? code : null;
    }
    return null;
}

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
        suppressAuthExpiryBroadcastDepth += 1;
        try {
            return await operation();
        } finally {
            suppressAuthExpiryBroadcastDepth = Math.max(0, suppressAuthExpiryBroadcastDepth - 1);
        }
    }
    catch (error) {
        if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 419)) {
            invalidateCsrfCookie();
            await ensureCsrfCookie({ force: true });
            try {
                const result = await operation();
                // The first attempt's 401/419 already triggered the
                // response interceptor's `handleAuthExpiry` which set the
                // session-expired notification flag. Now that the retry
                // succeeded, the session is actually fine — reset the
                // flag so the next route navigation doesn't redirect
                // the user to /login (Phase 1 H4 fix).
                const { resetSessionExpiredNotification } = await import('@/lib/auth/session-expiry');
                resetSessionExpiredNotification();
                return result;
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
    // Refresh CSRF cookie ONLY when no token is available. The common
    // case (token cached in memory or in cookie) skips the extra HTTP
    // round-trip. Phase 1 M4: logout + long-idle sessions sometimes
    // hit this path with both the in-memory `csrfToken` cache cleared
    // AND the XSRF-TOKEN cookie expired — without the fetch the POST
    // goes without `X-CSRF-TOKEN`, backend 419s, and the flow gets
    // bumped to /login awkwardly. Swallow CSRF-cookie fetch failures
    // (network errors during tests or offline) so the mutation can
    // still proceed and receive the real backend response.
    let token = csrfToken ?? getXsrfTokenFromCookie();
    if (token === null) {
        try {
            await ensureCsrfCookie();
        } catch {
            // Best-effort refresh — let the request go without CSRF if
            // the cookie endpoint is unreachable. Real backend will
            // 419 and the caller / interceptor handles it.
        }
        token = csrfToken ?? getXsrfTokenFromCookie();
    }
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
    let parsedBody: TResponse | { message?: string; error?: { message?: string } } | undefined;

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
            (parsedBody as { message?: string; error?: { message?: string } } | undefined)?.message
            ?? (parsedBody as { error?: { message?: string } } | undefined)?.error?.message
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

        if (status === 429) {
            return getLocalizedClientMessage('errors.rateLimited', fallback);
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

        if (
            nestedErrorCode === 'subscription_read_only'
            || nestedErrorCode === 'plan_staff_limit_reached'
            || nestedErrorCode === 'plan_entry_image_limit_reached'
            || nestedErrorCode === 'plan_upload_size_exceeded'
            || nestedErrorCode === 'plan_feature_not_available'
        ) {
            return getLocalizedClientMessage(`errors.${nestedErrorCode}`, fallback);
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
        if (/too many attempts/i.test(error.message)) {
            return getLocalizedClientMessage('errors.rateLimited', fallback);
        }

        if (isGenericNetworkMessage(error.message)) {
            return getLocalizedClientMessage('errors.network', fallback);
        }

        return getDisplayableApiMessage(error.message, fallback);
    }

    return fallback;
}
