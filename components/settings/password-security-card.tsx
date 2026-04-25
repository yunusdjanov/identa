'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { useI18n } from '@/components/providers/i18n-provider';
import { getApiErrorMessage } from '@/lib/api/client';
import { changeCurrentPassword } from '@/lib/api/dentist';
import type { ApiUser } from '@/lib/api/types';
import { INPUT_LIMITS, getPasswordValidationMessage } from '@/lib/input-validation';

interface PasswordSecurityCardProps {
    user: ApiUser;
    className?: string;
}

export function PasswordSecurityCard({ user, className }: PasswordSecurityCardProps) {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newPasswordConfirmation, setNewPasswordConfirmation] = useState('');
    const [isSubmitted, setIsSubmitted] = useState(false);
    const requiresCurrentPassword = !user.must_change_password;

    const currentPasswordError = requiresCurrentPassword && !currentPassword.trim()
        ? t('settings.currentPasswordRequired')
        : null;
    const newPasswordError = getPasswordValidationMessage(newPassword, { required: true });
    const newPasswordConfirmationError = useMemo(() => {
        if (!newPasswordConfirmation.trim()) {
            return t('settings.passwordConfirmationRequired');
        }

        if (newPassword !== newPasswordConfirmation) {
            return t('settings.passwordMismatch');
        }

        return null;
    }, [newPassword, newPasswordConfirmation, t]);
    const hasErrors = Boolean(currentPasswordError || newPasswordError || newPasswordConfirmationError);

    const changePasswordMutation = useMutation({
        mutationFn: () =>
            changeCurrentPassword({
                ...(currentPassword.trim() ? { current_password: currentPassword } : {}),
                new_password: newPassword,
                new_password_confirmation: newPasswordConfirmation,
            }),
        onSuccess: (updatedUser) => {
            queryClient.setQueryData(['auth', 'me'], updatedUser);
            setCurrentPassword('');
            setNewPassword('');
            setNewPasswordConfirmation('');
            setIsSubmitted(false);
            toast.success(t('settings.passwordChanged'));
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('settings.passwordChangeFailed')));
        },
    });

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSubmitted(true);

        if (hasErrors) {
            toast.error(t('settings.passwordFixErrors'));
            return;
        }

        changePasswordMutation.mutate();
    };

    return (
        <Card className={className}>
            <CardHeader>
                <CardTitle className="flex items-center">
                    <Lock className="mr-2 h-4 w-4" />
                    {t('settings.passwordSecurity')}
                </CardTitle>
                <p className="text-sm text-slate-500">{t('settings.passwordSelfServiceInfo')}</p>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-5">
                    {requiresCurrentPassword ? (
                        <div className="space-y-2">
                            <Label htmlFor="current-password">
                                {t('settings.currentPassword')} <span className="text-red-500">*</span>
                            </Label>
                            <PasswordInput
                                id="current-password"
                                value={currentPassword}
                                onChange={(event) => setCurrentPassword(event.target.value)}
                                required
                                maxLength={INPUT_LIMITS.password}
                                autoComplete="current-password"
                                aria-invalid={Boolean(isSubmitted && currentPasswordError)}
                                showLabel={t('login.showPassword')}
                                hideLabel={t('login.hidePassword')}
                            />
                            {isSubmitted && currentPasswordError ? (
                                <p className="text-xs text-red-600">{currentPasswordError}</p>
                            ) : null}
                        </div>
                    ) : null}

                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="new-password">
                                {t('settings.newPassword')} <span className="text-red-500">*</span>
                            </Label>
                            <PasswordInput
                                id="new-password"
                                value={newPassword}
                                onChange={(event) => setNewPassword(event.target.value)}
                                required
                                maxLength={INPUT_LIMITS.password}
                                autoComplete="new-password"
                                aria-invalid={Boolean(isSubmitted && newPasswordError)}
                                showLabel={t('login.showPassword')}
                                hideLabel={t('login.hidePassword')}
                            />
                            {isSubmitted && newPasswordError ? (
                                <p className="text-xs text-red-600">{newPasswordError}</p>
                            ) : (
                                <p className="text-xs text-slate-500">{t('settings.newPasswordHelp')}</p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="new-password-confirmation">
                                {t('settings.confirmNewPassword')} <span className="text-red-500">*</span>
                            </Label>
                            <PasswordInput
                                id="new-password-confirmation"
                                value={newPasswordConfirmation}
                                onChange={(event) => setNewPasswordConfirmation(event.target.value)}
                                required
                                maxLength={INPUT_LIMITS.password}
                                autoComplete="new-password"
                                aria-invalid={Boolean(isSubmitted && newPasswordConfirmationError)}
                                showLabel={t('login.showPassword')}
                                hideLabel={t('login.hidePassword')}
                            />
                            {isSubmitted && newPasswordConfirmationError ? (
                                <p className="text-xs text-red-600">{newPasswordConfirmationError}</p>
                            ) : null}
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <Button type="submit" disabled={changePasswordMutation.isPending}>
                            {changePasswordMutation.isPending
                                ? t('settings.changingPassword')
                                : t('settings.changePassword')}
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}
