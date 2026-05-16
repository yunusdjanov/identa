import { AuthFormLoadingState } from '@/components/layout/page-loading-skeletons';

export default function Loading() {
    return <AuthFormLoadingState fieldCount={4} showOAuth />;
}
