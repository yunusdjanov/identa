'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/components/providers/i18n-provider';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { Brand } from '@/components/branding/brand';

export default function RegisterPage() {
    const { t } = useI18n();

    return (
        <div className="relative min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
            <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
                <LanguageSwitcher variant="compact" />
            </div>
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <div className="mb-3 flex justify-center">
                        <Brand href="/" variant="full" priority fullClassName="w-28 sm:w-32" />
                    </div>
                    <p className="text-gray-600">{t('register.inviteOnlySubtitle')}</p>
                </div>

                <Card className="shadow-xl">
                    <CardHeader>
                        <div className="flex justify-center">
                            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                                {t('register.inviteOnlyBadge')}
                            </span>
                        </div>
                        <CardTitle className="text-center text-2xl">{t('register.inviteOnlyTitle')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <p className="text-sm leading-6 text-gray-600">
                            {t('register.inviteOnlyDescription')}
                        </p>
                        <p className="text-sm leading-6 text-gray-600">
                            {t('register.inviteOnlyHelp')}
                        </p>
                        <div className="flex flex-col gap-3 sm:flex-row">
                            <Button asChild className="flex-1">
                                <Link href="/login">{t('register.inviteOnlyLogin')}</Link>
                            </Button>
                            <Button asChild variant="outline" className="flex-1">
                                <Link href="/admin/login">{t('register.inviteOnlyAdmin')}</Link>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
