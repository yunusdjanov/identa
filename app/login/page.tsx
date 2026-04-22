'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { getCurrentUser, loginWithPassword } from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import {
    consumeAuthRedirectReason,
    isSessionExpiredRedirectReason,
    resetSessionExpiredNotification,
} from '@/lib/auth/session-expiry';
import { useAuthStore } from '@/lib/store';
import { toast } from 'sonner';
import { INPUT_LIMITS, getEmailValidationMessage } from '@/lib/input-validation';
import { useI18n } from '@/components/providers/i18n-provider';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { Brand } from '@/components/branding/brand';

export default function LoginPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { login } = useAuthStore();
    const { t } = useI18n();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [remember, setRemember] = useState(true);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const emailError = getEmailValidationMessage(email, { required: true });
    const passwordError = password ? null : t('login.passwordRequired');
    const hasValidationErrors = Boolean(emailError || passwordError);
    const currentUserQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        retry: false,
        staleTime: 5 * 60_000,
    });

    const loginMutation = useMutation({
        mutationFn: () => loginWithPassword(email.trim(), password, remember),
        onSuccess: (user) => {
            resetSessionExpiredNotification();
            login(user.name);
            queryClient.setQueryData(['auth', 'me'], user);
            toast.success(t('login.toast.success'));
            router.push(user.role === 'admin' ? '/admin' : '/dashboard');
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('login.toast.failed')));
        },
    });

    useEffect(() => {
        const redirectReason = consumeAuthRedirectReason();
        if (isSessionExpiredRedirectReason(redirectReason)) {
            toast.error(t('auth.sessionExpired'));
        }
    }, [t]);

    useEffect(() => {
        if (!currentUserQuery.data) {
            return;
        }

        router.replace(currentUserQuery.data.role === 'admin' ? '/admin' : '/dashboard');
    }, [currentUserQuery.data, router]);

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSubmitted(true);
        if (hasValidationErrors) {
            toast.error(t('login.toast.fixErrors'));
            return;
        }

        loginMutation.mutate();
    };

    if (currentUserQuery.isLoading) {
        return (
            <div className="relative min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
                <div className="w-full max-w-md">
                    <Card className="shadow-xl">
                        <CardContent className="flex items-center justify-center py-10 text-sm text-gray-500">
                            {t('common.loading')}
                        </CardContent>
                    </Card>
                </div>
            </div>
        );
    }

    return (
        <div className="relative min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
            <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
                <LanguageSwitcher variant="compact" />
            </div>
            <div className="w-full max-w-md">
                <div className="mb-8 text-center">
                    <div className="mb-3 flex justify-center">
                        <Brand href="/" variant="text" priority textClassName="w-40 sm:w-44" />
                    </div>
                    <p className="text-gray-600">{t('login.subtitle')}</p>
                </div>

                <Card className="shadow-xl">
                    <CardHeader>
                        <CardTitle className="text-center text-2xl">{t('login.welcomeBack')}</CardTitle>
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
                                    autoComplete="current-password"
                                    aria-invalid={Boolean(isSubmitted && passwordError)}
                                    showLabel={t('login.showPassword')}
                                    hideLabel={t('login.hidePassword')}
                                />
                                {isSubmitted && passwordError ? (
                                    <p className="text-xs text-red-600">{passwordError}</p>
                                ) : null}
                            </div>

                            <div className="flex items-center justify-between gap-4">
                                <label className="flex items-center gap-3 text-sm text-gray-600">
                                    <input
                                        type="checkbox"
                                        checked={remember}
                                        onChange={(event) => setRemember(event.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span>{t('login.rememberMe')}</span>
                                </label>
                                <Link
                                    href="/forgot-password"
                                    className="text-sm font-medium text-blue-600 transition hover:text-blue-700"
                                >
                                    {t('login.forgotPassword')}
                                </Link>
                            </div>

                            <Button
                                type="submit"
                                className="w-full"
                                disabled={loginMutation.isPending}
                            >
                                {loginMutation.isPending ? t('login.signingIn') : t('login.signIn')}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
