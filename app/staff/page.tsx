'use client';

import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Users, History } from 'lucide-react';
import { StaffLoadingState } from '@/components/layout/page-loading-skeletons';
import { PageHeader } from '@/components/ui/page-shell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getCurrentUser } from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import { TeamAccessTab } from '@/components/settings/team-access-tab';
import { AuditLogsTab } from '@/components/settings/audit-logs-tab';
import { useI18n } from '@/components/providers/i18n-provider';
import { AppErrorState } from '@/components/error/app-error-state';
import { AccessDeniedState } from '@/components/error/access-denied-state';

type TeamTab = 'access' | 'logs';

const STAFF_ACTIVE_TAB_STORAGE_KEY = 'identa.staff.activeTab';
const noopSubscribe = () => () => undefined;

function parseTeamTab(value: string | null): TeamTab | null {
    return value === 'access' || value === 'logs' ? value : null;
}

function getStoredTeamTab(): TeamTab | null {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        return parseTeamTab(window.localStorage.getItem(STAFF_ACTIVE_TAB_STORAGE_KEY));
    } catch {
        return null;
    }
}

function setStoredTeamTab(tab: TeamTab) {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.localStorage.setItem(STAFF_ACTIVE_TAB_STORAGE_KEY, tab);
    } catch {
        // Storage can be unavailable in some private browsing modes; URL state still works.
    }
}

export default function StaffPage() {
    const { t } = useI18n();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const requestedTab = parseTeamTab(searchParams.get('tab'));
    const storedTab = useSyncExternalStore(noopSubscribe, getStoredTeamTab, () => null);

    const currentUserQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        staleTime: 5 * 60_000,
    });

    const currentUser = currentUserQuery.data;
    const isDentist = currentUser?.role === 'dentist';
    const canManageTeam = Boolean(currentUser && isDentist);
    const canViewAuditLogs = Boolean(currentUser && isDentist);

    const activeTab: TeamTab = requestedTab ?? storedTab ?? 'access';

    const updateActiveTab = (nextTab: TeamTab) => {
        setStoredTeamTab(nextTab);
        const params = new URLSearchParams(searchParams.toString());
        params.set('tab', nextTab);

        const nextSearch = params.toString();
        router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname, { scroll: false });
    };

    if (currentUserQuery.isLoading) {
        return <StaffLoadingState />;
    }

    if (currentUserQuery.isError) {
        return (
            <AppErrorState
                title={t('common.loadErrorTitle')}
                description={getApiErrorMessage(currentUserQuery.error, t('settings.loadFailed'))}
                retryLabel={t('common.retry')}
                onRetry={() => currentUserQuery.refetch()}
            />
        );
    }

    if (!isDentist) {
        return (
            <AccessDeniedState
                title={t('common.forbiddenTitle')}
                description={t('settings.team.noAccess')}
                actionLabel={t('dashboard.title')}
            />
        );
    }

    return (
        <div className="space-y-5 lg:space-y-6">
            <PageHeader title={t('staff.title')} description={t('staff.subtitle')} />

            <Tabs value={activeTab} onValueChange={(value) => updateActiveTab(value as TeamTab)} className="space-y-4 lg:space-y-5">
                <div className="-mx-4 overflow-x-auto overflow-y-hidden px-4 no-scrollbar sm:mx-0 sm:px-0">
                    <TabsList className="inline-flex min-w-max border border-slate-200/80 bg-white shadow-sm shadow-slate-200/50 sm:w-auto">
                        <TabsTrigger value="access" className="flex-shrink-0">
                            <Users className="w-4 h-4 mr-2" />
                            <span>{t('menu.staffAccess')}</span>
                        </TabsTrigger>
                        <TabsTrigger value="logs" className="flex-shrink-0">
                            <History className="w-4 h-4 mr-2" />
                            <span>{t('menu.actionLogs')}</span>
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
