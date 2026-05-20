'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/components/providers/i18n-provider';
import { GoogleAuthButton } from '@/components/auth/google-auth-button';
import { AuthPageShell } from '@/components/auth/auth-page-shell';
import {
    authCardClassName,
    authCardContentClassName,
    authInputClassName,
    authLinkClassName,
    authSubmitClassName,
} from '@/components/auth/auth-form-styles';
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
                width: Math.max(240, Math.min(360, Math.floor(googleButtonRef.current.getBoundingClientRect().width || 360))),
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
        <AuthPageShell>
            <Card className={authCardClassName}>
                <CardHeader className="space-y-1.5 px-5 pb-2.5 pt-5 text-center sm:px-7 sm:pb-3 sm:pt-6">
                    <div className="space-y-0.5">
                        <CardTitle className="text-[1.32rem] font-black leading-tight tracking-normal text-slate-950 sm:text-[1.42rem]">
                            {t('register.cardTitle')}
                        </CardTitle>
                        <p className="text-[13px] leading-5 text-slate-600">{t('register.subtitle')}</p>
                    </div>
                </CardHeader>
                <CardContent className={`${authCardContentClassName} sm:space-y-4`}>
                        <div className="flex justify-center">
                            <div className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-full border border-teal-300/80 bg-white/80 px-3.5 text-teal-800 shadow-sm shadow-cyan-950/5 ring-1 ring-white/80 backdrop-blur">
                                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-teal-100 text-teal-700 ring-1 ring-teal-200/80">
                                    <CheckCircle2 className="size-3.5" aria-hidden="true" />
                                </span>
                                <span className="truncate text-[13px] font-black leading-none tracking-[0.06em]">
                                    {t('register.trialBadge')}
                                </span>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="name" className="text-[13px] font-semibold text-slate-950">
                                    {t('register.name')} <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    id="name"
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                    maxLength={INPUT_LIMITS.personName}
                                    autoComplete="name"
                                    className={authInputClassName}
                                    aria-invalid={Boolean(isSubmitted && nameError)}
                                />
                                {isSubmitted && nameError ? (
                                    <p className="text-xs text-red-600">{nameError}</p>
                                ) : null}
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="email" className="text-[13px] font-semibold text-slate-950">
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
                                    className={authInputClassName}
                                    aria-invalid={Boolean(isSubmitted && emailError)}
                                />
                                {isSubmitted && emailError ? (
                                    <p className="text-xs text-red-600">{emailError}</p>
                                ) : null}
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="password" className="text-[13px] font-semibold text-slate-950">
                                    {t('register.password')} <span className="text-red-500">*</span>
                                </Label>
                                <PasswordInput
                                    id="password"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    maxLength={INPUT_LIMITS.password}
                                    autoComplete="new-password"
                                    className={authInputClassName}
                                    aria-invalid={Boolean(isSubmitted && passwordError)}
                                    showLabel={t('login.showPassword')}
                                    hideLabel={t('login.hidePassword')}
                                />
                                {isSubmitted && passwordError ? (
                                    <p className="text-xs text-red-600">{passwordError}</p>
                                ) : null}
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="password_confirmation" className="text-[13px] font-semibold text-slate-950">
                                    {t('register.confirmPassword')} <span className="text-red-500">*</span>
                                </Label>
                                <PasswordInput
                                    id="password_confirmation"
                                    value={passwordConfirmation}
                                    onChange={(event) => setPasswordConfirmation(event.target.value)}
                                    maxLength={INPUT_LIMITS.password}
                                    autoComplete="new-password"
                                    className={authInputClassName}
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
                                className={`${authSubmitClassName} gap-2`}
                                disabled={registerMutation.isPending || googleMutation.isPending}
                            >
                                {registerMutation.isPending ? t('register.creatingAccount') : t('register.createAccount')}
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
                            isConfigured={Boolean(googleClientId)}
                            isReady={googleReady}
                            isPending={registerMutation.isPending || googleMutation.isPending}
                            label={t('register.googleContinue')}
                            unavailableLabel={t('register.googleNotConfigured')}
                            soonLabel={t('register.googleSoon')}
                        />

                        <p className="text-center text-sm leading-6 text-slate-600">
                            {t('register.haveAccount')}{' '}
                            <Link href="/login" className={authLinkClassName}>
                                {t('landing.signIn')}
                            </Link>
                        </p>
                </CardContent>
            </Card>
        </AuthPageShell>
    );
}
