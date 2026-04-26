'use client';

import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Users, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-shell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getCurrentUser } from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import { TeamAccessTab } from '@/components/settings/team-access-tab';
import { AuditLogsTab } from '@/components/settings/audit-logs-tab';
import { useI18n } from '@/components/providers/i18n-provider';

type TeamTab = 'access' | 'logs';

function TeamLoadingSkeleton() {
    return (
        <div className="space-y-5 lg:space-y-6">
            <div className="space-y-2">
                <Skeleton className="h-9 w-44" />
                <Skeleton className="h-4 w-72" />
            </div>
            <div className="space-y-4 lg:space-y-5">
                <div className="flex gap-2 overflow-x-auto overflow-y-hidden no-scrollbar">
                    {Array.from({ length: 2 }).map((_, index) => (
                        <Skeleton key={index} className="h-10 w-32 shrink-0" />
                    ))}
                </div>
                <Card>
                    <CardHeader>
                        <Skeleton className="h-6 w-44" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-28 w-full" />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default function StaffPage() {
    const { t } = useI18n();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const requestedTab = searchParams.get('tab');

    const currentUserQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        staleTime: 5 * 60_000,
    });

    const currentUser = currentUserQuery.data;
    const isDentist = currentUser?.role === 'dentist';
    const assistantPermissions = new Set(currentUser?.assistant_permissions ?? []);
    const canManageTeam = Boolean(currentUser && (isDentist || assistantPermissions.has('team.manage')));
    const canViewAuditLogs = Boolean(
        currentUser && (isDentist || assistantPermissions.has('audit_logs.view'))
    );

    const activeTab: TeamTab = requestedTab === 'logs' ? 'logs' : 'access';

    const updateActiveTab = (nextTab: TeamTab) => {
        const params = new URLSearchParams(searchParams.toString());
        if (nextTab === 'logs') {
            params.set('tab', 'logs');
        }
        else {
            params.delete('tab');
        }

        const nextSearch = params.toString();
        router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname, { scroll: false });
    };

    if (currentUserQuery.isLoading) {
        return <TeamLoadingSkeleton />;
    }

    if (currentUserQuery.isError) {
        return (
            <div className="space-y-4">
                <p className="text-sm text-red-600">
                    {getApiErrorMessage(currentUserQuery.error, t('settings.loadFailed'))}
                </p>
                <Button variant="outline" onClick={() => currentUserQuery.refetch()}>
                    {t('common.retry')}
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-5 lg:space-y-6">
            <PageHeader title={t('staff.title')} description={t('staff.subtitle')} />

            <Tabs value={activeTab} onValueChange={(value) => updateActiveTab(value as TeamTab)} className="space-y-4 lg:space-y-5">
                <div className="-mx-4 overflow-x-auto overflow-y-hidden px-4 no-scrollbar sm:mx-0 sm:px-0">
                    <TabsList className="inline-flex min-w-max border border-slate-200/80 bg-white/80 shadow-sm shadow-slate-200/50 sm:w-auto">
                        <TabsTrigger value="access" className="flex-shrink-0">
                            <Users className="w-4 h-4 sm:mr-2" />
                            <span className="hidden sm:inline">{t('menu.staffAccess')}</span>
                        </TabsTrigger>
                        <TabsTrigger value="logs" className="flex-shrink-0">
                            <History className="w-4 h-4 sm:mr-2" />
                            <span className="hidden sm:inline">{t('menu.actionLogs')}</span>
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="access">
                    <TeamAccessTab
                        canManageTeam={canManageTeam}
                        subscription={currentUser?.subscription}
                        t={t}
                    />
                </TabsContent>

                <TabsContent value="logs">
                    <AuditLogsTab canViewAuditLogs={canViewAuditLogs} t={t} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
