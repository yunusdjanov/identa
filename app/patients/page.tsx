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
import { listPatientCategories, listPatients, restorePatient } from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import type { ApiPatient } from '@/lib/api/types';
import { extractPrimaryPhone, formatDate, toLocalDateKey, truncateForUi } from '@/lib/utils';
import { Plus, Search, Phone, Clock3, CalendarPlus, ArrowRight, Tags, FileText } from 'lucide-react';
import { AddPatientDialog } from '@/components/patients/add-patient-dialog';
import { ManageCategoriesDialog } from '@/components/patients/manage-categories-dialog';
import { useI18n } from '@/components/providers/i18n-provider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';

const noopSubscribe = () => () => undefined;
const PAGE_SIZE = 10;
const PATIENT_TABLE_NAME_UI_LIMIT = 25;
const PATIENT_CATEGORY_UI_LIMIT = 20;

interface PatientRow {
    id: string;
    fullName: string;
    photoUrl?: string;
    phone: string;
    secondaryPhone?: string;
    dateOfBirth?: string;
    createdAt?: string;
    lastVisitDate?: string;
    isArchived: boolean;
    categories: Array<{ id: string; name: string; color: string }>;
}

function mapPatientRow(patient: ApiPatient): PatientRow {
    return {
        id: patient.id,
        fullName: patient.full_name,
        photoUrl: patient.photo_url ?? undefined,
        phone: extractPrimaryPhone(patient.phone),
        secondaryPhone: patient.secondary_phone ?? undefined,
        dateOfBirth: patient.date_of_birth ?? undefined,
        createdAt: patient.created_at ?? undefined,
        lastVisitDate: patient.last_visit_at ?? undefined,
        isArchived: Boolean(patient.is_archived),
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
                        <div key={index} className="grid grid-cols-[0.5fr_1fr_2.4fr_1.2fr_1.2fr_1.2fr_1fr_1fr] gap-4 items-center">
                            <Skeleton className="h-4 w-4" />
                            <Skeleton className="h-4 w-20" />
                            <div className="space-y-2">
                                <Skeleton className="h-4 w-40" />
                                <Skeleton className="h-3 w-32" />
                            </div>
                            <Skeleton className="h-6 w-20" />
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-6 w-16" />
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
    const [inactiveFilter, setInactiveFilter] = useState<'none' | '1y'>('none');
    const [showArchivedOnly, setShowArchivedOnly] = useState(false);
    const [selectedCategoryId, setSelectedCategoryId] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
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
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">{t('patients.title')}</h1>
                    <p className="text-gray-500 mt-1">
                        {t('patients.subtitle')}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => setIsManageCategoriesOpen(true)}>
                        <Tags className="w-4 h-4 mr-2" />
                        {t('patients.categories')}
                    </Button>
                    <Button onClick={() => setIsAddDialogOpen(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        {t('patients.addPatient')}
                    </Button>
                </div>
            </div>

            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="relative flex-1">
                            <Search aria-hidden="true" className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <Input
                                placeholder={t('patients.searchPlaceholder')}
                                aria-label={t('patients.searchAria')}
                                value={searchQuery}
                                onChange={(event) => {
                                    setSearchQuery(event.target.value);
                                    setCurrentPage(1);
                                }}
                                className="pl-10"
                            />
                        </div>
                        <Button
                            variant={inactiveFilter === '1y' ? 'default' : 'outline'}
                            aria-pressed={inactiveFilter === '1y'}
                            disabled={showArchivedOnly}
                            onClick={() => {
                                setInactiveFilter((value) => (value === '1y' ? 'none' : '1y'));
                                setCurrentPage(1);
                            }}
                        >
                            <Clock3 className="w-4 h-4 mr-2" />
                            {t('patients.noVisit1y')}
                        </Button>
                        <Button
                            variant={showArchivedOnly ? 'default' : 'outline'}
                            aria-pressed={showArchivedOnly}
                            onClick={() => {
                                setShowArchivedOnly((value) => !value);
                                setInactiveFilter('none');
                                setCurrentPage(1);
                            }}
                        >
                            {t('patients.archived')}
                        </Button>
                        <Select
                            value={selectedCategoryId}
                            onValueChange={(value) => {
                                setSelectedCategoryId(value);
                                setCurrentPage(1);
                            }}
                        >
                            <SelectTrigger className="w-full md:w-56" aria-label={t('patients.filterByCategoryAria')}>
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
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>
                        {t('patients.totalCount', { count: totalPatients })}
                        {inactiveFilter === '1y' && ` (${t('patients.noVisit1y')})`}
                        {showArchivedOnly && ` (${t('patients.archived')})`}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {patientRows.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-gray-500">
                                {inactiveFilter === '1y'
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
                                    onClick={() => {
                                        setSearchQuery('');
                                        setSelectedCategoryId('all');
                                        setInactiveFilter('none');
                                        setShowArchivedOnly(false);
                                        setCurrentPage(1);
                                    }}
                                >
                                    {t('patients.resetFilters')}
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table className="w-full">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-12">#</TableHead>
                                        <TableHead className="w-16">{t('patients.table.photo')}</TableHead>
                                        <TableHead>{t('patients.table.name')}</TableHead>
                                        <TableHead>{t('patients.table.category')}</TableHead>
                                        <TableHead>{t('patients.table.registered')}</TableHead>
                                        <TableHead>{t('patients.table.lastVisit')}</TableHead>
                                        <TableHead>{t('patients.table.status')}</TableHead>
                                        <TableHead className="text-right">{t('patients.table.actions')}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {patientRows.map((patient, index) => {
                                        const isInactive =
                                            !patient.lastVisitDate ||
                                            patient.lastVisitDate < inactiveThresholdDateKey1y;
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
                                            className="cursor-pointer hover:bg-gray-50"
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
                                                {patient.photoUrl ? (
                                                    <Avatar className="h-9 w-9">
                                                        <AvatarImage src={patient.photoUrl} alt={patient.fullName} />
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
                                            <TableCell>
                                                {patient.isArchived ? (
                                                    <Badge variant="secondary" className="bg-slate-200 text-slate-800">
                                                        {t('patients.archived')}
                                                    </Badge>
                                                ) : isInactive ? (
                                                    <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                                                        {t('patients.status.needsFollowUp')}
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="secondary" className="bg-green-100 text-green-800">
                                                        {t('patients.status.active')}
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    {showArchivedOnly ? (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-8"
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
                                                            className="h-8"
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
                                                        className="h-8"
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
                                                        className="h-8 border-slate-300 text-slate-700 hover:bg-slate-100"
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
                            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-sm text-gray-500">
                                    {t('patients.showing', { shown: patientRows.length, total: totalPatients })}
                                </p>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                                        disabled={!hasPreviousPage || patientsQuery.isFetching}
                                    >
                                        {t('patients.previous')}
                                    </Button>
                                    <span className="text-sm text-gray-600">
                                        {t('patients.pageOf', { page: pageNumber, total: totalPages })}
                                    </span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCurrentPage((page) => page + 1)}
                                        disabled={!hasNextPage || patientsQuery.isFetching}
                                    >
                                        {t('patients.next')}
                                    </Button>
                                </div>
                            </div>
                        </div>
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
