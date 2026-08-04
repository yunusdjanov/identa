'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { ensureCsrfCookie, getApiErrorMessage } from '@/lib/api/client';
import { getCurrentUser, loginWithPassword, logoutSession } from '@/lib/api/dentist';
import {
    CLIENT_LOGOUT_FINISHED_EVENT,
    clearClientLogoutInProgress,
    isClientLogoutInProgress,
} from '@/lib/auth/client-logout';
import { postAuthBroadcast, subscribeAuthBroadcast } from '@/lib/auth/auth-broadcast';
import { toast } from 'sonner';
import { INPUT_LIMITS, getEmailValidationMessage } from '@/lib/input-validation';
import { useI18n } from '@/components/providers/i18n-provider';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import Link from 'next/link';
import { Brand } from '@/components/branding/brand';
import { AuthFormLoadingState } from '@/components/layout/page-loading-skeletons';
import { queryKeys } from '@/lib/query-keys';

export default function AdminLoginPage() {
    const { t } = useI18n();
    const router = useRouter();
    const queryClient = useQueryClient();
    const emailInputRef = useRef<HTMLInputElement | null>(null);
    const passwordInputRef = useRef<HTMLInputElement | null>(null);
    const [credentials, setCredentials] = useState({
        email: '',
        password: '',
    });
    const [remember, setRemember] = useState(true);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [isLogoutRedirect, setIsLogoutRedirect] = useState(() => isClientLogoutInProgress());
    const emailError = getEmailValidationMessage(credentials.email, { required: true });
    const passwordError = credentials.password ? null : t('admin.login.passwordRequired');
    const hasValidationErrors = Boolean(emailError || passwordError);
    const currentUserQuery = useQuery({
        queryKey: queryKeys.auth.me(),
        queryFn: getCurrentUser,
        retry: false,
        enabled: !isLogoutRedirect,
        staleTime: 5 * 60_000,
    });

    const loginMutation = useMutation({
        mutationFn: async () => {
            const user = await loginWithPassword(
                credentials.email.trim(),
                credentials.password,
                remember,
                'admin'
            );

            if (user.role !== 'admin') {
                await logoutSession();
                throw new Error(t('admin.login.accessRequired'));
            }

            return user;
        },
        onSuccess: (user) => {
            clearClientLogoutInProgress();
            setIsLogoutRedirect(false);
            // Wipe any cached data from a previous session BEFORE seeding the
            // new auth/me. Closes the cross-tenant flash window covered by
            // the matching change in /login. `invalidateQueries(['admin'])`
            // below becomes redundant after the clear, but kept as belt-
            // and-braces in case clear() is removed accidentally later.
            queryClient.clear();
            queryClient.setQueryData(queryKeys.auth.me(), user);
            queryClient.invalidateQueries({ queryKey: queryKeys.admin.all() });
            postAuthBroadcast({ type: 'login' });
            toast.success(t('admin.login.success'));
            router.push(user.must_change_password
                ? '/admin/settings?forceReset=1'
                : '/admin');
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('admin.login.invalidCredentials')));
        },
    });

    useEffect(() => {
        if (!currentUserQuery.isFetched) {
            return;
        }

        // The guest auth check and CSRF bootstrap both create a session for a
        // fresh browser. Run them sequentially so their Set-Cookie responses
        // cannot race and leave the form holding a token from another session.
        void ensureCsrfCookie().catch(() => undefined);
    }, [currentUserQuery.isFetched]);

    useEffect(() => {
        const updateLogoutRedirectState = () => {
            setIsLogoutRedirect(isClientLogoutInProgress());
        };

        window.addEventListener(CLIENT_LOGOUT_FINISHED_EVENT, updateLogoutRedirectState);
        const timeoutId = window.setTimeout(updateLogoutRedirectState, 1200);

        // FA-A10 multi-tab login signal. Mirrors the public /login page.
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

        router.replace(currentUserQuery.data.role === 'admin'
            ? (currentUserQuery.data.must_change_password
                ? '/admin/settings?forceReset=1'
                : '/admin')
            : '/dashboard');
    }, [currentUserQuery.data, isLogoutRedirect, router]);

    const handleLogin = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSubmitted(true);
        if (hasValidationErrors) {
            toast.error(t('admin.form.fixErrors'));
            if (emailError) {
                emailInputRef.current?.focus();
            } else {
                passwordInputRef.current?.focus();
            }
            return;
        }

        loginMutation.mutate();
    };

    if (!isLogoutRedirect && currentUserQuery.isLoading) {
        return <AuthFormLoadingState fieldCount={2} showRememberAndForgot />;
    }

    return (
        <main className="relative min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center p-4">
            <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
                <LanguageSwitcher variant="compact" />
            </div>
            <div className="w-full max-w-md">
                <div className="mb-8 text-center">
                    <div className="mb-4 flex justify-center">
                        <Brand href="/" variant="full" priority fullClassName="w-28 sm:w-32" />
                    </div>
                    <h1 className="text-3xl font-bold text-slate-900 mb-2">{t('admin.login.title')}</h1>
                    <p className="text-slate-600">{t('admin.login.subtitle')}</p>
                </div>

                <Card className="shadow-xl">
                    <CardHeader>
                        <CardTitle className="text-center text-xl">{t('admin.login.signInTitle')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">
                                    {t('login.email')} <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    ref={emailInputRef}
                                    id="email"
                                    name="email"
                                    type="email"
                                    value={credentials.email}
                                    onChange={(event) =>
                                        setCredentials({ ...credentials, email: event.target.value })
                                    }
                                    required
                                    maxLength={INPUT_LIMITS.email}
                                    inputMode="email"
                                    autoComplete="email"
                                    autoFocus
                                    aria-invalid={Boolean(isSubmitted && emailError)}
                                    aria-describedby={isSubmitted && emailError ? 'admin-login-email-error' : undefined}
                                />
                                {isSubmitted && emailError ? (
                                    <p id="admin-login-email-error" role="alert" className="text-xs text-red-600">{emailError}</p>
                                ) : null}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password">
                                    {t('login.password')} <span className="text-red-500">*</span>
                                </Label>
                                <PasswordInput
                                    ref={passwordInputRef}
                                    id="password"
                                    name="password"
                                    value={credentials.password}
                                    onChange={(event) =>
                                        setCredentials({ ...credentials, password: event.target.value })
                                    }
                                    required
                                    maxLength={INPUT_LIMITS.password}
                                    autoComplete="current-password"
                                    aria-invalid={Boolean(isSubmitted && passwordError)}
                                    aria-describedby={isSubmitted && passwordError ? 'admin-login-password-error' : undefined}
                                    showLabel={t('login.showPassword')}
                                    hideLabel={t('login.hidePassword')}
                                />
                                {isSubmitted && passwordError ? (
                                    <p id="admin-login-password-error" role="alert" className="text-xs text-red-600">{passwordError}</p>
                                ) : null}
                            </div>

                            <div className="flex items-center justify-between gap-4">
                                <label className="flex items-center gap-3 text-sm text-slate-600">
                                    <input
                                        type="checkbox"
                                        name="remember"
                                        checked={remember}
                                        onChange={(event) => setRemember(event.target.checked)}
                                        className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                                    />
                                    <span>{t('login.rememberMe')}</span>
                                </label>
                                <Link
                                    href="/forgot-password?from=admin"
                                    className="text-sm font-medium text-slate-700 transition hover:text-slate-900"
                                >
                                    {t('login.forgotPassword')}
                                </Link>
                            </div>

                            <Button
                                type="submit"
                                size="lg"
                                className="w-full bg-slate-900 hover:bg-slate-800"
                                disabled={loginMutation.isPending}
                            >
                                {loginMutation.isPending ? t('admin.login.signingIn') : t('admin.login.signIn')}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                {/* Admin login intentionally omits a self-service "Create account"
                    affordance — admin accounts are provisioned by other admins via
                    /admin/dentists or via DB seeder, never self-served. The notice
                    below reinforces that this surface is for authorized personnel. */}
                <p className="text-center text-xs text-slate-500 mt-6">
                    {t('admin.login.notice')}
                </p>
            </div>
        </main>
    );
}
