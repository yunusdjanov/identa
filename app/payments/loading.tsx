'use client';

import { useSearchParams } from 'next/navigation';

import { PaymentsLoadingState } from '@/components/layout/page-loading-skeletons';

export default function Loading() {
    const searchParams = useSearchParams();
    const tab = searchParams.get('tab') === 'expenses' || searchParams.get('tab') === 'history'
        ? 'expenses'
        : 'patients';

    return <PaymentsLoadingState tab={tab} />;
}
