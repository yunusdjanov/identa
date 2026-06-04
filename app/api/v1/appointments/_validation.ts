import { NextResponse } from 'next/server';

const VALID_STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'] as const;
const TIME_RX = /^\d{2}:\d{2}$/;
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

// Mirrors StoreAppointmentRequest/UpdateAppointmentRequest::rules() so
// the mock rejects payloads the backend would 422 on. Returns the
// Laravel `{ message, errors: { field: [] } }` envelope so the same
// `getApiErrorMessage` parsing path works. Extracted into a helper
// module (rather than living next to the route handlers) because
// Next.js route files MUST only export HTTP method handlers — exporting
// extra symbols breaks the typed route generator. FA-X3 J3/J4.
export function validateAppointmentPayload(
    body: Record<string, unknown>,
    { isCreate }: { isCreate: boolean }
): Record<string, string[]> | null {
    const errors: Record<string, string[]> = {};

    if (typeof body.patient_id !== 'string' || body.patient_id.trim() === '') {
        errors.patient_id = ['Patient is required.'];
    }
    if (typeof body.appointment_date !== 'string' || !DATE_RX.test(body.appointment_date)) {
        errors.appointment_date = ['Date must be YYYY-MM-DD.'];
    } else if (isCreate) {
        // Backend StoreAppointmentRequest uses `after_or_equal:today`.
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const requested = new Date(`${body.appointment_date}T00:00:00`);
        if (requested.getTime() < today.getTime()) {
            errors.appointment_date = ['Appointment cannot be in the past.'];
        }
    }
    if (typeof body.start_time !== 'string' || !TIME_RX.test(body.start_time)) {
        errors.start_time = ['Start time must be HH:MM.'];
    }
    if (typeof body.end_time !== 'string' || !TIME_RX.test(body.end_time)) {
        errors.end_time = ['End time must be HH:MM.'];
    } else if (typeof body.start_time === 'string' && body.end_time <= body.start_time) {
        errors.end_time = ['End time must be after start time.'];
    }
    if (body.status !== undefined && body.status !== null) {
        if (typeof body.status !== 'string' || !(VALID_STATUSES as readonly string[]).includes(body.status)) {
            errors.status = ['Status must be one of: scheduled, completed, cancelled, no_show.'];
        } else if (isCreate && body.status !== 'scheduled') {
            // Backend restricts status to `scheduled` on create.
            errors.status = ['New appointments must start as scheduled.'];
        }
    }
    if (body.reason !== undefined && body.reason !== null) {
        if (typeof body.reason !== 'string' || body.reason.length > 255) {
            errors.reason = ['Reason must be 0-255 characters.'];
        }
    }

    return Object.keys(errors).length > 0 ? errors : null;
}

export function validationFailure(errors: Record<string, string[]>): NextResponse {
    return NextResponse.json(
        { message: 'Validation failed.', errors },
        { status: 422 }
    );
}
