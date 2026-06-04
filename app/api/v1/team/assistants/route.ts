import { NextResponse } from 'next/server';
import { list, requireDentist } from '../../_auth';
import { getAdminStore, pushAuditEntry, recomputeStaffCounts } from '@/lib/mock/admin-store';

// The mock dentist session (/auth/me id 'dentist-1') is the same person seeded
// in the admin store under id '1'. Reading and mutating staffByDentist['1']
// here means admin-side changes are visible on the dentist team view AND
// dentist-side changes appear on the admin staff page — the single-source-
// of-truth contract production has (one users table, both surfaces query it).
const MOCK_DENTIST_ID = '1';

function getStaff() {
    const store = getAdminStore();
    if (!store.staffByDentist[MOCK_DENTIST_ID]) {
        store.staffByDentist[MOCK_DENTIST_ID] = [];
    }
    return store.staffByDentist[MOCK_DENTIST_ID];
}

export async function GET() {
    // Team management is dentist-owner-only on the real backend
    // (`role:dentist + permission:team.manage`). Without this gate
    // an assistant logged into the mock could enumerate every staff
    // member of the practice — including email/phone/permissions.
    const auth = await requireDentist();
    if (auth) return auth;
    return list(getStaff());
}

export async function POST(request: Request) {
    const auth = await requireDentist();
    if (auth) return auth;

    const body = await request.json().catch(() => ({}));
    const staff = getStaff();
    const id = `ast-${Date.now()}`;
    const assistant = {
        id,
        name: String(body?.name ?? 'New Assistant'),
        email: String(body?.email ?? `assistant${id}@identa.test`),
        phone: body?.phone ?? null,
        avatar_url: null,
        account_status: 'active' as const,
        assistant_permissions: Array.isArray(body?.assistant_permissions)
            ? body.assistant_permissions
            : [],
        must_change_password: true,
        last_login_at: null,
        created_at: new Date().toISOString(),
    };
    staff.unshift(assistant);
    recomputeStaffCounts(MOCK_DENTIST_ID);

    pushAuditEntry({
        eventType: 'team.assistant.created',
        entityType: 'user',
        entityId: id,
        metadata: { email: assistant.email, dentist_id: MOCK_DENTIST_ID },
    });

    return NextResponse.json({ data: assistant }, { status: 201 });
}
