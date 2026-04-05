'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listAuditLogs } from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import type { ApiAuditLogEntry } from '@/lib/api/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

const HIDDEN_EVENT_TYPES = new Set([
    'auth.login',
    'auth.logout',
    'team.assistant.created',
    'team.assistant.updated',
    'team.assistant.status_updated',
    'team.assistant.password_reset',
    'team.assistant.deleted',
]);

const EVENT_TYPE_OPTIONS = [
    'all',
    'auth.permission_denied',
    'patient.created',
    'patient.updated',
    'patient.archived',
    'patient.restored',
    'patient.permanently_deleted',
    'appointment.created',
    'appointment.updated',
    'appointment.deleted',
    'payment.created',
    'payment.updated',
    'payment.deleted',
    'patient.odontogram_entry.created',
    'patient.odontogram_entry.updated',
    'patient.odontogram_entry.deleted',
    'patient.odontogram_entry.image.uploaded',
    'patient.odontogram_entry.image.deleted',
    'patient.treatment.created',
];

const PERMISSION_LABEL_KEY_BY_CODE: Record<string, string> = {
    'patients.view': 'settings.team.permissionPatientsView',
    'patients.manage': 'settings.team.permissionPatientsManage',
    'appointments.view': 'settings.team.permissionAppointmentsView',
    'appointments.manage': 'settings.team.permissionAppointmentsManage',
    'invoices.view': 'settings.team.permissionInvoicesView',
    'invoices.manage': 'settings.team.permissionInvoicesManage',
    'payments.view': 'settings.team.permissionPaymentsView',
    'payments.manage': 'settings.team.permissionPaymentsManage',
    'odontogram.view': 'settings.team.permissionOdontogramView',
    'odontogram.manage': 'settings.team.permissionOdontogramManage',
    'treatments.view': 'settings.team.permissionTreatmentsView',
    'treatments.manage': 'settings.team.permissionTreatmentsManage',
    'patient_categories.view': 'settings.team.permissionCategoriesView',
    'patient_categories.manage': 'settings.team.permissionCategoriesManage',
    'settings.view': 'settings.team.permissionSettingsView',
    'settings.manage': 'settings.team.permissionSettingsManage',
    'audit_logs.view': 'settings.team.permissionAuditLogsView',
};

interface AuditLogsTabProps {
    canViewAuditLogs: boolean;
    t: (key: string, variables?: Record<string, string | number>) => string;
}

const UUID_SEGMENT_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formatDateTime(value: string | null): string {
    if (!value) {
        return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString();
}

function formatEventTypeLabel(
    eventType: string,
    t: (key: string, variables?: Record<string, string | number>) => string
): string {
    const translationKey = `settings.logs.event.${eventType}`;
    const translated = t(translationKey);
    if (translated !== translationKey) {
        return translated;
    }

    const prettified = eventType
        .replaceAll('.', ' ')
        .replaceAll('_', ' ')
        .trim();
    if (prettified === '') {
        return eventType;
    }

    return prettified.charAt(0).toUpperCase() + prettified.slice(1);
}

function maskRoutePath(rawPath: string): string {
    const normalized = rawPath.replace(/^\/+/, '');
    if (normalized === '') {
        return '-';
    }

    const [pathname] = normalized.split('?');
    const maskedPathSegments = pathname
        .split('/')
        .map((segment) => (UUID_SEGMENT_REGEX.test(segment) ? '{id}' : segment))
        .filter((segment) => segment !== '');

    if (maskedPathSegments.length === 0) {
        return '-';
    }

    return `/${maskedPathSegments.join('/')}`;
}

function formatIpAddress(
    ipAddress: string | null,
    t: (key: string, variables?: Record<string, string | number>) => string
): string {
    if (!ipAddress) {
        return '-';
    }

    if (ipAddress === '127.0.0.1' || ipAddress === '::1') {
        return t('settings.logs.localhost');
    }

    const ipv4Match = ipAddress.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
        return `${ipv4Match[1]}.${ipv4Match[2]}.${ipv4Match[3]}.xxx`;
    }

    if (ipAddress.includes(':')) {
        const parts = ipAddress.split(':').filter((part) => part.length > 0);
        const prefix = parts.slice(0, 2).join(':');
        return prefix ? `${prefix}:xxxx:xxxx` : 'xxxx:xxxx:xxxx';
    }

    return ipAddress;
}

function formatEntityLabel(
    entry: Pick<ApiAuditLogEntry, 'entity_type' | 'entity_id'>,
    t: (key: string, variables?: Record<string, string | number>) => string
): string {
    const entityType = (entry.entity_type ?? '').trim();
    const entityIdRaw = (entry.entity_id ?? '').trim();
    const entityId = entityIdRaw === '' ? '-' : entityIdRaw;

    if (entityType === '') {
        return entityId;
    }

    if (entityType === 'route') {
        const displayPath = maskRoutePath(entityIdRaw);
        return `${t('settings.logs.entityType.route')} / ${displayPath}`;
    }

    return `${entityType} / ${entityId}`;
}

function extractRequiredPermission(metadata: ApiAuditLogEntry['metadata']): string | null {
    if (!metadata || typeof metadata !== 'object') {
        return null;
    }

    const value = metadata.required_permission;
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
}

function formatRequiredPermissionLabel(
    requiredPermission: string,
    t: (key: string, variables?: Record<string, string | number>) => string
): string {
    return requiredPermission
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .map((permissionCode) => {
            const key = PERMISSION_LABEL_KEY_BY_CODE[permissionCode];
            return key ? t(key) : permissionCode;
        })
        .join(', ');
}

function AuditLogsLoadingSkeleton() {
    return (
        <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
                <div key={`audit-log-skeleton-${index}`} className="rounded-lg border border-gray-200 p-4 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                        <Skeleton className="h-4 w-44" />
                        <Skeleton className="h-3 w-28" />
                    </div>
                    <Skeleton className="h-3 w-60" />
                    <Skeleton className="h-3 w-72" />
                    <Skeleton className="h-3 w-64" />
                </div>
            ))}
            <div className="flex items-center justify-end gap-2 pt-2">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-16" />
            </div>
        </div>
    );
}

export function AuditLogsTab({ canViewAuditLogs, t }: AuditLogsTabProps) {
    const [search, setSearch] = useState('');
    const [eventType, setEventType] = useState('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [page, setPage] = useState(1);

    const logsQuery = useQuery({
        queryKey: ['settings', 'audit-logs', search, eventType, dateFrom, dateTo, page],
        queryFn: () =>
            listAuditLogs({
                page,
                perPage: 10,
                sort: '-created_at',
                filter: {
                    search: search || undefined,
                    event_type: eventType === 'all' ? undefined : eventType,
                    date_from: dateFrom || undefined,
                    date_to: dateTo || undefined,
                },
            }),
        enabled: canViewAuditLogs,
    });

    const visibleEntries = (logsQuery.data?.data ?? []).filter(
        (entry) => !HIDDEN_EVENT_TYPES.has(entry.event_type)
    );

    const totalPages = logsQuery.data?.meta?.pagination?.total_pages ?? 1;
    const canPrev = page > 1;
    const canNext = page < totalPages;

    if (!canViewAuditLogs) {
        return (
            <Card>
                <CardHeader className="space-y-2">
                    <CardTitle>{t('settings.logs.title')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-sm text-gray-600">{t('settings.logs.noAccess')}</p>
                    <div className="pointer-events-none opacity-70">
                        <AuditLogsLoadingSkeleton />
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader className="space-y-3">
                <CardTitle>{t('settings.logs.title')}</CardTitle>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                    <Input
                        value={search}
                        onChange={(event) => {
                            setSearch(event.target.value);
                            setPage(1);
                        }}
                        placeholder={t('settings.logs.searchPlaceholder')}
                    />
                    <Select
                        value={eventType}
                        onValueChange={(value) => {
                            setEventType(value);
                            setPage(1);
                        }}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {EVENT_TYPE_OPTIONS.map((eventTypeOption) => (
                                <SelectItem key={eventTypeOption} value={eventTypeOption}>
                                    {eventTypeOption === 'all'
                                        ? t('settings.logs.eventTypeAll')
                                        : formatEventTypeLabel(eventTypeOption, t)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Input
                        type="date"
                        value={dateFrom}
                        onChange={(event) => {
                            setDateFrom(event.target.value);
                            setPage(1);
                        }}
                    />
                    <Input
                        type="date"
                        value={dateTo}
                        onChange={(event) => {
                            setDateTo(event.target.value);
                            setPage(1);
                        }}
                    />
                </div>
            </CardHeader>
            <CardContent>
                {logsQuery.isLoading ? (
                    <AuditLogsLoadingSkeleton />
                ) : logsQuery.isError ? (
                    <p className="text-sm text-red-600">
                        {getApiErrorMessage(logsQuery.error, t('settings.logs.loadFailed'))}
                    </p>
                ) : (
                    <div className="space-y-3">
                        {visibleEntries.map((entry) => {
                            const requiredPermission = extractRequiredPermission(entry.metadata);
                            const requiredPermissionLabel = requiredPermission
                                ? formatRequiredPermissionLabel(requiredPermission, t)
                                : null;

                            return (
                                <div key={entry.id} className="rounded-lg border border-gray-200 p-4">
                                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                        <p className="text-sm font-semibold text-gray-900">
                                            {formatEventTypeLabel(entry.event_type, t)}
                                        </p>
                                        <p className="text-xs text-gray-500">{formatDateTime(entry.created_at)}</p>
                                    </div>
                                    <p className="text-xs text-gray-600 mt-1">
                                        {t('settings.logs.actor')}: {entry.actor?.name || '-'} (
                                        {entry.actor?.role ? t(`role.${entry.actor.role}`) : '-'})
                                    </p>
                                    <p className="text-xs text-gray-600">
                                        {t('settings.logs.entity')}: {formatEntityLabel(entry, t)}
                                    </p>
                                    {requiredPermission ? (
                                        <p className="text-xs text-gray-600">
                                            {t('settings.logs.requiredPermission')}:{' '}
                                            <span className="font-medium">{requiredPermissionLabel}</span>
                                        </p>
                                    ) : null}
                                    <p className="text-xs text-gray-500">
                                        {t('settings.logs.ip')}: {formatIpAddress(entry.ip_address, t)}
                                    </p>
                                </div>
                            );
                        })}

                        {visibleEntries.length === 0 ? (
                            <p className="text-sm text-gray-500">{t('settings.logs.empty')}</p>
                        ) : null}

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={!canPrev}
                                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                            >
                                {t('common.previous')}
                            </Button>
                            <span className="text-xs text-gray-500">
                                {t('settings.logs.pageOf', { page, total: totalPages })}
                            </span>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={!canNext}
                                onClick={() => setPage((prev) => prev + 1)}
                            >
                                {t('common.next')}
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
