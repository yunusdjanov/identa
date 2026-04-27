import { QueryProvider } from '@/components/providers/query-provider';

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <QueryProvider>{children}</QueryProvider>;
}
