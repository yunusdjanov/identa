import type { RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function GoogleMark() {
    return (
        <span
            aria-hidden="true"
            className="grid size-5 shrink-0 place-items-center rounded-full bg-white text-sm font-black text-slate-900 shadow-sm ring-1 ring-slate-200"
        >
            G
        </span>
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
