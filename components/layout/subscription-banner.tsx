'use client';

import { AlertTriangle, Clock3, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatLocalizedDate } from '@/lib/i18n/date';
import type { AppLocale } from '@/lib/i18n/config';
import type { ApiSubscriptionSummary } from '@/lib/api/types';

interface SubscriptionBannerProps {
    locale: AppLocale;
    subscription?: ApiSubscriptionSummary | null;
    t: (key: string, variables?: Record<string, string | number>) => string;
}

type BannerTone = 'warning' | 'danger' | 'info';

interface BannerCopy {
    tone: BannerTone;
    title: string;
    description: string;
}

const EXPIRING_THRESHOLD_DAYS = 7;

function formatSubscriptionDate(value: string | null | undefined, locale: AppLocale): string | null {
    if (!value) {
        return null;
    }

    return formatLocalizedDate(value, locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

function getBannerCopy(
    subscription: ApiSubscriptionSummary | null | undefined,
    locale: AppLocale,
    t: SubscriptionBannerProps['t']
): BannerCopy | null {
    if (!subscription?.is_configured) {
        return null;
    }

    const endsAt = formatSubscriptionDate(subscription.ends_at, locale) ?? '-';
    const graceEndsAt = formatSubscriptionDate(subscription.grace_ends_at, locale) ?? endsAt;
    const daysRemaining = subscription.days_remaining;

    if (subscription.status === 'read_only') {
        return {
            tone: 'danger',
            title: t('subscription.banner.readOnlyTitle'),
            description: t('subscription.banner.readOnlyDescription', {
                date: graceEndsAt,
            }),
        };
    }

    if (subscription.status === 'grace') {
        return {
            tone: 'danger',
            title: t('subscription.banner.graceTitle'),
            description: t('subscription.banner.graceDescription', {
                date: graceEndsAt,
            }),
        };
    }

    if (subscription.cancel_at_period_end) {
        return {
            tone: 'info',
            title: t('subscription.banner.cancelScheduledTitle'),
            description: t('subscription.banner.cancelScheduledDescription', {
                date: endsAt,
            }),
        };
    }

    if (daysRemaining !== null && daysRemaining <= EXPIRING_THRESHOLD_DAYS) {
        if (subscription.plan === 'trial') {
            return {
                tone: 'warning',
                title: t('subscription.banner.trialEndingTitle'),
                description: t('subscription.banner.trialEndingDescription', {
                    days: Math.max(daysRemaining, 0),
                    date: endsAt,
                }),
            };
        }

        return {
            tone: 'warning',
            title: t('subscription.banner.planEndingTitle'),
            description: t('subscription.banner.planEndingDescription', {
                days: Math.max(daysRemaining, 0),
                date: endsAt,
            }),
        };
    }

    return null;
}

export function SubscriptionBanner({ locale, subscription, t }: SubscriptionBannerProps) {
    const banner = getBannerCopy(subscription, locale, t);
    if (!banner) {
        return null;
    }

    const Icon = banner.tone === 'danger'
        ? ShieldAlert
        : banner.tone === 'warning'
            ? AlertTriangle
            : Clock3;

    return (
        <div
            className={cn(
                'border-t',
                banner.tone === 'danger' && 'border-red-200 bg-red-50',
                banner.tone === 'warning' && 'border-amber-200 bg-amber-50',
                banner.tone === 'info' && 'border-blue-200 bg-blue-50'
            )}
        >
            <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 lg:px-8">
                <div className="flex items-start gap-3">
                    <Icon
                        className={cn(
                            'mt-0.5 h-4 w-4 shrink-0',
                            banner.tone === 'danger' && 'text-red-600',
                            banner.tone === 'warning' && 'text-amber-600',
                            banner.tone === 'info' && 'text-blue-600'
                        )}
                    />
                    <div className="space-y-1">
                        <p
                            className={cn(
                                'text-sm font-semibold',
                                banner.tone === 'danger' && 'text-red-900',
                                banner.tone === 'warning' && 'text-amber-900',
                                banner.tone === 'info' && 'text-blue-900'
                            )}
                        >
                            {banner.title}
                        </p>
                        <p
                            className={cn(
                                'text-sm',
                                banner.tone === 'danger' && 'text-red-800',
                                banner.tone === 'warning' && 'text-amber-800',
                                banner.tone === 'info' && 'text-blue-800'
                            )}
                        >
                            {banner.description}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
