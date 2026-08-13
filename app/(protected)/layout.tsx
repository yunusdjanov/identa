import type { Metadata } from 'next';
import { AppLayout } from '@/components/layout/app-layout';
import { QueryProvider } from '@/components/providers/query-provider';
import { ServerI18nProvider } from '@/components/providers/server-i18n-provider';

export const metadata: Metadata = {
    title: 'Workspace',
    description: null,
    keywords: null,
    alternates: { canonical: null },
    openGraph: null,
    twitter: null,
    robots: {
        index: false,
        follow: false,
        noarchive: true,
    },
};

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
    return (
        <ServerI18nProvider>
            <QueryProvider>
                <AppLayout>{children}</AppLayout>
            </QueryProvider>
        </ServerI18nProvider>
    );
}
