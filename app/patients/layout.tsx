import { AppLayout } from '@/components/layout/app-layout';
import { QueryProvider } from '@/components/providers/query-provider';

export default function PatientsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <QueryProvider>
            <AppLayout>{children}</AppLayout>
        </QueryProvider>
    );
}
