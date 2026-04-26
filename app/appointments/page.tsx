'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-shell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    deleteAppointment,
    getProfile,
    listAllAppointments,
    updateAppointment,
} from '@/lib/api/dentist';
import {
    getAppointmentApiErrorMessage,
} from '@/lib/appointments/messages';
import { getApiErrorMessage } from '@/lib/api/client';
import { INPUT_LIMITS } from '@/lib/input-validation';
import { formatTime, getStatusBadgeColor, isValidTimeInput, toLocalDateKey, truncateForUi } from '@/lib/utils';
import {
    createAppointmentCoveredSlots,
    createAppointmentStartSlots,
    isAppointmentWithinWorkingHours,
    normalizeAppointmentWorkingHours,
    resolveAppointmentEndTime,
    toMinutesFromTime,
    type NormalizedAppointmentWorkingHours,
} from '@/lib/appointments/time-slots';
import { formatLocalizedDate } from '@/lib/i18n/date';
import { Plus, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { AddAppointmentDialog } from '@/components/appointments/add-appointment-dialog';
import { AppointmentTimePicker } from '@/components/appointments/appointment-time-picker';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useI18n } from '@/components/providers/i18n-provider';

const noopSubscribe = () => () => undefined;
const APPOINTMENT_NAME_UI_LIMIT = 25;
const APPOINTMENT_COMPACT_NAME_UI_LIMIT = 14;
const APPOINTMENT_REASON_UI_LIMIT = 40;
const APPOINTMENT_MODAL_NAME_UI_LIMIT = 40;
const APPOINTMENT_MODAL_REASON_UI_LIMIT = 56;
const WEEK_VIEW_VISIBLE_APPOINTMENTS = 6;
const WEEK_VIEW_COMPACT_VISIBLE_APPOINTMENTS = 9;
const APPOINTMENT_STATUS_VALUES = ['scheduled', 'completed', 'cancelled', 'no_show'] as const;
type AppointmentStatus = (typeof APPOINTMENT_STATUS_VALUES)[number];

function parseStatusFilter(raw: string): AppointmentStatus[] {
    if (!raw) {
        return [];
    }

    const allowedStatuses = new Set<AppointmentStatus>(APPOINTMENT_STATUS_VALUES);
    return raw
        .split(',')
        .map((value) => value.trim())
        .filter((value): value is AppointmentStatus => allowedStatuses.has(value as AppointmentStatus));
}

function getDurationMinutes(startTime: string, endTime: string): number {
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);

    return Math.max(0, endHour * 60 + endMinute - (startHour * 60 + startMinute));
}

function extractReason(notes: string | null): string {
    if (!notes) {
        return '';
    }

    const parts = notes.split('|').map((part) => part.trim()).filter(Boolean);
    return parts[0] ?? '';
}

function getWeekStart(date: Date): Date {
    const weekStart = new Date(date);
    const normalizedDay = (weekStart.getDay() + 6) % 7;
    weekStart.setDate(weekStart.getDate() - normalizedDay);
    weekStart.setHours(0, 0, 0, 0);
    return weekStart;
}

function getAppointmentCardClass(status: AppointmentRow['status']): string {
    switch (status) {
        case 'scheduled':
            return 'border-blue-500 bg-blue-50/80';
        case 'completed':
            return 'border-green-500 bg-green-50/80';
        case 'cancelled':
            return 'border-slate-400 bg-slate-100/80';
        case 'no_show':
            return 'border-red-500 bg-red-50/80';
        default:
            return 'border-blue-500 bg-blue-50/80';
    }
}

function getAppointmentBorderClass(status: AppointmentRow['status']): string {
    switch (status) {
        case 'scheduled':
            return 'border-blue-500';
        case 'completed':
            return 'border-green-500';
        case 'cancelled':
            return 'border-gray-400';
        case 'no_show':
            return 'border-red-500';
        default:
            return 'border-blue-500';
    }
}

function getCompactAppointmentTimeClass(status: AppointmentRow['status']): string {
    switch (status) {
        case 'scheduled':
            return 'bg-blue-100 text-blue-700';
        case 'completed':
            return 'bg-green-100 text-green-700';
        case 'cancelled':
            return 'bg-slate-200 text-slate-700';
        case 'no_show':
            return 'bg-red-100 text-red-700';
        default:
            return 'bg-blue-100 text-blue-700';
    }
}

function isNonBlockingAppointmentStatus(status: AppointmentRow['status']): boolean {
    return status === 'cancelled' || status === 'no_show';
}

function getSlotOrderPriority(status: AppointmentRow['status']): number {
    switch (status) {
        case 'cancelled':
            return 0;
        case 'no_show':
            return 1;
        case 'scheduled':
            return 2;
        case 'completed':
            return 3;
        default:
            return 9;
    }
}

interface AppointmentRow {
    id: string;
    patientId: string;
    patientName: string;
    appointmentDate: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    status: AppointmentStatus;
    reason?: string;
}

interface WeekInlineEditFormData {
    startTime: string;
    durationMinutes: number;
    status: AppointmentStatus;
    reason: string;
}

function hasAppointmentRowConflict(
    appointments: AppointmentRow[],
    payload: {
        appointmentDate: string;
        startTime: string;
        endTime: string;
        status: AppointmentStatus;
        ignoreAppointmentId?: string;
    }
): boolean {
    if (payload.status === 'cancelled' || payload.status === 'no_show') {
        return false;
    }

    return appointments.some((appointment) => {
        if (appointment.id === payload.ignoreAppointmentId || appointment.appointmentDate !== payload.appointmentDate) {
            return false;
        }
        if (appointment.status === 'cancelled' || appointment.status === 'no_show') {
            return false;
        }

        return appointment.startTime < payload.endTime && appointment.endTime > payload.startTime;
    });
}

function getAvailableAppointmentStartTimes(
    appointments: AppointmentRow[],
    payload: {
        appointmentDate: string;
        durationMinutes: number;
        status: AppointmentStatus;
        ignoreAppointmentId?: string;
        includeStartTime?: string;
        workingHours: NormalizedAppointmentWorkingHours;
    },
    timeSlots: string[]
): string[] {
    return timeSlots.filter((startTime) => {
        const endTime = resolveAppointmentEndTime(startTime, payload.durationMinutes);
        if (!endTime) {
            return false;
        }
        if (
            startTime !== payload.includeStartTime
            && !isAppointmentWithinWorkingHours(startTime, endTime, payload.workingHours)
        ) {
            return false;
        }

        return !hasAppointmentRowConflict(appointments, {
            appointmentDate: payload.appointmentDate,
            startTime,
            endTime,
            status: payload.status,
            ignoreAppointmentId: payload.ignoreAppointmentId,
        });
    });
}

function AppointmentsLoadingSkeleton() {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div className="space-y-2">
                    <Skeleton className="h-9 w-48" />
                    <Skeleton className="h-4 w-64" />
                </div>
                <Skeleton className="h-10 w-40" />
            </div>

            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="flex space-x-2">
                            <Skeleton className="h-10 w-24" />
                            <Skeleton className="h-10 w-24" />
                        </div>
                        <Skeleton className="h-10 w-64" />
                        <Skeleton className="h-10 w-20" />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-44" />
                </CardHeader>
                <CardContent className="space-y-2">
                    {Array.from({ length: 9 }).map((_, index) => (
                        <div key={index} className="flex items-start gap-3 border-b border-gray-100 py-2">
                            <Skeleton className="h-4 w-14 mt-1" />
                            <div className="flex-1">
                                <Skeleton className="h-9 w-full" />
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}

export default function AppointmentsPage() {
    const { t, locale } = useI18n();
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
    const [viewOverride, setViewOverride] = useState<'day' | 'week' | null>(null);
    const [currentDateOverride, setCurrentDateOverride] = useState<Date | null>(null);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [prefillDate, setPrefillDate] = useState<string | undefined>(undefined);
    const [prefillStartTime, setPrefillStartTime] = useState<string | undefined>(undefined);
    const [dialogVersion, setDialogVersion] = useState(0);
    const [editDialogVersion, setEditDialogVersion] = useState(0);
    const [editingAppointment, setEditingAppointment] = useState<AppointmentRow | null>(null);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [appointmentToDelete, setAppointmentToDelete] = useState<AppointmentRow | null>(null);
    const [draggedAppointmentId, setDraggedAppointmentId] = useState<string | null>(null);
    const [expandedWeekDateKey, setExpandedWeekDateKey] = useState<string | null>(null);
    const [editingWeekAppointmentId, setEditingWeekAppointmentId] = useState<string | null>(null);
    const [weekInlineEditFormData, setWeekInlineEditFormData] = useState<WeekInlineEditFormData | null>(null);
    const [dismissedUrlDialogSignature, setDismissedUrlDialogSignature] = useState<string | null>(null);
    const urlParams = isClient ? new URLSearchParams(urlSearch) : null;
    const urlAction = (urlParams?.get('action') ?? '').trim() || undefined;
    const rawUrlPrefillPatientId = (urlParams?.get('patientId') ?? '').trim();
    const urlView = (urlParams?.get('view') ?? '').trim();
    const urlDate = (urlParams?.get('date') ?? '').trim();
    const urlStatuses = parseStatusFilter((urlParams?.get('status') ?? '').trim());
    const urlWhen = (urlParams?.get('when') ?? '').trim();
    const rawUrlWindowMinutes = (urlParams?.get('window') ?? '').trim();
    const parsedUrlWindowMinutes = Number.parseInt(rawUrlWindowMinutes, 10);
    const urlWindowMinutes = Number.isFinite(parsedUrlWindowMinutes) && parsedUrlWindowMinutes > 0
        ? Math.min(parsedUrlWindowMinutes, 720)
        : null;
    const viewFromUrl = urlView === 'day' || urlView === 'week' ? urlView : 'week';
    const currentDateFromUrl = useMemo(() => {
        if (urlDate === 'today') {
            return new Date();
        }

        if (/^\d{4}-\d{2}-\d{2}$/.test(urlDate)) {
            const [year, month, day] = urlDate.split('-').map(Number);
            const parsedDate = new Date(year, month - 1, day);
            if (!Number.isNaN(parsedDate.getTime())) {
                return parsedDate;
            }
        }

        return new Date();
    }, [urlDate]);
    const view = viewOverride ?? viewFromUrl;
    const currentDate = currentDateOverride ?? currentDateFromUrl;
    const weekStartDate = useMemo(() => getWeekStart(currentDate), [currentDate]);
    const weekEndDate = useMemo(() => {
        const end = new Date(weekStartDate);
        end.setDate(end.getDate() + 6);
        return end;
    }, [weekStartDate]);
    const urlPrefillPatientId = urlAction === 'new' && rawUrlPrefillPatientId !== ''
        ? rawUrlPrefillPatientId
        : undefined;
    const urlDialogSignature = `${urlAction ?? ''}|${urlPrefillPatientId ?? ''}`;
    const shouldOpenFromUrl = Boolean(urlAction === 'new' && dismissedUrlDialogSignature !== urlDialogSignature);
    const isDialogOpen = isAddDialogOpen || shouldOpenFromUrl;
    const hasUrlFilters = urlStatuses.length > 0 || urlWhen === 'upcoming' || urlWindowMinutes !== null;

    const openAddDialog = (options?: { date?: Date; startTime?: string }) => {
        const dialogDate = options?.date ?? currentDate;
        setPrefillDate(toLocalDateKey(dialogDate));
        setPrefillStartTime(options?.startTime ?? availabilityTimeSlots[0]);
        setDialogVersion((version) => version + 1);
        setIsAddDialogOpen(true);
    };

    const handleDialogOpenChange = (open: boolean) => {
        if (!open && shouldOpenFromUrl) {
            setDismissedUrlDialogSignature(urlDialogSignature);
        }

        setIsAddDialogOpen(open);
    };

    const openEditDialog = (appointment: AppointmentRow) => {
        if (appointment.status !== 'scheduled') {
            toast.error(t('appointments.toast.onlyScheduledEdit'));
            return;
        }

        setEditingAppointment(appointment);
        setEditDialogVersion((version) => version + 1);
        setIsEditDialogOpen(true);
    };

    const handleEditDialogOpenChange = (open: boolean) => {
        setIsEditDialogOpen(open);
        if (!open) {
            setEditingAppointment(null);
        }
    };

    const openDeleteDialog = (appointment: AppointmentRow) => {
        setAppointmentToDelete(appointment);
        setIsDeleteDialogOpen(true);
    };

    const handleDeleteDialogOpenChange = (open: boolean) => {
        setIsDeleteDialogOpen(open);
        if (!open) {
            setAppointmentToDelete(null);
        }
    };

    const openWeekInlineEditor = (appointment: AppointmentRow) => {
        if (editingWeekAppointmentId === appointment.id) {
            closeWeekInlineEditor();
            return;
        }

        setEditingWeekAppointmentId(appointment.id);
        setWeekInlineEditFormData({
            startTime: appointment.startTime,
            durationMinutes: appointment.durationMinutes,
            status: appointment.status,
            reason: appointment.reason ?? '',
        });
    };

    const closeWeekInlineEditor = () => {
        setEditingWeekAppointmentId(null);
        setWeekInlineEditFormData(null);
    };

    const visibleRange = useMemo(() => {
        if (view === 'day') {
            const rangeStart = new Date(currentDate);
            rangeStart.setHours(0, 0, 0, 0);
            const startDate = toLocalDateKey(rangeStart);

            return {
                startDate,
                endDate: startDate,
            };
        }

        return {
            startDate: toLocalDateKey(weekStartDate),
            endDate: toLocalDateKey(weekEndDate),
        };
    }, [currentDate, view, weekEndDate, weekStartDate]);

    const appointmentsQuery = useQuery({
        queryKey: ['appointments', 'list', visibleRange.startDate, visibleRange.endDate],
        queryFn: () =>
            listAllAppointments({
                sort: 'appointment_date,start_time',
                filter: {
                    date_from: visibleRange.startDate,
                    date_to: visibleRange.endDate,
                },
            }),
        placeholderData: (previousData) => previousData,
        staleTime: 300000,
        gcTime: 900000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });
    const profileQuery = useQuery({
        queryKey: ['settings', 'profile'],
        queryFn: getProfile,
        staleTime: 300000,
        gcTime: 900000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });
    const workingHours = normalizeAppointmentWorkingHours(profileQuery.data?.working_hours);

    const appointmentRows = useMemo<AppointmentRow[]>(() => {
        return (appointmentsQuery.data ?? []).map((appointment) => {
            const reason = extractReason(appointment.notes);

            return {
                id: appointment.id,
                patientId: appointment.patient_id,
                patientName: appointment.patient_name ?? t('appointments.unknownPatient'),
                appointmentDate: appointment.appointment_date,
                startTime: appointment.start_time,
                endTime: appointment.end_time,
                durationMinutes: getDurationMinutes(appointment.start_time, appointment.end_time),
                status: appointment.status,
                reason: reason || undefined,
            };
        });
    }, [appointmentsQuery.data, t]);
    const nowTimeKey = useMemo(
        () => `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`,
        []
    );
    const todayDateKey = useMemo(() => toLocalDateKey(new Date()), []);
    const filteredAppointmentRows = useMemo(() => {
        return appointmentRows.filter((appointment) => {
            if (urlStatuses.length > 0 && !urlStatuses.includes(appointment.status)) {
                return false;
            }

            if (urlWhen === 'upcoming') {
                if (appointment.appointmentDate < todayDateKey) {
                    return false;
                }

                if (appointment.appointmentDate === todayDateKey && appointment.startTime < nowTimeKey) {
                    return false;
                }
            }

            if (urlWindowMinutes !== null) {
                if (appointment.appointmentDate !== todayDateKey) {
                    return false;
                }

                const appointmentMinutes = toMinutesFromTime(appointment.startTime);
                const nowMinutes = toMinutesFromTime(nowTimeKey);
                if (appointmentMinutes < nowMinutes || appointmentMinutes > nowMinutes + urlWindowMinutes) {
                    return false;
                }
            }

            return true;
        });
    }, [appointmentRows, nowTimeKey, todayDateKey, urlStatuses, urlWhen, urlWindowMinutes]);
    const availabilityTimeSlots = createAppointmentStartSlots(workingHours);
    const timeSlots = createAppointmentStartSlots(workingHours, {
        extraSlots: appointmentRows.flatMap((appointment) =>
            createAppointmentCoveredSlots(appointment.startTime, appointment.endTime)
        ),
    });
    const slotMinutesByTime = new Map(timeSlots.map((time) => [time, toMinutesFromTime(time)]));
    const currentDateKey = useMemo(() => toLocalDateKey(currentDate), [currentDate]);
    const appointmentById = useMemo(
        () => new Map(filteredAppointmentRows.map((appointment) => [appointment.id, appointment])),
        [filteredAppointmentRows]
    );
    const appointmentsByDate = useMemo(() => {
        const grouped = new Map<string, AppointmentRow[]>();

        for (const appointment of filteredAppointmentRows) {
            const existing = grouped.get(appointment.appointmentDate);
            if (existing) {
                existing.push(appointment);
            } else {
                grouped.set(appointment.appointmentDate, [appointment]);
            }
        }

        for (const [date, items] of grouped.entries()) {
            grouped.set(
                date,
                items.sort((a, b) => {
                    const startCompare = a.startTime.localeCompare(b.startTime);
                    if (startCompare !== 0) {
                        return startCompare;
                    }

                    const statusCompare = getSlotOrderPriority(a.status) - getSlotOrderPriority(b.status);
                    if (statusCompare !== 0) {
                        return statusCompare;
                    }

                    return a.id.localeCompare(b.id);
                })
            );
        }

        return grouped;
    }, [filteredAppointmentRows]);
    const appointmentsByDateAndTime = useMemo(() => {
        const grouped = new Map<string, Map<string, AppointmentRow[]>>();

        for (const [date, items] of appointmentsByDate.entries()) {
            const byTime = new Map<string, AppointmentRow[]>();
            for (const appointment of items) {
                const existing = byTime.get(appointment.startTime);
                if (existing) {
                    existing.push(appointment);
                } else {
                    byTime.set(appointment.startTime, [appointment]);
                }
            }
            grouped.set(date, byTime);
        }

        return grouped;
    }, [appointmentsByDate]);
    const appointmentsCoveringByDateAndTime = (() => {
        const grouped = new Map<string, Map<string, AppointmentRow[]>>();

        for (const [date, items] of appointmentsByDate.entries()) {
            const byTime = new Map<string, AppointmentRow[]>();

            for (const appointment of items) {
                const startMinutes = toMinutesFromTime(appointment.startTime);
                const endMinutes = toMinutesFromTime(appointment.endTime);

                for (const timeSlot of timeSlots) {
                    const slotMinutes = slotMinutesByTime.get(timeSlot) ?? toMinutesFromTime(timeSlot);
                    if (slotMinutes < startMinutes || slotMinutes >= endMinutes) {
                        continue;
                    }

                    const existing = byTime.get(timeSlot);
                    if (existing) {
                        existing.push(appointment);
                    } else {
                        byTime.set(timeSlot, [appointment]);
                    }
                }
            }

            grouped.set(date, byTime);
        }

        return grouped;
    })();

    const rescheduleMutation = useMutation({
        mutationFn: async (payload: {
            appointment: AppointmentRow;
            nextDate: string;
            nextStartTime: string;
            nextEndTime: string;
        }) =>
            updateAppointment(payload.appointment.id, {
                patient_id: payload.appointment.patientId,
                appointment_date: payload.nextDate,
                start_time: payload.nextStartTime,
                end_time: payload.nextEndTime,
                status: payload.appointment.status,
                reason: payload.appointment.reason ?? undefined,
            }),
        onSuccess: () => {
            toast.success(t('appointments.toast.moved'));
            queryClient.invalidateQueries({ queryKey: ['appointments'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        },
        onError: (error) => {
            toast.error(getAppointmentApiErrorMessage(error, t('appointments.toast.moveFailed')));
        },
        onSettled: () => {
            setDraggedAppointmentId(null);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (appointmentId: string) => deleteAppointment(appointmentId),
        onSuccess: () => {
            toast.success(t('appointments.toast.deleted'));
            queryClient.invalidateQueries({ queryKey: ['appointments'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            setIsDeleteDialogOpen(false);
            setAppointmentToDelete(null);
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('appointments.toast.deleteFailed')));
        },
    });

    const weekInlineEditMutation = useMutation({
        mutationFn: async (payload: { appointment: AppointmentRow; formData: WeekInlineEditFormData }) => {
            const endTime = resolveAppointmentEndTime(payload.formData.startTime, payload.formData.durationMinutes);
            if (!endTime) {
                throw new Error(t('appointments.toast.endOfDay'));
            }

            const reasonPayload = payload.formData.reason.trim() || undefined;

            return updateAppointment(payload.appointment.id, {
                patient_id: payload.appointment.patientId,
                appointment_date: payload.appointment.appointmentDate,
                start_time: payload.formData.startTime,
                end_time: endTime,
                status: payload.formData.status,
                reason: reasonPayload,
            });
        },
        onSuccess: () => {
            toast.success(t('appointments.dialog.toast.updated'));
            closeWeekInlineEditor();
            queryClient.invalidateQueries({ queryKey: ['appointments'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        },
        onError: (error) => {
            toast.error(getAppointmentApiErrorMessage(error, t('appointments.dialog.toast.updateFailed')));
        },
    });

    const weekDateDescriptors = useMemo(
        () =>
            Array.from({ length: 7 }).map((_, dayIndex) => {
                const date = new Date(weekStartDate);
                date.setDate(date.getDate() + dayIndex);
                const dateKey = toLocalDateKey(date);

                return {
                    dayIndex,
                    date,
                    dateKey,
                    weekdayLabel: formatLocalizedDate(date, locale, { weekday: 'short' }),
                    compactDateLabel: `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`,
                    dayNumber: date.getDate(),
                    fullDateLabel: formatLocalizedDate(date, locale, {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                    }),
                };
            }),
        [locale, weekStartDate]
    );
    const weekRangeLabel = useMemo(() => {
        const sameMonth = weekStartDate.getMonth() === weekEndDate.getMonth()
            && weekStartDate.getFullYear() === weekEndDate.getFullYear();
        const startMonthLabel = formatLocalizedDate(weekStartDate, locale, { month: sameMonth ? 'long' : 'short' });
        const endMonthLabel = formatLocalizedDate(weekEndDate, locale, { month: 'short' });
        const startDayLabel = String(weekStartDate.getDate());
        const endDayLabel = String(weekEndDate.getDate());
        const yearLabel = String(weekEndDate.getFullYear());

        if (sameMonth) {
            return `${startMonthLabel} ${startDayLabel} - ${endDayLabel}, ${yearLabel}`;
        }

        return `${startMonthLabel} ${startDayLabel} - ${endMonthLabel} ${endDayLabel}, ${yearLabel}`;
    }, [locale, weekEndDate, weekStartDate]);
    const expandedWeekDescriptor = useMemo(
        () => weekDateDescriptors.find((descriptor) => descriptor.dateKey === expandedWeekDateKey) ?? null,
        [expandedWeekDateKey, weekDateDescriptors]
    );
    const expandedWeekAppointments = expandedWeekDescriptor
        ? appointmentsByDate.get(expandedWeekDescriptor.dateKey) ?? []
        : [];

    const renderWeekDayCard = (
        descriptor: (typeof weekDateDescriptors)[number],
        options?: {
            compact?: boolean;
            includeTestIds?: boolean;
        }
    ) => {
        const compact = options?.compact ?? false;
        const includeTestIds = options?.includeTestIds ?? false;
        const dayAppointments = appointmentsByDate.get(descriptor.dateKey) ?? [];
        const visibleAppointments = dayAppointments.slice(
            0,
            compact ? WEEK_VIEW_COMPACT_VISIBLE_APPOINTMENTS : WEEK_VIEW_VISIBLE_APPOINTMENTS
        );
        const hiddenAppointmentsCount = Math.max(0, dayAppointments.length - visibleAppointments.length);
        const isTodayLane = descriptor.dateKey === todayDateKey;

        return (
            <div
                key={descriptor.dayIndex}
                className={`interactive-card flex flex-col overflow-hidden rounded-2xl border shadow-sm ${
                    compact ? 'h-[19.5rem] self-start' : 'h-auto min-h-[18rem] self-start'
                } ${isTodayLane ? 'border-blue-200 bg-blue-50/35 shadow-blue-100/70 ring-1 ring-blue-100' : 'border-slate-200/80 bg-white/95 shadow-slate-200/50'}`}
                data-testid={includeTestIds ? `week-day-card-${descriptor.dateKey}` : undefined}
            >
                <div className={`w-full border-b text-left ${
                    compact ? 'px-2.5 py-1.5' : 'px-3 py-2.5'
                } ${
                    isTodayLane
                        ? 'border-blue-500 bg-blue-600 text-white'
                        : 'border-slate-100 bg-slate-50/80'
                }`}>
                    <div className={compact ? 'relative flex min-h-[1.35rem] items-center justify-center' : 'flex items-start justify-between gap-3'}>
                        {compact ? (
                            <>
                                <span className={`absolute left-0 top-1/2 -translate-y-1/2 text-[11px] font-medium uppercase tracking-[0.12em] ${
                                    isTodayLane ? 'text-blue-100' : 'text-slate-500'
                                }`}>
                                    {descriptor.weekdayLabel}
                                </span>
                                <p className={`inline-flex items-center justify-center font-semibold leading-none ${
                                    isTodayLane ? 'text-white' : 'text-slate-900'
                                }`}>
                                    <span className="inline-flex items-center leading-none">{descriptor.compactDateLabel}</span>
                                </p>
                            </>
                        ) : (
                            <div className="min-w-0">
                                <p className={`flex items-baseline gap-1.5 font-semibold leading-none text-lg ${
                                    isTodayLane ? 'text-white' : 'text-slate-900'
                                }`}>
                                    <span className={`text-[12px] font-medium uppercase tracking-[0.12em] ${
                                        isTodayLane ? 'text-blue-100' : 'text-slate-500'
                                    }`}>
                                        {descriptor.weekdayLabel}
                                    </span>
                                    <span className="inline-flex items-center leading-none">{descriptor.compactDateLabel}</span>
                                </p>
                                {isTodayLane ? (
                                    <p className="mt-1 inline-flex rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
                                        {t('appointments.today')}
                                    </p>
                                ) : null}
                            </div>
                        )}
                        <span
                            className={`${compact ? 'absolute right-0 top-1/2 -translate-y-1/2' : ''} inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                isTodayLane
                                    ? 'bg-white/15 text-white'
                                    : 'bg-white text-slate-600 ring-1 ring-slate-200'
                            }`}
                            aria-label={t('appointments.count', { count: dayAppointments.length })}
                        >
                            {compact ? dayAppointments.length : t('appointments.count', { count: dayAppointments.length })}
                        </span>
                    </div>
                </div>
                <div className={`flex flex-1 min-h-0 flex-col ${compact ? 'p-1' : 'gap-2 p-2'}`}>
                    {dayAppointments.length === 0 ? (
                        <div className={`flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3 text-center text-sm text-slate-500 ${
                            compact ? 'h-[8.75rem] py-4' : 'min-h-[11rem] py-5'
                        }`}>
                            {t('appointments.noAppointments')}
                        </div>
                    ) : (
                        <>
                            <div className={compact ? 'h-[14.5rem] rounded-xl border border-slate-100 bg-slate-50/70 p-1.5' : 'space-y-1.5'}>
                                <div className={compact ? 'space-y-0.5' : ''}>
                                {visibleAppointments.map((appointment) => (
                                    <div
                                        key={appointment.id}
                                        className={`border-l-4 ${
                                            compact
                                                ? `${getAppointmentBorderClass(appointment.status)} flex h-[1.35rem] items-center rounded-lg bg-white px-1.5 shadow-xs ring-1 ring-slate-100`
                                                : 'rounded-lg px-2.5 py-1.5'
                                        } ${
                                            compact ? '' : getAppointmentCardClass(appointment.status)
                                        }`}
                                    >
                                        <div className="flex w-full min-w-0 items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <div
                                                    className={`flex w-full min-w-0 items-center gap-1.5 font-semibold text-slate-900 leading-tight ${compact ? 'text-xs' : 'text-[13px]'}`}
                                                    title={`${appointment.startTime} ${appointment.patientName}`}
                                                >
                                                    <span
                                                        className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 font-medium ${
                                                            compact
                                                                ? `text-[9px] ${getCompactAppointmentTimeClass(appointment.status)}`
                                                                : 'text-xs text-slate-700'
                                                        }`}
                                                    >
                                                        {appointment.startTime}
                                                    </span>
                                                    <span className="block min-w-0 flex-1 truncate">
                                                        {truncateForUi(
                                                            appointment.patientName,
                                                            compact ? APPOINTMENT_COMPACT_NAME_UI_LIMIT : APPOINTMENT_NAME_UI_LIMIT
                                                        )}
                                                    </span>
                                                </div>
                                            </div>
                                            {compact ? null : (
                                                <Badge className={`${getStatusBadgeColor(appointment.status)} shrink-0`}>
                                                    {t(`status.${appointment.status}`)}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                </div>
                            </div>
                            <div className={`mt-auto flex gap-1.5 ${compact ? 'pt-1' : 'pt-2'}`}>
                                <button
                                    type="button"
                                    className={`inline-flex flex-1 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 font-medium text-blue-700 transition-colors hover:bg-blue-100 ${
                                        compact ? 'h-6 px-1.5 text-[10px]' : 'h-8 px-3 text-xs'
                                    }`}
                                    aria-label={hiddenAppointmentsCount > 0
                                        ? t('appointments.showMoreAria', { count: hiddenAppointmentsCount })
                                        : t('appointments.showAppointments')}
                                    data-testid={includeTestIds ? `week-day-more-${descriptor.dateKey}` : undefined}
                                    onClick={() => setExpandedWeekDateKey(descriptor.dateKey)}
                                >
                                    {hiddenAppointmentsCount > 0
                                        ? t('appointments.moreCount', { count: hiddenAppointmentsCount })
                                        : t('appointments.showAppointments')}
                                </button>
                                <button
                                    type="button"
                                    className={`inline-flex flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white font-medium text-slate-700 transition-colors hover:bg-slate-50 ${
                                        compact ? 'h-6 px-1.5 text-[10px]' : 'h-8 px-3 text-xs'
                                    }`}
                                    data-testid={includeTestIds ? `week-day-add-${descriptor.dateKey}` : undefined}
                                    onClick={() => openAddDialog({ date: descriptor.date })}
                                >
                                    {t('appointments.addForDay')}
                                </button>
                            </div>
                        </>
                    )}
                    {dayAppointments.length === 0 ? (
                        <div className={compact ? 'mt-auto pt-1.5' : 'mt-auto pt-2'}>
                            <button
                                type="button"
                                className={`inline-flex w-full items-center justify-center rounded-lg border border-blue-200 bg-blue-50 font-medium text-blue-700 transition-colors hover:bg-blue-100 ${
                                    compact ? 'h-6 px-1.5 text-[10px]' : 'h-8 px-3 text-xs'
                                }`}
                                aria-label={t('appointments.addForDay')}
                                data-testid={includeTestIds ? `week-day-more-${descriptor.dateKey}` : undefined}
                                onClick={() => openAddDialog({ date: descriptor.date })}
                            >
                                {t('appointments.addForDay')}
                            </button>
                        </div>
                    ) : null}
                </div>
            </div>
        );
    };

    const replaceAppointmentsUrl = (updates: Record<string, string | null>) => {
        if (!isClient) {
            return;
        }

        const params = new URLSearchParams(urlSearch);
        Object.entries(updates).forEach(([key, value]) => {
            if (value === null || value === '') {
                params.delete(key);
                return;
            }

            params.set(key, value);
        });

        const nextSearch = params.toString();
        window.history.replaceState(window.history.state, '', nextSearch ? `/appointments?${nextSearch}` : '/appointments');
    };

    const navigateDate = (direction: 'prev' | 'next') => {
        const newDate = new Date(currentDate);

        if (view === 'day') {
            newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
        } else {
            newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
        }

        setCurrentDateOverride(newDate);
        setExpandedWeekDateKey(null);
        replaceAppointmentsUrl({
            view,
            date: toLocalDateKey(newDate),
        });
    };

    const activeFilterLabel = useMemo(() => {
        if (!hasUrlFilters) {
            return null;
        }

        if (urlWindowMinutes !== null) {
            return t('appointments.filters.startingSoon');
        }

        if (urlWhen === 'upcoming' && urlStatuses.length === 1 && urlStatuses[0] === 'scheduled') {
            return t('appointments.filters.pendingToday');
        }

        if (urlStatuses.includes('cancelled') || urlStatuses.includes('no_show')) {
            return t('appointments.filters.cancelledNoShowToday');
        }

        if (urlStatuses.length > 0) {
            return t('appointments.filters.statuses', {
                statuses: urlStatuses.map((status) => t(`status.${status}`)).join(', '),
            });
        }

        return t('appointments.filters.custom');
    }, [hasUrlFilters, t, urlStatuses, urlWhen, urlWindowMinutes]);

    const clearUrlFilters = () => {
        replaceAppointmentsUrl({
            status: null,
            when: null,
            window: null,
        });
    };

    const moveAppointmentToSlot = (targetDate: Date, targetStartTime: string, dragId?: string) => {
        const activeDragId = dragId ?? draggedAppointmentId;
        if (!activeDragId || rescheduleMutation.isPending) {
            return;
        }

        const draggedAppointment = appointmentById.get(activeDragId);
        if (!draggedAppointment) {
            setDraggedAppointmentId(null);
            return;
        }

        if (draggedAppointment.status !== 'scheduled') {
            toast.error(t('appointments.toast.onlyScheduledMove'));
            setDraggedAppointmentId(null);
            return;
        }

        const targetDateKey = toLocalDateKey(targetDate);
        if (
            draggedAppointment.appointmentDate === targetDateKey
            && draggedAppointment.startTime === targetStartTime
        ) {
            setDraggedAppointmentId(null);
            return;
        }

        const targetEndTime = resolveAppointmentEndTime(targetStartTime, draggedAppointment.durationMinutes);
        if (!targetEndTime) {
            toast.error(t('appointments.toast.endOfDay'));
            setDraggedAppointmentId(null);
            return;
        }

        const targetStartMinutes = toMinutesFromTime(targetStartTime);
        const targetEndMinutes = toMinutesFromTime(targetEndTime);
        const coveredSlots = appointmentsCoveringByDateAndTime.get(targetDateKey);
        const hasConflict = timeSlots.some((timeSlot) => {
            const slotMinutes = slotMinutesByTime.get(timeSlot) ?? toMinutesFromTime(timeSlot);
            if (slotMinutes < targetStartMinutes || slotMinutes >= targetEndMinutes) {
                return false;
            }

            const slotAppointments = coveredSlots?.get(timeSlot) ?? [];
            return slotAppointments.some(
                (appointment) =>
                    appointment.id !== draggedAppointment.id
                    && !isNonBlockingAppointmentStatus(appointment.status)
            );
        });
        if (hasConflict) {
            toast.error(t('appointments.toast.conflict'));
            setDraggedAppointmentId(null);
            return;
        }

        rescheduleMutation.mutate({
            appointment: draggedAppointment,
            nextDate: targetDateKey,
            nextStartTime: targetStartTime,
            nextEndTime: targetEndTime,
        });
    };

    if (!isClient || appointmentsQuery.isLoading) {
        return <AppointmentsLoadingSkeleton />;
    }

    if (appointmentsQuery.isError) {
        return (
            <div className="space-y-4">
                <p className="text-sm text-red-600">
                    {getApiErrorMessage(appointmentsQuery.error, t('appointments.error.loadFailed'))}
                </p>
                <Button
                    variant="outline"
                    onClick={() => {
                        appointmentsQuery.refetch();
                    }}
                >
                    {t('common.retry')}
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-5 lg:space-y-6">
            <PageHeader
                title={t('appointments.title')}
                description={t('appointments.subtitle')}
                actions={(
                    <Button className="w-full sm:w-auto" onClick={() => openAddDialog({ date: currentDate })}>
                        <Plus aria-hidden="true" className="w-4 h-4 mr-2" />
                        {t('appointments.new')}
                    </Button>
                )}
            />

            <Card className="overflow-hidden rounded-[1.75rem] border-blue-100/80 bg-white/95 shadow-sm shadow-blue-100/50">
                <CardContent className="p-4 sm:p-5">
                    <div className="space-y-4">
                        <div className="flex flex-col gap-3 rounded-2xl border border-blue-100/80 bg-gradient-to-r from-white via-blue-50/30 to-white p-3 shadow-xs md:flex-row md:items-center md:justify-between">
                            <div className="inline-flex w-full items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-100/70 p-1 shadow-xs sm:w-auto">
                                <Button
                                    variant={view === 'week' ? 'default' : 'outline'}
                                    className="flex-1 rounded-lg sm:flex-none"
                                    onClick={() => {
                                        setViewOverride('week');
                                        setExpandedWeekDateKey(null);
                                        replaceAppointmentsUrl({
                                            view: 'week',
                                            date: toLocalDateKey(currentDate),
                                        });
                                    }}
                                >
                                    {t('appointments.weekView')}
                                </Button>
                                <Button
                                    variant={view === 'day' ? 'default' : 'outline'}
                                    className="flex-1 rounded-lg sm:flex-none"
                                    onClick={() => {
                                        setViewOverride('day');
                                        setExpandedWeekDateKey(null);
                                        replaceAppointmentsUrl({
                                            view: 'day',
                                            date: toLocalDateKey(currentDate),
                                        });
                                    }}
                                >
                                    {t('appointments.dayView')}
                                </Button>
                            </div>

                            <div className="flex w-full items-center justify-center gap-2 md:w-auto">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="rounded-xl bg-white/90 shadow-xs"
                                    onClick={() => navigateDate('prev')}
                                    aria-label={view === 'day' ? t('appointments.aria.previousDay') : t('appointments.aria.previousWeek')}
                                >
                                    <ChevronLeft aria-hidden="true" className="w-4 h-4" />
                                </Button>

                                <div className="flex min-h-9 min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3 shadow-xs">
                                    <CalendarIcon aria-hidden="true" className="w-4 h-4 text-gray-500" />
                                    <span className="truncate text-sm font-semibold text-slate-800">
                                        {view === 'day'
                                            ? formatLocalizedDate(currentDate, locale, {
                                                weekday: 'long',
                                                year: 'numeric',
                                                month: 'long',
                                                day: 'numeric',
                                            })
                                            : weekRangeLabel}
                                    </span>
                                </div>

                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="rounded-xl bg-white/90 shadow-xs"
                                    onClick={() => navigateDate('next')}
                                    aria-label={view === 'day' ? t('appointments.aria.nextDay') : t('appointments.aria.nextWeek')}
                                >
                                    <ChevronRight aria-hidden="true" className="w-4 h-4" />
                                </Button>
                            </div>

                            <Button
                                variant="outline"
                                className="w-full rounded-xl bg-white/90 shadow-xs md:w-auto"
                                onClick={() => {
                                    const today = new Date();
                                    setCurrentDateOverride(today);
                                    setExpandedWeekDateKey(null);
                                    replaceAppointmentsUrl({
                                        view,
                                        date: toLocalDateKey(today),
                                    });
                                }}
                            >
                                {t('appointments.today')}
                            </Button>
                        </div>

                        {hasUrlFilters && activeFilterLabel ? (
                            <div className="flex items-center justify-between rounded-2xl border border-blue-100 bg-blue-50/80 px-4 py-3">
                                <p className="text-sm text-blue-800">
                                    {t('appointments.filters.active')}: <span className="font-medium">{activeFilterLabel}</span>
                                </p>
                                <Button variant="outline" size="sm" onClick={clearUrlFilters}>
                                    {t('appointments.filters.clear')}
                                </Button>
                            </div>
                        ) : null}

                        <div className="border-t border-slate-100 pt-4">
            {view === 'day' ? (
                            <div className="space-y-4">
                                <p className="text-lg font-semibold text-slate-900">
                                    {t('appointments.count', { count: filteredAppointmentRows.length })}
                                </p>
                        <div className="space-y-1">
                            {timeSlots.map((time) => {
                                const slotStartAppointments = appointmentsByDateAndTime.get(currentDateKey)?.get(time) ?? [];
                                const slotCoveringAppointments = appointmentsCoveringByDateAndTime.get(currentDateKey)?.get(time) ?? [];
                                const continuationAppointments = slotCoveringAppointments.filter(
                                    (appointment) =>
                                        appointment.startTime !== time
                                        && !isNonBlockingAppointmentStatus(appointment.status)
                                );
                                const hasSlotAppointments = slotStartAppointments.length > 0 || continuationAppointments.length > 0;
                                const hasBlockingSlotAppointments = slotCoveringAppointments.some(
                                    (appointment) => !isNonBlockingAppointmentStatus(appointment.status)
                                );
                                return (
                                    <div
                                        key={time}
                                        className="flex items-start border-b border-gray-100 py-2 hover:bg-gray-50"
                                    >
                                        <div className="w-20 flex-shrink-0">
                                            <span className="text-sm font-medium text-gray-600">
                                                {formatTime(time)}
                                            </span>
                                        </div>
                                        <div
                                            data-testid={`timeslot-dropzone-${time}`}
                                            className="flex-1 space-y-2"
                                            onDragOver={(event) => {
                                                if (!draggedAppointmentId) {
                                                    return;
                                                }
                                                event.preventDefault();
                                                event.dataTransfer.dropEffect = 'move';
                                            }}
                                            onDrop={(event) => {
                                                event.preventDefault();
                                                const dragId = event.dataTransfer.getData('text/plain') || undefined;
                                                moveAppointmentToSlot(currentDate, time, dragId);
                                            }}
                                        >
                                            {hasSlotAppointments ? (
                                                <>
                                                    {continuationAppointments.map((appointment) => (
                                                        <div
                                                            key={`${appointment.id}-${time}`}
                                                            className={`rounded border-l-4 px-3 py-2 ${getAppointmentCardClass(appointment.status)} opacity-75`}
                                                        >
                                                            <p
                                                                className="text-sm font-medium [overflow-wrap:anywhere] break-words"
                                                                title={appointment.patientName}
                                                            >
                                                                {truncateForUi(appointment.patientName, APPOINTMENT_NAME_UI_LIMIT)}
                                                            </p>
                                                            <p className="text-xs text-gray-600">
                                                                {t('appointments.continuesUntil', { time: appointment.endTime })}
                                                            </p>
                                                        </div>
                                                    ))}
                                                    {slotStartAppointments.map((appointment) => (
                                                        <div
                                                            key={appointment.id}
                                                            data-testid={`appointment-card-${appointment.id}`}
                                                            className={`p-3 border-l-4 rounded ${getAppointmentCardClass(appointment.status)} ${
                                                                appointment.status === 'scheduled'
                                                                    ? 'cursor-grab active:cursor-grabbing'
                                                                    : 'cursor-not-allowed opacity-90'
                                                            }`}
                                                            draggable={
                                                                appointment.status === 'scheduled'
                                                                && !rescheduleMutation.isPending
                                                            }
                                                            onDragStart={(event) => {
                                                                if (appointment.status !== 'scheduled') {
                                                                    event.preventDefault();
                                                                    return;
                                                                }

                                                                setDraggedAppointmentId(appointment.id);
                                                                event.dataTransfer.effectAllowed = 'move';
                                                                event.dataTransfer.setData('text/plain', appointment.id);
                                                            }}
                                                            onDragEnd={() => setDraggedAppointmentId(null)}
                                                        >
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div className="min-w-0 flex-1">
                                                                    <p
                                                                        className="font-medium text-sm truncate"
                                                                        title={appointment.patientName}
                                                                    >
                                                                        {truncateForUi(appointment.patientName, APPOINTMENT_NAME_UI_LIMIT)}
                                                                    </p>
                                                                    <p className="text-xs text-gray-600 [overflow-wrap:anywhere] break-words">
                                                                        {truncateForUi(appointment.reason || t('appointments.general'), APPOINTMENT_REASON_UI_LIMIT)}
                                                                    </p>
                                                                    <p className="text-xs text-gray-500 mt-1">
                                                                        {appointment.startTime} - {appointment.endTime} ({t('appointments.minutesShort', { count: appointment.durationMinutes })})
                                                                    </p>
                                                                </div>
                                                                <div className="flex items-center gap-2" onPointerDown={(event) => event.stopPropagation()}>
                                                                    <Badge className={getStatusBadgeColor(appointment.status)}>
                                                                        {t(`status.${appointment.status}`)}
                                                                    </Badge>
                                                                    <Button
                                                                        type="button"
                                                                        size="xs"
                                                                        variant="outline"
                                                                        draggable={false}
                                                                        onClick={() => openEditDialog(appointment)}
                                                                        disabled={
                                                                            rescheduleMutation.isPending
                                                                            || deleteMutation.isPending
                                                                            || appointment.status !== 'scheduled'
                                                                        }
                                                                    >
                                                                        <Pencil className="w-3 h-3" />
                                                                        {t('appointments.edit')}
                                                                    </Button>
                                                                    <Button
                                                                        type="button"
                                                                        size="xs"
                                                                        variant="destructive"
                                                                        draggable={false}
                                                                        onClick={() => openDeleteDialog(appointment)}
                                                                        disabled={deleteMutation.isPending}
                                                                    >
                                                                        <Trash2 className="w-3 h-3" />
                                                                        {t('appointments.delete')}
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {!hasBlockingSlotAppointments ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => openAddDialog({ date: currentDate, startTime: time })}
                                                            className="text-xs text-gray-600 hover:text-blue-700 transition-colors"
                                                        >
                                                            {t('appointments.addSlot')}
                                                        </button>
                                                    ) : null}
                                                </>
                                            ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => openAddDialog({ date: currentDate, startTime: time })}
                                                        className="text-xs text-gray-600 hover:text-blue-700 transition-colors"
                                                    >
                                                        {t('appointments.addSlot')}
                                                    </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                            </div>
            ) : (
                            <div className="space-y-2.5">
                        <div className="hidden lg:grid lg:grid-cols-7 lg:gap-2.5">
                            {weekDateDescriptors.map((descriptor) => renderWeekDayCard(descriptor, { compact: true }))}
                        </div>
                        <div className="hidden lg:flex lg:items-center lg:justify-center lg:gap-6 lg:pt-1.5">
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span className="h-2.5 w-2.5 rounded-full bg-blue-500" aria-hidden="true" />
                                <span>{t('status.scheduled')}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span className="h-2.5 w-2.5 rounded-full bg-green-500" aria-hidden="true" />
                                <span>{t('status.completed')}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span className="h-2.5 w-2.5 rounded-full bg-slate-500" aria-hidden="true" />
                                <span>{t('status.cancelled')}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span className="h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden="true" />
                                <span>{t('status.no_show')}</span>
                            </div>
                        </div>
                        <div className="space-y-3 lg:hidden">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                                {weekDateDescriptors.slice(0, 4).map((descriptor) => renderWeekDayCard(descriptor, { includeTestIds: true }))}
                            </div>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:mx-auto lg:max-w-[calc(((100%-0.75rem*3)/4)*3+0.75rem*2)] lg:grid-cols-3">
                                {weekDateDescriptors.slice(4).map((descriptor) => renderWeekDayCard(descriptor, { includeTestIds: true }))}
                            </div>
                        </div>
                            </div>
            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Dialog
                open={expandedWeekDescriptor !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setExpandedWeekDateKey(null);
                        closeWeekInlineEditor();
                    }
                }}
            >
            <DialogContent className="flex max-h-[86vh] flex-col overflow-hidden sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>
                            {expandedWeekDescriptor
                                ? t('appointments.dayQueueTitle', { date: expandedWeekDescriptor.fullDateLabel })
                                : t('appointments.moreAppointments')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('appointments.dayQueueDescription')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="min-h-0 flex-1 overflow-y-auto pr-1" data-testid="week-day-queue-modal">
                        {expandedWeekAppointments.length === 0 ? (
                            <div className="flex min-h-[12rem] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                                {t('appointments.noAppointments')}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {expandedWeekAppointments.map((appointment) => {
                                    const isExpanded = editingWeekAppointmentId === appointment.id && weekInlineEditFormData !== null;
                                    const inlineAvailableStartTimes = isExpanded
                                        ? getAvailableAppointmentStartTimes(
                                            appointmentRows,
                                            {
                                                appointmentDate: appointment.appointmentDate,
                                                durationMinutes: weekInlineEditFormData.durationMinutes,
                                                status: weekInlineEditFormData.status,
                                                ignoreAppointmentId: appointment.id,
                                                includeStartTime: appointment.startTime,
                                                workingHours,
                                            },
                                            timeSlots
                                        )
                                        : [];
                                    const reasonError = isExpanded && weekInlineEditFormData.reason.trim().length > INPUT_LIMITS.shortText
                                        ? t('appointments.dialog.reasonMax', { max: INPUT_LIMITS.shortText })
                                        : null;
                                    const timeError = isExpanded && !isValidTimeInput(weekInlineEditFormData.startTime)
                                        ? t('appointments.dialog.timeInvalid')
                                        : isExpanded && !inlineAvailableStartTimes.includes(weekInlineEditFormData.startTime)
                                            ? t('appointments.dialog.timeUnavailable')
                                            : null;

                                    return (
                                        <div
                                            key={appointment.id}
                                            className={`rounded-lg border-l-4 px-3 py-2.5 ${getAppointmentCardClass(appointment.status)}`}
                                        >
                                            <div
                                                className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2"
                                                data-testid={`week-modal-appointment-${appointment.id}`}
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-semibold text-slate-900">
                                                        {appointment.startTime} - {appointment.endTime}
                                                    </p>
                                                    <p className="truncate text-sm font-semibold text-slate-900 leading-tight" title={appointment.patientName}>
                                                        {truncateForUi(appointment.patientName, APPOINTMENT_MODAL_NAME_UI_LIMIT)}
                                                    </p>
                                                    <p className="truncate text-[11px] text-slate-600 leading-tight" title={appointment.reason || t('appointments.general')}>
                                                        {truncateForUi(appointment.reason || t('appointments.general'), APPOINTMENT_MODAL_REASON_UI_LIMIT)}
                                                    </p>
                                                </div>
                                                <div className="flex shrink-0 items-start gap-1.5">
                                                    <Badge className={`${getStatusBadgeColor(appointment.status)} shrink-0 text-xs px-2 py-0.5`}>
                                                        {t(`status.${appointment.status}`)}
                                                    </Badge>
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="outline"
                                                        className="h-8 w-8"
                                                        onClick={() => openWeekInlineEditor(appointment)}
                                                        disabled={appointment.status !== 'scheduled'}
                                                        aria-label={t('appointments.edit')}
                                                        title={t('appointments.edit')}
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="destructive"
                                                        className="h-8 w-8"
                                                        onClick={() => openDeleteDialog(appointment)}
                                                        disabled={deleteMutation.isPending}
                                                        aria-label={t('appointments.delete')}
                                                        title={t('appointments.delete')}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </div>
                                            {isExpanded ? (
                                                <div className="mt-3 border-t border-slate-200 pt-3">
                                                    <div className="grid gap-3 md:grid-cols-3">
                                                        <div className="space-y-2">
                                                            <Label htmlFor={`week-edit-time-${appointment.id}`}>{t('appointments.dialog.time')}</Label>
                                                            <AppointmentTimePicker
                                                                id={`week-edit-time-${appointment.id}`}
                                                                value={weekInlineEditFormData.startTime}
                                                                onValueChange={(value) => {
                                                                    setWeekInlineEditFormData((current) => current
                                                                        ? { ...current, startTime: value }
                                                                        : current);
                                                                }}
                                                                disabled={inlineAvailableStartTimes.length === 0}
                                                                options={inlineAvailableStartTimes}
                                                                placeholder={t('appointments.dialog.time')}
                                                                emptyLabel={t('appointments.dialog.noAvailableSlots')}
                                                                ariaInvalid={Boolean(timeError)}
                                                            />
                                                            {timeError ? (
                                                                <p className="text-xs text-red-600">{timeError}</p>
                                                            ) : null}
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label htmlFor={`week-edit-duration-${appointment.id}`}>{t('appointments.dialog.duration')}</Label>
                                                            <Select
                                                                value={String(weekInlineEditFormData.durationMinutes)}
                                                                onValueChange={(value) => {
                                                                    setWeekInlineEditFormData((current) => current
                                                                        ? (() => {
                                                                            const nextDuration = Number(value);
                                                                            const nextAvailableStartTimes = getAvailableAppointmentStartTimes(
                                                                                appointmentRows,
                                                                                {
                                                                                    appointmentDate: appointment.appointmentDate,
                                                                                    durationMinutes: nextDuration,
                                                                                    status: current.status,
                                                                                    ignoreAppointmentId: appointment.id,
                                                                                    includeStartTime: appointment.startTime,
                                                                                    workingHours,
                                                                                },
                                                                                timeSlots
                                                                            );

                                                                            return {
                                                                                ...current,
                                                                                durationMinutes: nextDuration,
                                                                                startTime: nextAvailableStartTimes.includes(current.startTime)
                                                                                    ? current.startTime
                                                                                    : nextAvailableStartTimes[0] ?? current.startTime,
                                                                            };
                                                                        })()
                                                                        : current);
                                                                }}
                                                            >
                                                                <SelectTrigger id={`week-edit-duration-${appointment.id}`} className="w-full">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="15">{t('appointments.dialog.duration.15')}</SelectItem>
                                                                    <SelectItem value="30">{t('appointments.dialog.duration.30')}</SelectItem>
                                                                    <SelectItem value="45">{t('appointments.dialog.duration.45')}</SelectItem>
                                                                    <SelectItem value="60">{t('appointments.dialog.duration.60')}</SelectItem>
                                                                    <SelectItem value="90">{t('appointments.dialog.duration.90')}</SelectItem>
                                                                    <SelectItem value="120">{t('appointments.dialog.duration.120')}</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label htmlFor={`week-edit-status-${appointment.id}`}>{t('appointments.dialog.status')}</Label>
                                                            <Select
                                                                value={weekInlineEditFormData.status}
                                                                onValueChange={(value) => {
                                                                    setWeekInlineEditFormData((current) => current
                                                                        ? (() => {
                                                                            const nextStatus = value as AppointmentStatus;
                                                                            const nextAvailableStartTimes = getAvailableAppointmentStartTimes(
                                                                                appointmentRows,
                                                                                {
                                                                                    appointmentDate: appointment.appointmentDate,
                                                                                    durationMinutes: current.durationMinutes,
                                                                                    status: nextStatus,
                                                                                    ignoreAppointmentId: appointment.id,
                                                                                    includeStartTime: appointment.startTime,
                                                                                    workingHours,
                                                                                },
                                                                                timeSlots
                                                                            );

                                                                            return {
                                                                                ...current,
                                                                                status: nextStatus,
                                                                                startTime: nextAvailableStartTimes.includes(current.startTime)
                                                                                    ? current.startTime
                                                                                    : nextAvailableStartTimes[0] ?? current.startTime,
                                                                            };
                                                                        })()
                                                                        : current);
                                                                }}
                                                            >
                                                                <SelectTrigger id={`week-edit-status-${appointment.id}`} className="w-full">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="scheduled">{t('status.scheduled')}</SelectItem>
                                                                    <SelectItem value="completed">{t('status.completed')}</SelectItem>
                                                                    <SelectItem value="cancelled">{t('status.cancelled')}</SelectItem>
                                                                    <SelectItem value="no_show">{t('status.no_show')}</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    </div>
                                                    <div className="mt-3 space-y-2">
                                                        <Label htmlFor={`week-edit-reason-${appointment.id}`}>{t('appointments.dialog.reason')}</Label>
                                                        <Input
                                                            id={`week-edit-reason-${appointment.id}`}
                                                            value={weekInlineEditFormData.reason}
                                                            onChange={(event) => {
                                                                setWeekInlineEditFormData((current) => current
                                                                    ? { ...current, reason: event.target.value }
                                                                    : current);
                                                            }}
                                                            placeholder={t('appointments.dialog.reasonPlaceholder')}
                                                            aria-invalid={Boolean(reasonError)}
                                                        />
                                                        {reasonError ? (
                                                            <p className="text-xs text-red-600">{reasonError}</p>
                                                        ) : null}
                                                    </div>
                                                    <div className="mt-4 flex flex-wrap justify-end gap-2">
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={closeWeekInlineEditor}
                                                        >
                                                            {t('common.cancel')}
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            onClick={() => {
                                                                if (!weekInlineEditFormData || reasonError) {
                                                                    return;
                                                                }

                                                                if (timeError) {
                                                                    return;
                                                                }

                                                                weekInlineEditMutation.mutate({
                                                                    appointment,
                                                                    formData: weekInlineEditFormData,
                                                                });
                                                            }}
                                                            disabled={weekInlineEditMutation.isPending || Boolean(reasonError) || Boolean(timeError)}
                                                        >
                                                            {weekInlineEditMutation.isPending ? t('common.saving') : t('common.saveChanges')}
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : null}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    <DialogFooter className="border-t border-slate-200 pt-3 sm:justify-end">
                        <Button
                            type="button"
                            className="h-9 w-full px-4 sm:w-auto sm:min-w-[10rem]"
                            disabled={!expandedWeekDescriptor}
                            onClick={() => {
                                if (expandedWeekDescriptor) {
                                    setExpandedWeekDateKey(null);
                                    openAddDialog({ date: expandedWeekDescriptor.date });
                                }
                            }}
                        >
                            <Plus className="mr-2 h-4 w-4" />
                            {t('appointments.new')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AddAppointmentDialog
                key={`add-appointment-${dialogVersion}-${urlPrefillPatientId ?? 'none'}`}
                open={isDialogOpen}
                onOpenChange={handleDialogOpenChange}
                prefillDate={prefillDate}
                prefillStartTime={prefillStartTime}
                prefillPatientId={urlPrefillPatientId}
                workingHours={workingHours}
            />
            <AddAppointmentDialog
                key={`edit-appointment-${editDialogVersion}`}
                open={isEditDialogOpen}
                onOpenChange={handleEditDialogOpenChange}
                editingAppointment={
                    editingAppointment
                        ? {
                            id: editingAppointment.id,
                            patientId: editingAppointment.patientId,
                            patientName: editingAppointment.patientName,
                            appointmentDate: editingAppointment.appointmentDate,
                            startTime: editingAppointment.startTime,
                            durationMinutes: editingAppointment.durationMinutes,
                            status: editingAppointment.status,
                            reason: editingAppointment.reason,
                        }
                        : undefined
                }
                workingHours={workingHours}
            />
            <ConfirmActionDialog
                open={isDeleteDialogOpen}
                onOpenChange={handleDeleteDialogOpenChange}
                title={t('appointments.deleteTitle')}
                description={
                    appointmentToDelete
                        ? t('appointments.deleteDescription', {
                            patientName: appointmentToDelete.patientName,
                            date: appointmentToDelete.appointmentDate,
                            time: appointmentToDelete.startTime,
                        })
                        : t('appointments.deleteDescriptionFallback')
                }
                disabled={!appointmentToDelete}
                isPending={deleteMutation.isPending}
                confirmLabel={t('appointments.confirmDelete')}
                pendingLabel={t('appointments.deleting')}
                onConfirm={() => {
                    if (!appointmentToDelete) {
                        return;
                    }

                    deleteMutation.mutate(appointmentToDelete.id);
                }}
            />
        </div>
    );
}
