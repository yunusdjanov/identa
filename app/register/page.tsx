'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { registerDentist } from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store';
import { toast } from 'sonner';
import { INPUT_LIMITS, getEmailValidationMessage, getTextValidationMessage } from '@/lib/input-validation';
import { useI18n } from '@/components/providers/i18n-provider';
import { LanguageSwitcher } from '@/components/layout/language-switcher';

export default function RegisterPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { login } = useAuthStore();
    const { t } = useI18n();
    const [form, setForm] = useState({
        name: '',
        email: '',
        password: '',
        passwordConfirmation: '',
    });
    const [isSubmitted, setIsSubmitted] = useState(false);
    const nameError = getTextValidationMessage(form.name, {
        label: t('register.name'),
        required: true,
        min: 3,
        max: INPUT_LIMITS.personName,
    });
    const emailError = getEmailValidationMessage(form.email, { required: true });
    const passwordError = form.password.length >= 8 ? null : t('register.passwordMin');
    const passwordConfirmationError = form.passwordConfirmation.length === 0
        ? t('register.passwordConfirmRequired')
        : form.password !== form.passwordConfirmation
            ? t('register.passwordMismatch')
            : null;
    const hasValidationErrors = Boolean(
        nameError
        || emailError
        || passwordError
        || passwordConfirmationError
    );

    const registerMutation = useMutation({
        mutationFn: () =>
            registerDentist({
                name: form.name.trim(),
                email: form.email.trim(),
                password: form.password,
                password_confirmation: form.passwordConfirmation,
            }),
        onSuccess: (user) => {
            login(user.name);
            queryClient.setQueryData(['auth', 'me'], user);
            toast.success(t('register.toast.success'));
            router.push('/dashboard');
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('register.toast.failed')));
        },
    });

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
        <div className="relative min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
            <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
                <LanguageSwitcher variant="compact" />
            </div>
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <Link href="/">
                        <h1 className="text-4xl font-bold text-blue-600 mb-2 cursor-pointer hover:text-blue-700">
                            Identa
                        </h1>
                    </Link>
                    <p className="text-gray-600">{t('register.subtitle')}</p>
                </div>

                <Card className="shadow-xl">
                    <CardHeader>
                        <CardTitle className="text-center text-2xl">{t('register.getStarted')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="name">{t('register.name')}</Label>
                                <Input
                                    id="name"
                                    value={form.name}
                                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                                    required
                                    maxLength={INPUT_LIMITS.personName}
                                    aria-invalid={Boolean(isSubmitted && nameError)}
                                />
                                {isSubmitted && nameError ? (
                                    <p className="text-xs text-red-600">{nameError}</p>
                                ) : null}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="email">{t('register.email')}</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={form.email}
                                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                                    required
                                    maxLength={INPUT_LIMITS.email}
                                    inputMode="email"
                                    autoComplete="email"
                                    aria-invalid={Boolean(isSubmitted && emailError)}
                                />
                                {isSubmitted && emailError ? (
                                    <p className="text-xs text-red-600">{emailError}</p>
                                ) : null}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password">{t('register.password')}</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={form.password}
                                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                                    required
                                    minLength={8}
                                    maxLength={INPUT_LIMITS.password}
                                    autoComplete="new-password"
                                    aria-invalid={Boolean(isSubmitted && passwordError)}
                                />
                                {isSubmitted && passwordError ? (
                                    <p className="text-xs text-red-600">{passwordError}</p>
                                ) : null}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="passwordConfirmation">{t('register.confirmPassword')}</Label>
                                <Input
                                    id="passwordConfirmation"
                                    type="password"
                                    value={form.passwordConfirmation}
                                    onChange={(event) =>
                                        setForm({ ...form, passwordConfirmation: event.target.value })
                                    }
                                    required
                                    minLength={8}
                                    maxLength={INPUT_LIMITS.password}
                                    autoComplete="new-password"
                                    aria-invalid={Boolean(isSubmitted && passwordConfirmationError)}
                                />
                                {isSubmitted && passwordConfirmationError ? (
                                    <p className="text-xs text-red-600">{passwordConfirmationError}</p>
                                ) : null}
                            </div>

                            <Button
                                type="submit"
                                className="w-full"
                                disabled={registerMutation.isPending}
                            >
                                {registerMutation.isPending ? t('register.creatingAccount') : t('register.createAccount')}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
