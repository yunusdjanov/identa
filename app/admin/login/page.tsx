'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { getApiErrorMessage } from '@/lib/api/client';
import { loginWithPassword, logoutSession } from '@/lib/api/dentist';
import { toast } from 'sonner';
import { Shield } from 'lucide-react';
import { INPUT_LIMITS, getEmailValidationMessage } from '@/lib/input-validation';
import { useI18n } from '@/components/providers/i18n-provider';
import { LanguageSwitcher } from '@/components/layout/language-switcher';

export default function AdminLoginPage() {
    const { t } = useI18n();
    const router = useRouter();
    const queryClient = useQueryClient();
    const [credentials, setCredentials] = useState({
        email: '',
        password: '',
    });
    const [remember, setRemember] = useState(true);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const emailError = getEmailValidationMessage(credentials.email, { required: true });
    const passwordError = credentials.password ? null : t('admin.login.passwordRequired');
    const hasValidationErrors = Boolean(emailError || passwordError);

    const loginMutation = useMutation({
        mutationFn: async () => {
            const user = await loginWithPassword(
                credentials.email.trim(),
                credentials.password,
                remember
            );

            if (user.role !== 'admin') {
                await logoutSession();
                throw new Error(t('admin.login.accessRequired'));
            }

            return user;
        },
        onSuccess: (user) => {
            queryClient.setQueryData(['auth', 'me'], user);
            toast.success(t('admin.login.success'));
            router.push('/admin');
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('admin.login.invalidCredentials')));
        },
    });

    const handleLogin = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSubmitted(true);
        if (hasValidationErrors) {
            toast.error(t('admin.form.fixErrors'));
            return;
        }

        loginMutation.mutate();
    };

    return (
        <div className="relative min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center p-4">
            <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
                <LanguageSwitcher variant="compact" />
            </div>
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <div className="flex justify-center mb-4">
                        <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center">
                            <Shield className="w-8 h-8 text-white" />
                        </div>
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
                                    id="email"
                                    type="email"
                                    value={credentials.email}
                                    onChange={(event) =>
                                        setCredentials({ ...credentials, email: event.target.value })
                                    }
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
                                <Label htmlFor="password">
                                    {t('login.password')} <span className="text-red-500">*</span>
                                </Label>
                                <PasswordInput
                                    id="password"
                                    value={credentials.password}
                                    onChange={(event) =>
                                        setCredentials({ ...credentials, password: event.target.value })
                                    }
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

                            <label className="flex items-center gap-3 text-sm text-slate-600">
                                <input
                                    type="checkbox"
                                    checked={remember}
                                    onChange={(event) => setRemember(event.target.checked)}
                                    className="h-4 w-4 rounded border-gray-300 text-slate-900 focus:ring-slate-500"
                                />
                                <span>{t('login.rememberMe')}</span>
                            </label>

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

                <p className="text-center text-xs text-slate-500 mt-6">
                    {t('admin.login.notice')}
                </p>
            </div>
        </div>
    );
}
