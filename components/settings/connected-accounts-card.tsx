'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, KeyRound } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GoogleAuthButton } from '@/components/auth/google-auth-button';
import { useI18n } from '@/components/providers/i18n-provider';
import { linkGoogleAccount, unlinkGoogleAccount } from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import type { ApiUser } from '@/lib/api/types';

const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

/**
 * Local narrow types for the bits of the Google Identity Services API we
 * touch from this card. The /login + /register pages already augment
 * `Window.google` with their own narrow GoogleAccountsId shape; our
 * `initialize` config carries a couple of extra fields (auto_select,
 * cancel_on_tap_outside), so re-augmenting the global from here would
 * clash with that declaration. We keep these as a local cast instead.
 */
interface GsiIdApi {
    initialize: (config: {
        client_id: string;
        callback: (response: { credential?: string }) => void;
    }) => void;
    renderButton: (
        parent: HTMLElement,
        options: {
            theme: 'outline';
            size: 'large';
            type: 'standard';
            text: 'continue_with';
            shape: 'rectangular' | 'pill';
            logo_alignment?: 'left' | 'center';
            locale?: string;
            width: number;
        }
    ) => void;
}

function getGsi(): GsiIdApi | undefined {
    if (typeof window === 'undefined') return undefined;
    return window.google?.accounts?.id as unknown as GsiIdApi | undefined;
}

/**
 * Official 4-color Google mark per Google brand guidelines
 * (https://developers.google.com/identity/branding-guidelines). Sized
 * to sit inside a 40px circular avatar slot.
 */
function GoogleMark() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="size-5 shrink-0">
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

interface ConnectedAccountsCardProps {
    user: ApiUser;
    className?: string;
}

/**
 * Settings → Security → "Connected accounts" panel.
 *
 * Lets the dentist see and manage which sign-in methods are bound to
 * their Identa account:
 *   - Email + Password — derived from `has_password`.
 *   - Google — derived from `google_linked`.
 *
 * Connecting Google renders Google Identity Services' official button
 * (the same reliable popup flow used on /login + /register — NOT the
 * One-Tap prompt, which silently no-ops on Safari/Firefox/ITP and after
 * a couple of dismissals, which would make this the dead-end the login
 * page warns users away from). The returned ID token is shipped to
 * `POST /auth/google/link`, which re-verifies it server-side before
 * binding. Disconnecting is hidden
 * when the user has no password fallback (the backend also refuses,
 * but hiding the action keeps the UX from leading them into the dead
 * end). Owner password-reset can be used to set the missing password.
 */
export function ConnectedAccountsCard({ user, className }: ConnectedAccountsCardProps) {
    const { t, locale } = useI18n();
    const queryClient = useQueryClient();
    const [googleReady, setGoogleReady] = useState(false);
    // GSI injects its <iframe> button here. Like /login + /register, this
    // div MUST stay empty in JSX (it's GSI's territory) — GoogleAuthButton
    // enforces that and overlays its own loading placeholder as a sibling.
    const mountRef = useRef<HTMLDivElement | null>(null);
    // One-time GSI init guard — see login/page.tsx. The effect re-runs on
    // locale/t changes; without this it would re-initialize the GSI singleton
    // and strand the rendered "Connect" button (unclickable).
    const googleInitializedRef = useRef(false);

    const linkMutation = useMutation({
        mutationFn: linkGoogleAccount,
        onSuccess: (updated) => {
            queryClient.setQueryData(['auth', 'me'], updated);
            void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
            toast.success(t('settings.connectedAccounts.toast.linked'));
        },
        onError: (error) =>
            toast.error(getApiErrorMessage(error, t('settings.connectedAccounts.toast.linkFailed'))),
    });

    const unlinkMutation = useMutation({
        mutationFn: unlinkGoogleAccount,
        onSuccess: (updated) => {
            queryClient.setQueryData(['auth', 'me'], updated);
            void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
            toast.success(t('settings.connectedAccounts.toast.unlinked'));
        },
        onError: (error) =>
            toast.error(getApiErrorMessage(error, t('settings.connectedAccounts.toast.unlinkFailed'))),
    });

    // Keep the latest link handler in a ref so the GSI init effect below
    // doesn't need `linkMutation` in its deps — otherwise every flip of the
    // mutation's pending state would re-run the effect and re-render
    // (flicker) the GSI button mid-link.
    const linkRef = useRef(linkMutation.mutate);
    useEffect(() => {
        linkRef.current = linkMutation.mutate;
    }, [linkMutation.mutate]);

    // Lazy-load the Google Identity Services SDK and render Google's OWN
    // button only when the user lands on Settings → Security, the deploy is
    // configured, AND Google isn't linked yet (nothing to connect once it
    // is). Same proven pattern as /login + /register: render Google's
    // official button (a reliable click → account-chooser popup) instead of
    // One-Tap `prompt()`, which can silently no-op on Safari/Firefox/ITP and
    // strand the user with no dialog and no error. The script (~70KB) only
    // ships when this branch is actually reachable.
    useEffect(() => {
        if (!googleClientId || typeof window === 'undefined' || user.google_linked) {
            return;
        }

        let cancelled = false;
        let pollHandle = 0;

        const initialize = () => {
            if (cancelled) return;
            const gid = getGsi();
            const mount = mountRef.current;
            if (!gid || !mount) {
                // Either GSI's global hasn't attached yet (race between
                // appendChild and load) or React mounted the ref a tick
                // later than us. Re-poll up to ~2s rather than strand the
                // user on the disabled placeholder.
                pollHandle = window.setTimeout(initialize, 100);
                return;
            }
            // Initialize + render exactly once per mount (see login/page.tsx).
            if (googleInitializedRef.current) {
                setGoogleReady(true);
                return;
            }
            googleInitializedRef.current = true;
            // GSI owns this node — clear it before handing it over so a
            // re-render never collides with React's view of the children.
            mount.innerHTML = '';
            gid.initialize({
                client_id: googleClientId,
                callback: (response) => {
                    if (!response.credential) {
                        toast.error(t('settings.connectedAccounts.toast.linkFailed'));
                        return;
                    }
                    linkRef.current(response.credential);
                },
            });
            gid.renderButton(mount, {
                theme: 'outline',
                size: 'large',
                type: 'standard',
                text: 'continue_with',
                shape: 'pill',
                locale,
                logo_alignment: 'left',
                width: Math.max(
                    240,
                    Math.min(400, Math.floor(mount.getBoundingClientRect().width || 400))
                ),
            });
            setGoogleReady(true);
        };

        const existing = document.querySelector<HTMLScriptElement>(
            'script[src="https://accounts.google.com/gsi/client"]'
        );
        if (existing) {
            initialize();
            existing.addEventListener('load', initialize);
            return () => {
                cancelled = true;
                window.clearTimeout(pollHandle);
                existing.removeEventListener('load', initialize);
            };
        }

        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.addEventListener('load', initialize);
        document.head.appendChild(script);
        return () => {
            cancelled = true;
            window.clearTimeout(pollHandle);
            script.removeEventListener('load', initialize);
        };
    }, [user.google_linked, locale, t]);

    const isLinkPending = linkMutation.isPending;
    const isUnlinkPending = unlinkMutation.isPending;

    return (
        <Card className={className}>
            <CardHeader className="pb-2">
                <CardTitle>{t('settings.connectedAccounts.title')}</CardTitle>
                <p className="text-sm text-slate-600">{t('settings.connectedAccounts.subtitle')}</p>
            </CardHeader>
            <CardContent>
                <ul className="divide-y divide-slate-100">
                    {/* Email + Password row */}
                    <li className="flex items-center justify-between gap-3 py-4 first:pt-2">
                        <div className="flex min-w-0 items-center gap-3">
                            <span
                                aria-hidden="true"
                                className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600"
                            >
                                <KeyRound className="size-5" />
                            </span>
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900">
                                    {t('settings.connectedAccounts.password.label')}
                                </p>
                                <p className="truncate text-xs text-slate-500">{user.email}</p>
                            </div>
                        </div>
                        {user.has_password ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                <Check className="size-3" aria-hidden="true" />
                                {t('settings.connectedAccounts.statusConnected')}
                            </span>
                        ) : (
                            <span className="shrink-0 text-xs font-medium text-slate-500">
                                {t('settings.connectedAccounts.password.notSet')}
                            </span>
                        )}
                    </li>
                    {/* Google row */}
                    <li className="flex items-center justify-between gap-3 py-4 last:pb-2">
                        <div className="flex min-w-0 items-center gap-3">
                            <span
                                aria-hidden="true"
                                className="grid size-10 shrink-0 place-items-center rounded-full bg-white ring-1 ring-slate-200"
                            >
                                <GoogleMark />
                            </span>
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900">
                                    {t('settings.connectedAccounts.google.label')}
                                </p>
                                <p className="truncate text-xs text-slate-500">
                                    {t('settings.connectedAccounts.google.description')}
                                </p>
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
                                            disabled={isUnlinkPending}
                                            onClick={() => unlinkMutation.mutate()}
                                            className="h-8 rounded-lg text-xs"
                                        >
                                            {isUnlinkPending
                                                ? t('common.saving')
                                                : t('settings.connectedAccounts.disconnect')}
                                        </Button>
                                    ) : null}
                                </>
                            ) : googleClientId ? (
                                // Status only — the actual connect affordance is
                                // Google's own rendered button below the list (a
                                // reliable popup, unlike One-Tap). Mirrors the
                                // password row's "Not set" treatment.
                                <span className="shrink-0 text-xs font-medium text-slate-500">
                                    {t('settings.connectedAccounts.google.notConnected')}
                                </span>
                            ) : (
                                <span className="text-xs font-medium text-slate-400">
                                    {t('settings.connectedAccounts.google.unavailable')}
                                </span>
                            )}
                        </div>
                    </li>
                </ul>
                {/* Connect affordance: Google's OWN rendered button (reliable
                    popup) rather than One-Tap. Shown only while unlinked and
                    configured; GoogleAuthButton keeps the mount node empty for
                    GSI and overlays a matching loading pill until it's ready. */}
                {!user.google_linked && googleClientId ? (
                    <div className="mt-4">
                        <GoogleAuthButton
                            mountRef={mountRef}
                            isConfigured
                            isReady={googleReady}
                            isPending={isLinkPending}
                            label={t('register.googleContinue')}
                            unavailableLabel={t('settings.connectedAccounts.google.unavailable')}
                        />
                    </div>
                ) : null}
                {/* Lock-out reminder: a user who deletes their password and
                    only has Google linked could lose access if Google is
                    unavailable. The backend refuses the unlink in that
                    state, but proactively nudging them to set a password
                    is friendlier than waiting for the error. */}
                {!user.has_password && user.google_linked ? (
                    <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        {t('settings.connectedAccounts.passwordReminder')}
                    </p>
                ) : null}
            </CardContent>
        </Card>
    );
}
