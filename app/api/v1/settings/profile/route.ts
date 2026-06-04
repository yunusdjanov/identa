import { cookies } from 'next/headers';
import { requireAuth, ok } from '../../_auth';
import { PROFILE } from '../../_mock-data';
import { pushAuditEntry } from '@/lib/mock/admin-store';

// Local mock: GET / PUT settings/profile.
//
// Admin and dentist share the same endpoint in production — backend
// ProfileSettingsService role-filters the payload internally. The mock
// mirrors that contract: admin requests get a slim ApiProfile snapshot
// keyed off the admin identity (name/email only matter), dentist requests
// get the full PROFILE constant.

const ADMIN_PROFILE = {
    id: 'admin-1',
    name: 'Identa Admin',
    email: 'admin@identa.test',
    phone: null,
    practice_name: null,
    license_number: null,
    address: null,
    working_hours: { start: null, end: null },
    default_appointment_duration: 30,
};

async function isAdminSession(): Promise<boolean> {
    const cookieStore = await cookies();
    return cookieStore.get('mock_role')?.value === 'admin';
}

export async function GET() {
    const auth = await requireAuth();
    if (auth) return auth;
    return ok((await isAdminSession()) ? ADMIN_PROFILE : PROFILE);
}

export async function PUT(request: Request) {
    const auth = await requireAuth();
    if (auth) return auth;

    const body = await request.json().catch(() => ({}));
    const base = (await isAdminSession()) ? ADMIN_PROFILE : PROFILE;

    // Mirror backend: admins may only mutate name/email; dentists/assistants
    // get the broader set. Filtering here makes the mock truthful about what
    // would actually persist server-side.
    const isAdmin = await isAdminSession();
    const allowedKeys = isAdmin
        ? new Set(['name', 'email'])
        : new Set([
            'name',
            'email',
            'phone',
            'practice_name',
            'license_number',
            'address',
            'working_hours_start',
            'working_hours_end',
            'default_appointment_duration',
        ]);

    const filtered: Record<string, unknown> = {};
    for (const key of Object.keys(body ?? {})) {
        if (allowedKeys.has(key)) filtered[key] = body[key];
    }

    // working_hours shape parity with backend ApiProfile envelope.
    const workingHours = base.working_hours;
    if (filtered.working_hours_start !== undefined) {
        workingHours.start = filtered.working_hours_start as string | null;
    }
    if (filtered.working_hours_end !== undefined) {
        workingHours.end = filtered.working_hours_end as string | null;
    }

    // Backend `ProfileSettingsService::update` writes an audit row on every
    // profile mutation (task A-H1). The mock used to skip this, which made
    // the admin's `/admin/settings` activity panel look quiet during dev
    // and hid a missing-audit class of bug we'd only find in production.
    // Mirror the backend's metadata shape so the audit panel renders the
    // same context in both modes.
    if (Object.keys(filtered).length > 0) {
        pushAuditEntry({
            eventType: 'settings.profile.updated',
            entityType: 'user',
            entityId: base.id,
            metadata: { fields: Object.keys(filtered) },
        });
    }

    return ok({
        ...base,
        ...filtered,
        working_hours: workingHours,
    });
}
