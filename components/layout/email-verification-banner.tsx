'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { MailWarning } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getCurrentUser, resendEmailVerification } from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import { useI18n } from '@/components/providers/i18n-provider';

/**
 * Soft email-verification nudge. Shows a thin amber banner under the header
 * whenever the authenticated user has not verified their email yet, with a
 * one-click resend. It never blocks the app (soft gate) — best practice for
 * trial-led SaaS onboarding.
 */
export function EmailVerificationBanner() {
    const { t } = useI18n();
    const { data: user } = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        staleTime: 5 * 60_000,
    });

    const resendMutation = useMutation({
        mutationFn: resendEmailVerification,
        onSuccess: () => toast.success(t('verifyEmail.toast.sent')),
        onError: (error) => toast.error(getApiErrorMessage(error, t('verifyEmail.toast.failed'))),
    });

    // Only nudge real logged-in app users whose email is explicitly unverified.
    // `email_verified === undefined` (older payloads) is treated as verified to
    // avoid a false alarm.
    if (!user || user.email_verified !== false) {
        return null;
    }

    return (
        <div className="border-b border-amber-200/80 bg-amber-50">
            <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
                <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                        <MailWarning className="h-3.5 w-3.5" />
                    </span>
                    <p className="min-w-0 text-xs font-medium text-amber-900 sm:text-[13px]">
                        {t('verifyEmail.banner.text')}
                    </p>
                </div>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 rounded-lg border-amber-300 bg-white text-xs font-semibold text-amber-800 hover:bg-amber-50 hover:text-amber-900"
                    disabled={resendMutation.isPending}
                    onClick={() => resendMutation.mutate()}
                >
                    {resendMutation.isPending ? t('verifyEmail.banner.sending') : t('verifyEmail.banner.resend')}
                </Button>
            </div>
        </div>
    );
}
