'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { useI18n } from '@/components/providers/i18n-provider';
import {
    INPUT_LIMITS,
    getEmailValidationMessage,
    getPasswordValidationMessage,
} from '@/lib/input-validation';
import { getApiErrorMessage } from '@/lib/api/client';
import { resetPasswordWithToken } from '@/lib/api/dentist';
import { toast } from 'sonner';

export default function ResetPasswordPage() {
    const { t } = useI18n();
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get('token') ?? '';
    const initialEmail = searchParams.get('email') ?? '';

    const [email, setEmail] = useState(initialEmail);
    const [password, setPassword] = useState('');
    const [passwordConfirmation, setPasswordConfirmation] = useState('');
    const [isSubmitted, setIsSubmitted] = useState(false);

    const emailError = getEmailValidationMessage(email, { required: true });
    const passwordError = getPasswordValidationMessage(password, { required: true });
    const passwordConfirmationError = useMemo(() => {
        if (!passwordConfirmation.trim()) {
            return t('resetPassword.passwordConfirmationRequired');
        }

        if (password !== passwordConfirmation) {
            return t('resetPassword.passwordMismatch');
        }

        return null;
    }, [password, passwordConfirmation, t]);
    const tokenError = token ? null : t('resetPassword.invalidLink');

    const resetPasswordMutation = useMutation({
        mutationFn: () =>
            resetPasswordWithToken({
                token,
                email: email.trim(),
                password,
                password_confirmation: passwordConfirmation,
            }),
        onSuccess: (message) => {
            toast.success(message || t('resetPassword.success'));
            router.push('/login');
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('resetPassword.failed')));
        },
    });

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSubmitted(true);

        if (emailError || passwordError || passwordConfirmationError || tokenError) {
            toast.error(t('resetPassword.fixErrors'));
            return;
        }

        resetPasswordMutation.mutate();
    };

    return (
        <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50 p-4">
            <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
                <LanguageSwitcher variant="compact" />
            </div>
            <div className="w-full max-w-md">
                <div className="mb-8 text-center">
                    <Link href="/">
                        <h1 className="mb-2 cursor-pointer text-4xl font-bold text-blue-600 hover:text-blue-700">
                            Identa
                        </h1>
                    </Link>
                    <p className="text-gray-600">{t('resetPassword.subtitle')}</p>
                </div>

                <Card className="shadow-xl">
                    <CardHeader>
                        <CardTitle className="text-center text-2xl">{t('resetPassword.title')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="email">
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
                                    aria-invalid={Boolean(isSubmitted && emailError)}
                                />
                                {isSubmitted && emailError ? (
                                    <p className="text-xs text-red-600">{emailError}</p>
                                ) : null}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password">
                                    {t('login.password')} <span className="text-red-500">*</span>
                                </Label>
                                <PasswordInput
                                    id="password"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    required
                                    maxLength={INPUT_LIMITS.password}
                                    autoComplete="new-password"
                                    aria-invalid={Boolean(isSubmitted && passwordError)}
                                    showLabel={t('login.showPassword')}
                                    hideLabel={t('login.hidePassword')}
                                />
                                {isSubmitted && passwordError ? (
                                    <p className="text-xs text-red-600">{passwordError}</p>
                                ) : null}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password_confirmation">
                                    {t('resetPassword.passwordConfirmation')} <span className="text-red-500">*</span>
                                </Label>
                                <PasswordInput
                                    id="password_confirmation"
                                    value={passwordConfirmation}
                                    onChange={(event) => setPasswordConfirmation(event.target.value)}
                                    required
                                    maxLength={INPUT_LIMITS.password}
                                    autoComplete="new-password"
                                    aria-invalid={Boolean(isSubmitted && passwordConfirmationError)}
                                    showLabel={t('login.showPassword')}
                                    hideLabel={t('login.hidePassword')}
                                />
                                {isSubmitted && passwordConfirmationError ? (
                                    <p className="text-xs text-red-600">{passwordConfirmationError}</p>
                                ) : null}
                            </div>

                            {isSubmitted && tokenError ? (
                                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                    {tokenError}
                                </div>
                            ) : null}

                            <Button
                                type="submit"
                                className="w-full"
                                disabled={resetPasswordMutation.isPending}
                            >
                                {resetPasswordMutation.isPending
                                    ? t('resetPassword.submitting')
                                    : t('resetPassword.submit')}
                            </Button>

                            <div className="text-center">
                                <Link
                                    href="/login"
                                    className="text-sm font-medium text-blue-600 transition hover:text-blue-700"
                                >
                                    {t('forgotPassword.backToLogin')}
                                </Link>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
