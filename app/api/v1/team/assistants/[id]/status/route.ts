import { NextResponse } from 'next/server';
import { pushAuditEntry, recomputeStaffCounts } from '@/lib/mock/admin-store';
import { setMockUserAccountStatus } from '../../../../_mock-users';
import {
    findMockAssistant,
    MOCK_DENTIST_ID,
    notFound,
    requireTeamMutationAccess,
    staffLimitErrorWhenFull,
    validationFailure,
} from '../../../_shared';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireTeamMutationAccess();
    if (auth) return auth;

    const { id } = await params;
    const found = findMockAssistant(id);
    if (!found) return notFound();
    const assistant = found.assistant;

    const body = await request.json().catch(() => ({}));
    if (body?.status !== 'active' && body?.status !== 'blocked') {
        return validationFailure({ status: ['Status must be either active or blocked.'] });
    }
    if (assistant.account_status === 'deleted') {
        return notFound();
    }
    if (body.status === 'active' && assistant.account_status !== 'active') {
        const limitError = staffLimitErrorWhenFull(assistant.id);
        if (limitError) return limitError;
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
