import { AppLayout } from '@/components/layout/app-layout';

export default function AppointmentsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <AppLayout>{children}</AppLayout>;
}
