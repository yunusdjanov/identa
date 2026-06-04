'use client';

import { useMemo } from 'react';
import { CheckCircle, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { AdminDentistSubscriptionAction } from '@/lib/api/dentist';
import type { ApiAdminDentist, ApiSubscriptionSummary } from '@/lib/api/types';
import { useI18n } from '@/components/providers/i18n-provider';

interface StateManagementSectionProps {
    dentist: ApiAdminDentist;
    subscription: ApiSubscriptionSummary;
    isPending: boolean;
    onAction: (dentist: ApiAdminDentist, action: AdminDentistSubscriptionAction) => void;
    getSubscriptionActionLabel: (action: AdminDentistSubscriptionAction) => string;
}

/**
 * State management section. Two large buttons:
 *   - "Ограничить просмотром" (mark_read_only): disabled when already
 *     read-only OR no subscription.
 *   - "Сделать активным" (mark_active): disabled when already full+active
 *     OR no subscription.
 *
 * Each button shows a contextual reason inline + as a tooltip so the admin
 * understands why an option is greyed out.
 */
export function StateManagementSection({
    dentist,
    subscription: sub,
    isPending,
    onAction,
    getSubscriptionActionLabel,
}: StateManagementSectionProps) {
    const { t } = useI18n();

    const { cannotMarkReadOnly, cannotMarkActive, markReadOnlyReason, markActiveReason } = useMemo(() => {
        const cannotReadOnly = sub.access_mode === 'read_only' || sub.status === 'none';
        const cannotActive = (sub.access_mode === 'full' && sub.status === 'active') || sub.status === 'none';
        return {
            cannotMarkReadOnly: cannotReadOnly,
            cannotMarkActive: cannotActive,
            markReadOnlyReason: cannotReadOnly
                ? (sub.status === 'none'
                    ? t('admin.billing.state.markReadOnlyReason.noSub')
                    : t('admin.billing.state.markReadOnlyReason.alreadyReadOnly'))
                : t('admin.billing.state.limitDescription'),
            markActiveReason: cannotActive
                ? (sub.status === 'none'
                    ? t('admin.billing.state.markActiveReason.noSub')
                    : t('admin.billing.state.markActiveReason.alreadyActive'))
                : t('admin.billing.state.activateDescription'),
        };
    }, [sub.access_mode, sub.status, t]);

    return (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-lg font-bold tracking-[-0.02em] text-slate-950">
                        {t('admin.billing.actionGroup.state')}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                        {t('admin.billing.state.description')}
                    </p>
                </div>
                <Badge
                    variant="outline"
                    className={
                        sub.access_mode === 'full'
                            ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                            : 'border-orange-100 bg-orange-50 text-orange-700'
                    }
                >
                    {sub.access_mode === 'full'
                        ? t('admin.billing.state.fullAccess')
                        : t('admin.billing.state.readOnlyAccess')}
                </Badge>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                    type="button"
                    onClick={() => onAction(dentist, 'mark_read_only')}
                    disabled={isPending || cannotMarkReadOnly}
                    title={markReadOnlyReason}
                    className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-orange-200 hover:bg-orange-50/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:bg-white"
                >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                        <Lock className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                        <p className="font-semibold text-slate-950">
                            {getSubscriptionActionLabel('mark_read_only')}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-600">
                            {markReadOnlyReason}
                        </p>
                    </div>
                </button>

                <button
                    type="button"
                    onClick={() => onAction(dentist, 'mark_active')}
                    disabled={isPending || cannotMarkActive}
                    title={markActiveReason}
                    className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-emerald-200 hover:bg-emerald-50/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:bg-white"
                >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                        <CheckCircle className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                        <p className="font-semibold text-slate-950">
                            {getSubscriptionActionLabel('mark_active')}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-600">
                            {markActiveReason}
                        </p>
                    </div>
                </button>
            </div>
        </div>
    );
}
