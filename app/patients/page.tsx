'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import { listPatientCategories, listPatients, restorePatient } from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import type { ApiPatient } from '@/lib/api/types';
import { cn, extractPrimaryPhone, formatDate, toLocalDateKey, truncateForUi } from '@/lib/utils';
import { Plus, Search, Phone, CalendarPlus, ArrowRight, Tags, FileText, FilterX } from 'lucide-react';
import { AddPatientDialog } from '@/components/patients/add-patient-dialog';
import { ManageCategoriesDialog } from '@/components/patients/manage-categories-dialog';
import { useI18n } from '@/components/providers/i18n-provider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getProtectedMediaCrossOrigin } from '@/lib/protected-media';
import { toast } from 'sonner';

const noopSubscribe = () => () => undefined;
const PAGE_SIZE = 10;
const PATIENT_TABLE_NAME_UI_LIMIT = 25;
const PATIENT_CATEGORY_UI_LIMIT = 20;

interface PatientRow {
    id: string;
    fullName: string;
    photoThumbnailUrl?: string;
    phone: string;
    secondaryPhone?: string;
    dateOfBirth?: string;
    createdAt?: string;
    lastVisitDate?: string;
    categories: Array<{ id: string; name: string; color: string }>;
}

function mapPatientRow(patient: ApiPatient): PatientRow {
    const photoThumbnailUrl = patient.photo_thumbnail_ready === false
        ? (patient.photo_preview_ready ? patient.photo_preview_url ?? undefined : undefined)
        : patient.photo_thumbnail_url ?? patient.photo_preview_url ?? undefined;

    return {
        id: patient.id,
        fullName: patient.full_name,
        photoThumbnailUrl,
        phone: extractPrimaryPhone(patient.phone),
        secondaryPhone: patient.secondary_phone ?? undefined,
        dateOfBirth: patient.date_of_birth ?? undefined,
        createdAt: patient.created_at ?? undefined,
        lastVisitDate: patient.last_visit_at ?? undefined,
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

function PatientsLoadingSkeleton() {
    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div className="space-y-2">
                    <Skeleton className="h-9 w-36" />
                    <Skeleton className="h-4 w-80" />
                </div>
                <Skeleton className="h-10 w-32" />
            </div>

            <Card>
                <CardContent className="pt-6">
                    <Skeleton className="h-10 w-full" />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-32" />
                </CardHeader>
                <CardContent className="space-y-3">
                    {Array.from({ length: 6 }).map((_, index) => (
                        <div key={index} className="grid grid-cols-[0.5fr_1fr_2.4fr_1.2fr_1.2fr_1.2fr_1fr] gap-4 items-center">
                            <Skeleton className="h-4 w-4" />
                            <Skeleton className="h-4 w-20" />
                            <div className="space-y-2">
                                <Skeleton className="h-4 w-40" />
                                <Skeleton className="h-3 w-32" />
                            </div>
                            <Skeleton className="h-6 w-20" />
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-8 w-24 justify-self-end" />
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
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
    const [dismissedUrlDialog, setDismissedUrlDialog] = useState(false);
    const shouldOpenFromUrl =
        isClient && new URLSearchParams(urlSearch).get('action') === 'new' && !dismissedUrlDialog;
    const isDialogOpen = isAddDialogOpen || shouldOpenFromUrl;

    const handleDialogOpenChange = (open: boolean) => {
        if (!open && shouldOpenFromUrl) {
            setDismissedUrlDialog(true);
        }

        setIsAddDialogOpen(open);
    };

    const patientsQuery = useQuery({
        queryKey: [
            'patients',
            'list',
            {
                page: currentPage,
                search: searchQuery,
                    categoryId: selectedCategoryId,
                    inactiveFilter,
                    archivedOnly: showArchivedOnly,
            },
        ],
        queryFn: () =>
            listPatients({
                page: currentPage,
                perPage: PAGE_SIZE,
                sort: '-created_at',
                filter: {
                    search: searchQuery.trim() || undefined,
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
        staleTime: 300000,
        gcTime: 900000,
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
    const openPatientDetails = (patientId: string) => {
        router.push(`/patients/${patientId}`);
    };
    const resetFilters = () => {
        setSearchQuery('');
        setSelectedCategoryId('all');
        setInactiveFilter('none');
        setShowArchivedOnly(false);
        setCurrentPage(1);
    };

    if (patientsQuery.isLoading) {
        return <PatientsLoadingSkeleton />;
    }

    if (patientsQuery.isError || categoriesQuery.isError) {
        return (
            <div className="space-y-4">
                <p className="text-sm text-red-600">
                    {getApiErrorMessage(patientsQuery.error || categoriesQuery.error, t('patients.loadFailed'))}
                </p>
                <Button
                    variant="outline"
                    onClick={() => {
                        patientsQuery.refetch();
                        categoriesQuery.refetch();
                    }}
                >
                    {t('common.retry')}
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <PageHeader
                title={t('patients.title')}
                description={t('patients.subtitle')}
                actions={(
                    <>
                        <Button
                            variant="outline"
                            className="w-full sm:w-auto"
                            onClick={() => setIsManageCategoriesOpen(true)}
                        >
                            <Tags className="w-4 h-4 mr-2" />
                            {t('patients.categories')}
                        </Button>
                        <Button className="w-full sm:w-auto" onClick={() => setIsAddDialogOpen(true)}>
                            <Plus className="w-4 h-4 mr-2" />
                            {t('patients.addPatient')}
                        </Button>
                    </>
                )}
            />

            <Card className="rounded-[1.5rem] border-blue-100/80 bg-gradient-to-br from-white via-blue-50/35 to-white shadow-sm shadow-blue-100/50">
                <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                        <div className="relative flex-1">
                            <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <Input
                                placeholder={t('patients.searchPlaceholder')}
                                aria-label={t('patients.searchAria')}
                                value={searchQuery}
                                onChange={(event) => {
                                    setSearchQuery(event.target.value);
                                    setCurrentPage(1);
                                }}
                                className="h-11 rounded-xl border-slate-200 bg-white/90 pl-10 shadow-xs"
                            />
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
                                    className="h-11 w-full min-w-[168px] rounded-xl border-slate-200 bg-white/90 text-left shadow-xs md:w-[168px]"
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
                                    className="h-11 w-full min-w-[168px] rounded-xl border-slate-200 bg-white/90 text-left shadow-xs md:w-[168px]"
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
                            <div className="relative flex h-11 shrink-0 items-center">
                                <Button
                                    variant="outline"
                                    className={cn(
                                        'h-11 min-w-[120px] rounded-xl px-4 shadow-xs',
                                        showArchivedOnly
                                            ? 'border-slate-900 bg-slate-900 text-white hover:border-slate-900 hover:bg-slate-800 hover:text-white'
                                            : 'border-slate-200 bg-white/90 text-slate-900 hover:bg-white'
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
                                        className="absolute right-0 top-full mt-1 h-6 whitespace-nowrap px-2 text-xs text-slate-500 hover:bg-white/80 hover:text-slate-900"
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

            <Card className="overflow-hidden rounded-[1.5rem] bg-white/95">
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
                        <div className="text-center py-12">
                            <p className="text-gray-500">
                                {inactiveFilter === '6m'
                                    ? t('patients.empty.noVisit6m')
                                    : inactiveFilter === '1y'
                                        ? t('patients.empty.noVisit1y')
                                    : showArchivedOnly
                                        ? t('patients.empty.archived')
                                    : hasActiveFilters
                                        ? t('patients.empty.filtered')
                                        : t('patients.empty.default')}
                            </p>
                            {hasActiveFilters && (
                                <Button
                                    variant="outline"
                                    className="mt-4"
                                    onClick={resetFilters}
                                >
                                    {t('patients.resetFilters')}
                                </Button>
                            )}
                        </div>
                    ) : (
                        <>
                        <DataTableShell>
                            <Table className={getDataTableClassName('standard')}>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-12">#</TableHead>
                                        <TableHead className="w-16">{t('patients.table.photo')}</TableHead>
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

                                        return (
                                        <TableRow
                                            key={patient.id}
                                            className="cursor-pointer hover:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
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
                                            <TableCell className="text-gray-500">
                                                {rowNumber}
                                            </TableCell>
                                            <TableCell>
                                                {patient.photoThumbnailUrl ? (
                                                    <Avatar className="h-9 w-9">
                                                        <AvatarImage
                                                            src={patient.photoThumbnailUrl}
                                                            alt={patient.fullName}
                                                            crossOrigin={getProtectedMediaCrossOrigin(patient.photoThumbnailUrl)}
                                                        />
                                                        <AvatarFallback className="bg-slate-100 text-slate-700 text-xs font-semibold">
                                                            {getPatientInitials(patient.fullName)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                ) : (
                                                    <Avatar className="h-9 w-9">
                                                        <AvatarFallback className="bg-slate-100 text-slate-700 text-xs font-semibold">
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
                                                    <p className="text-sm text-gray-500 truncate">
                                                        <Phone aria-hidden="true" className="mr-1 inline-block h-3 w-3 text-gray-400" />
                                                        {patient.phone}
                                                    </p>
                                                    {patient.dateOfBirth && (
                                                        <p className="text-sm text-gray-500 truncate">
                                                            {t('patients.born')}: {formatDate(patient.dateOfBirth)}
                                                        </p>
                                                    )}
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
                                                    <span className="text-gray-400 text-sm">{t('patients.uncategorized')}</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {patient.createdAt ? (
                                                    formatDate(patient.createdAt)
                                                ) : (
                                                    <span className="text-gray-400">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {patient.lastVisitDate ? (
                                                    formatDate(patient.lastVisitDate)
                                                ) : (
                                                    <span className="text-gray-400">{t('patients.never')}</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    {showArchivedOnly ? (
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
                                                    ) : inactiveFilter !== 'none' ? (
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
                                                        className="h-8 rounded-lg border-slate-300 text-slate-700 hover:bg-slate-100"
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
                                <p className="text-sm text-gray-500">
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

            <AddPatientDialog
                open={isDialogOpen}
                onOpenChange={handleDialogOpenChange}
            />

            <ManageCategoriesDialog
                open={isManageCategoriesOpen}
                onOpenChange={setIsManageCategoriesOpen}
            />
        </div>
    );
}
