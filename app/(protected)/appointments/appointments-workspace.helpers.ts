import {
    isAppointmentWithinWorkingHours,
    resolveAppointmentEndTime,
    type NormalizedAppointmentWorkingHours,
} from '@/lib/appointments/time-slots';
import type { ApiRecordActor } from '@/lib/api/types';

export const noopSubscribe = () => () => undefined;
export const APPOINTMENT_NAME_UI_LIMIT = 25;
export const APPOINTMENT_COMPACT_NAME_UI_LIMIT = 14;
export const APPOINTMENT_REASON_UI_LIMIT = 40;
export const APPOINTMENT_MODAL_NAME_UI_LIMIT = 40;
export const APPOINTMENT_MODAL_REASON_UI_LIMIT = 56;
export const WEEK_VIEW_MIN_VISIBLE_APPOINTMENTS = 8;
const WEEK_VIEW_MAX_VISIBLE_APPOINTMENTS = 9;
export const WEEK_VIEW_STACKED_VISIBLE_APPOINTMENTS = 7;
export const WEEK_VIEW_COMPACT_CARD_HEIGHT_CLASSES: Record<number, string> = {
    8: 'h-[20rem]',
    9: 'h-[21.5rem]',
};
export const WEEK_VIEW_COMPACT_LIST_HEIGHT_CLASSES: Record<number, string> = {
    8: 'h-[15rem]',
    9: 'h-[16.5rem]',
};
export const WEEK_VIEW_STACKED_CARD_HEIGHT_CLASS = 'h-[23.5rem]';
export const WEEK_VIEW_STACKED_LIST_HEIGHT_CLASS = 'h-[16.5rem]';

const APPOINTMENT_STATUS_VALUES = ['scheduled', 'completed', 'cancelled', 'no_show'] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUS_VALUES)[number];
export type AppointmentsWorkspaceMode = 'appointments' | 'dashboard';

export interface AppointmentRow {
    id: string;
    patientId: string | null;
    patientName: string;
    guestName?: string | null;
    guestPhone?: string | null;
    isGuest: boolean;
    appointmentDate: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    status: AppointmentStatus;
    reason?: string;
    createdBy?: ApiRecordActor | null;
    updatedBy?: ApiRecordActor | null;
}

export interface WeekInlineEditFormData {
    startTime: string;
    durationMinutes: number;
    status: AppointmentStatus;
    reason: string;
}

export function subscribeViewportChanges(onStoreChange: () => void): () => void {
    if (typeof window === 'undefined') {
        return () => undefined;
    }

    window.addEventListener('resize', onStoreChange);
    window.addEventListener('orientationchange', onStoreChange);

    return () => {
        window.removeEventListener('resize', onStoreChange);
        window.removeEventListener('orientationchange', onStoreChange);
    };
}

export function getWeekViewCompactVisibleAppointments(): number {
    if (typeof window === 'undefined' || window.innerWidth < 1024) {
        return WEEK_VIEW_MIN_VISIBLE_APPOINTMENTS;
    }

    if (window.innerHeight >= 900) {
        return WEEK_VIEW_MAX_VISIBLE_APPOINTMENTS;
    }

    return WEEK_VIEW_MIN_VISIBLE_APPOINTMENTS;
}

export function parseStatusFilter(raw: string): AppointmentStatus[] {
    if (!raw) {
        return [];
    }

    const allowedStatuses = new Set<AppointmentStatus>(APPOINTMENT_STATUS_VALUES);
    return raw
        .split(',')
        .map((value) => value.trim())
        .filter((value): value is AppointmentStatus => allowedStatuses.has(value as AppointmentStatus));
}

export function getDurationMinutes(startTime: string, endTime: string): number {
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);

    return Math.max(0, endHour * 60 + endMinute - (startHour * 60 + startMinute));
}

export function extractReason(notes: string | null): string {
    if (!notes) {
        return '';
    }

    const parts = notes.split('|').map((part) => part.trim()).filter(Boolean);
    return parts[0] ?? '';
}

export function getWeekStart(date: Date): Date {
    const weekStart = new Date(date);
    const normalizedDay = (weekStart.getDay() + 6) % 7;
    weekStart.setDate(weekStart.getDate() - normalizedDay);
    weekStart.setHours(0, 0, 0, 0);
    return weekStart;
}

export function getAppointmentCardClass(status: AppointmentRow['status']): string {
    switch (status) {
        case 'scheduled':
            return 'border-slate-200 bg-white border-l-blue-500';
        case 'completed':
            return 'border-slate-200 bg-white border-l-teal-400';
        case 'cancelled':
            return 'border-slate-200 bg-white border-l-slate-700';
        case 'no_show':
            return 'border-slate-200 bg-white border-l-rose-400';
        default:
            return 'border-slate-200 bg-white border-l-blue-500';
    }
}

export function getAppointmentBorderClass(status: AppointmentRow['status']): string {
    switch (status) {
        case 'scheduled':
            return 'border-l-blue-500';
        case 'completed':
            return 'border-l-teal-400';
        case 'cancelled':
            return 'border-l-slate-700';
        case 'no_show':
            return 'border-l-rose-400';
        default:
            return 'border-l-blue-500';
    }
}

export function getAppointmentStatusBadgeClass(status: AppointmentRow['status']): string {
    switch (status) {
        case 'scheduled':
            return 'bg-blue-50 text-blue-700 ring-1 ring-blue-100';
        case 'completed':
            return 'bg-teal-50 text-teal-700 ring-1 ring-teal-100';
        case 'cancelled':
            return 'bg-slate-200 text-slate-800 ring-1 ring-slate-300';
        case 'no_show':
            return 'bg-rose-50 text-rose-700 ring-1 ring-rose-100';
        default:
            return 'bg-blue-50 text-blue-700 ring-1 ring-blue-100';
    }
}

export function isNonBlockingAppointmentStatus(status: AppointmentRow['status']): boolean {
    return status === 'cancelled' || status === 'no_show';
}

export function getSlotOrderPriority(status: AppointmentRow['status']): number {
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

export function getAppointmentIdentityPayload(appointment: AppointmentRow): {
    patient_id: string | null;
    guest_name?: string;
    guest_phone?: string;
} {
    if (appointment.patientId) {
        return { patient_id: appointment.patientId };
    }

    return {
        patient_id: null,
        guest_name: appointment.guestName ?? appointment.patientName,
        guest_phone: appointment.guestPhone ?? '',
    };
}

export function hasAppointmentRowConflict(
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

export function getAvailableAppointmentStartTimes(
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
