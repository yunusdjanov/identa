import { NextResponse } from 'next/server';
import { requireDentist } from '../../../../_auth';
import { getAdminStore, pushAuditEntry, recomputeStaffCounts } from '@/lib/mock/admin-store';
import { setMockUserAccountStatus } from '../../../../_mock-users';

const MOCK_DENTIST_ID = '1';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    if (body?.status !== 'active' && body?.status !== 'blocked') {
        return NextResponse.json(
            {
                message: 'Validation failed.',
                errors: { status: ['Status must be either active or blocked.'] },
            },
            { status: 422 }
        );
    }
    if (assistant.account_status === 'deleted') {
        return NextResponse.json(
            {
                message: 'Validation failed.',
                errors: { status: ['Cannot update deleted account status.'] },
            },
            { status: 422 }
        );
    }

    const oldStatus = assistant.account_status;
    assistant.account_status = body.status;
    setMockUserAccountStatus(id, body.status);
    recomputeStaffCounts(MOCK_DENTIST_ID);

    pushAuditEntry({
        eventType: 'team.assistant.status_updated',
        entityType: 'user',
        entityId: id,
        metadata: { old_status: oldStatus, new_status: body.status },
    });

    return NextResponse.json({ data: assistant });
}
