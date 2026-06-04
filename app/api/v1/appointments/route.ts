import { NextResponse } from 'next/server';
import { list, requirePermission } from '../_auth';
import { APPOINTMENTS } from '../_mock-data';
import { validateAppointmentPayload, validationFailure } from './_validation';

export async function GET() {
    // Backend gates `/appointments` GET with `appointments.view` (see
    // routes/api.php line 246). Mock used to accept any authed session, so
    // an assistant without appointments.view saw the full list in dev that
    // production would 403. Match the real gate.
    const denied = await requirePermission('appointments.view');
    if (denied) return denied;
    return list(APPOINTMENTS, APPOINTMENTS.length);
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
    const apt = { id: `apt-${Date.now()}`, status: 'scheduled', notes: null, ...body };
    return NextResponse.json({ data: apt }, { status: 201 });
}
