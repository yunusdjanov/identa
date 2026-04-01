import { AppLayout } from '@/components/layout/app-layout';

export default function TeamLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <AppLayout>{children}</AppLayout>;
}

