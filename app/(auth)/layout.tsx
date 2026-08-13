import type { Metadata } from 'next';
import { QueryProvider } from '@/components/providers/query-provider';
import { ServerI18nProvider } from '@/components/providers/server-i18n-provider';

export const metadata: Metadata = {
    description: null,
    keywords: null,
    openGraph: null,
    twitter: null,
    robots: {
        index: false,
        follow: false,
        noarchive: true,
    },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
    return (
        <ServerI18nProvider>
            <QueryProvider>{children}</QueryProvider>
        </ServerI18nProvider>
    );
}
