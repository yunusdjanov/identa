import { NextResponse } from 'next/server';
import { requireAuth } from '../../_auth';
import { validateAppointmentPayload, validationFailure } from '../_validation';
import { APPOINTMENTS } from '../../_mock-data';

const IMMUTABLE_STATUSES = new Set(['completed', 'cancelled', 'no_show']);
type MockAppointment = Record<string, unknown> & { id: string; status: string; patient_name?: string | null };

function appointmentsStore(): MockAppointment[] {
    return APPOINTMENTS as MockAppointment[];
}

function optionalString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const store = appointmentsStore();
    const existingIndex = store.findIndex((appointment) => appointment.id === id);
    const existing = existingIndex >= 0 ? store[existingIndex] : undefined;
    // Mirror AppointmentService::update's IMMUTABLE_STATUSES guard
    // (FA-X3 J4) - backend 422s when editing a finalised appointment.
    if (existing && IMMUTABLE_STATUSES.has(existing.status)) {
        return NextResponse.json(
            {
                message: 'Validation failed.',
                errors: { status: ['Finalised appointments cannot be edited.'] },
            },
            { status: 422 }
        );
    }
    if (!existing) {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }

    const validationErrors = validateAppointmentPayload(body, { isCreate: false });
    if (validationErrors) {
        return validationFailure(validationErrors);
    }
    const patientId = optionalString(body.patient_id);
    const guestName = optionalString(body.guest_name);
    const apt: MockAppointment = {
        ...existing,
        ...body,
        id: existing.id,
        status: optionalString(body.status) ?? existing.status,
        patient_id: patientId,
        patient_name: patientId ? existing.patient_name ?? null : guestName,
        guest_name: patientId ? null : guestName,
        guest_phone: patientId ? null : optionalString(body.guest_phone),
        is_guest: !patientId,
    };
    store[existingIndex] = apt;

    return NextResponse.json({ data: apt });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    const { id } = await params;
    const store = appointmentsStore();
    const existingIndex = store.findIndex((appointment) => appointment.id === id);
    if (existingIndex >= 0) {
        store.splice(existingIndex, 1);
    }

    return NextResponse.json({ message: 'Deleted.' });
}
