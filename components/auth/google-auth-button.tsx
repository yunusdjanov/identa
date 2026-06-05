import type { RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Official Google "G" mark — multi-color SVG per Google brand guidelines
// (https://developers.google.com/identity/branding-guidelines). Used in
// the disabled / loading fallbacks; the ready state is drawn by Google
// Identity Services itself via `accounts.id.renderButton`, which already
// renders the canonical mark inline.
function GoogleMark() {
    return (
        <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
            className="size-5 shrink-0"
        >
            <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
        </svg>
    );
}

interface GoogleAuthButtonProps {
    mountRef: RefObject<HTMLDivElement | null>;
    isConfigured: boolean;
    isReady: boolean;
    isPending: boolean;
    label: string;
    unavailableLabel: string;
    soonLabel: string;
}

export function GoogleAuthButton({
    mountRef,
    isConfigured,
    isReady,
    isPending,
    label,
    unavailableLabel,
    soonLabel,
}: GoogleAuthButtonProps) {
    if (!isConfigured) {
        return (
            <Button
                type="button"
                variant="outline"
                className="h-10 w-full justify-between gap-3 rounded-full border-slate-300/80 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm shadow-teal-950/5 backdrop-blur transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-100"
                disabled
                aria-label={`${label}. ${unavailableLabel}. ${soonLabel}`}
                title={unavailableLabel}
            >
                <span className="flex min-w-0 items-center gap-3">
                    <GoogleMark />
                    <span className="truncate">{label}</span>
                </span>
                <span className="rounded-full border border-teal-200/80 bg-teal-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-teal-700">
                    {soonLabel}
                </span>
            </Button>
        );
    }

    return (
        <div className="relative min-h-10 w-full overflow-hidden rounded-full">
            <div
                ref={mountRef}
                className={cn('flex min-h-10 justify-center', (!isReady || isPending) && 'pointer-events-none opacity-0')}
                aria-busy={!isReady || isPending}
            />
            {!isReady || isPending ? (
                <Button
                    type="button"
                    variant="outline"
                    className="absolute inset-0 h-10 w-full justify-center gap-3 rounded-full border-slate-300/80 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm shadow-teal-950/5 backdrop-blur disabled:opacity-100"
                    disabled
                >
                    <GoogleMark />
                    <span>{label}</span>
                </Button>
            ) : null}
        </div>
    );
}
