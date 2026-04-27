'use client';

import { Loader2, LogOut } from 'lucide-react';
import { useI18n } from '@/components/providers/i18n-provider';

export function LogoutOverlay({ show }: { show: boolean }) {
    const { t } = useI18n();

    if (!show) {
        return null;
    }

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/10 p-4 backdrop-blur-[3px]"
            role="status"
            aria-live="polite"
            aria-label={t('menu.loggingOut')}
        >
            <div className="flex w-full max-w-xs items-center gap-4 rounded-[1.4rem] border border-white/80 bg-white/92 p-4 shadow-2xl shadow-slate-900/12 ring-1 ring-blue-100/70">
                <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                    <LogOut className="h-5 w-5" aria-hidden="true" />
                    <Loader2 className="absolute -right-1 -top-1 h-4 w-4 animate-spin rounded-full bg-white text-blue-600" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-950">{t('menu.loggingOut')}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{t('menu.loggingOutHint')}</p>
                </div>
            </div>
        </div>
    );
}
