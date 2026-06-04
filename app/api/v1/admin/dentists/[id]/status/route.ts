import { NextResponse } from 'next/server';
import { findDentist, pushAuditEntry } from '@/lib/mock/admin-store';
import { requireAdmin } from '../../../../_auth';

// Local mock: block / activate a dentist account.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if (auth) return auth;

    const { id } = await params;
    const dentist = findDentist(id);
    if (!dentist) {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }
    // Mirror backend: a soft-deleted dentist's status is terminal; flipping
    // back to 'active' or 'blocked' requires the restore endpoint instead.
    if (dentist.status === 'deleted') {
        return NextResponse.json({
            message: 'Validation failed.',
            errors: { status: ['Cannot update deleted account status. Restore first.'] },
        }, { status: 422 });
    }

    const body = await request.json().catch(() => ({}));
    const oldStatus = dentist.status;
    if (body?.status === 'active' || body?.status === 'blocked') {
        dentist.status = body.status;
        pushAuditEntry({
            eventType: 'admin.dentist.status_updated',
            entityType: 'user',
            entityId: dentist.id,
            metadata: {
                old_status: oldStatus,
                new_status: body.status,
            },
        });
    } else {
        return NextResponse.json({
            message: 'Validation failed.',
            errors: { status: ['Status must be either active or blocked.'] },
        }, { status: 422 });
    }

    return NextResponse.json({ data: dentist });
}
