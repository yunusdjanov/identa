'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Users, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getCurrentUser } from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import { TeamAccessTab } from '@/components/settings/team-access-tab';
import { AuditLogsTab } from '@/components/settings/audit-logs-tab';
import { useI18n } from '@/components/providers/i18n-provider';

type TeamTab = 'access' | 'logs';

function TeamLoadingSkeleton() {
    return (
        <div className="space-y-8">
            <div className="space-y-2">
                <Skeleton className="h-9 w-44" />
                <Skeleton className="h-4 w-72" />
            </div>
            <div className="space-y-6">
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

    const resolvedTab = useMemo<TeamTab>(() => {
        return requestedTab === 'logs' ? 'logs' : 'access';
    }, [requestedTab]);

    const [activeTab, setActiveTab] = useState<TeamTab>('access');

    useEffect(() => {
        setActiveTab(resolvedTab);
    }, [resolvedTab]);

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
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-gray-900">{t('staff.title')}</h1>
                <p className="text-gray-500 mt-1">{t('staff.subtitle')}</p>
            </div>

            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TeamTab)} className="space-y-6">
                <div className="overflow-x-auto overflow-y-hidden no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
                    <TabsList className="inline-flex w-full sm:w-auto min-w-max">
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
