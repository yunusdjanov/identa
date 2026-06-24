'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PatientsLoadingState } from '@/components/layout/page-loading-skeletons';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { DataTableShell, getDataTableClassName } from '@/components/ui/data-table-shell';
import { PageHeader } from '@/components/ui/page-shell';
import {
    clearRecentPatients,
    forgetRecentPatient,
    getCurrentUser,
    listPatientCategories,
    listPatients,
    listRecentPatients,
    restorePatient,
} from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import type { ApiPatient, ApiRecordActor } from '@/lib/api/types';
import { cn, extractPrimaryPhone, formatDate, toLocalDateKey, truncateForUi } from '@/lib/utils';
import { Plus, Search, Phone, Users, CalendarPlus, ArrowRight, Tags, FileText, FilterX, Download, Maximize2, X } from 'lucide-react';
import { buildPdfFilename, exportRowsToPdf } from '@/lib/export/pdf';
import { EmptyState } from '@/components/ui/empty-state';
import { useI18n } from '@/components/providers/i18n-provider';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getProtectedMediaCrossOrigin, getProtectedMediaPreviewUrl, getProtectedMediaThumbnailUrl } from '@/lib/protected-media';
import { toast } from 'sonner';
import { AppErrorState } from '@/components/error/app-error-state';
import { AccessDeniedState } from '@/components/error/access-denied-state';
import { canManage, canView, getManageDeniedMessage, isSubscriptionReadOnly } from '@/lib/auth/permissions';
import { RecordAuthorBadge } from '@/components/ui/record-author-badge';

const AddPatientDialog = dynamic(
    () => import('@/components/patients/add-patient-dialog').then((module) => module.AddPatientDialog),
    { ssr: false }
);
const ManageCategoriesDialog = dynamic(
    () => import('@/components/patients/manage-categories-dialog').then((module) => module.ManageCategoriesDialog),
    { ssr: false }
);
const PatientPhotoPreviewDialog = dynamic(
    () => import('@/components/patients/patient-photo-preview-dialog').then((module) => module.PatientPhotoPreviewDialog),
    { ssr: false }
);

const noopSubscribe = () => () => undefined;
const PAGE_SIZE = 10;
const PATIENT_TABLE_NAME_UI_LIMIT = 25;
const PATIENT_CATEGORY_UI_LIMIT = 20;

interface PatientRow {
    id: string;
    fullName: string;
    photoThumbnailUrl?: string;
    photoPreviewUrl?: string;
    phone: string;
    secondaryPhone?: string;
    dateOfBirth?: string;
    createdAt?: string;
    lastVisitDate?: string;
    createdBy?: ApiRecordActor | null;
    updatedBy?: ApiRecordActor | null;
    categories: Array<{ id: string; name: string; color: string }>;
}

function mapPatientRow(patient: ApiPatient): PatientRow {
    const photoThumbnailUrl = getProtectedMediaThumbnailUrl({
        scanStatus: patient.photo_scan_status,
        thumbnailUrl: patient.photo_thumbnail_url,
        thumbnailReady: patient.photo_thumbnail_ready,
        previewUrl: patient.photo_preview_url,
        previewReady: patient.photo_preview_ready,
        url: patient.photo_url,
        allowFullFallback: true,
    }) ?? undefined;
    const photoPreviewUrl = getProtectedMediaPreviewUrl({
        scanStatus: patient.photo_scan_status,
        previewUrl: patient.photo_preview_url,
        url: patient.photo_url,
    }) ?? photoThumbnailUrl;

    return {
        id: patient.id,
        fullName: patient.full_name,
        photoThumbnailUrl,
        photoPreviewUrl,
        phone: extractPrimaryPhone(patient.phone),
        secondaryPhone: patient.secondary_phone ?? undefined,
        dateOfBirth: patient.date_of_birth ?? undefined,
        createdAt: patient.created_at ?? undefined,
        lastVisitDate: patient.last_visit_at ?? undefined,
        createdBy: patient.created_by ?? null,
        updatedBy: patient.updated_by ?? null,
        categories: (patient.categories ?? []).map((category) => ({
            id: category.id,
            name: category.name,
            color: category.color,
        })),
    };
}

function getPatientInitials(fullName: string): string {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
        return '?';
    }

    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export default function PatientsPage() {
    const { t } = useI18n();
    const router = useRouter();
    const queryClient = useQueryClient();
    const isClient = useSyncExternalStore(
        noopSubscribe,
        () => true,
        () => false
    );
    const urlSearch = useSyncExternalStore(
        noopSubscribe,
        () => window.location.search,
        () => ''
    );
    const [searchQuery, setSearchQuery] = useState('');
    const [inactiveFilter, setInactiveFilter] = useState<'none' | '6m' | '1y'>('none');
    const [showArchivedOnly, setShowArchivedOnly] = useState(false);
    const [selectedCategoryId, setSelectedCategoryId] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [inactiveThresholdDateKey6m] = useState(() => {
        const threshold = new Date();
        threshold.setHours(0, 0, 0, 0);
        threshold.setMonth(threshold.getMonth() - 6);
        return toLocalDateKey(threshold);
    });
    const [inactiveThresholdDateKey1y] = useState(() => {
        const threshold = new Date();
        threshold.setHours(0, 0, 0, 0);
        threshold.setFullYear(threshold.getFullYear() - 1);
        return toLocalDateKey(threshold);
    });
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isManageCategoriesOpen, setIsManageCategoriesOpen] = useState(false);
    const [isRecentMenuOpen, setIsRecentMenuOpen] = useState(false);
    const [photoPreview, setPhotoPreview] = useState<{
        src: string;
        thumbnailSrc?: string;
        alt: string;
        title: string;
    } | null>(null);
    const [dismissedUrlDialog, setDismissedUrlDialog] = useState(false);
    const shouldOpenFromUrl =
        isClient && new URLSearchParams(urlSearch).get('action') === 'new' && !dismissedUrlDialog;
    const currentUserQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        staleTime: 5 * 60_000,
    });
    const currentUser = currentUserQuery.data;
    const canViewPatients = canView(currentUser, 'patients');
    const canManagePatients = canManage(currentUser, 'patients');
    const canViewAppointments = canView(currentUser, 'appointments');
    const canManageAppointments = canManage(currentUser, 'appointments');
    const showRecordAuthors = currentUser?.show_record_authors === true;
    const isDialogOpen = canManagePatients && (isAddDialogOpen || shouldOpenFromUrl);
    const denyManageAction = () => toast.error(getManageDeniedMessage(currentUser, t));

    const handleDialogOpenChange = (open: boolean) => {
        if (open && !canManagePatients) {
            denyManageAction();
            return;
        }

        if (!open && shouldOpenFromUrl) {
            setDismissedUrlDialog(true);
        }

        setIsAddDialogOpen(open);
    };

    // Debounced so a search request fires once the user pauses typing, not on
    // every keystroke. The input still updates instantly via `searchQuery`.
    const debouncedSearch = useDebouncedValue(searchQuery, 300);
    const patientsQuery = useQuery({
        queryKey: [
            'patients',
            'list',
            {
                page: currentPage,
                search: debouncedSearch,
                    categoryId: selectedCategoryId,
                    inactiveFilter,
                    archivedOnly: showArchivedOnly,
            },
        ],
        enabled: canViewPatients,
        queryFn: () =>
            listPatients({
                page: currentPage,
                perPage: PAGE_SIZE,
                sort: '-created_at',
                filter: {
                    search: debouncedSearch.trim() || undefined,
                    category_id: selectedCategoryId !== 'all' ? selectedCategoryId : undefined,
                    inactive_before:
                        inactiveFilter === 'none' || showArchivedOnly
                            ? undefined
                            : inactiveFilter === '6m'
                                ? inactiveThresholdDateKey6m
                                : inactiveThresholdDateKey1y,
                    archived_only: showArchivedOnly ? true : undefined,
                },
            }),
        placeholderData: (previousData) => previousData,
        staleTime: 300000,
        gcTime: 900000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });
    const categoriesQuery = useQuery({
        queryKey: ['patient-categories', 'list'],
        queryFn: () => listPatientCategories(),
        enabled: canViewPatients,
        staleTime: 300000,
        gcTime: 900000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });
    const recentPatientsQuery = useQuery({
        queryKey: ['patients', 'recent'],
        queryFn: listRecentPatients,
        enabled: canViewPatients,
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });
    const patientRows = useMemo(
        () => (patientsQuery.data?.data ?? []).map((patient) => mapPatientRow(patient)),
        [patientsQuery.data]
    );
    const pagination = patientsQuery.data?.meta?.pagination;
    const totalPatients = pagination?.total ?? patientRows.length;
    const totalPages = pagination?.total_pages ?? 1;
    const pageNumber = pagination?.page ?? currentPage;
    const hasPreviousPage = pageNumber > 1;
    const hasNextPage = pageNumber < totalPages;
    const hasActiveFilters =
        searchQuery.trim().length > 0
        || inactiveFilter !== 'none'
        || selectedCategoryId !== 'all'
        || showArchivedOnly;
    const restoreMutation = useMutation({
        mutationFn: (patientId: string) => restorePatient(patientId),
        onSuccess: () => {
            toast.success(t('patients.restoreSuccess'));
            queryClient.invalidateQueries({ queryKey: ['patients'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('patients.restoreFailed')));
        },
    });
    const forgetRecentMutation = useMutation({
        mutationFn: (patientId: string) => forgetRecentPatient(patientId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['patients', 'recent'] });
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('patients.recent.removeFailed')));
        },
    });
    const clearRecentMutation = useMutation({
        mutationFn: clearRecentPatients,
        onSuccess: () => {
            setIsRecentMenuOpen(false);
            queryClient.invalidateQueries({ queryKey: ['patients', 'recent'] });
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('patients.recent.clearFailed')));
        },
    });
    const openPatientDetails = (patientId: string) => {
        router.push(`/patients/${patientId}`);
    };
    const recentPatients = recentPatientsQuery.data ?? [];
    const shouldShowRecentMenu = isRecentMenuOpen && searchQuery.trim() === '' && recentPatients.length > 0;
    const resetFilters = () => {
        setSearchQuery('');
        setSelectedCategoryId('all');
        setInactiveFilter('none');
        setShowArchivedOnly(false);
        setCurrentPage(1);
    };

    if (currentUserQuery.isLoading || patientsQuery.isLoading) {
        return <PatientsLoadingState />;
    }

    if (!canViewPatients) {
        return (
            <AccessDeniedState
                title={t('common.forbiddenTitle')}
                description={t('permissions.deniedDescription')}
                actionLabel={t('dashboard.title')}
                className="min-h-[20rem]"
            />
        );
    }

    if (currentUserQuery.isError || patientsQuery.isError || categoriesQuery.isError) {
        return (
            <AppErrorState
                title={t('common.loadErrorTitle')}
                description={getApiErrorMessage(currentUserQuery.error || patientsQuery.error || categoriesQuery.error, t('patients.loadFailed'))}
                retryLabel={t('common.retry')}
                onRetry={() => {
                    currentUserQuery.refetch();
                    patientsQuery.refetch();
                    categoriesQuery.refetch();
                }}
            />
        );
    }

    return (
        <div className="space-y-5 lg:space-y-6">
            <PageHeader
                title={t('patients.title')}
                description={t('patients.subtitle')}
                actions={(
                    <>
                        {currentUser?.subscription?.can_export ? (
                            <Button
                                variant="outline"
                                className="w-full sm:w-auto"
                                disabled={patientRows.length === 0}
                                onClick={() => {
                                    if (patientRows.length === 0) {
                                        toast.error(t('export.empty'));
                                        return;
                                    }
                                    const data = patientsQuery.data?.data ?? [];
                                    const rows = data.map((patient) => [
                                        patient.full_name,
                                        extractPrimaryPhone(patient.phone) || '-',
                                        patient.gender ? t(`gender.${patient.gender}`) ?? patient.gender : '-',
                                        patient.date_of_birth ? formatDate(patient.date_of_birth) : '-',
                                        (patient.categories ?? []).map((c) => c.name).join(', ') || '-',
                                        patient.last_visit_at ? formatDate(patient.last_visit_at) : '-',
                                    ]);
                                    exportRowsToPdf({
                                        filename: buildPdfFilename('patients'),
                                        title: t('patients.title'),
                                        subtitle: t('patients.subtitle'),
                                        columns: [
                                            t('patients.table.name'),
                                            t('patients.table.phone'),
                                            t('patients.table.gender'),
                                            t('patients.table.dateOfBirth'),
                                            t('patients.categories'),
                                            t('patients.table.lastVisit'),
                                        ],
                                        rows,
                                        summary: [
                                            { label: t('patients.table.name'), value: String(data.length) },
                                        ],
                                        orientation: 'landscape',
                                    });
                                    toast.success(t('export.downloaded'));
                                }}
                            >
                                <Download className="w-4 h-4 mr-2" />
                                {t('common.export')}
                            </Button>
                        ) : null}
                        {/* Header CTAs are HIDDEN (not disabled) for
                            view-only assistants. A dimmed "Add patient"
                            button next to a working "Export PDF" reads as
                            broken UI; clean-omit reflects the same truth
                            ("you can't do this") without a misleading
                            affordance. Per-row pencil/trash icons stay
                            disabled to preserve column alignment.
                            Read-only subscriptions get disabled+toast
                            instead of hide, so the dentist owner knows
                            why their button is greyed. */}
                        {canManagePatients ? (
                            <Button
                                variant="outline"
                                className="w-full sm:w-auto"
                                onClick={() => setIsManageCategoriesOpen(true)}
                            >
                                <Tags className="w-4 h-4 mr-2" />
                                {t('patients.categories')}
                            </Button>
                        ) : isSubscriptionReadOnly(currentUser) ? (
                            <Button
                                variant="outline"
                                className="w-full sm:w-auto"
                                disabled
                                onClick={denyManageAction}
                            >
                                <Tags className="w-4 h-4 mr-2" />
                                {t('patients.categories')}
                            </Button>
                        ) : null}
                        {canManagePatients ? (
                            <Button
                                className="w-full sm:w-auto"
                                onClick={() => setIsAddDialogOpen(true)}
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                {t('patients.addPatient')}
                            </Button>
                        ) : isSubscriptionReadOnly(currentUser) ? (
                            <Button
                                className="w-full sm:w-auto"
                                disabled
                                onClick={denyManageAction}
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                {t('patients.addPatient')}
                            </Button>
                        ) : null}
                    </>
                )}
            />

            <Card className="rounded-2xl border-teal-100/80 bg-white shadow-sm shadow-teal-100/50">
                <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                        <div
                            className="relative flex-1"
                            onBlur={(event) => {
                                const nextFocus = event.relatedTarget;
                                if (!(nextFocus instanceof Node) || !event.currentTarget.contains(nextFocus)) {
                                    setIsRecentMenuOpen(false);
                                }
                            }}
                        >
                            <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <Input
                                placeholder={t('patients.searchPlaceholder')}
                                aria-label={t('patients.searchAria')}
                                value={searchQuery}
                                onFocus={() => {
                                    if (searchQuery.trim() === '') {
                                        setIsRecentMenuOpen(true);
                                    }
                                }}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    setSearchQuery(value);
                                    setIsRecentMenuOpen(value.trim() === '');
                                    setCurrentPage(1);
                                }}
                                className="h-9 rounded-xl border-slate-200 bg-white pl-10 shadow-xs"
                            />
                            {shouldShowRecentMenu ? (
                                <div className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-200/80">
                                    <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                                            {t('patients.recent.title')}
                                        </p>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-2 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                                            disabled={clearRecentMutation.isPending}
                                            onClick={() => clearRecentMutation.mutate()}
                                        >
                                            {t('common.clear')}
                                        </Button>
                                    </div>
                                    <div className="py-1">
                                        {recentPatients.map((patient) => (
                                            <div
                                                key={patient.id}
                                                className="group flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-teal-50/70 focus-visible:bg-teal-50/70 focus-visible:outline-none"
                                            >
                                                <button
                                                    type="button"
                                                    className="min-w-0 flex-1 truncate text-left font-medium text-slate-800 focus-visible:outline-none"
                                                    onClick={() => openPatientDetails(patient.id)}
                                                >
                                                    {patient.full_name}
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-label={t('patients.recent.removeAria', { patientName: patient.full_name })}
                                                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 opacity-100 transition hover:bg-white hover:text-slate-700 focus-visible:bg-white focus-visible:text-slate-700 focus-visible:outline-none sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                                                    disabled={forgetRecentMutation.isPending}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        forgetRecentMutation.mutate(patient.id);
                                                    }}
                                                >
                                                    <X className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2.5 lg:justify-end">
                            <Select
                                value={selectedCategoryId}
                                onValueChange={(value) => {
                                    setSelectedCategoryId(value);
                                    setCurrentPage(1);
                                }}
                            >
                                <SelectTrigger
                                    className="h-9 w-full min-w-[168px] rounded-xl border-slate-200 bg-white text-left shadow-xs md:w-[168px]"
                                    aria-label={t('patients.filterByCategoryAria')}
                                >
                                    <SelectValue placeholder={t('patients.allCategories')} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{t('patients.allCategories')}</SelectItem>
                                    {(categoriesQuery.data ?? []).map((category) => (
                                        <SelectItem key={category.id} value={category.id}>
                                            {category.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select
                                value={inactiveFilter}
                                disabled={showArchivedOnly}
                                onValueChange={(value: 'none' | '6m' | '1y') => {
                                    setInactiveFilter(value);
                                    setCurrentPage(1);
                                }}
                            >
                                <SelectTrigger
                                    className="h-9 w-full min-w-[168px] rounded-xl border-slate-200 bg-white text-left shadow-xs md:w-[168px]"
                                    aria-label={t('patients.filterByVisitActivityAria')}
                                >
                                    <SelectValue placeholder={t('patients.visitFilterLabel')} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">{t('patients.visitFilterAll')}</SelectItem>
                                    <SelectItem value="6m">{t('patients.noVisit6m')}</SelectItem>
                                    <SelectItem value="1y">{t('patients.noVisit1y')}</SelectItem>
                                </SelectContent>
                            </Select>
                            <div className="relative flex h-9 shrink-0 items-center">
                                <Button
                                    variant="outline"
                                    className={cn(
                                        'h-9 min-w-[120px] rounded-xl px-4 shadow-xs transition-colors',
                                        showArchivedOnly
                                            ? 'border-teal-200 bg-teal-50 text-teal-700 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700'
                                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                    )}
                                    aria-pressed={showArchivedOnly}
                                    onClick={() => {
                                        setShowArchivedOnly((value) => !value);
                                        setInactiveFilter('none');
                                        setCurrentPage(1);
                                    }}
                                >
                                    {t('patients.archived')}
                                </Button>
                                {hasActiveFilters ? (
                                    <Button
                                        variant="ghost"
                                        className="absolute right-0 top-full mt-1 h-6 whitespace-nowrap px-2 text-xs text-slate-500 hover:bg-white hover:text-slate-900"
                                        onClick={resetFilters}
                                    >
                                        <FilterX className="h-3.5 w-3.5" />
                                        {t('common.clear')}
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="overflow-hidden rounded-2xl bg-white">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                        {t('patients.totalCount', { count: totalPatients })}
                        {inactiveFilter === '6m' && ` (${t('patients.noVisit6m')})`}
                        {inactiveFilter === '1y' && ` (${t('patients.noVisit1y')})`}
                        {showArchivedOnly && ` (${t('patients.archived')})`}
                    </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-5 sm:px-5">
                    {patientRows.length === 0 ? (
                        <EmptyState
                            icon={hasActiveFilters ? FilterX : Users}
                            title={
                                inactiveFilter === '6m'
                                    ? t('patients.empty.noVisit6m')
                                    : inactiveFilter === '1y'
                                        ? t('patients.empty.noVisit1y')
                                    : showArchivedOnly
                                        ? t('patients.empty.archived')
                                    : hasActiveFilters
                                        ? t('patients.empty.filtered')
                                        : t('patients.empty.default')
                            }
                            description={hasActiveFilters ? undefined : (t('patients.searchPlaceholder') ?? undefined)}
                            action={hasActiveFilters ? (
                                <Button variant="outline" onClick={resetFilters}>
                                    <FilterX className="h-4 w-4 mr-1.5" />
                                    {t('patients.resetFilters')}
                                </Button>
                            ) : null}
                        />
                    ) : (
                        <>
                        <DataTableShell>
                            <Table className={getDataTableClassName('standard')}>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-12">#</TableHead>
                                        <TableHead className="w-24">{t('patients.table.photo')}</TableHead>
                                        <TableHead>{t('patients.table.name')}</TableHead>
                                        <TableHead>{t('patients.table.category')}</TableHead>
                                        <TableHead>{t('patients.table.registered')}</TableHead>
                                        <TableHead>{t('patients.table.lastVisit')}</TableHead>
                                        <TableHead className="text-right">{t('patients.table.actions')}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {patientRows.map((patient, index) => {
                                        const filteredCategory =
                                            selectedCategoryId !== 'all'
                                                ? patient.categories.find((category) => category.id === selectedCategoryId)
                                                : undefined;
                                        const categoryToDisplay = filteredCategory ?? patient.categories[0];
                                        const rowNumber =
                                            (pageNumber - 1) * (pagination?.per_page ?? PAGE_SIZE) + index + 1;
                                        const patientPhotoThumbnailUrl = patient.photoThumbnailUrl ?? '';
                                        const patientPhotoPreviewUrl = patient.photoPreviewUrl ?? patientPhotoThumbnailUrl;

                                        return (
                                        <TableRow
                                            key={patient.id}
                                            className="cursor-pointer hover:bg-teal-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-100"
                                            role="button"
                                            tabIndex={0}
                                            aria-label={t('patients.aria.openDetailsFor', { patientName: patient.fullName })}
                                            onClick={() => openPatientDetails(patient.id)}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter' || event.key === ' ') {
                                                    event.preventDefault();
                                                    openPatientDetails(patient.id);
                                                }
                                            }}
                                        >
                                            <TableCell className="text-slate-500">
                                                {rowNumber}
                                            </TableCell>
                                            <TableCell className="w-28">
                                                {patientPhotoThumbnailUrl !== '' ? (
                                                    <button
                                                        type="button"
                                                        className="group relative inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-0 shadow-xs transition hover:border-teal-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
                                                        aria-label={`${t('patients.form.photo')}: ${patient.fullName}`}
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            setPhotoPreview({
                                                                src: patientPhotoPreviewUrl,
                                                                thumbnailSrc: patientPhotoThumbnailUrl,
                                                                alt: patient.fullName,
                                                                title: patient.fullName,
                                                            });
                                                        }}
                                                        onKeyDown={(event) => event.stopPropagation()}
                                                    >
                                                        <Avatar className="h-full w-full rounded-xl">
                                                            <AvatarImage
                                                                src={patientPhotoThumbnailUrl}
                                                                alt={patient.fullName}
                                                                crossOrigin={getProtectedMediaCrossOrigin(patientPhotoThumbnailUrl)}
                                                                className="rounded-xl"
                                                            />
                                                            <AvatarFallback className="rounded-xl bg-slate-100 text-xs font-semibold text-slate-700">
                                                                {getPatientInitials(patient.fullName)}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/0 text-white opacity-0 transition group-hover:bg-slate-950/35 group-hover:opacity-100 group-focus-visible:bg-slate-950/35 group-focus-visible:opacity-100">
                                                            <Maximize2 className="h-4 w-4" />
                                                        </span>
                                                    </button>
                                                ) : (
                                                    <Avatar className="h-16 w-16 rounded-xl border border-dashed border-slate-200 bg-slate-50">
                                                        <AvatarFallback className="rounded-xl bg-slate-50 text-xs font-semibold text-slate-500">
                                                            {getPatientInitials(patient.fullName)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                )}
                                            </TableCell>
                                            <TableCell className="max-w-[24rem]">
                                                <div className="min-w-0">
                                                    <p className="font-medium truncate" title={patient.fullName}>
                                                        {truncateForUi(patient.fullName, PATIENT_TABLE_NAME_UI_LIMIT)}
                                                    </p>
                                                    <p className="text-sm text-slate-500 truncate">
                                                        <Phone aria-hidden="true" className="mr-1 inline-block h-3 w-3 text-slate-400" />
                                                        {patient.phone}
                                                    </p>
                                                    {patient.dateOfBirth && (
                                                        <p className="text-sm text-slate-500 truncate">
                                                            {t('patients.born')}: {formatDate(patient.dateOfBirth)}
                                                        </p>
                                                    )}
                                                    {showRecordAuthors ? (
                                                        <RecordAuthorBadge
                                                            className="mt-1"
                                                            createdBy={patient.createdBy}
                                                            updatedBy={patient.updatedBy}
                                                        />
                                                    ) : null}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {categoryToDisplay ? (
                                                    <Badge
                                                        variant="secondary"
                                                        className="max-w-[10rem] truncate"
                                                        style={{ backgroundColor: `${categoryToDisplay.color}22`, color: categoryToDisplay.color }}
                                                        title={categoryToDisplay.name}
                                                    >
                                                        {truncateForUi(categoryToDisplay.name, PATIENT_CATEGORY_UI_LIMIT)}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-slate-400 text-sm">{t('patients.uncategorized')}</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {patient.createdAt ? (
                                                    formatDate(patient.createdAt)
                                                ) : (
                                                    <span className="text-slate-400">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {patient.lastVisitDate ? (
                                                    formatDate(patient.lastVisitDate)
                                                ) : (
                                                    <span className="text-slate-400">{t('patients.never')}</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    {/* AF5 row-action gating: hide for view-only assistants,
                                                        keep disabled+toast for subscription read-only so the
                                                        dentist owner sees what's paused. View Details and
                                                        History below are read-only actions — always shown. */}
                                                    {showArchivedOnly ? (
                                                        canManagePatients ? (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-8 rounded-lg"
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    restoreMutation.mutate(patient.id);
                                                                }}
                                                                disabled={restoreMutation.isPending}
                                                            >
                                                                {t('patients.restore')}
                                                            </Button>
                                                        ) : isSubscriptionReadOnly(currentUser) ? (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-8 rounded-lg"
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    denyManageAction();
                                                                }}
                                                                disabled
                                                            >
                                                                {t('patients.restore')}
                                                            </Button>
                                                        ) : null
                                                    ) : inactiveFilter !== 'none' ? (
                                                        canManageAppointments ? (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-8 rounded-lg"
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    router.push(
                                                                        `/appointments?action=new&patientId=${encodeURIComponent(patient.id)}`
                                                                    );
                                                                }}
                                                            >
                                                                <CalendarPlus className="w-3 h-3 mr-1" />
                                                                {t('patients.schedule')}
                                                            </Button>
                                                        ) : isSubscriptionReadOnly(currentUser) && canViewAppointments ? (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-8 rounded-lg"
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    toast.error(getManageDeniedMessage(currentUser, t));
                                                                }}
                                                                disabled
                                                            >
                                                                <CalendarPlus className="w-3 h-3 mr-1" />
                                                                {t('patients.schedule')}
                                                            </Button>
                                                        ) : null
                                                    ) : null}
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-8 rounded-lg"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            router.push(`/patients/${patient.id}/history?from=patients`);
                                                        }}
                                                    >
                                                        <FileText className="w-3 h-3 mr-1" />
                                                        {t('payments.tabs.history')}
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-8 rounded-lg border-slate-200 text-slate-700 hover:bg-slate-50"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            openPatientDetails(patient.id);
                                                        }}
                                                    >
                                                        {t('patients.viewDetails')}
                                                        <ArrowRight className="w-3 h-3 ml-1" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </DataTableShell>
                        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <p className="text-sm text-slate-500">
                                    {t('patients.showing', { shown: patientRows.length, total: totalPatients })}
                                </p>
                                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="min-w-[96px]"
                                        onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                                        disabled={!hasPreviousPage || patientsQuery.isFetching}
                                    >
                                        {t('patients.previous')}
                                    </Button>
                                    <span className="inline-flex min-w-[132px] justify-center rounded-xl border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600 shadow-xs">
                                        {t('patients.pageOf', { page: pageNumber, total: totalPages })}
                                    </span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="min-w-[80px]"
                                        onClick={() => setCurrentPage((page) => page + 1)}
                                        disabled={!hasNextPage || patientsQuery.isFetching}
                                    >
                                        {t('patients.next')}
                                    </Button>
                                </div>
                        </div>
                        </>
                    )}
                </CardContent>
            </Card>

            {isDialogOpen ? (
                <AddPatientDialog
                    open={isDialogOpen}
                    onOpenChange={handleDialogOpenChange}
                    uploadMaxMb={currentUser?.subscription?.upload_max_mb}
                />
            ) : null}

            {isManageCategoriesOpen ? (
                <ManageCategoriesDialog
                    open={isManageCategoriesOpen}
                    onOpenChange={setIsManageCategoriesOpen}
                />
            ) : null}

            {photoPreview ? (
                <PatientPhotoPreviewDialog
                    open={photoPreview !== null}
                    onOpenChange={(open) => {
                        if (!open) {
                            setPhotoPreview(null);
                        }
                    }}
                    images={[photoPreview]}
                    alt={photoPreview.alt}
                    title={photoPreview.title}
                />
            ) : null}
        </div>
    );
}
