import { NextResponse } from 'next/server';
import { findDentist, pushAuditEntry } from '@/lib/mock/admin-store';
import { requireAdmin } from '../../../../_auth';
import { setMockUserAccountStatus } from '../../../../_mock-users';

// Local mock: restore a soft-deleted dentist account.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if (auth) return auth;

    const { id } = await params;
    const dentist = findDentist(id);
    if (!dentist) {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }

    if (dentist.status === 'deleted') {
        // Match the backend's audit metadata shape (previous/new status).
        // The mock used to record `{ email }` instead, which produced a
        // different rendering in the admin's activity panel between dev
        // and prod for the same action — see audit gap F8.
        dentist.status = 'active';
        setMockUserAccountStatus(id, 'active');
        pushAuditEntry({
            eventType: 'admin.dentist.restored',
            entityType: 'user',
            entityId: dentist.id,
            metadata: { previous_status: 'deleted', new_status: 'active' },
        });
    }

    return NextResponse.json({ data: dentist });
}
