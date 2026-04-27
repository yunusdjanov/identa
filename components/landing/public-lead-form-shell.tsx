'use client';

import dynamic from 'next/dynamic';
import { QueryProvider } from '@/components/providers/query-provider';
import { Skeleton } from '@/components/ui/skeleton';
import type { LandingFormContent } from '@/components/landing/public-lead-form';

const LazyPublicLeadForm = dynamic(
    () => import('@/components/landing/public-lead-form').then((module) => module.PublicLeadForm),
    {
        ssr: false,
        loading: () => (
            <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Skeleton className="h-16 rounded-2xl" />
                    <Skeleton className="h-16 rounded-2xl" />
                    <Skeleton className="h-16 rounded-2xl" />
                    <Skeleton className="h-16 rounded-2xl" />
                </div>
                <Skeleton className="h-28 rounded-2xl" />
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <Skeleton className="h-12 rounded-xl" />
                    <Skeleton className="h-12 rounded-xl sm:w-44" />
                </div>
            </div>
        ),
    }
);

export function PublicLeadFormShell({
    content,
    telegramHref,
}: {
    content: LandingFormContent;
    telegramHref: string;
}) {
    return (
        <QueryProvider>
            <LazyPublicLeadForm content={content} telegramHref={telegramHref} />
        </QueryProvider>
    );
}
