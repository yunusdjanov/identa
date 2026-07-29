import { NextResponse } from 'next/server';
import { requireDentist } from '../../../../_auth';
import { getAdminStore, pushAuditEntry } from '@/lib/mock/admin-store';

const MOCK_DENTIST_ID = '1';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireDentist();
    if (auth) return auth;

    const { id } = await params;
    const store = getAdminStore();
    const staff = store.staffByDentist[MOCK_DENTIST_ID] ?? [];
    const assistant = staff.find((a) => a.id === id);
    if (!assistant) {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const newPassword = typeof body?.new_password === 'string' ? body.new_password : '';
    const confirmation = typeof body?.new_password_confirmation === 'string'
        ? body.new_password_confirmation
        : '';

    // Mirror Laravel FormRequest rules: 8 ≤ length ≤ 255, confirmed.
    if (newPassword.length < 8) {
        return NextResponse.json({
            message: 'Validation failed.',
            errors: { new_password: ['The new password must be at least 8 characters.'] },
        }, { status: 422 });
    }
    if (newPassword.length > 255) {
        return NextResponse.json({
            message: 'Validation failed.',
            errors: { new_password: ['The new password may not be greater than 255 characters.'] },
        }, { status: 422 });
    }
    if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
        return NextResponse.json({
            message: 'Validation failed.',
            errors: { new_password: ['The new password must contain letters and numbers.'] },
        }, { status: 422 });
    }
    if (newPassword !== confirmation) {
        return NextResponse.json({
            message: 'Validation failed.',
            errors: { new_password_confirmation: ['The password confirmation does not match.'] },
        }, { status: 422 });
    }

    // Production-side reset (TeamAssistantService::resetPassword) flips
    // must_change_password so the assistant is forced to rotate on next login.
    assistant.must_change_password = true;

    pushAuditEntry({
        eventType: 'team.assistant.password_reset',
        entityType: 'user',
        entityId: id,
        metadata: { email: assistant.email },
    });

    return NextResponse.json({ data: { assistant_id: id, password_reset: true } });
}
