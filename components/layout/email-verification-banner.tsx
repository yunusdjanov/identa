'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { MailWarning } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getCurrentUser, resendEmailVerification } from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import { useI18n } from '@/components/providers/i18n-provider';

/**
 * Email-verification notice shown on the settings/recovery surface that
 * remains available while protected application routes are blocked.
 *
 * Spam control: after a successful resend, the button is locked behind a
 * 60-second countdown that survives refreshes via localStorage. This is the
 * client-side mirror of the backend `throttle:6,1` rate limit on
 * `/auth/email/verification-notification` — without it, a user who hammers
 * the button hits a confusing 429 on the 7th click. Stripe / GitHub /
 * Vercel all use the same "resend in 30-60s" pattern for verification mail.
 */
const COOLDOWN_SECONDS = 60;
const COOLDOWN_STORAGE_KEY = 'identa.emailVerifyCooldownUntil';

function readCooldownUntil(): number | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(COOLDOWN_STORAGE_KEY);
        if (!raw) return null;
        const timestamp = Number(raw);
        if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
            window.localStorage.removeItem(COOLDOWN_STORAGE_KEY);
            return null;
        }
        return timestamp;
    } catch {
        return null;
    }
}

function writeCooldownUntil(timestamp: number): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(COOLDOWN_STORAGE_KEY, String(timestamp));
    } catch {
        // Private mode / quota errors — fall back to in-memory only.
    }
}

export function EmailVerificationBanner() {
    const { t } = useI18n();
    const { data: user } = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        staleTime: 5 * 60_000,
    });

    // Restore cooldown across page refresh / nav. The remaining seconds are
    // derived from `cooldownUntil - now`, ticked every second by the
    // setInterval below.
    const [cooldownUntil, setCooldownUntil] = useState<number | null>(() => readCooldownUntil());
    const [now, setNow] = useState<number>(() => Date.now());

    useEffect(() => {
        if (cooldownUntil === null) return undefined;
        const interval = window.setInterval(() => {
            const current = Date.now();
            setNow(current);
            if (current >= cooldownUntil) {
                setCooldownUntil(null);
                window.clearInterval(interval);
            }
        }, 1000);
        return () => window.clearInterval(interval);
    }, [cooldownUntil]);

    const resendMutation = useMutation({
        mutationFn: resendEmailVerification,
        onSuccess: () => {
            const until = Date.now() + COOLDOWN_SECONDS * 1000;
            writeCooldownUntil(until);
            setCooldownUntil(until);
            setNow(Date.now());
            toast.success(t('verifyEmail.toast.sent'));
        },
        onError: (error) => toast.error(getApiErrorMessage(error, t('verifyEmail.toast.failed'))),
    });

    // Only nudge real logged-in app users whose email is explicitly unverified.
    // `email_verified === undefined` (older payloads) is treated as verified to
    // avoid a false alarm.
    if (!user || user.email_verified !== false) {
        return null;
    }

    const remainingSeconds =
        cooldownUntil !== null ? Math.max(0, Math.ceil((cooldownUntil - now) / 1000)) : 0;
    const isCoolingDown = remainingSeconds > 0;
    const isBusy = resendMutation.isPending;
    const buttonLabel = isBusy
        ? t('verifyEmail.banner.sending')
        : isCoolingDown
            ? t('verifyEmail.banner.cooldown', { seconds: remainingSeconds })
            : t('verifyEmail.banner.resend');

    return (
        <div className="border-b border-amber-200/80 bg-amber-50">
            <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
                <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                        <MailWarning className="h-3.5 w-3.5" />
                    </span>
                    <p className="min-w-0 text-xs font-medium text-amber-900 sm:text-[13px]">
                        {t('verifyEmail.banner.text', {
                            days: user.email_verification_retention_days ?? 30,
                        })}
                    </p>
                </div>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 rounded-lg border-amber-300 bg-white text-xs font-semibold text-amber-800 hover:bg-amber-50 hover:text-amber-900 disabled:opacity-70"
                    disabled={isBusy || isCoolingDown}
                    onClick={() => resendMutation.mutate()}
                    aria-live="polite"
                >
                    {buttonLabel}
                </Button>
            </div>
        </div>
    );
}
