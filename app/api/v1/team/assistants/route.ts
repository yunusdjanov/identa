import { NextResponse } from 'next/server';
import { list, requireDentist } from '../../_auth';
import { getAdminStore, pushAuditEntry, recomputeStaffCounts } from '@/lib/mock/admin-store';
import { normalizeAssistantPermissions } from '@/lib/auth/permissions';

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

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const permissions = Array.isArray(body.permissions)
        ? body.permissions.filter((permission): permission is string => typeof permission === 'string')
        : [];
    const password = typeof body.password === 'string' ? body.password : '';
    const passwordConfirmation = typeof body.password_confirmation === 'string'
        ? body.password_confirmation
        : '';
    if (
        typeof body.name !== 'string'
        || body.name.trim().length < 3
        || typeof body.email !== 'string'
        || !body.email.includes('@')
        || permissions.length === 0
        || password.length < 8
        || !/[A-Za-z]/.test(password)
        || !/\d/.test(password)
        || password !== passwordConfirmation
    ) {
        return NextResponse.json({
            message: 'Validation failed.',
            errors: {
                assistant: ['Name, email, permissions, and a confirmed password with letters and numbers are required.'],
            },
        }, { status: 422 });
    }
    const staff = getStaff();
    const id = `ast-${Date.now()}`;
    const assistant = {
        id,
        name: body.name.trim(),
        email: body.email.trim(),
        phone: typeof body.phone === 'string' ? body.phone : null,
        avatar_url: null,
        account_status: 'active' as const,
        assistant_permissions: normalizeAssistantPermissions(permissions),
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
