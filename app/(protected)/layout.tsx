import { AppLayout } from '@/components/layout/app-layout';
import { QueryProvider } from '@/components/providers/query-provider';
import { ServerI18nProvider } from '@/components/providers/server-i18n-provider';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
    return (
        <ServerI18nProvider>
            <QueryProvider>
                <AppLayout>{children}</AppLayout>
            </QueryProvider>
        </ServerI18nProvider>
    );
}
