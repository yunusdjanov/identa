'use client';

import dynamic from 'next/dynamic';
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import type { ApiPatient, ApiRecentPatient, ApiRecordActor } from '@/lib/api/types';
import { cn, extractPrimaryPhone, formatDate, toLocalDateKey, truncateForUi } from '@/lib/utils';
import { Plus, Search, Phone, Users, CalendarPlus, ArrowRight, Tags, FilterX, Download, Maximize2, X, ChevronRight } from 'lucide-react';
import { buildPdfFilename, exportRowsToPdf } from '@/lib/export/pdf';
import { EmptyState } from '@/components/ui/empty-state';
import { useI18n } from '@/components/providers/i18n-provider';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getProtectedMediaCrossOrigin, getProtectedMediaPreviewUrl, getProtectedMediaThumbnailUrl } from '@/lib/protected-media';
import { toast } from 'sonner';
import { AppErrorState } from '@/components/error/app-error-state';
import { AccessDeniedState } from '@/components/error/access-denied-state';
import { canManage, canView, getManageDeniedMessage, isSubscriptionReadOnly } from '@/lib/auth/permissions';
import { RecordAuthorBadge } from '@/components/ui/record-author-badge';
import {
    clearPatientListRestoreIntent,
    markPatientListStateForBackNavigation,
    readPatientListState,
    writePatientListState,
} from '@/lib/patients/patient-list-state';
import { queryKeys } from '@/lib/query-keys';

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
const PATIENT_SEARCH_MAX_LENGTH = 160;
const PATIENT_TABLE_NAME_UI_LIMIT = 25;
const PATIENT_CATEGORY_UI_LIMIT = 20;
type PatientOpenSource = 'list' | 'recent' | 'search';

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

const MOBILE_AVATAR_COLORS = [
    'bg-teal-100 text-teal-800',
    'bg-sky-100 text-sky-800',
    'bg-violet-100 text-violet-800',
    'bg-amber-100 text-amber-800',
    'bg-rose-100 text-rose-800',
] as const;

function getMobilePatientInitials(fullName: string): string {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

    return `${parts[0][0] ?? ''}${parts.at(-1)?.[0] ?? ''}`.toUpperCase();
}

function getMobileAvatarColor(patientId: string): string {
    const hash = Array.from(patientId).reduce((total, character) => total + character.charCodeAt(0), 0);
    return MOBILE_AVATAR_COLORS[hash % MOBILE_AVATAR_COLORS.length];
}

const CYRILLIC_INITIALS: Record<string, string> = {
    А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ё: 'Y', Ж: 'J', З: 'Z', И: 'I', Й: 'Y',
    К: 'K', Л: 'L', М: 'M', Н: 'N', О: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T', У: 'U', Ф: 'F',
    Х: 'X', Ц: 'C', Ч: 'C', Ш: 'S', Щ: 'S', Ъ: '#', Ы: 'I', Ь: '#', Э: 'E', Ю: 'Y', Я: 'Y',
    Ў: 'O', Қ: 'Q', Ғ: 'G', Ҳ: 'H',
};

function getPatientSectionInitial(fullName: string): string {
    const firstCharacter = fullName.trim().charAt(0).toUpperCase();
    if (!firstCharacter) return '#';

    const latinCharacter = CYRILLIC_INITIALS[firstCharacter]
        ?? firstCharacter.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    return /^[A-Z]$/.test(latinCharacter) ? latinCharacter : '#';
}

function groupPatientsByInitial(patients: PatientRow[]): Array<[string, PatientRow[]]> {
    const groups = new Map<string, PatientRow[]>();

    patients.forEach((patient) => {
        const initial = getPatientSectionInitial(patient.fullName);
        groups.set(initial, [...(groups.get(initial) ?? []), patient]);
    });

    return Array.from(groups.entries())
        .sort(([first], [second]) => first.localeCompare(second, 'en'))
        .map(([initial, rows]) => [
            initial,
            rows.sort((first, second) => first.fullName.localeCompare(second.fullName, 'en')),
        ]);
}

function getPatientAge(dateOfBirth?: string): number | null {
    if (!dateOfBirth) return null;
    const birthDate = new Date(`${dateOfBirth.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(birthDate.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const birthdayHasPassed = today.getMonth() > birthDate.getMonth()
        || (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
    if (!birthdayHasPassed) age -= 1;

    return age >= 0 ? age : null;
}

function formatRelativeVisit(date: string | undefined, locale: string): string | null {
    if (!date) return null;
    const visitDate = new Date(date);
    if (Number.isNaN(visitDate.getTime())) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    visitDate.setHours(0, 0, 0, 0);
    const differenceInDays = Math.round((visitDate.getTime() - today.getTime()) / 86_400_000);
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

    if (Math.abs(differenceInDays) < 7) return formatter.format(differenceInDays, 'day');
    if (Math.abs(differenceInDays) < 30) return formatter.format(Math.round(differenceInDays / 7), 'week');
    if (Math.abs(differenceInDays) < 365) return formatter.format(Math.round(differenceInDays / 30), 'month');
    return formatter.format(Math.round(differenceInDays / 365), 'year');
}

export default function PatientsPage() {
    const { t, locale } = useI18n();
    const router = useRouter();
    const searchParams = useSearchParams();
    const queryClient = useQueryClient();
    const recentMenuId = useId();
    const restoreInProgressRef = useRef(false);
    const isClient = useSyncExternalStore(
        noopSubscribe,
        () => true,
        () => false
    );
    const restoreSearchValue = searchParams.get('restore');
    const [initialListState] = useState(readPatientListState);
    const [searchQuery, setSearchQuery] = useState(initialListState.searchQuery);
    const [inactiveFilter, setInactiveFilter] = useState<'none' | '6m' | '1y'>(initialListState.inactiveFilter);
    const [showArchivedOnly, setShowArchivedOnly] = useState(initialListState.showArchivedOnly);
    const [selectedCategoryId, setSelectedCategoryId] = useState(initialListState.selectedCategoryId);
    const [currentPage, setCurrentPage] = useState(initialListState.currentPage);
    const [focusedPatientId, setFocusedPatientId] = useState<string | null>(initialListState.focusPatientId);
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
    const [optimisticRecentPatients, setOptimisticRecentPatients] = useState<ApiRecentPatient[] | null>(null);
    const [photoPreview, setPhotoPreview] = useState<{
        src: string;
        thumbnailSrc?: string;
        alt: string;
        title: string;
    } | null>(null);
    const [dismissedUrlDialog, setDismissedUrlDialog] = useState(false);
    const shouldOpenFromUrl =
        isClient && searchParams.get('action') === 'new' && !dismissedUrlDialog;
    const currentUserQuery = useQuery({
        queryKey: queryKeys.auth.me(),
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
        queryKey: queryKeys.patients.list({
                page: currentPage,
                search: debouncedSearch,
                categoryId: selectedCategoryId,
                inactiveFilter,
                archivedOnly: showArchivedOnly,
        }),
        enabled: canViewPatients,
        queryFn: () =>
            listPatients({
                page: currentPage,
                perPage: PAGE_SIZE,
                sort: '-updated_at',
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
        queryKey: queryKeys.patientCategories.list(),
        queryFn: () => listPatientCategories(),
        enabled: canViewPatients,
        staleTime: 300000,
        gcTime: 900000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });
    const recentPatientsQuery = useQuery({
        queryKey: queryKeys.patients.recent(),
        queryFn: listRecentPatients,
        enabled: canViewPatients,
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnMount: 'always',
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });
    const patientRows = useMemo(
        () => (patientsQuery.data?.data ?? []).map((patient) => mapPatientRow(patient)),
        [patientsQuery.data]
    );
    const mobilePatientGroups = useMemo(() => groupPatientsByInitial(patientRows), [patientRows]);
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
            queryClient.invalidateQueries({ queryKey: queryKeys.patients.all() });
            queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all() });
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('patients.restoreFailed')));
        },
    });
    const forgetRecentMutation = useMutation({
        mutationFn: (patientId: string) => forgetRecentPatient(patientId),
        onMutate: async (patientId: string) => {
            const previous = queryClient.getQueryData<ApiRecentPatient[]>(queryKeys.patients.recent());
            const previousOptimistic = optimisticRecentPatients;
            setOptimisticRecentPatients((current) => {
                const source = current ?? previous ?? [];

                return source.filter((patient) => patient.id !== patientId);
            });
            queryClient.setQueryData<ApiRecentPatient[]>(queryKeys.patients.recent(), (current = []) =>
                current.filter((patient) => patient.id !== patientId)
            );
            await queryClient.cancelQueries({ queryKey: queryKeys.patients.recent() }, { revert: false });

            return { previous, previousOptimistic };
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.patients.recent() });
        },
        onError: (error, _patientId, context) => {
            setOptimisticRecentPatients(context?.previousOptimistic ?? context?.previous ?? null);
            queryClient.setQueryData(queryKeys.patients.recent(), context?.previous ?? []);
            toast.error(getApiErrorMessage(error, t('patients.recent.removeFailed')));
        },
    });
    const clearRecentMutation = useMutation({
        mutationFn: clearRecentPatients,
        onMutate: async () => {
            const previous = queryClient.getQueryData<ApiRecentPatient[]>(queryKeys.patients.recent());
            const previousOptimistic = optimisticRecentPatients;
            setOptimisticRecentPatients([]);
            queryClient.setQueryData<ApiRecentPatient[]>(queryKeys.patients.recent(), []);
            setIsRecentMenuOpen(false);
            await queryClient.cancelQueries({ queryKey: queryKeys.patients.recent() }, { revert: false });

            return { previous, previousOptimistic };
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.patients.recent() });
        },
        onError: (error, _variables, context) => {
            setOptimisticRecentPatients(context?.previousOptimistic ?? context?.previous ?? null);
            queryClient.setQueryData(queryKeys.patients.recent(), context?.previous ?? []);
            toast.error(getApiErrorMessage(error, t('patients.recent.clearFailed')));
        },
    });
    const getPatientOpenSource = (): PatientOpenSource => (
        searchQuery.trim() === '' ? 'list' : 'search'
    );

    useEffect(() => {
        if (!isClient || restoreSearchValue !== '1') {
            return;
        }

        let releaseRestoreTimer: number | undefined;
        const restoreTimer = window.setTimeout(() => {
            const restoredState = readPatientListState();
            restoreInProgressRef.current = true;
            writePatientListState(restoredState);

            setSearchQuery(restoredState.searchQuery);
            setInactiveFilter(restoredState.inactiveFilter);
            setShowArchivedOnly(restoredState.showArchivedOnly);
            setSelectedCategoryId(restoredState.selectedCategoryId);
            setCurrentPage(restoredState.currentPage);
            setFocusedPatientId(restoredState.focusPatientId);
            clearPatientListRestoreIntent();

            releaseRestoreTimer = window.setTimeout(() => {
                restoreInProgressRef.current = false;
                writePatientListState(restoredState);
            }, 0);
        }, 0);

        return () => {
            window.clearTimeout(restoreTimer);
            if (releaseRestoreTimer !== undefined) {
                window.clearTimeout(releaseRestoreTimer);
            }
            restoreInProgressRef.current = false;
        };
    }, [isClient, restoreSearchValue]);

    useEffect(() => {
        if (!isClient || restoreSearchValue === '1' || restoreInProgressRef.current) {
            return;
        }

        writePatientListState({
            searchQuery,
            inactiveFilter,
            showArchivedOnly,
            selectedCategoryId,
            currentPage,
            focusPatientId: focusedPatientId,
        });
    }, [currentPage, focusedPatientId, inactiveFilter, isClient, restoreSearchValue, searchQuery, selectedCategoryId, showArchivedOnly]);

    useEffect(() => {
        if (!isClient || !focusedPatientId || patientsQuery.isFetching) {
            return;
        }

        if (!patientRows.some((patient) => patient.id === focusedPatientId)) {
            return;
        }

        const runAfterPaint = window.requestAnimationFrame ?? ((callback: FrameRequestCallback) => {
            return window.setTimeout(() => callback(window.performance.now()), 0);
        });

        runAfterPaint(() => {
            const targetId = window.matchMedia('(max-width: 1023px)').matches
                ? `patient-mobile-card-${focusedPatientId}`
                : `patient-row-${focusedPatientId}`;
            document.getElementById(targetId)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
    }, [focusedPatientId, isClient, patientRows, patientsQuery.isFetching]);

    const openPatientDetails = (
        patientId: string,
        patientName?: string,
        source: PatientOpenSource = 'list'
    ) => {
        const shouldRememberRecent = source !== 'list';
        setFocusedPatientId(patientId);
        markPatientListStateForBackNavigation({
            searchQuery,
            inactiveFilter,
            showArchivedOnly,
            selectedCategoryId,
            currentPage: pageNumber,
            focusPatientId: patientId,
        });

        if (patientName && shouldRememberRecent) {
            setOptimisticRecentPatients((current) => [
                { id: patientId, full_name: patientName },
                ...(current ?? recentPatientsQuery.data ?? []).filter((patient) => patient.id !== patientId),
            ].slice(0, 5));
            queryClient.setQueryData<ApiRecentPatient[]>(queryKeys.patients.recent(), (current = []) => [
                { id: patientId, full_name: patientName },
                ...current.filter((patient) => patient.id !== patientId),
            ].slice(0, 5));
        }

        const href = shouldRememberRecent
            ? `/patients/${patientId}?remember_recent=1`
            : `/patients/${patientId}`;

        router.push(href);
    };
    const recentPatients = optimisticRecentPatients ?? recentPatientsQuery.data ?? [];
    const shouldShowRecentMenu = isRecentMenuOpen && searchQuery.trim() === '' && recentPatients.length > 0;
    const resetFilters = () => {
        setSearchQuery('');
        setSelectedCategoryId('all');
        setInactiveFilter('none');
        setShowArchivedOnly(false);
        setCurrentPage(1);
    };
    const patientsFilterToolbar = (
        <div
            data-testid="patients-filter-toolbar"
            className="min-w-0 max-w-full overflow-hidden bg-white lg:overflow-visible lg:rounded-2xl lg:border lg:border-teal-100/80 lg:p-4 lg:shadow-sm lg:shadow-teal-100/40"
        >
            <div className="flex min-w-0 max-w-full flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
                <div
                    className="relative mx-5 min-w-0 flex-1 lg:mx-0"
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
                        maxLength={PATIENT_SEARCH_MAX_LENGTH}
                        onFocus={() => {
                            if (searchQuery.trim() === '') {
                                setIsRecentMenuOpen(true);
                            }
                        }}
                        onClick={() => {
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
                        onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                                setIsRecentMenuOpen(false);
                            }
                        }}
                        aria-controls={shouldShowRecentMenu ? recentMenuId : undefined}
                        aria-expanded={shouldShowRecentMenu}
                        className="h-11 rounded-xl border-0 bg-slate-100/90 pl-10 pr-10 shadow-none ring-1 ring-inset ring-slate-200/40 lg:h-9 lg:border lg:border-slate-200 lg:bg-white lg:pr-3 lg:shadow-xs lg:ring-0"
                    />
                    {shouldShowRecentMenu ? (
                        <div
                            id={recentMenuId}
                            data-testid="patients-recent-menu"
                            className="absolute left-0 top-full z-40 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-xl shadow-slate-200/70 backdrop-blur"
                        >
                            <div className="flex h-10 items-center justify-between border-b border-slate-100 px-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                    {t('patients.recent.title')}
                                </p>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 rounded-full px-2.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                                    disabled={clearRecentMutation.isPending}
                                    onClick={() => clearRecentMutation.mutate()}
                                >
                                    {t('common.clear')}
                                </Button>
                            </div>
                            <ul className="max-h-60 overflow-y-auto p-1" role="list">
                                {recentPatients.map((patient) => (
                                    <li
                                        key={patient.id}
                                        className="group flex min-h-10 items-center gap-1 rounded-xl text-sm transition hover:bg-teal-50/80 focus-within:bg-teal-50/80"
                                    >
                                        <button
                                            type="button"
                                            className="min-w-0 flex-1 truncate rounded-xl px-3 py-2 text-left font-medium text-slate-800 focus-visible:outline-none"
                                            onClick={() => openPatientDetails(patient.id, patient.full_name, 'recent')}
                                        >
                                            {patient.full_name}
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={t('patients.recent.removeAria', { patientName: patient.full_name })}
                                            className="mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 opacity-100 transition hover:bg-white hover:text-slate-700 focus-visible:bg-white focus-visible:text-slate-700 focus-visible:outline-none sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                                            disabled={forgetRecentMutation.isPending}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                forgetRecentMutation.mutate(patient.id);
                                            }}
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}
                </div>
                <div
                    data-testid="patients-mobile-category-chips"
                    className="flex w-full min-w-0 max-w-full gap-2 overflow-x-auto px-5 py-1 no-scrollbar lg:hidden"
                >
                    <button
                        type="button"
                        aria-pressed={selectedCategoryId === 'all' && inactiveFilter === 'none' && !showArchivedOnly}
                        className={cn(
                            'h-8 shrink-0 rounded-full px-3.5 text-[13px] font-semibold transition-colors',
                            selectedCategoryId === 'all' && inactiveFilter === 'none' && !showArchivedOnly
                                ? 'bg-teal-600 text-white shadow-sm'
                                : 'bg-slate-100 text-slate-600'
                        )}
                        onClick={() => {
                            setSelectedCategoryId('all');
                            setInactiveFilter('none');
                            setShowArchivedOnly(false);
                            setCurrentPage(1);
                        }}
                    >
                        {t('patients.all')}
                    </button>
                    <button
                        type="button"
                        aria-pressed={showArchivedOnly}
                        className={cn(
                            'h-8 shrink-0 rounded-full px-3.5 text-[13px] font-semibold transition-colors',
                            showArchivedOnly ? 'bg-teal-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600'
                        )}
                        onClick={() => {
                            setShowArchivedOnly(true);
                            setInactiveFilter('none');
                            setSelectedCategoryId('all');
                            setCurrentPage(1);
                        }}
                    >
                        {t('patients.archived')}
                    </button>
                    {(['6m', '1y'] as const).map((filter) => (
                        <button
                            key={filter}
                            type="button"
                            aria-pressed={inactiveFilter === filter && !showArchivedOnly}
                            className={cn(
                                'h-8 shrink-0 rounded-full px-3.5 text-[13px] font-semibold transition-colors',
                                inactiveFilter === filter && !showArchivedOnly
                                    ? 'bg-teal-600 text-white shadow-sm'
                                    : 'bg-slate-100 text-slate-600'
                            )}
                            onClick={() => {
                                setInactiveFilter(filter);
                                setShowArchivedOnly(false);
                                setSelectedCategoryId('all');
                                setCurrentPage(1);
                            }}
                        >
                            {t(filter === '6m' ? 'patients.noVisit6m' : 'patients.noVisit1y')}
                        </button>
                    ))}
                    {(categoriesQuery.data ?? []).map((category) => (
                        <button
                            key={category.id}
                            type="button"
                            aria-pressed={selectedCategoryId === category.id && !showArchivedOnly}
                            className={cn(
                                'inline-flex h-8 max-w-44 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors',
                                selectedCategoryId === category.id && !showArchivedOnly
                                    ? 'bg-teal-600 text-white shadow-sm'
                                    : 'bg-slate-100 text-slate-600'
                            )}
                            onClick={() => {
                                setSelectedCategoryId(category.id);
                                setInactiveFilter('none');
                                setShowArchivedOnly(false);
                                setCurrentPage(1);
                            }}
                        >
                            <span
                                aria-hidden="true"
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: category.color }}
                            />
                            <span className="truncate">{category.name}</span>
                        </button>
                    ))}
                </div>
                <div className="hidden min-w-0 grid-cols-2 items-center gap-2 lg:flex lg:flex-wrap lg:justify-end lg:gap-2.5">
                    <Select
                        value={selectedCategoryId}
                        onValueChange={(value) => {
                            setSelectedCategoryId(value);
                            setCurrentPage(1);
                        }}
                    >
                        <SelectTrigger
                            className="h-9 w-full min-w-0 rounded-xl border-slate-200 bg-white text-left text-xs shadow-xs sm:min-w-[168px] sm:text-sm md:w-[168px]"
                            aria-label={t('patients.filterByCategoryAria')}
                        >
                            <SelectValue placeholder={t('patients.allCategories')} />
                        </SelectTrigger>
                        <SelectContent
                            position="popper"
                            align="start"
                            className="w-[var(--radix-select-trigger-width)]"
                        >
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
                            className="h-9 w-full min-w-0 rounded-xl border-slate-200 bg-white text-left text-xs shadow-xs sm:min-w-[168px] sm:text-sm md:w-[168px]"
                            aria-label={t('patients.filterByVisitActivityAria')}
                        >
                            <SelectValue placeholder={t('patients.visitFilterLabel')} />
                        </SelectTrigger>
                        <SelectContent
                            position="popper"
                            align="start"
                            className="w-[var(--radix-select-trigger-width)]"
                        >
                            <SelectItem value="none">{t('patients.visitFilterAll')}</SelectItem>
                            <SelectItem value="6m">{t('patients.noVisit6m')}</SelectItem>
                            <SelectItem value="1y">{t('patients.noVisit1y')}</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button
                        variant="outline"
                        className={cn(
                            'col-span-2 h-9 min-w-0 shrink-0 rounded-xl px-3 text-xs shadow-xs transition-colors sm:col-span-1 sm:min-w-[120px] sm:px-4 sm:text-sm',
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
                            className="h-9 shrink-0 whitespace-nowrap rounded-xl px-2.5 text-xs text-slate-500 hover:bg-white hover:text-slate-900"
                            onClick={resetFilters}
                        >
                            <FilterX className="h-3.5 w-3.5" />
                            {t('common.clear')}
                        </Button>
                    ) : null}
                </div>
            </div>
        </div>
    );

    const handleExportPatients = () => {
        if (patientRows.length === 0) {
            toast.error(t('export.empty'));
            return;
        }

        const data = patientsQuery.data?.data ?? [];
        const rows = data.map((patient) => [
            patient.full_name,
            extractPrimaryPhone(patient.phone) || '-',
            patient.gender ? t(`gender.${patient.gender}`) : '-',
            patient.date_of_birth ? formatDate(patient.date_of_birth) : '-',
            (patient.categories ?? []).map((category) => category.name).join(', ') || '-',
            patient.last_visit_at ? formatDate(patient.last_visit_at) : '-',
        ]);
        exportRowsToPdf({
            filename: buildPdfFilename('patients'),
            title: t('patients.title'),
            subtitle: t('patients.subtitle'),
            locale,
            columns: [
                t('patients.table.name'),
                t('patients.table.phone'),
                t('patients.table.gender'),
                t('patients.table.dateOfBirth'),
                t('patients.categories'),
                t('patients.table.lastVisit'),
            ],
            rows,
            summary: [{ label: t('patients.table.name'), value: String(data.length) }],
            orientation: 'landscape',
        });
        toast.success(t('export.downloaded'));
    };

    if (currentUserQuery.isLoading || patientsQuery.isLoading) {
        return <PatientsLoadingState />;
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

    return (
        <div className="space-y-3 sm:space-y-5 lg:space-y-6">
            <div
                data-testid="patients-mobile-app-header"
                className="-mx-3 flex items-center justify-between gap-3 bg-white px-5 pb-2 pt-1 sm:-mx-6 lg:hidden"
            >
                <div className="min-w-0">
                    <h1 className="text-[28px] font-bold leading-[34px] tracking-tight text-slate-950">
                        {t('patients.title')}
                    </h1>
                    <p className="text-[13px] leading-[18px] text-slate-500">
                        {t('patients.totalCount', { count: totalPatients })}
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {currentUser?.subscription?.can_export ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-full bg-slate-100 text-slate-600"
                            aria-label={t('common.export')}
                            disabled={patientRows.length === 0}
                            onClick={handleExportPatients}
                        >
                            <Download className="h-[18px] w-[18px]" />
                        </Button>
                    ) : null}
                    {canManagePatients ? (
                        <Button
                            type="button"
                            variant="ghost"
                            className="h-9 w-9 gap-1.5 rounded-full bg-teal-50 px-0 text-xs font-bold text-teal-700 hover:bg-teal-100 hover:text-teal-800 min-[380px]:w-auto min-[380px]:px-3"
                            aria-label={t('patients.categories')}
                            onClick={() => setIsManageCategoriesOpen(true)}
                        >
                            <Tags className="h-[18px] w-[18px]" />
                            <span className="hidden min-[380px]:inline">{t('patients.categories')}</span>
                        </Button>
                    ) : null}
                </div>
            </div>

            <div className="hidden lg:block">
                <PageHeader
                    title={t('patients.title')}
                    description={t('patients.subtitle')}
                    actions={(
                    <div className="grid w-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1.5 sm:flex sm:w-auto sm:flex-wrap sm:gap-2">
                        {currentUser?.subscription?.can_export ? (
                            <Button
                                variant="outline"
                                className="h-9 min-w-0 w-full gap-1.5 px-2.5 text-xs sm:w-auto sm:px-3 sm:text-sm"
                                disabled={patientRows.length === 0}
                                onClick={handleExportPatients}
                            >
                                <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
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
                                className="h-9 min-w-0 w-full gap-1.5 px-2.5 text-xs sm:w-auto sm:px-3 sm:text-sm"
                                onClick={() => setIsManageCategoriesOpen(true)}
                            >
                                <Tags className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                {t('patients.categories')}
                            </Button>
                        ) : isSubscriptionReadOnly(currentUser) ? (
                            <Button
                                variant="outline"
                                className="h-9 min-w-0 w-full gap-1.5 px-2.5 text-xs sm:w-auto sm:px-3 sm:text-sm"
                                disabled
                                onClick={denyManageAction}
                            >
                                <Tags className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                {t('patients.categories')}
                            </Button>
                        ) : null}
                        {canManagePatients ? (
                            <Button
                                className="col-span-2 h-9 min-w-0 w-full gap-1.5 px-3 text-xs sm:w-auto sm:text-sm"
                                onClick={() => setIsAddDialogOpen(true)}
                            >
                                <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                {t('patients.addPatient')}
                            </Button>
                        ) : isSubscriptionReadOnly(currentUser) ? (
                            <Button
                                className="col-span-2 h-9 min-w-0 w-full gap-1.5 px-3 text-xs sm:w-auto sm:text-sm"
                                disabled
                                onClick={denyManageAction}
                            >
                                <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                {t('patients.addPatient')}
                            </Button>
                        ) : null}
                    </div>
                    )}
                />
            </div>

            <Card data-testid="patients-list-card" className="-mx-3 min-w-0 max-w-full overflow-hidden rounded-none border-0 bg-white shadow-none sm:-mx-6 lg:mx-0 lg:max-w-none lg:overflow-visible lg:rounded-2xl lg:border lg:shadow-sm">
                <CardHeader className="min-w-0 max-w-full gap-2 px-0 pb-1 pt-0 lg:gap-4 lg:px-6 lg:pb-4 lg:pt-6">
                    <CardTitle className="hidden text-sm lg:block lg:text-base">
                        {t('patients.totalCount', { count: totalPatients })}
                        {inactiveFilter === '6m' && ` (${t('patients.noVisit6m')})`}
                        {inactiveFilter === '1y' && ` (${t('patients.noVisit1y')})`}
                        {showArchivedOnly && ` (${t('patients.archived')})`}
                    </CardTitle>
                    {patientsFilterToolbar}
                </CardHeader>
                <CardContent className="min-w-0 max-w-full px-3 pb-24 sm:px-5 lg:pb-5">
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
                            description={hasActiveFilters ? undefined : t('patients.searchPlaceholder')}
                            action={hasActiveFilters ? (
                                <Button variant="outline" onClick={resetFilters}>
                                    <FilterX className="h-4 w-4 mr-1.5" />
                                    {t('patients.resetFilters')}
                                </Button>
                            ) : null}
                        />
                    ) : (
                        <>
                        <div data-testid="patients-mobile-list" className="-mx-3 min-w-0 max-w-full bg-white sm:-mx-5 lg:hidden">
                            {mobilePatientGroups.map(([initial, patients]) => (
                                <section key={initial} data-testid={`patients-mobile-section-${initial}`}>
                                    <h2 className="border-b border-slate-200/70 bg-[#F2F2F7] px-5 py-[5px] text-[13px] font-bold leading-[18px] text-slate-500">
                                        {initial}
                                    </h2>
                                    <div>
                                        {patients.map((patient) => {
                                            const filteredCategory = selectedCategoryId !== 'all'
                                                ? patient.categories.find((category) => category.id === selectedCategoryId)
                                                : undefined;
                                            const categoryToDisplay = filteredCategory ?? patient.categories[0];
                                            const patientPhotoThumbnailUrl = patient.photoThumbnailUrl ?? '';
                                            const patientAge = getPatientAge(patient.dateOfBirth);
                                            const relativeVisit = formatRelativeVisit(patient.lastVisitDate, locale);

                                            return (
                                                <article
                                                    key={patient.id}
                                                    id={`patient-mobile-card-${patient.id}`}
                                                    data-testid={`patient-mobile-card-${patient.id}`}
                                                    className={cn(
                                                        'relative min-w-0 max-w-full bg-white after:absolute after:bottom-0 after:left-[4.5rem] after:right-0 after:h-px after:bg-slate-100 last:after:hidden',
                                                        focusedPatientId === patient.id && 'bg-teal-50/50'
                                                    )}
                                                >
                                                    <button
                                                        type="button"
                                                        className="flex w-full min-w-0 items-center gap-3 px-5 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-300"
                                                        aria-label={t('patients.aria.openDetailsFor', { patientName: patient.fullName })}
                                                        onClick={() => openPatientDetails(patient.id, patient.fullName, getPatientOpenSource())}
                                                    >
                                                        {patientPhotoThumbnailUrl ? (
                                                            <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-slate-100">
                                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                <img
                                                                    src={patientPhotoThumbnailUrl}
                                                                    alt=""
                                                                    crossOrigin={getProtectedMediaCrossOrigin(patientPhotoThumbnailUrl)}
                                                                    className="h-full w-full object-cover object-center"
                                                                    decoding="async"
                                                                    loading="lazy"
                                                                />
                                                            </span>
                                                        ) : (
                                                            <Avatar className={cn('h-10 w-10 shrink-0 rounded-full border-0', getMobileAvatarColor(patient.id))}>
                                                                <AvatarFallback className="rounded-full bg-transparent text-xs font-bold text-current">
                                                                    {getMobilePatientInitials(patient.fullName)}
                                                                </AvatarFallback>
                                                            </Avatar>
                                                        )}
                                                        <span className="min-w-0 flex-1">
                                                            <span className="flex min-w-0 items-center gap-2">
                                                                <span className="min-w-0 flex-1 truncate text-[17px] font-semibold leading-[22px] text-slate-950" title={patient.fullName}>
                                                                    {patient.fullName}
                                                                </span>
                                                                {relativeVisit ? (
                                                                    <span className="shrink-0 text-xs leading-4 text-slate-400">
                                                                        {relativeVisit}
                                                                    </span>
                                                                ) : null}
                                                            </span>
                                                            <span className="mt-0.5 flex min-w-0 items-center gap-2">
                                                                <span className="min-w-0 flex-1 truncate text-[13px] leading-[18px] text-slate-500">
                                                                    {patient.phone || '-'}
                                                                    {patientAge !== null ? ` · ${t('patients.age', { count: patientAge })}` : ''}
                                                                </span>
                                                                {categoryToDisplay ? (
                                                                    <span
                                                                        className="inline-flex h-5 max-w-[7.5rem] shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-medium"
                                                                        style={{ backgroundColor: `${categoryToDisplay.color}1A`, color: categoryToDisplay.color }}
                                                                        title={categoryToDisplay.name}
                                                                    >
                                                                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: categoryToDisplay.color }} />
                                                                        <span className="truncate">{categoryToDisplay.name}</span>
                                                                    </span>
                                                                ) : null}
                                                            </span>
                                                        </span>
                                                        <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-300" />
                                                    </button>
                                                    {showRecordAuthors ? (
                                                        <RecordAuthorBadge className="mb-2 ml-[4.5rem]" createdBy={patient.createdBy} updatedBy={patient.updatedBy} />
                                                    ) : null}
                                                    {showArchivedOnly ? (
                                                        <div className="pb-3 pl-[4.5rem] pr-5">
                                                            {canManagePatients ? (
                                                                <Button variant="outline" className="h-9 w-full text-xs" onClick={() => restoreMutation.mutate(patient.id)} disabled={restoreMutation.isPending}>
                                                                    {t('patients.restore')}
                                                                </Button>
                                                            ) : isSubscriptionReadOnly(currentUser) ? (
                                                                <Button variant="outline" className="h-9 w-full text-xs" disabled onClick={denyManageAction}>
                                                                    {t('patients.restore')}
                                                                </Button>
                                                            ) : null}
                                                        </div>
                                                    ) : inactiveFilter !== 'none' ? (
                                                        <div className="pb-3 pl-[4.5rem] pr-5">
                                                            {canManageAppointments ? (
                                                                <Button variant="outline" className="h-9 w-full text-xs" onClick={() => router.push(`/appointments?action=new&patientId=${encodeURIComponent(patient.id)}`)}>
                                                                    <CalendarPlus className="h-3.5 w-3.5" />
                                                                    {t('patients.schedule')}
                                                                </Button>
                                                            ) : isSubscriptionReadOnly(currentUser) && canViewAppointments ? (
                                                                <Button variant="outline" className="h-9 w-full text-xs" disabled>
                                                                    <CalendarPlus className="h-3.5 w-3.5" />
                                                                    {t('patients.schedule')}
                                                                </Button>
                                                            ) : null}
                                                        </div>
                                                    ) : null}
                                                </article>
                                            );
                                        })}
                                    </div>
                                </section>
                            ))}
                        </div>
                        <DataTableShell data-testid="patients-desktop-table" className="hidden lg:block">
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
                                            id={`patient-row-${patient.id}`}
                                            key={patient.id}
                                            data-testid={`patient-row-${patient.id}`}
                                            className={cn(
                                                'cursor-pointer hover:bg-teal-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-100',
                                                focusedPatientId === patient.id && 'bg-teal-50/60 ring-1 ring-inset ring-teal-100'
                                            )}
                                            role="button"
                                            tabIndex={0}
                                            aria-label={t('patients.aria.openDetailsFor', { patientName: patient.fullName })}
                                            onClick={() => openPatientDetails(patient.id, patient.fullName, getPatientOpenSource())}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter' || event.key === ' ') {
                                                    event.preventDefault();
                                                    openPatientDetails(patient.id, patient.fullName, getPatientOpenSource());
                                                }
                                            }}
                                        >
                                            <TableCell className="text-slate-500">
                                                {rowNumber}
                                            </TableCell>
                                            <TableCell className="w-28 overflow-visible">
                                                {patientPhotoThumbnailUrl !== '' ? (
                                                    <div className="relative h-16 w-20 overflow-visible">
                                                        <button
                                                            type="button"
                                                            className="group absolute left-0 top-1/2 inline-flex h-20 w-20 -translate-y-1/2 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-0 shadow-xs transition hover:border-teal-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
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
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img
                                                                src={patientPhotoThumbnailUrl}
                                                                alt={patient.fullName}
                                                                crossOrigin={getProtectedMediaCrossOrigin(patientPhotoThumbnailUrl)}
                                                                className="block h-full w-full rounded-xl object-cover object-center"
                                                                decoding="async"
                                                                loading="lazy"
                                                            />
                                                            <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/0 text-white opacity-0 transition group-hover:bg-slate-950/35 group-hover:opacity-100 group-focus-visible:bg-slate-950/35 group-focus-visible:opacity-100">
                                                                <Maximize2 className="h-4 w-4" />
                                                            </span>
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="relative h-16 w-20 overflow-visible">
                                                        <Avatar className="absolute left-0 top-1/2 h-20 w-20 -translate-y-1/2 rounded-xl border border-dashed border-slate-200 bg-slate-50">
                                                            <AvatarFallback className="rounded-xl bg-slate-50 text-sm font-semibold text-slate-500">
                                                                {getPatientInitials(patient.fullName)}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                    </div>
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
                                                        dentist owner sees what's paused. View Details below is
                                                        a read-only action — always shown. */}
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
                                                        className="h-8 rounded-lg border-slate-200 text-slate-700 hover:bg-slate-50"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            openPatientDetails(patient.id, patient.fullName, getPatientOpenSource());
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

            {canManagePatients ? (
                <Button
                    type="button"
                    size="icon"
                    className="fixed bottom-5 right-5 z-30 h-14 w-14 rounded-full bg-gradient-to-br from-teal-500 to-teal-700 text-white shadow-[0_10px_28px_rgba(13,148,136,0.38)] hover:from-teal-600 hover:to-teal-800 lg:hidden"
                    aria-label={t('patients.addPatient')}
                    onClick={() => setIsAddDialogOpen(true)}
                >
                    <Plus className="h-6 w-6" />
                </Button>
            ) : null}

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
