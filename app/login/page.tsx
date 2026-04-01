'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loginWithPassword } from '@/lib/api/dentist';
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

export default function LoginPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { login } = useAuthStore();
    const { t } = useI18n();

    const [email, setEmail] = useState('dentist@odenta.test');
    const [password, setPassword] = useState('password123');
    const [isSubmitted, setIsSubmitted] = useState(false);
    const emailError = getEmailValidationMessage(email, { required: true });
    const passwordError = password ? null : t('login.passwordRequired');
    const hasValidationErrors = Boolean(emailError || passwordError);

    const loginMutation = useMutation({
        mutationFn: () => loginWithPassword(email.trim(), password),
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
        <div className="relative min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
            <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
                <LanguageSwitcher variant="compact" />
            </div>
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <Link href="/">
                        <h1 className="text-4xl font-bold text-blue-600 mb-2 cursor-pointer hover:text-blue-700">
                            Odenta
                        </h1>
                    </Link>
                    <p className="text-gray-600">{t('login.subtitle')}</p>
                </div>

                <Card className="shadow-xl">
                    <CardHeader>
                        <CardTitle className="text-center text-2xl">{t('login.welcomeBack')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="email">{t('login.email')}</Label>
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
                                <Label htmlFor="password">{t('login.password')}</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    required
                                    maxLength={INPUT_LIMITS.password}
                                    autoComplete="current-password"
                                    aria-invalid={Boolean(isSubmitted && passwordError)}
                                />
                                {isSubmitted && passwordError ? (
                                    <p className="text-xs text-red-600">{passwordError}</p>
                                ) : null}
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
