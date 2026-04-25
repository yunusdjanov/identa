'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { useI18n } from '@/components/providers/i18n-provider';
import { INPUT_LIMITS, getEmailValidationMessage } from '@/lib/input-validation';
import { requestPasswordReset } from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import { toast } from 'sonner';
import { Brand } from '@/components/branding/brand';

export default function ForgotPasswordPage() {
    const { t } = useI18n();
    const searchParams = useSearchParams();
    const backToLoginHref = searchParams.get('from') === 'admin' ? '/admin/login' : '/login';
    const [email, setEmail] = useState('');
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [isSent, setIsSent] = useState(false);
    const emailError = getEmailValidationMessage(email, { required: true });

    const forgotPasswordMutation = useMutation({
        mutationFn: () => requestPasswordReset(email.trim()),
        onSuccess: (message) => {
            setIsSent(true);
            toast.success(message || t('forgotPassword.success'));
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('forgotPassword.failed')));
        },
    });

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSubmitted(true);

        if (emailError) {
            toast.error(t('forgotPassword.fixErrors'));
            return;
        }

        forgotPasswordMutation.mutate();
    };

    return (
        <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50 p-4">
            <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
                <LanguageSwitcher variant="compact" />
            </div>
            <div className="w-full max-w-md">
                <div className="mb-8 text-center">
                    <div className="mb-3 flex justify-center">
                        <Brand href="/" variant="text" priority textClassName="w-40 sm:w-44" />
                    </div>
                    <p className="text-gray-600">{t('forgotPassword.subtitle')}</p>
                </div>

                <Card className="shadow-xl">
                    <CardHeader>
                        <CardTitle className="text-center text-2xl">{t('forgotPassword.title')}</CardTitle>
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

                            {isSent ? (
                                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                                    {t('forgotPassword.sentHelp')}
                                </div>
                            ) : (
                                <p className="text-sm leading-6 text-gray-600">
                                    {t('forgotPassword.description')}
                                </p>
                            )}

                            <Button
                                type="submit"
                                className="w-full"
                                disabled={forgotPasswordMutation.isPending}
                            >
                                {forgotPasswordMutation.isPending
                                    ? t('forgotPassword.sending')
                                    : t('forgotPassword.submit')}
                            </Button>

                            <div className="text-center">
                                <Link
                                    href={backToLoginHref}
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
