'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, KeyRound } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GoogleAuthButton } from '@/components/auth/google-auth-button';
import { useGoogleIdentityButton } from '@/components/auth/use-google-identity-button';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import { useI18n } from '@/components/providers/i18n-provider';
import { linkGoogleAccount, unlinkGoogleAccount } from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import type { ApiUser } from '@/lib/api/types';
import { queryKeys } from '@/lib/query-keys';

const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

function GoogleMark() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="size-5 shrink-0">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
    );
}

interface ConnectedAccountsCardProps {
    user: ApiUser;
    className?: string;
}

/**
 * Account sign-in methods. Google Identity Services is loaded only while
 * linking is possible. Unlinking requires a confirmation and remains blocked
 * when no password fallback exists (the API enforces the same invariant).
 */
export function ConnectedAccountsCard({ user, className }: ConnectedAccountsCardProps) {
    const { t, locale } = useI18n();
    const queryClient = useQueryClient();
    const mountRef = useRef<HTMLDivElement | null>(null);
    const [unlinkDialogOpen, setUnlinkDialogOpen] = useState(false);

    const linkMutation = useMutation({
        mutationFn: linkGoogleAccount,
        onSuccess: (updated) => {
            queryClient.setQueryData(queryKeys.auth.me(), updated);
            void queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
            toast.success(t('settings.connectedAccounts.toast.linked'));
        },
        onError: (error) =>
            toast.error(getApiErrorMessage(error, t('settings.connectedAccounts.toast.linkFailed'))),
    });

    const unlinkMutation = useMutation({
        mutationFn: unlinkGoogleAccount,
        onSuccess: (updated) => {
            queryClient.setQueryData(queryKeys.auth.me(), updated);
            void queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
            setUnlinkDialogOpen(false);
            toast.success(t('settings.connectedAccounts.toast.unlinked'));
        },
        onError: (error) =>
            toast.error(getApiErrorMessage(error, t('settings.connectedAccounts.toast.unlinkFailed'))),
    });

    const handleGoogleCredential = useCallback((credential: string | null) => {
        if (!credential) {
            toast.error(t('settings.connectedAccounts.toast.linkFailed'));
            return;
        }
        linkMutation.mutate(credential);
    }, [linkMutation, t]);
    const handleGoogleLoadError = useCallback(() => {
        toast.error(t('settings.connectedAccounts.toast.linkFailed'));
    }, [t]);
    const {
        hasLoadError: googleHasLoadError,
        isLoadRequested: isGoogleLoadRequested,
        isReady: isGoogleReady,
        requestLoad: requestGoogleLoad,
    } = useGoogleIdentityButton({
        clientId: googleClientId,
        enabled: !user.google_linked,
        locale,
        mountRef,
        onCredential: handleGoogleCredential,
        onLoadError: handleGoogleLoadError,
    });

    useEffect(() => {
        if (googleClientId && !user.google_linked) {
            requestGoogleLoad();
        }
    }, [requestGoogleLoad, user.google_linked]);

    return (
        <Card className={className}>
            <CardHeader className="pb-2">
                <CardTitle>{t('settings.connectedAccounts.title')}</CardTitle>
                <p className="text-sm text-slate-600">{t('settings.connectedAccounts.subtitle')}</p>
            </CardHeader>
            <CardContent>
                <ul className="divide-y divide-slate-100">
                    <li className="flex items-center justify-between gap-3 py-4 first:pt-2">
                        <div className="flex min-w-0 items-center gap-3">
                            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600">
                                <KeyRound className="size-5" />
                            </span>
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900">{t('settings.connectedAccounts.password.label')}</p>
                                <p className="truncate text-xs text-slate-500">{user.email}</p>
                            </div>
                        </div>
                        {user.has_password ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                <Check className="size-3" aria-hidden="true" />
                                {t('settings.connectedAccounts.statusConnected')}
                            </span>
                        ) : (
                            <span className="shrink-0 text-xs font-medium text-slate-500">{t('settings.connectedAccounts.password.notSet')}</span>
                        )}
                    </li>

                    <li className="flex items-center justify-between gap-3 py-4 last:pb-2">
                        <div className="flex min-w-0 items-center gap-3">
                            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-white ring-1 ring-slate-200">
                                <GoogleMark />
                            </span>
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900">{t('settings.connectedAccounts.google.label')}</p>
                                <p className="truncate text-xs text-slate-500">{t('settings.connectedAccounts.google.description')}</p>
                            </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            {user.google_linked ? (
                                <>
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                        <Check className="size-3" aria-hidden="true" />
                                        {t('settings.connectedAccounts.statusConnected')}
                                    </span>
                                    {user.has_password ? (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={unlinkMutation.isPending}
                                            onClick={() => setUnlinkDialogOpen(true)}
                                            className="h-8 rounded-lg text-xs"
                                        >
                                            {unlinkMutation.isPending ? t('common.saving') : t('settings.connectedAccounts.disconnect')}
                                        </Button>
                                    ) : null}
                                </>
                            ) : googleClientId ? (
                                <span className="shrink-0 text-xs font-medium text-slate-500">{t('settings.connectedAccounts.google.notConnected')}</span>
                            ) : (
                                <span className="text-xs font-medium text-slate-400">{t('settings.connectedAccounts.google.unavailable')}</span>
                            )}
                        </div>
                    </li>
                </ul>

                {!user.google_linked && googleClientId ? (
                    <div className="mt-4">
                        <GoogleAuthButton
                            mountRef={mountRef}
                            isConfigured
                            isReady={isGoogleReady}
                            isPending={linkMutation.isPending}
                            label={t('register.googleContinue')}
                            unavailableLabel={t('settings.connectedAccounts.google.unavailable')}
                            retryLabel={t('common.retry')}
                            hasLoadError={googleHasLoadError}
                            isLoadRequested={isGoogleLoadRequested}
                            onLoadRequest={requestGoogleLoad}
                        />
                    </div>
                ) : null}

                {!user.has_password && user.google_linked ? (
                    <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        {t('settings.connectedAccounts.passwordReminder')}
                    </p>
                ) : null}
            </CardContent>

            <ConfirmActionDialog
                open={unlinkDialogOpen}
                onOpenChange={setUnlinkDialogOpen}
                title={t('settings.connectedAccounts.unlinkTitle')}
                description={t('settings.connectedAccounts.unlinkDescription')}
                confirmLabel={t('settings.connectedAccounts.disconnect')}
                pendingLabel={t('common.saving')}
                cancelLabel={t('common.cancel')}
                isPending={unlinkMutation.isPending}
                onConfirm={() => unlinkMutation.mutate()}
            />
        </Card>
    );
}
