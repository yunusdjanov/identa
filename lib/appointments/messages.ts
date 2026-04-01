import { getApiErrorMessage } from '@/lib/api/client';

export const APPOINTMENT_CONFLICT_MESSAGE = 'Appointment time conflicts with an existing appointment.';
export const APPOINTMENT_PAST_SLOT_MESSAGE = 'Cannot schedule or move an appointment into a past time slot.';

const LEGACY_CONFLICT_MESSAGES = new Set([
    APPOINTMENT_CONFLICT_MESSAGE,
    'Target time range is occupied. Drop onto an empty range.',
]);

const LEGACY_PAST_SLOT_MESSAGES = new Set([
    APPOINTMENT_PAST_SLOT_MESSAGE,
    'Cannot move an appointment into a past time slot.',
    'Appointment start time cannot be in the past.',
]);

export function normalizeAppointmentConflictMessage(message: string): string {
    if (LEGACY_CONFLICT_MESSAGES.has(message)) {
        return APPOINTMENT_CONFLICT_MESSAGE;
    }

    if (LEGACY_PAST_SLOT_MESSAGES.has(message)) {
        return APPOINTMENT_PAST_SLOT_MESSAGE;
    }

    return message;
}

export function getAppointmentApiErrorMessage(error: unknown, fallback: string): string {
    const apiMessage = getApiErrorMessage(error, fallback);
    return normalizeAppointmentConflictMessage(apiMessage);
}
