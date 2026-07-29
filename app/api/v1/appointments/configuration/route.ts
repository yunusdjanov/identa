import { NextResponse } from 'next/server';
import { requirePermission } from '../../_auth';
import { PROFILE } from '../../_mock-data';

export async function GET() {
    const denied = await requirePermission('appointments.view');
    if (denied) return denied;

    return NextResponse.json({
        data: {
            working_hours: PROFILE.working_hours,
            default_appointment_duration: PROFILE.default_appointment_duration,
        },
    });
}
