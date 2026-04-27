import { QueryProvider } from '@/components/providers/query-provider';

export default function ForgotPasswordLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <QueryProvider>{children}</QueryProvider>;
}
