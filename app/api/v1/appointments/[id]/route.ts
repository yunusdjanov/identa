import { NextResponse } from 'next/server';
import { requireAuth } from '../../_auth';
import { validateAppointmentPayload, validationFailure } from '../_validation';
import { APPOINTMENTS } from '../../_mock-data';

const IMMUTABLE_STATUSES = new Set(['completed', 'cancelled', 'no_show']);

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const existing = APPOINTMENTS.find((a) => a.id === id) ?? APPOINTMENTS[0];
    // Mirror AppointmentService::update's IMMUTABLE_STATUSES guard
    // (FA-X3 J4) — backend 422s when editing a finalised appointment.
    if (existing && IMMUTABLE_STATUSES.has(existing.status)) {
        return NextResponse.json(
            {
                message: 'Validation failed.',
                errors: { status: ['Finalised appointments cannot be edited.'] },
            },
            { status: 422 }
        );
    }

    const validationErrors = validateAppointmentPayload(body, { isCreate: false });
    if (validationErrors) {
        return validationFailure(validationErrors);
    }
    const apt = { ...existing, ...body };
    return NextResponse.json({ data: apt });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    await params;
    return NextResponse.json({ message: 'Deleted.' });
}
