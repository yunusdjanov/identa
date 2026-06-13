'use client';

import { UserRound } from 'lucide-react';
import { useI18n } from '@/components/providers/i18n-provider';
import type { ApiRecordActor } from '@/lib/api/types';
import { cn, truncateForUi } from '@/lib/utils';

interface RecordAuthorBadgeProps {
    createdBy?: ApiRecordActor | null;
    updatedBy?: ApiRecordActor | null;
    className?: string;
}

const AUTHOR_NAME_UI_LIMIT = 22;

/**
 * Renders the compact "created by" chip used across record lists.
 */
export function RecordAuthorBadge({ createdBy, updatedBy, className }: RecordAuthorBadgeProps) {
    const { t } = useI18n();
    const primaryActor = createdBy ?? updatedBy;

    if (!primaryActor) {
        return null;
    }

    const creatorName = truncateForUi(createdBy?.name ?? primaryActor.name, AUTHOR_NAME_UI_LIMIT);
    const updaterName = updatedBy?.name ? truncateForUi(updatedBy.name, AUTHOR_NAME_UI_LIMIT) : null;
    const label = t('recordAuthors.by', { name: creatorName });
    const title = createdBy && updatedBy && updaterName && updatedBy.id !== createdBy.id
        ? `${t('recordAuthors.createdBy', { name: createdBy?.name ?? primaryActor.name })} - ${t('recordAuthors.updatedBy', { name: updatedBy.name })}`
        : t(createdBy ? 'recordAuthors.createdBy' : 'recordAuthors.updatedBy', { name: primaryActor.name });

    return (
        <span
            className={cn(
                'inline-flex max-w-full items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200',
                className
            )}
            title={title}
        >
            <UserRound className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
            <span className="truncate">{label}</span>
        </span>
    );
}
