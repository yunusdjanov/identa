import { NextResponse } from 'next/server';
import { list, requirePermission } from '../_auth';
import { APPOINTMENTS } from '../_mock-data';
import { validateAppointmentPayload, validationFailure } from './_validation';

type MockAppointment = Record<string, unknown> & {
    id: string;
    appointment_date: string;
    start_time: string;
    end_time: string;
    status: string;
};

function appointmentsStore(): MockAppointment[] {
    return APPOINTMENTS as MockAppointment[];
}

function optionalString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function filterAppointmentsForRequest(request: Request): MockAppointment[] {
    const url = new URL(request.url);
    const dateFrom = url.searchParams.get('filter[date_from]') ?? url.searchParams.get('date_from');
    const dateTo = url.searchParams.get('filter[date_to]') ?? url.searchParams.get('date_to');
    const appointments = appointmentsStore();

    return appointments.filter((appointment) => {
        if (dateFrom && appointment.appointment_date < dateFrom) {
            return false;
        }
        if (dateTo && appointment.appointment_date > dateTo) {
            return false;
        }

        return true;
    });
}

export async function GET(request: Request) {
    // Backend gates `/appointments` GET with `appointments.view` (see
    // routes/api.php line 246). Mock used to accept any authed session, so
    // an assistant without appointments.view saw the full list in dev that
    // production would 403. Match the real gate.
    const denied = await requirePermission('appointments.view');
    if (denied) return denied;
    const appointments = filterAppointmentsForRequest(request);

    return list(appointments, appointments.length);
}

export async function POST(request: Request) {
    // POST gated by `appointments.manage` on the backend.
    const denied = await requirePermission('appointments.manage');
    if (denied) return denied;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const validationErrors = validateAppointmentPayload(body, { isCreate: true });
    if (validationErrors) {
        return validationFailure(validationErrors);
    }
    const patientId = optionalString(body.patient_id);
    const guestName = optionalString(body.guest_name);
    const apt: MockAppointment = {
        id: `apt-${Date.now()}`,
        notes: null,
        ...body,
        appointment_date: String(body.appointment_date ?? ''),
        start_time: String(body.start_time ?? ''),
        end_time: String(body.end_time ?? ''),
        status: optionalString(body.status) ?? 'scheduled',
        patient_id: patientId,
        patient_name: patientId ? optionalString(body.patient_name) : guestName,
        guest_name: patientId ? null : guestName,
        guest_phone: patientId ? null : optionalString(body.guest_phone),
        is_guest: !patientId,
    };
    appointmentsStore().push(apt);

    return NextResponse.json({ data: apt }, { status: 201 });
}
