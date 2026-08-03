import type { Metadata } from 'next';
import { QueryProvider } from '@/components/providers/query-provider';

export const metadata: Metadata = {
    robots: {
        index: false,
        follow: false,
        noarchive: true,
    },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
    return <QueryProvider>{children}</QueryProvider>;
}
