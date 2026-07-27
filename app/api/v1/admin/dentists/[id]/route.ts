import { NextResponse } from 'next/server';
import { findDentist, pushAuditEntry } from '@/lib/mock/admin-store';
import { requireAdmin } from '../../../_auth';
import { setMockUserAccountStatus } from '../../../_mock-users';

// Local mock: show a single dentist / soft-delete (mark deleted).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if (auth) return auth;

    const { id } = await params;
    const dentist = findDentist(id);
    if (!dentist) {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }
    return NextResponse.json({ data: dentist });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if (auth) return auth;

    const { id } = await params;
    const dentist = findDentist(id);

    // Mirror backend: unknown dentist → 404 (not silent 204).
    if (!dentist) {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }

    // Idempotency: backend returns 204 immediately on already-deleted
    // without writing a duplicate audit entry. Same behaviour here.
    if (dentist.status === 'deleted') {
        return new NextResponse(null, { status: 204 });
    }

    const oldStatus = dentist.status;
    dentist.status = 'deleted';
    setMockUserAccountStatus(id, 'deleted');

    pushAuditEntry({
        eventType: 'admin.dentist.deleted',
        entityType: 'user',
        entityId: id,
        metadata: {
            old_status: oldStatus,
            new_status: 'deleted',
        },
    });

    return new NextResponse(null, { status: 204 });
}
