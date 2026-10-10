import { NextResponse } from 'next/server';
import { requireDentist } from '../../_auth';
import { pushAuditEntry, recomputeStaffCounts } from '@/lib/mock/admin-store';
import { normalizeAssistantPermissions } from '@/lib/auth/permissions';
import {
    ALLOWED_ASSISTANT_PERMISSIONS,
    getMockStaff,
    MOCK_DENTIST_ID,
    requireTeamMutationAccess,
    staffLimitErrorWhenFull,
    validationFailure,
} from '../_shared';

// The mock dentist session (/auth/me id 'dentist-1') is the same person seeded
// in the admin store under id '1'. Reading and mutating staffByDentist['1']
// here means admin-side changes are visible on the dentist team view AND
// dentist-side changes appear on the admin staff page — the single-source-
// of-truth contract production has (one users table, both surfaces query it).
export async function GET(request: Request) {
    // Team management is dentist-owner-only on the real backend
    // (`role:dentist + permission:team.manage`). Without this gate
    // an assistant logged into the mock could enumerate every staff
    // member of the practice — including email/phone/permissions.
    const auth = await requireDentist();
    if (auth) return auth;

    const url = new URL(request.url);
    const search = (url.searchParams.get('filter[search]') ?? '').trim().toLocaleLowerCase();
    const status = url.searchParams.get('filter[status]');
    const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
    const perPage = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('per_page') ?? '15', 10) || 15));
    const allStaff = getMockStaff();
    const filtered = allStaff.filter((assistant) => {
        const matchesStatus = !status || assistant.account_status === status;
        const matchesSearch = !search || [assistant.name, assistant.email, assistant.phone ?? '']
            .some((value) => value.toLocaleLowerCase().includes(search));
        return matchesStatus && matchesSearch;
    });
    const offset = (page - 1) * perPage;

    return NextResponse.json({
        data: filtered.slice(offset, offset + perPage),
        meta: {
            pagination: {
                page,
                per_page: perPage,
                total: filtered.length,
                total_pages: Math.max(1, Math.ceil(filtered.length / perPage)),
            },
            summary: {
                total_count: allStaff.length,
                active_count: allStaff.filter((assistant) => assistant.account_status === 'active').length,
                blocked_count: allStaff.filter((assistant) => assistant.account_status === 'blocked').length,
            },
        },
    });
}

export async function POST(request: Request) {
    const auth = await requireTeamMutationAccess();
    if (auth) return auth;

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const permissions = Array.isArray(body.permissions)
        ? body.permissions.filter((permission): permission is string => typeof permission === 'string')
        : [];
    const password = typeof body.password === 'string' ? body.password : '';
    const passwordConfirmation = typeof body.password_confirmation === 'string'
        ? body.password_confirmation
        : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const phone = typeof body.phone === 'string' && body.phone.trim() !== '' ? body.phone.trim() : null;
    const errors: Record<string, string[]> = {};
    if (name.length < 3 || name.length > 255) errors.name = ['Name must be between 3 and 255 characters.'];
    if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = ['A valid email is required.'];
    if (phone !== null && !/^\+\d{9,15}$/.test(phone)) errors.phone = ['Phone must use international format.'];
    if (!Array.isArray(body.permissions) || permissions.length === 0) errors.permissions = ['At least one permission is required.'];
    if (permissions.some((permission) => !ALLOWED_ASSISTANT_PERMISSIONS.has(permission)) || new Set(permissions).size !== permissions.length) {
        errors.permissions = ['Permissions must be allowed and distinct.'];
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        errors.password = ['Password must be at least 8 characters and contain letters and numbers.'];
    }
    if (password !== passwordConfirmation) errors.password_confirmation = ['The password confirmation does not match.'];

    const staff = getMockStaff();
    if (staff.some((assistant) => assistant.email.toLocaleLowerCase() === email.toLocaleLowerCase())) {
        errors.email = ['The email has already been taken.'];
    }
    if (Object.keys(errors).length > 0) return validationFailure(errors);

    const limitError = staffLimitErrorWhenFull();
    if (limitError) return limitError;

    const id = `ast-${Date.now()}`;
    const assistant = {
        id,
        name,
        email,
        phone,
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
        metadata: {
            dentist_id: MOCK_DENTIST_ID,
            permission_count: assistant.assistant_permissions.length,
        },
    });

    return NextResponse.json({ data: assistant }, { status: 201 });
}
