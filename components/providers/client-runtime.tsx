'use client';

import dynamic from 'next/dynamic';

const RuntimeToaster = dynamic(
    () => import('@/components/ui/sonner').then((module) => module.Toaster),
    { ssr: false }
);

const RuntimeAnalytics = dynamic(
    () => import('@vercel/analytics/next').then((module) => module.Analytics),
    { ssr: false }
);

const RuntimeSpeedInsights = dynamic(
    () => import('@vercel/speed-insights/next').then((module) => module.SpeedInsights),
    { ssr: false }
);

export function ClientRuntime() {
    return (
        <>
            <RuntimeToaster />
            <RuntimeAnalytics />
            <RuntimeSpeedInsights />
        </>
    );
}
