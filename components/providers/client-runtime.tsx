'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';

const RuntimeToaster = dynamic(
    () => import('@/components/ui/sonner').then((module) => module.Toaster),
    { ssr: false }
);

const RuntimeAnalytics = dynamic(
    () => import('@vercel/analytics/next').then((module) => module.Analytics),
    { ssr: false }
);

const RuntimeSpeedInsights = dynamic(
    () => import('@vercel/speed-insights/next').then((module) => module.SpeedInsights),
    { ssr: false }
);

const enableVercelTelemetry = process.env.NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS === 'true';
const STALE_RUNTIME_RELOAD_KEY = 'identa.staleRuntimeReloadedAt';
const STALE_RUNTIME_RELOAD_WINDOW_MS = 30_000;
const AUTH_ENTRY_PATHS = new Set(['/login', '/register', '/forgot-password', '/reset-password', '/admin/login']);

function getErrorText(value: unknown): string {
    if (typeof value === 'string') {
        return value;
    }
    if (value instanceof Error) {
        return `${value.name} ${value.message}`;
    }
    if (value && typeof value === 'object' && 'message' in value) {
        return String((value as { message?: unknown }).message ?? '');
    }

    return '';
}

export function isStaleRuntimeError(value: unknown): boolean {
    const text = getErrorText(value).toLowerCase();

    return text.includes('chunkloaderror')
        || text.includes('loading chunk')
        || text.includes('failed to fetch dynamically imported module')
        || text.includes('importing a module script failed')
        || text.includes('failed to load script')
        || text.includes('module script load failed');
}

export function shouldRecoverAuthEntryError(pathname: string, bodyText: string): boolean {
    return AUTH_ENTRY_PATHS.has(pathname)
        && bodyText.includes("This page couldn")
        && bodyText.includes('Reload to try again');
}

function isNextStaticAsset(url: string | undefined): boolean {
    return Boolean(url && url.includes('/_next/static/'));
}

function hardReloadOnce(): void {
    try {
        const previousReloadAt = Number(window.sessionStorage.getItem(STALE_RUNTIME_RELOAD_KEY));
        if (Number.isFinite(previousReloadAt) && Date.now() - previousReloadAt < STALE_RUNTIME_RELOAD_WINDOW_MS) {
            return;
        }
        window.sessionStorage.setItem(STALE_RUNTIME_RELOAD_KEY, String(Date.now()));
    } catch {
        // If storage is blocked, prefer a single best-effort reload over
        // leaving an old tab stuck on Next's runtime fallback.
    }

    window.location.reload();
}

function installStaleRuntimeRecovery(): () => void {
    const recoverFromAuthEntryFallback = () => {
        if (shouldRecoverAuthEntryError(window.location.pathname, document.body.innerText)) {
            hardReloadOnce();
        }
    };

    const handleError = (event: ErrorEvent) => {
        const target = event.target as HTMLScriptElement | HTMLLinkElement | null;
        const failedAssetUrl = target instanceof HTMLScriptElement
            ? target.src
            : target instanceof HTMLLinkElement
                ? target.href
                : undefined;

        if (isNextStaticAsset(failedAssetUrl) || isStaleRuntimeError(event.error) || isStaleRuntimeError(event.message)) {
            hardReloadOnce();
        }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
        if (isStaleRuntimeError(event.reason)) {
            hardReloadOnce();
        }
    };

    window.addEventListener('error', handleError, true);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    const authEntryFallbackTimer = window.setTimeout(recoverFromAuthEntryFallback, 600);

    return () => {
        window.removeEventListener('error', handleError, true);
        window.removeEventListener('unhandledrejection', handleUnhandledRejection);
        window.clearTimeout(authEntryFallbackTimer);
    };
}

export function ClientRuntime() {
    useEffect(() => installStaleRuntimeRecovery(), []);

    return (
        <>
            <RuntimeToaster />
            {enableVercelTelemetry ? (
                <>
                    <RuntimeAnalytics />
                    <RuntimeSpeedInsights />
                </>
            ) : null}
        </>
    );
}
