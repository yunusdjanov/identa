import { AdminLayoutClient } from '@/app/admin/_components/admin-layout-client';
import { ServerI18nProvider } from '@/components/providers/server-i18n-provider';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <ServerI18nProvider>
            <AdminLayoutClient>{children}</AdminLayoutClient>
        </ServerI18nProvider>
    );
}
