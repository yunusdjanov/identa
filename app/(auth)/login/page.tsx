'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
import { resolvePostLoginDestination } from '@/lib/auth/post-login-destination';
import { useAuthStore } from '@/lib/store';
import { toast } from 'sonner';
import { INPUT_LIMITS, getEmailValidationMessage } from '@/lib/input-validation';
import { useI18n } from '@/components/providers/i18n-provider';
import { GoogleAuthButton } from '@/components/auth/google-auth-button';
import { useGoogleIdentityButton } from '@/components/auth/use-google-identity-button';
import { AuthPageShell } from '@/components/auth/auth-page-shell';
import type { ApiUser } from '@/lib/api/types';
import {
    authCardClassName,
    authCardContentClassName,
    authCardHeaderClassName,
    authInputClassName,
    authLinkClassName,
    authSubmitClassName,
} from '@/components/auth/auth-form-styles';
import { queryKeys } from '@/lib/query-keys';

export default function LoginPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { isAuthenticated, login } = useAuthStore();
    const { t, locale } = useI18n();
    const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
    const googleButtonRef = useRef<HTMLDivElement | null>(null);
    const emailInputRef = useRef<HTMLInputElement | null>(null);
    const passwordInputRef = useRef<HTMLInputElement | null>(null);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [remember, setRemember] = useState(true);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [isLogoutRedirect, setIsLogoutRedirect] = useState(() => isClientLogoutInProgress());
    const emailError = getEmailValidationMessage(email, { required: true });
    const passwordError = password ? null : t('login.passwordRequired');
    const hasValidationErrors = Boolean(emailError || passwordError);
    const currentUserQuery = useQuery({
        queryKey: queryKeys.auth.me(),
        queryFn: getCurrentUser,
        retry: false,
        enabled: isAuthenticated && !isLogoutRedirect,
        staleTime: 5 * 60_000,
    });
    const getPostLoginDestination = (user: ApiUser) => resolvePostLoginDestination(
        typeof window === 'undefined'
            ? null
            : new URLSearchParams(window.location.search).get('from'),
        user
    );

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
            queryClient.setQueryData(queryKeys.auth.me(), user);
            // FA-A10: signal sibling tabs (they may be sitting at /login
            // or showing a stale "session expired" state) to refresh.
            postAuthBroadcast({ type: 'login' });
            toast.success(t('login.toast.success'));
            router.push(getPostLoginDestination(user));
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
            queryClient.setQueryData(queryKeys.auth.me(), user);
            postAuthBroadcast({ type: 'login' });
            toast.success(t('register.toast.googleSuccess'));
            router.push(getPostLoginDestination(user));
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('register.toast.googleFailed')));
        },
    });

    const googleIdentity = useGoogleIdentityButton({
        clientId: googleClientId,
        enabled: !isLogoutRedirect,
        locale,
        mountRef: googleButtonRef,
        onCredential: (credential) => {
            if (!credential) {
                toast.error(t('register.toast.googleFailed'));
                return;
            }
            googleMutation.mutate(credential);
        },
        onLoadError: () => toast.error(t('register.toast.googleFailed')),
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
                queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
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

        router.replace(getPostLoginDestination(currentUserQuery.data));
    }, [currentUserQuery.data, isLogoutRedirect, router]);

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSubmitted(true);
        if (hasValidationErrors) {
            toast.error(t('login.toast.fixErrors'));
            if (emailError) {
                emailInputRef.current?.focus();
            } else {
                passwordInputRef.current?.focus();
            }
            return;
        }

        loginMutation.mutate();
    };

    return (
        <AuthPageShell>
            <Card className={authCardClassName}>
                <CardHeader className={authCardHeaderClassName}>
                    <div className="space-y-1">
                        <h1 className="text-[1.45rem] font-black leading-tight tracking-normal text-slate-950 sm:text-[1.55rem]">
                            {t('login.cardTitle')}
                        </h1>
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
                                    ref={emailInputRef}
                                    id="email"
                                    name="email"
                                    type="email"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    required
                                    maxLength={INPUT_LIMITS.email}
                                    autoComplete="email"
                                    inputMode="email"
                                    className={authInputClassName}
                                    aria-invalid={Boolean(isSubmitted && emailError)}
                                    aria-describedby={isSubmitted && emailError ? 'login-email-error' : undefined}
                                />
                                {isSubmitted && emailError ? (
                                    <p id="login-email-error" role="alert" className="text-xs text-red-600">{emailError}</p>
                                ) : null}
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="password" className="text-[13px] font-semibold text-slate-950">
                                    {t('login.password')} <span className="text-red-500">*</span>
                                </Label>
                                <PasswordInput
                                    ref={passwordInputRef}
                                    id="password"
                                    name="password"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    required
                                    maxLength={INPUT_LIMITS.password}
                                    autoComplete="current-password"
                                    className={authInputClassName}
                                    aria-invalid={Boolean(isSubmitted && passwordError)}
                                    aria-describedby={isSubmitted && passwordError ? 'login-password-error' : undefined}
                                    showLabel={t('login.showPassword')}
                                    hideLabel={t('login.hidePassword')}
                                />
                                {isSubmitted && passwordError ? (
                                    <p id="login-password-error" role="alert" className="text-xs text-red-600">{passwordError}</p>
                                ) : null}
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <label className="flex min-h-8 min-w-0 items-center gap-2 text-sm text-slate-600">
                                    <input
                                        type="checkbox"
                                        name="remember"
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

                        <div className="flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-slate-600">
                            <span className="h-px flex-1 bg-slate-200/80" />
                            <span>{t('register.orEmail')}</span>
                            <span className="h-px flex-1 bg-slate-200/80" />
                        </div>

                        <GoogleAuthButton
                            mountRef={googleButtonRef}
                            isConfigured={Boolean(googleClientId) && !isLogoutRedirect}
                            isReady={googleIdentity.isReady}
                            isPending={loginMutation.isPending || googleMutation.isPending}
                            label={t('register.googleContinue')}
                            unavailableLabel={t('register.googleNotConfigured')}
                            retryLabel={t('common.retry')}
                            hasLoadError={googleIdentity.hasLoadError}
                            isLoadRequested={googleIdentity.isLoadRequested}
                            onLoadRequest={googleIdentity.requestLoad}
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
