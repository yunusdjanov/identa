import { NextResponse } from 'next/server';
import { APPOINTMENTS, PATIENTS } from '../../../_mock-data';
import { requirePermission } from '../../../_auth';

const PHONE_RX = /^\+\d{9,15}$/;

type MockAppointment = Record<string, unknown> & {
    id: string;
    patient_id?: string | null;
    patient_name?: string | null;
};

function validatePatientPayload(body: Record<string, unknown>): Record<string, string[]> | null {
    const errors: Record<string, string[]> = {};

    if (typeof body.full_name !== 'string' || body.full_name.trim().length < 3) {
        errors.full_name = ['Full name must be at least 3 characters.'];
    }
    if (typeof body.phone !== 'string' || !PHONE_RX.test(body.phone)) {
        errors.phone = ['Phone must be in E.164 format (+998901234567).'];
    }
    if (body.secondary_phone !== undefined && body.secondary_phone !== null && body.secondary_phone !== '') {
        if (typeof body.secondary_phone !== 'string' || !PHONE_RX.test(body.secondary_phone)) {
            errors.secondary_phone = ['Secondary phone must be in E.164 format.'];
        }
    }

    return Object.keys(errors).length > 0 ? errors : null;
}

function validationFailure(errors: Record<string, string[]>): NextResponse {
    return NextResponse.json({ message: 'Validation failed.', errors }, { status: 422 });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const appointmentDenied = await requirePermission('appointments.manage');
    if (appointmentDenied) return appointmentDenied;
    const patientDenied = await requirePermission('patients.manage');
    if (patientDenied) return patientDenied;

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const validationErrors = validatePatientPayload(body);
    if (validationErrors) {
        return validationFailure(validationErrors);
    }

    const appointments = APPOINTMENTS as MockAppointment[];
    const appointmentIndex = appointments.findIndex((appointment) => appointment.id === id);
    const appointment = appointmentIndex >= 0 ? appointments[appointmentIndex] : undefined;
    if (!appointment) {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }
    if (appointment.patient_id) {
        return validationFailure({ appointment: ['This appointment is already linked to a patient.'] });
    }

    const fullName = String(body.full_name);
    const phone = String(body.phone);
    const patient: Record<string, unknown> & {
        id: string;
        patient_id: string;
        full_name: string;
        phone: string;
    } = {
        ...body,
        id: `pat-${Date.now()}`,
        patient_id: `P-${String(PATIENTS.length + 1).padStart(3, '0')}`,
        full_name: fullName,
        phone,
        is_archived: false,
        archived_at: null,
        categories: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_visit_at: null,
    };
    (PATIENTS as Array<Record<string, unknown>>).push(patient);

    const linkedAppointment = {
        ...appointment,
        patient_id: patient.id,
        patient_name: patient.full_name,
        guest_name: null,
        guest_phone: null,
        is_guest: false,
    };
    appointments[appointmentIndex] = linkedAppointment;

    return NextResponse.json({
        data: {
            appointment: linkedAppointment,
            patient,
        },
    }, { status: 201 });
}
