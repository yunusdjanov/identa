import { NextResponse } from 'next/server';
import { requireDentist } from '../../../_auth';
import { getAdminStore, pushAuditEntry, recomputeStaffCounts } from '@/lib/mock/admin-store';
import { setMockUserAccountStatus, updateMockUserProfile } from '../../../_mock-users';
import { normalizeAssistantPermissions } from '@/lib/auth/permissions';

const MOCK_DENTIST_ID = '1';

function findAssistant(id: string) {
    const store = getAdminStore();
    const staff = store.staffByDentist[MOCK_DENTIST_ID] ?? [];
    const index = staff.findIndex((a) => a.id === id);
    return index >= 0 ? { staff, index, assistant: staff[index] } : null;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireDentist();
    if (auth) return auth;

    const { id } = await params;
    const found = findAssistant(id);
    if (!found) {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }
    if (found.assistant.account_status === 'deleted') {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const allowedKeys = new Set(['name', 'email', 'phone']);
    const before = { ...found.assistant };
    const target = found.assistant as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(body ?? {})) {
        if (allowedKeys.has(key)) {
            target[key] = value;
        }
    }
    if (Array.isArray(body.permissions)) {
        target.assistant_permissions = normalizeAssistantPermissions(
            body.permissions.filter((permission): permission is string => typeof permission === 'string')
        );
    }
    updateMockUserProfile(id, {
        name: typeof body.name === 'string' ? body.name : undefined,
        email: typeof body.email === 'string' ? body.email : undefined,
        phone: typeof body.phone === 'string' || body.phone === null ? body.phone : undefined,
    });

    pushAuditEntry({
        eventType: 'team.assistant.updated',
        entityType: 'user',
        entityId: id,
        metadata: { before, after: { ...found.assistant } },
    });

    return NextResponse.json({ data: found.assistant });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireDentist();
    if (auth) return auth;

    const { id } = await params;
    const found = findAssistant(id);
    if (!found) {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }

    // Soft-delete matches backend: status flips to 'deleted' rather than the
    // row being pulled out of the array, so admin-side roster filters still
    // hide it consistently.
    const oldStatus = found.assistant.account_status;
    found.assistant.account_status = 'deleted';
    setMockUserAccountStatus(id, 'deleted');
    recomputeStaffCounts(MOCK_DENTIST_ID);

    pushAuditEntry({
        eventType: 'team.assistant.deleted',
        entityType: 'user',
        entityId: id,
        metadata: { old_status: oldStatus, new_status: 'deleted' },
    });

    return new NextResponse(null, { status: 204 });
}
