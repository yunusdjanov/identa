import { isValidTimeInput } from '@/lib/utils';

export interface AppointmentWorkingHours {
    start?: string | null;
    end?: string | null;
}

export interface NormalizedAppointmentWorkingHours {
    start: string;
    end: string;
}

export const DEFAULT_APPOINTMENT_WORKING_HOURS: NormalizedAppointmentWorkingHours = {
    start: '09:00',
    end: '18:00',
};

export const APPOINTMENT_SLOT_STEP_MINUTES = 30;

export function toMinutesFromTime(timeInput: string): number {
    const [hours, minutes] = timeInput.split(':').map(Number);
    return hours * 60 + minutes;
}

export function resolveAppointmentEndTime(startTime: string, durationMinutes: number): string | null {
    if (!isValidTimeInput(startTime) || durationMinutes <= 0) {
        return null;
    }

    const total = toMinutesFromTime(startTime) + durationMinutes;
    if (total >= 24 * 60) {
        return null;
    }

    const endHour = Math.floor(total / 60);
    const endMinute = total % 60;

    return `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
}

export function normalizeAppointmentWorkingHours(
    workingHours?: AppointmentWorkingHours | null
): NormalizedAppointmentWorkingHours {
    const start = workingHours?.start && isValidTimeInput(workingHours.start)
        ? workingHours.start
        : DEFAULT_APPOINTMENT_WORKING_HOURS.start;
    const end = workingHours?.end && isValidTimeInput(workingHours.end)
        ? workingHours.end
        : DEFAULT_APPOINTMENT_WORKING_HOURS.end;

    if (toMinutesFromTime(end) <= toMinutesFromTime(start)) {
        return DEFAULT_APPOINTMENT_WORKING_HOURS;
    }

    return { start, end };
}

export function isAppointmentWithinWorkingHours(
    startTime: string,
    endTime: string,
    workingHours: NormalizedAppointmentWorkingHours
): boolean {
    return toMinutesFromTime(startTime) >= toMinutesFromTime(workingHours.start)
        && toMinutesFromTime(endTime) <= toMinutesFromTime(workingHours.end);
}

export function createAppointmentStartSlots(
    workingHours: NormalizedAppointmentWorkingHours,
    options?: {
        extraSlots?: string[];
        stepMinutes?: number;
    }
): string[] {
    const stepMinutes = options?.stepMinutes ?? APPOINTMENT_SLOT_STEP_MINUTES;
    const startMinutes = toMinutesFromTime(workingHours.start);
    const endMinutes = toMinutesFromTime(workingHours.end);
    const slots = new Set<string>();

    for (let total = startMinutes; total < endMinutes; total += stepMinutes) {
        const hour = Math.floor(total / 60);
        const minute = total % 60;
        slots.add(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
    }

    for (const extraSlot of options?.extraSlots ?? []) {
        if (isValidTimeInput(extraSlot)) {
            slots.add(extraSlot);
        }
    }

    return [...slots].sort((a, b) => toMinutesFromTime(a) - toMinutesFromTime(b));
}

export function createAppointmentCoveredSlots(
    startTime: string,
    endTime: string,
    stepMinutes = APPOINTMENT_SLOT_STEP_MINUTES
): string[] {
    if (!isValidTimeInput(startTime) || !isValidTimeInput(endTime)) {
        return [];
    }

    const startMinutes = toMinutesFromTime(startTime);
    const endMinutes = toMinutesFromTime(endTime);
    if (endMinutes <= startMinutes) {
        return [];
    }

    const slots: string[] = [];
    for (let total = startMinutes; total < endMinutes; total += stepMinutes) {
        const hour = Math.floor(total / 60);
        const minute = total % 60;
        slots.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
    }

    return slots;
}
