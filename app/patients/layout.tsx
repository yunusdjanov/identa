import { AppLayout } from '@/components/layout/app-layout';

export default function PatientsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <AppLayout>{children}</AppLayout>;
}
