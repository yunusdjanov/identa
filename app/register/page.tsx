'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/components/providers/i18n-provider';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { Brand } from '@/components/branding/brand';
import { getApiErrorMessage } from '@/lib/api/client';
import { loginWithGoogleIdToken, registerWithPassword } from '@/lib/api/dentist';
import { INPUT_LIMITS, getEmailValidationMessage, getPasswordValidationMessage } from '@/lib/input-validation';
import { useAuthStore } from '@/lib/store';
import { toast } from 'sonner';

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
            shape: 'rectangular';
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

export default function RegisterPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { login } = useAuthStore();
    const { t } = useI18n();
    const googleButtonRef = useRef<HTMLDivElement | null>(null);

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirmation, setPasswordConfirmation] = useState('');
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [googleReady, setGoogleReady] = useState(false);

    const nameError = name.trim() ? null : t('register.nameRequired');
    const emailError = getEmailValidationMessage(email, { required: true });
    const passwordError = getPasswordValidationMessage(password, { required: true });
    const passwordConfirmationError = useMemo(() => {
        if (!passwordConfirmation) {
            return t('register.passwordConfirmRequired');
        }

        return password === passwordConfirmation ? null : t('register.passwordMismatch');
    }, [password, passwordConfirmation, t]);
    const hasValidationErrors = Boolean(nameError || emailError || passwordError || passwordConfirmationError);

    const completeLogin = (user: Awaited<ReturnType<typeof registerWithPassword>>) => {
        login(user.name);
        queryClient.setQueryData(['auth', 'me'], user);
        router.push('/dashboard');
    };

    const registerMutation = useMutation({
        mutationFn: () =>
            registerWithPassword({
                name: name.trim(),
                email: email.trim(),
                password,
                password_confirmation: passwordConfirmation,
            }),
        onSuccess: (user) => {
            toast.success(t('register.toast.success'));
            completeLogin(user);
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('register.toast.failed')));
        },
    });

    const googleMutation = useMutation({
        mutationFn: (idToken: string) => loginWithGoogleIdToken(idToken),
        onSuccess: (user) => {
            toast.success(t('register.toast.googleSuccess'));
            completeLogin(user);
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('register.toast.googleFailed')));
        },
    });

    useEffect(() => {
        if (!googleClientId || typeof window === 'undefined') {
            return;
        }

        const existingScript = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
        const initializeGoogle = () => {
            const googleId = window.google?.accounts?.id;
            if (!googleId || !googleButtonRef.current) {
                return;
            }

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
                shape: 'rectangular',
                width: 360,
            });
            setGoogleReady(true);
        };

        if (existingScript) {
            initializeGoogle();
            existingScript.addEventListener('load', initializeGoogle);

            return () => existingScript.removeEventListener('load', initializeGoogle);
        }

        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.addEventListener('load', initializeGoogle);
        document.head.appendChild(script);

        return () => {
            script.removeEventListener('load', initializeGoogle);
        };
    }, [googleMutation, t]);

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSubmitted(true);

        if (hasValidationErrors) {
            toast.error(t('register.toast.fixErrors'));
            return;
        }

        registerMutation.mutate();
    };

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-x-hidden bg-[#edf6f8] px-4 py-4 text-slate-950 sm:py-5">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_16%,rgba(13,148,136,0.20),transparent_31%),radial-gradient(circle_at_88%_18%,rgba(37,99,235,0.15),transparent_30%),linear-gradient(135deg,#e5f6f4_0%,#f9fbfc_45%,#e8f2ff_100%)]" />
            <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
                <LanguageSwitcher variant="compact" />
            </div>
            <div className="relative w-full max-w-md">
                <div className="mb-4 text-center sm:mb-5">
                    <div className="mb-2 flex justify-center">
                        <Brand href="/" variant="text" priority textClassName="w-36 sm:w-40" />
                    </div>
                    <p className="text-sm text-slate-600 sm:text-base">{t('register.subtitle')}</p>
                </div>

                <Card className="border-white/80 bg-white/90 shadow-2xl shadow-slate-950/10 backdrop-blur-md">
                    <CardHeader className="space-y-2 px-5 pb-3 pt-5 sm:px-7">
                        <div className="flex justify-center">
                            <span className="rounded-full bg-cyan-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-700 ring-1 ring-cyan-100">
                                {t('register.trialBadge')}
                            </span>
                        </div>
                        <CardTitle className="text-center text-2xl font-black tracking-[-0.035em] text-slate-950">
                            {t('register.getStarted')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 px-5 pb-5 sm:px-7">
                        <p className="text-sm leading-5 text-slate-600">
                            {t('register.trialDescription')}
                        </p>

                        <form onSubmit={handleSubmit} className="space-y-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="name" className="text-sm font-semibold text-slate-950">
                                    {t('register.name')} <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    id="name"
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                    maxLength={INPUT_LIMITS.personName}
                                    autoComplete="name"
                                    className="h-11 rounded-2xl bg-white/95 px-4 shadow-sm"
                                    aria-invalid={Boolean(isSubmitted && nameError)}
                                />
                                {isSubmitted && nameError ? (
                                    <p className="text-xs text-red-600">{nameError}</p>
                                ) : null}
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="email" className="text-sm font-semibold text-slate-950">
                                    {t('register.email')} <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    maxLength={INPUT_LIMITS.email}
                                    autoComplete="email"
                                    inputMode="email"
                                    className="h-11 rounded-2xl bg-white/95 px-4 shadow-sm"
                                    aria-invalid={Boolean(isSubmitted && emailError)}
                                />
                                {isSubmitted && emailError ? (
                                    <p className="text-xs text-red-600">{emailError}</p>
                                ) : null}
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="password" className="text-sm font-semibold text-slate-950">
                                    {t('register.password')} <span className="text-red-500">*</span>
                                </Label>
                                <PasswordInput
                                    id="password"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    maxLength={INPUT_LIMITS.password}
                                    autoComplete="new-password"
                                    className="h-11 rounded-2xl bg-white/95 px-4 shadow-sm"
                                    aria-invalid={Boolean(isSubmitted && passwordError)}
                                    showLabel={t('login.showPassword')}
                                    hideLabel={t('login.hidePassword')}
                                />
                                {isSubmitted && passwordError ? (
                                    <p className="text-xs text-red-600">{passwordError}</p>
                                ) : null}
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="password_confirmation" className="text-sm font-semibold text-slate-950">
                                    {t('register.confirmPassword')} <span className="text-red-500">*</span>
                                </Label>
                                <PasswordInput
                                    id="password_confirmation"
                                    value={passwordConfirmation}
                                    onChange={(event) => setPasswordConfirmation(event.target.value)}
                                    maxLength={INPUT_LIMITS.password}
                                    autoComplete="new-password"
                                    className="h-11 rounded-2xl bg-white/95 px-4 shadow-sm"
                                    aria-invalid={Boolean(isSubmitted && passwordConfirmationError)}
                                    showLabel={t('login.showPassword')}
                                    hideLabel={t('login.hidePassword')}
                                />
                                {isSubmitted && passwordConfirmationError ? (
                                    <p className="text-xs text-red-600">{passwordConfirmationError}</p>
                                ) : null}
                            </div>

                            <Button
                                type="submit"
                                className="h-11 w-full rounded-2xl bg-slate-950 text-base font-bold text-white shadow-lg shadow-slate-950/15 hover:bg-slate-800"
                                disabled={registerMutation.isPending || googleMutation.isPending}
                            >
                                {registerMutation.isPending ? t('register.creatingAccount') : t('register.createAccount')}
                            </Button>
                        </form>

                        <div className="flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-slate-400">
                            <span className="h-px flex-1 bg-gray-200" />
                            <span>{t('register.orEmail')}</span>
                            <span className="h-px flex-1 bg-gray-200" />
                        </div>

                        <div className="min-h-11 w-full overflow-hidden rounded-md">
                            {googleClientId ? (
                                <div
                                    ref={googleButtonRef}
                                    className="flex min-h-11 justify-center"
                                    aria-busy={!googleReady || googleMutation.isPending}
                                />
                            ) : (
                                <Button type="button" variant="outline" className="h-11 w-full rounded-2xl bg-white/80" disabled>
                                    {t('register.googleNotConfigured')}
                                </Button>
                            )}
                        </div>

                        <p className="text-center text-sm text-slate-600">
                            {t('register.haveAccount')}{' '}
                            <Link href="/login" className="font-semibold text-cyan-700 transition hover:text-cyan-800">
                                {t('landing.signIn')}
                            </Link>
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
