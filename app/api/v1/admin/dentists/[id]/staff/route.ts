import { NextResponse } from 'next/server';
import { findDentist, getAdminStore } from '@/lib/mock/admin-store';
import { requireAdmin } from '../../../../_auth';

// Local mock: list a dentist's assistants (read-only admin view).
//
// Mirrors backend DentistAccountController::staff():
//   - rejects unknown dentist with 404 (instead of returning [] silently)
//   - excludes soft-deleted dentists' rosters
//   - filters soft-deleted assistants from the response (PII)
//   - orders by (account_status, name)
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if (auth) return auth;

    const { id } = await params;
    const dentist = findDentist(id);
    if (!dentist) {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }
    if (dentist.status === 'deleted') {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }

    const staff = (getAdminStore().staffByDentist[id] ?? [])
        .filter((s) => s.account_status !== 'deleted')
        .slice()
        .sort((a, b) => {
            const statusCmp = a.account_status.localeCompare(b.account_status);
            return statusCmp !== 0 ? statusCmp : a.name.localeCompare(b.name);
        });

    return NextResponse.json({ data: staff });
}
