import { NextResponse } from 'next/server';
import { pushAuditEntry, recomputeStaffCounts } from '@/lib/mock/admin-store';
import { setMockUserAccountStatus, updateMockUserProfile } from '../../../_mock-users';
import { normalizeAssistantPermissions } from '@/lib/auth/permissions';
import {
    ALLOWED_ASSISTANT_PERMISSIONS,
    findMockAssistant,
    MOCK_DENTIST_ID,
    notFound,
    requireTeamMutationAccess,
    validationFailure,
} from '../../_shared';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireTeamMutationAccess();
    if (auth) return auth;

    const { id } = await params;
    const found = findMockAssistant(id);
    if (!found) {
        return notFound();
    }
    if (found.assistant.account_status === 'deleted') {
        return notFound();
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const phone = typeof body.phone === 'string' && body.phone.trim() !== '' ? body.phone.trim() : null;
    const permissions = Array.isArray(body.permissions)
        ? body.permissions.filter((permission): permission is string => typeof permission === 'string')
        : null;
    const errors: Record<string, string[]> = {};
    if (name.length < 3 || name.length > 255) errors.name = ['Name must be between 3 and 255 characters.'];
    if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = ['A valid email is required.'];
    if (phone !== null && !/^\+\d{9,15}$/.test(phone)) errors.phone = ['Phone must use international format.'];
    if (body.permissions !== undefined && body.permissions !== null && !Array.isArray(body.permissions)) {
        errors.permissions = ['Permissions must be an array.'];
    }
    if (permissions?.some((permission) => !ALLOWED_ASSISTANT_PERMISSIONS.has(permission)) || (permissions && new Set(permissions).size !== permissions.length)) {
        errors.permissions = ['Permissions must be allowed and distinct.'];
    }
    if (found.staff.some((assistant) => (
        assistant.id !== id && assistant.email.toLocaleLowerCase() === email.toLocaleLowerCase()
    ))) {
        errors.email = ['The email has already been taken.'];
    }
    if (Object.keys(errors).length > 0) return validationFailure(errors);

    const emailChanged = found.assistant.email !== email;
    found.assistant.name = name;
    found.assistant.email = email;
    found.assistant.phone = phone;
    if (permissions !== null) {
        found.assistant.assistant_permissions = normalizeAssistantPermissions(permissions);
    }
    updateMockUserProfile(id, {
        name,
        email,
        phone,
    });

    pushAuditEntry({
        eventType: 'team.assistant.updated',
        entityType: 'user',
        entityId: id,
        metadata: {
            email_changed: emailChanged,
            permission_count: found.assistant.assistant_permissions.length,
        },
    });

    return NextResponse.json({ data: found.assistant });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireTeamMutationAccess();
    if (auth) return auth;

    const { id } = await params;
    const found = findMockAssistant(id);
    if (!found) {
        return notFound();
    }

    // Soft-delete matches backend: status flips to 'deleted' rather than the
    // row being pulled out of the array, so admin-side roster filters still
    // hide it consistently.
    if (found.assistant.account_status !== 'deleted') {
        found.assistant.account_status = 'deleted';
        found.assistant.email = `deleted-${id}@deleted.invalid`;
        found.assistant.phone = null;
        setMockUserAccountStatus(id, 'deleted');
        updateMockUserProfile(id, {
            email: found.assistant.email,
            phone: null,
        });
        recomputeStaffCounts(MOCK_DENTIST_ID);
    }

    pushAuditEntry({
        eventType: 'team.assistant.deleted',
        entityType: 'user',
        entityId: id,
    });

    return new NextResponse(null, { status: 204 });
}
