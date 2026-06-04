import { NextResponse } from 'next/server';
import { findDentist, pushAuditEntry } from '@/lib/mock/admin-store';
import { requireAdmin } from '../../../../_auth';

// Local mock: acknowledge an admin-initiated dentist password reset.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if (auth) return auth;

    const { id } = await params;
    const dentist = findDentist(id);
    if (!dentist) {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const newPassword = typeof body?.new_password === 'string' ? body.new_password : '';
    const confirmation = typeof body?.new_password_confirmation === 'string' ? body.new_password_confirmation : '';

    // Mirror the Laravel FormRequest contract: at least 8 chars, confirmed.
    if (newPassword.length < 8) {
        return NextResponse.json({
            message: 'Validation failed.',
            errors: { new_password: ['The new password must be at least 8 characters.'] },
        }, { status: 422 });
    }
    if (newPassword !== confirmation) {
        return NextResponse.json({
            message: 'Validation failed.',
            errors: { new_password_confirmation: ['The password confirmation does not match.'] },
        }, { status: 422 });
    }

    // Backend writes this event without metadata — the entity id is the
    // dentist, the actor is the admin, the password itself is never
    // logged. Drop the `{ email }` payload to match.
    pushAuditEntry({
        eventType: 'admin.dentist.password_reset',
        entityType: 'user',
        entityId: dentist.id,
    });

    return NextResponse.json({ data: { dentist_id: id, password_reset: true } });
}
