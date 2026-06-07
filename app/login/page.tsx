'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { getCurrentUser, loginWithGoogleIdToken, loginWithPassword } from '@/lib/api/dentist';
import { ensureCsrfCookie, getApiErrorMessage } from '@/lib/api/client';
import {
    consumeAuthRedirectReason,
    isSessionExpiredRedirectReason,
    resetSessionExpiredNotification,
} from '@/lib/auth/session-expiry';
import {
    CLIENT_LOGOUT_FINISHED_EVENT,
    clearClientLogoutInProgress,
    isClientLogoutInProgress,
} from '@/lib/auth/client-logout';
import { postAuthBroadcast, subscribeAuthBroadcast } from '@/lib/auth/auth-broadcast';
import { useAuthStore } from '@/lib/store';
import { toast } from 'sonner';
import { INPUT_LIMITS, getEmailValidationMessage } from '@/lib/input-validation';
import { useI18n } from '@/components/providers/i18n-provider';
import { GoogleAuthButton } from '@/components/auth/google-auth-button';
import { AuthPageShell } from '@/components/auth/auth-page-shell';
import {
    authCardClassName,
    authCardContentClassName,
    authCardHeaderClassName,
    authInputClassName,
    authLinkClassName,
    authSubmitClassName,
} from '@/components/auth/auth-form-styles';

interface GoogleCredentialResponse {
    credential?: string;
}

interface GoogleAccountsId {
    initialize: (options: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
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

declare global {
    interface Window {
        google?: {
            accounts?: {
                id?: GoogleAccountsId;
            };
        };
    }
}

const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

export default function LoginPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { isAuthenticated, login } = useAuthStore();
    const { t, locale } = useI18n();
    const googleButtonRef = useRef<HTMLDivElement | null>(null);
    // Guards the one-time GSI initialize()+renderButton(). Without it, the
    // effect below re-runs whenever `t`/`locale`/the mutation object change
    // identity and calls initialize() again — GSI logs "initialize() is
    // called multiple times" and the rendered button binds to a superseded
    // instance, leaving it unclickable.
    const googleInitializedRef = useRef(false);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [remember, setRemember] = useState(true);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [isLogoutRedirect, setIsLogoutRedirect] = useState(() => isClientLogoutInProgress());
    const [googleReady, setGoogleReady] = useState(false);
    const emailError = getEmailValidationMessage(email, { required: true });
    const passwordError = password ? null : t('login.passwordRequired');
    const hasValidationErrors = Boolean(emailError || passwordError);
    const currentUserQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        retry: false,
        enabled: isAuthenticated && !isLogoutRedirect,
        staleTime: 5 * 60_000,
    });

    const loginMutation = useMutation({
        mutationFn: () => loginWithPassword(email.trim(), password, remember, 'app'),
        onSuccess: (user) => {
            clearClientLogoutInProgress();
            setIsLogoutRedirect(false);
            resetSessionExpiredNotification();
            // Wipe any cached data from a previous tenant BEFORE seeding the
            // new auth/me. The logout button already clears via AF6, but
            // login can also be reached without an explicit logout (e.g.
            // session expiry handled elsewhere, manual /login URL paste, or
            // back-button after token revocation). Clearing here closes the
            // cross-tenant flash window.
            queryClient.clear();
            login(user.name);
            queryClient.setQueryData(['auth', 'me'], user);
            // FA-A10: signal sibling tabs (they may be sitting at /login
            // or showing a stale "session expired" state) to refresh.
            postAuthBroadcast({ type: 'login' });
            toast.success(t('login.toast.success'));
            router.push(user.role === 'admin' ? '/admin' : '/dashboard');
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('login.toast.failed')));
        },
    });

    const googleMutation = useMutation({
        mutationFn: (idToken: string) => loginWithGoogleIdToken(idToken),
        onSuccess: (user) => {
            clearClientLogoutInProgress();
            setIsLogoutRedirect(false);
            resetSessionExpiredNotification();
            queryClient.clear();
            login(user.name);
            queryClient.setQueryData(['auth', 'me'], user);
            postAuthBroadcast({ type: 'login' });
            toast.success(t('register.toast.googleSuccess'));
            router.push('/dashboard');
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('register.toast.googleFailed')));
        },
    });

    useEffect(() => {
        // Best-effort CSRF prefetch — swallow failures so a transient
        // csrf-token endpoint error (or offline/test environment) doesn't
        // surface as an unhandled promise rejection. The login mutation
        // re-ensures the cookie before submitting anyway.
        void ensureCsrfCookie().catch(() => undefined);
    }, []);

    useEffect(() => {
        const redirectReason = consumeAuthRedirectReason();
        if (isSessionExpiredRedirectReason(redirectReason)) {
            toast.error(t('auth.sessionExpired'));
        }
    }, [t]);

    useEffect(() => {
        const updateLogoutRedirectState = () => {
            setIsLogoutRedirect(isClientLogoutInProgress());
        };

        window.addEventListener(CLIENT_LOGOUT_FINISHED_EVENT, updateLogoutRedirectState);
        const timeoutId = window.setTimeout(updateLogoutRedirectState, 1200);

        // FA-A10: if a sibling tab successfully logs in, the cookie is
        // now valid for THIS tab too — drop the logout-in-progress flag
        // and invalidate auth/me so the existing query re-enables and
        // resolves into the auto-redirect effect below.
        const unsubscribeBroadcast = subscribeAuthBroadcast((message) => {
            if (message.type === 'login') {
                clearClientLogoutInProgress();
                setIsLogoutRedirect(false);
                queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
            }
        });

        return () => {
            window.removeEventListener(CLIENT_LOGOUT_FINISHED_EVENT, updateLogoutRedirectState);
            window.clearTimeout(timeoutId);
            unsubscribeBroadcast();
        };
    }, [queryClient]);

    useEffect(() => {
        if (isLogoutRedirect) {
            return;
        }

        if (!currentUserQuery.data) {
            return;
        }

        router.replace(currentUserQuery.data.role === 'admin' ? '/admin' : '/dashboard');
    }, [currentUserQuery.data, isLogoutRedirect, router]);

    useEffect(() => {
        if (!googleClientId || typeof window === 'undefined' || isLogoutRedirect) {
            return;
        }

        const existingScript = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
        let pollHandle = 0;
        let cancelled = false;

        const initializeGoogle = () => {
            if (cancelled) return;
            const googleId = window.google?.accounts?.id;
            if (!googleId || !googleButtonRef.current) {
                // Script tag is in the DOM but the global hasn't been
                // attached yet (race between `appendChild` and `load`)
                // OR the React tree mounted the ref a tick later than
                // we expected. Re-poll up to ~2s so we don't silently
                // strand the user with the disabled placeholder.
                pollHandle = window.setTimeout(initializeGoogle, 100);
                return;
            }
            // Initialize + render exactly once per mount. A re-run that calls
            // initialize() again triggers GSI's "called multiple times"
            // warning and can strand the rendered button against the stale
            // instance; later invocations only re-assert the ready flag.
            if (googleInitializedRef.current) {
                setGoogleReady(true);
                return;
            }
            googleInitializedRef.current = true;
            googleButtonRef.current.innerHTML = '';
            googleId.initialize({
                client_id: googleClientId,
                callback: (response) => {
                    if (!response.credential) {
                        toast.error(t('register.toast.googleFailed'));
                        return;
                    }
                    googleMutation.mutate(response.credential);
                },
            });
            googleId.renderButton(googleButtonRef.current, {
                theme: 'outline',
                size: 'large',
                type: 'standard',
                text: 'continue_with',
                // `pill` matches the app's rounded-full buttons (the
                // primary "Войти" submit is rounded-full); `rectangular`
                // looked foreign next to it.
                shape: 'pill',
                // Render Google's button in the same language the user
                // picked in the app so "Continue with Google" isn't stuck
                // in English next to a Russian/Uzbek form.
                locale,
                logo_alignment: 'left',
                // GSI caps width at 400px. Fill the container so the
                // Google button spans the same width as the submit button
                // above it instead of floating narrow in the middle.
                width: Math.max(240, Math.min(400, Math.floor(googleButtonRef.current.getBoundingClientRect().width || 400))),
            });
            setGoogleReady(true);
        };

        if (existingScript) {
            initializeGoogle();
            existingScript.addEventListener('load', initializeGoogle);

            return () => {
                cancelled = true;
                window.clearTimeout(pollHandle);
                existingScript.removeEventListener('load', initializeGoogle);
            };
        }

        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.addEventListener('load', initializeGoogle);
        document.head.appendChild(script);

        return () => {
            cancelled = true;
            window.clearTimeout(pollHandle);
            script.removeEventListener('load', initializeGoogle);
        };
    }, [googleMutation, isLogoutRedirect, t, locale]);

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSubmitted(true);
        if (hasValidationErrors) {
            toast.error(t('login.toast.fixErrors'));
            return;
        }

        loginMutation.mutate();
    };

    return (
        <AuthPageShell>
            <Card className={authCardClassName}>
                <CardHeader className={authCardHeaderClassName}>
                    <div className="space-y-1">
                        <CardTitle className="text-[1.45rem] font-black leading-tight tracking-normal text-slate-950 sm:text-[1.55rem]">
                            {t('login.cardTitle')}
                        </CardTitle>
                        <p className="text-sm leading-5 text-slate-600">{t('login.subtitle')}</p>
                    </div>
                </CardHeader>
                <CardContent className={authCardContentClassName}>
                        <form onSubmit={handleSubmit} className="space-y-3.5">
                            <div className="space-y-1.5">
                                <Label htmlFor="email" className="text-[13px] font-semibold text-slate-950">
                                    {t('login.email')} <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    required
                                    maxLength={INPUT_LIMITS.email}
                                    autoComplete="email"
                                    inputMode="email"
                                    className={authInputClassName}
                                    aria-invalid={Boolean(isSubmitted && emailError)}
                                />
                                {isSubmitted && emailError ? (
                                    <p className="text-xs text-red-600">{emailError}</p>
                                ) : null}
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="password" className="text-[13px] font-semibold text-slate-950">
                                    {t('login.password')} <span className="text-red-500">*</span>
                                </Label>
                                <PasswordInput
                                    id="password"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    required
                                    maxLength={INPUT_LIMITS.password}
                                    autoComplete="current-password"
                                    className={authInputClassName}
                                    aria-invalid={Boolean(isSubmitted && passwordError)}
                                    showLabel={t('login.showPassword')}
                                    hideLabel={t('login.hidePassword')}
                                />
                                {isSubmitted && passwordError ? (
                                    <p className="text-xs text-red-600">{passwordError}</p>
                                ) : null}
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <label className="flex min-h-8 min-w-0 items-center gap-2 text-sm text-slate-600">
                                    <input
                                        type="checkbox"
                                        checked={remember}
                                        onChange={(event) => setRemember(event.target.checked)}
                                        className="h-5 w-5 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                                    />
                                    <span>{t('login.rememberMe')}</span>
                                </label>
                                <Link
                                    href="/forgot-password"
                                    className={`${authLinkClassName} text-sm`}
                                >
                                    {t('login.forgotPassword')}
                                </Link>
                            </div>

                            <Button
                                type="submit"
                                className={`${authSubmitClassName} gap-2`}
                                disabled={loginMutation.isPending || googleMutation.isPending}
                            >
                                {loginMutation.isPending ? t('login.signingIn') : t('login.signIn')}
                                <ArrowRight className="size-4" aria-hidden="true" />
                            </Button>
                        </form>

                        <div className="flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-slate-400">
                            <span className="h-px flex-1 bg-slate-200/80" />
                            <span>{t('register.orEmail')}</span>
                            <span className="h-px flex-1 bg-slate-200/80" />
                        </div>

                        <GoogleAuthButton
                            mountRef={googleButtonRef}
                            isConfigured={Boolean(googleClientId) && !isLogoutRedirect}
                            isReady={googleReady}
                            isPending={loginMutation.isPending || googleMutation.isPending}
                            label={t('register.googleContinue')}
                            unavailableLabel={t('register.googleNotConfigured')}
                        />

                        <p className="text-center text-sm leading-6 text-slate-600">
                            {t('login.noAccount')}{' '}
                            <Link href="/register" className={authLinkClassName}>
                                {t('login.createAccount')}
                            </Link>
                        </p>
                </CardContent>
            </Card>
        </AuthPageShell>
    );
}
