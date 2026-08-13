'use client';

import { useI18n } from '@/components/providers/i18n-provider';

export function SkipToContentLink() {
    const { t } = useI18n();

    return (
        <a
            href="#main-content"
            className="fixed left-3 top-3 z-[100] -translate-y-24 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-lg transition-transform focus:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:ring-offset-2"
        >
            {t('common.skipToContent')}
        </a>
    );
}
