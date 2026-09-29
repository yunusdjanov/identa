import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireAuth, ok } from '../../_auth';
import { PROFILE } from '../../_mock-data';
import { pushAuditEntry } from '@/lib/mock/admin-store';
import { resolveMockUser, updateMockUserProfile, type MockUser } from '../../_mock-users';

const ADMIN_PROFILE = {
    id: 'admin-1',
    name: 'Identa Admin',
    email: 'admin@identa.test',
    phone: null as string | null,
    practice_name: null as string | null,
    license_number: null as string | null,
    address: null as string | null,
    working_hours: { start: null as string | null, end: null as string | null },
    default_appointment_duration: 30,
    show_record_authors: false,
};

type ProfileShape = typeof ADMIN_PROFILE;
type ValidationErrors = Record<string, string[]>;

function validationFailure(errors: ValidationErrors) {
    return NextResponse.json({ message: 'Validation failed.', errors }, { status: 422 });
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidTime(value: unknown): value is string {
    if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return false;
    const [hours, minutes] = value.split(':').map(Number);
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

async function sessionProfile(): Promise<{ role: MockUser['role']; user: MockUser; profile: ProfileShape }> {
    const cookieStore = await cookies();
    const role = cookieStore.get('mock_role')?.value;
    const user = resolveMockUser(role, cookieStore.get('mock_user_id')?.value);

    if (role === 'admin') {
        Object.assign(ADMIN_PROFILE, { name: user.name, email: user.email });
        return { role: 'admin', user, profile: ADMIN_PROFILE };
    }
    if (role === 'assistant') {
        return {
            role: 'assistant',
            user,
            profile: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone ?? null,
                practice_name: null,
                license_number: null,
                address: null,
                working_hours: { start: null, end: null },
                default_appointment_duration: 30,
                show_record_authors: user.show_record_authors ?? false,
            },
        };
    }

    return { role: 'dentist', user, profile: PROFILE };
}

export async function GET() {
    const auth = await requireAuth();
    if (auth) return auth;
    return ok((await sessionProfile()).profile);
}

export async function PUT(request: Request) {
    const auth = await requireAuth();
    if (auth) return auth;

    const body = await request.json().catch(() => null);
    if (!isRecord(body)) {
        return validationFailure({ request: ['The request body must be an object.'] });
    }

    const session = await sessionProfile();
    const base = session.profile;
    const allowedKeys = session.role === 'admin'
        ? new Set(['name', 'email'])
        : session.role === 'assistant'
            ? new Set(['name', 'email', 'phone', 'show_record_authors'])
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
                'show_record_authors',
            ]);

    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
        if (allowedKeys.has(key)) filtered[key] = value;
    }

    const errors: ValidationErrors = {};
    const validateOptionalText = (key: string, min: number, max: number, nullable = true) => {
        if (!(key in filtered)) return;
        const value = filtered[key];
        if (value === null && nullable) return;
        if (typeof value !== 'string') {
            errors[key] = ['The field must be a string.'];
            return;
        }
        const length = value.trim().length;
        if (length < min || length > max) {
            errors[key] = [`The field must be between ${min} and ${max} characters.`];
        }
    };

    validateOptionalText('name', 3, 255, false);
    validateOptionalText('practice_name', 3, 255);
    validateOptionalText('license_number', 0, 50);
    validateOptionalText('address', 3, 255);

    if ('email' in filtered) {
        const email = filtered.email;
        if (typeof email !== 'string' || email.trim().length > 255 || !isValidEmail(email.trim())) {
            errors.email = ['Enter a valid email address.'];
        }
    }
    if ('phone' in filtered) {
        const phone = filtered.phone;
        if (phone !== null && (typeof phone !== 'string' || phone.length > 50 || !/^\+\d{9,15}$/.test(phone))) {
            errors.phone = ['Enter a valid international phone number.'];
        }
    }
    if ('show_record_authors' in filtered && typeof filtered.show_record_authors !== 'boolean') {
        errors.show_record_authors = ['The field must be true or false.'];
    }
    if ('default_appointment_duration' in filtered
        && filtered.default_appointment_duration !== null
        && ![15, 30, 45, 60].includes(Number(filtered.default_appointment_duration))) {
        errors.default_appointment_duration = ['Choose a supported appointment duration.'];
    }

    for (const key of ['working_hours_start', 'working_hours_end']) {
        if (key in filtered && filtered[key] !== null && !isValidTime(filtered[key])) {
            errors[key] = ['Use the HH:mm time format.'];
        }
    }

    const workingHours = { ...base.working_hours };
    if ('working_hours_start' in filtered && !errors.working_hours_start) {
        workingHours.start = filtered.working_hours_start as string | null;
    }
    if ('working_hours_end' in filtered && !errors.working_hours_end) {
        workingHours.end = filtered.working_hours_end as string | null;
    }
    const updatesWorkingHours = 'working_hours_start' in filtered || 'working_hours_end' in filtered;
    if (updatesWorkingHours) {
        if ((workingHours.start === null) !== (workingHours.end === null)) {
            errors.working_hours_end = ['Start and end time must be provided together.'];
        } else if (workingHours.start !== null && workingHours.end !== null && workingHours.end <= workingHours.start) {
            errors.working_hours_end = ['End time must be later than start time.'];
        }
    }

    const nextEmail = typeof filtered.email === 'string' ? filtered.email.trim() : base.email;
    const emailChanged = nextEmail !== base.email;
    if (emailChanged) {
        if (session.user.has_password === false) {
            errors.email = ['Set a password before changing the email address.'];
        } else if (typeof body.current_password !== 'string' || body.current_password.length === 0) {
            errors.current_password = ['The current password is required.'];
        }
    }
    if ('current_password' in body
        && (typeof body.current_password !== 'string' || body.current_password.length > 255)) {
        errors.current_password = ['The current password must be a string of at most 255 characters.'];
    }

    if (Object.keys(errors).length > 0) {
        return validationFailure(errors);
    }

    const normalized = { ...filtered };
    for (const key of ['name', 'email', 'practice_name', 'license_number', 'address']) {
        if (typeof normalized[key] === 'string') normalized[key] = normalized[key].trim();
    }
    const changedFields = Object.keys(normalized).filter((key) => {
        if (key === 'working_hours_start') return workingHours.start !== base.working_hours.start;
        if (key === 'working_hours_end') return workingHours.end !== base.working_hours.end;
        return JSON.stringify(normalized[key]) !== JSON.stringify(base[key as keyof ProfileShape]);
    });

    const profilePatch = Object.fromEntries(
        Object.entries(normalized).filter(([key]) => !key.startsWith('working_hours_'))
    );
    Object.assign(base, profilePatch, { working_hours: workingHours });

    updateMockUserProfile(base.id, {
        name: typeof normalized.name === 'string' ? normalized.name : undefined,
        email: typeof normalized.email === 'string' ? normalized.email : undefined,
        phone: typeof normalized.phone === 'string' || normalized.phone === null
            ? normalized.phone
            : undefined,
        show_record_authors: typeof normalized.show_record_authors === 'boolean'
            ? normalized.show_record_authors
            : undefined,
    });

    if (changedFields.length > 0) {
        pushAuditEntry({
            eventType: 'settings.profile.updated',
            entityType: 'user',
            entityId: base.id,
            metadata: { role: session.role, changed_fields: changedFields },
        });
    }

    return ok(base);
}
