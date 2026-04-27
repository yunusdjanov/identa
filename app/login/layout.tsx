import { QueryProvider } from '@/components/providers/query-provider';

export default function LoginLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <QueryProvider>{children}</QueryProvider>;
}
