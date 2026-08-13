import type { Metadata } from 'next';
import { AdminLayoutClient } from '@/app/admin/_components/admin-layout-client';
import { ServerI18nProvider } from '@/components/providers/server-i18n-provider';

export const metadata: Metadata = {
    title: 'Admin console',
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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <ServerI18nProvider>
            <AdminLayoutClient>{children}</AdminLayoutClient>
        </ServerI18nProvider>
    );
}
