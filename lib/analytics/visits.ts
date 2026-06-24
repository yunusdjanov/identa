import type { ApiAppointment, ApiTreatment } from '@/lib/api/types';
import { toLocalDateKey } from '@/lib/utils';
import { withinLocalBounds } from '@/lib/analytics/date-bounds';

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function dateKey(value: string | null | undefined): string | null {
    if (!value) {
        return null;
    }

    if (DATE_KEY_RE.test(value)) {
        return value;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return toLocalDateKey(parsed);
}

function appointmentVisitKey(appointment: ApiAppointment): string | null {
    if (appointment.status !== 'completed') {
        return null;
    }

    const day = dateKey(appointment.appointment_date);
    if (!day) {
        return null;
    }

    const identity = appointment.patient_id
        ? `patient:${appointment.patient_id}`
        : `guest-appointment:${appointment.id}`;

    return `${identity}:${day}`;
}

function treatmentVisitKey(treatment: ApiTreatment): string | null {
    if (!treatment.patient_id) {
        return null;
    }

    const day = dateKey(treatment.treatment_date);
    if (!day) {
        return null;
    }

    return `patient:${treatment.patient_id}:${day}`;
}

/**
 * Counts unique clinic visits for analytics. A completed appointment and a
 * treatment/history entry for the same patient on the same calendar day are
 * one visit, not two. Guest appointments cannot be matched to future patient
 * IDs yet, so each completed guest appointment is counted by appointment ID.
 */
export function countUniqueVisits(
    appointments: readonly ApiAppointment[],
    treatments: readonly ApiTreatment[],
    start: Date,
    end: Date
): number {
    const visitKeys = new Set<string>();

    for (const appointment of appointments) {
        if (!withinLocalBounds(appointment.appointment_date, start, end)) {
            continue;
        }

        const key = appointmentVisitKey(appointment);
        if (key) {
            visitKeys.add(key);
        }
    }

    for (const treatment of treatments) {
        if (!withinLocalBounds(treatment.treatment_date, start, end)) {
            continue;
        }

        const key = treatmentVisitKey(treatment);
        if (key) {
            visitKeys.add(key);
        }
    }

    return visitKeys.size;
}
