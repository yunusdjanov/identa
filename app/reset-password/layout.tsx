import { QueryProvider } from '@/components/providers/query-provider';

export default function ResetPasswordLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <QueryProvider>{children}</QueryProvider>;
}
