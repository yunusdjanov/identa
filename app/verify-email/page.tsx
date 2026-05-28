'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, MailCheck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/components/providers/i18n-provider';

type VerifyStatus = 'success' | 'already' | 'invalid';

function resolveStatus(value: string | null): VerifyStatus {
    return value === 'success' || value === 'already' ? value : 'invalid';
}

function VerifyEmailContent() {
    const { t } = useI18n();
    const params = useSearchParams();
    const status = resolveStatus(params.get('status'));

    const tone = {
        success: { icon: CheckCircle2, ring: 'from-teal-50 to-emerald-50 text-teal-600 ring-teal-100', title: 'verifyEmail.page.successTitle', text: 'verifyEmail.page.successText' },
        already: { icon: MailCheck, ring: 'from-teal-50 to-sky-50 text-teal-600 ring-teal-100', title: 'verifyEmail.page.alreadyTitle', text: 'verifyEmail.page.alreadyText' },
        invalid: { icon: XCircle, ring: 'from-rose-50 to-red-50 text-rose-600 ring-rose-100', title: 'verifyEmail.page.invalidTitle', text: 'verifyEmail.page.invalidText' },
    }[status];

    const Icon = tone.icon;

    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 via-white to-teal-50 p-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-8 text-center shadow-sm shadow-slate-200/60">
                <span className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ring-1 ${tone.ring}`}>
                    <Icon className="h-8 w-8" strokeWidth={2} />
                </span>
                <h1 className="mt-5 text-lg font-bold tracking-tight text-slate-900">{t(tone.title)}</h1>
                <p className="mt-2 text-sm text-slate-500">{t(tone.text)}</p>
                <Button asChild className="mt-6 h-10 w-full rounded-xl">
                    <Link href="/dashboard">{t('verifyEmail.page.goToApp')}</Link>
                </Button>
            </div>
        </div>
    );
}

export default function VerifyEmailPage() {
    return (
        <Suspense fallback={null}>
            <VerifyEmailContent />
        </Suspense>
    );
}
