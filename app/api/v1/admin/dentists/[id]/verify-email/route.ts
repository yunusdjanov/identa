import { NextResponse } from 'next/server';
import { findDentist, pushAuditEntry } from '@/lib/mock/admin-store';
import { requireAdmin } from '../../../../_auth';

// Local mock: admin manually marks a dentist's email as verified.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if (auth) return auth;

    const { id } = await params;
    const dentist = findDentist(id);
    if (!dentist) {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }

    // Idempotent: only log + flip if not already verified, matching backend.
    // Backend writes no metadata on this event (the entity id alone is the
    // dentist), so we don't either — keeping the panel renderings identical
    // between mock dev and prod.
    if (!dentist.email_verified) {
        dentist.email_verified = true;
        pushAuditEntry({
            eventType: 'admin.dentist.email_verified',
            entityType: 'user',
            entityId: dentist.id,
        });
    }

    return NextResponse.json({ data: dentist });
}
