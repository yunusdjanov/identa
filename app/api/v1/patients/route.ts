import { NextResponse } from 'next/server';
import { list, requirePermission } from '../_auth';
import { PATIENTS } from '../_mock-data';

function normalize(value: string): string {
    return value.toLowerCase().trim();
}

export async function GET(request: Request) {
    // Backend gates `/patients` GET with `patients.view` (routes/api.php
    // line 171). Mock used to admit any authed session.
    const denied = await requirePermission('patients.view');
    if (denied) return denied;

    const url = new URL(request.url);
    const params = url.searchParams;
    const search = normalize(params.get('filter[search]') ?? params.get('search') ?? '');
    const categoryId = params.get('filter[category_id]') ?? params.get('category_id');
    const inactiveBefore = params.get('filter[inactive_before]') ?? params.get('inactive_before');
    const archivedOnly = (params.get('filter[archived_only]') ?? params.get('archived_only')) === 'true';
    const page = parseInt(params.get('page') ?? '1', 10) || 1;
    const perPage = parseInt(params.get('per_page') ?? '50', 10) || 50;

    let filtered = PATIENTS.slice();

    if (search) {
        filtered = filtered.filter((p) => {
            const haystack = [
                p.full_name,
                p.phone,
                p.secondary_phone ?? '',
                p.patient_id,
                p.address ?? '',
            ].join(' ').toLowerCase();
            return haystack.includes(search);
        });
    }

    if (categoryId && categoryId !== 'all') {
        filtered = filtered.filter((p) => (p.categories ?? []).some((c) => c.id === categoryId));
    }

    if (inactiveBefore) {
        const threshold = new Date(inactiveBefore).getTime();
        if (!Number.isNaN(threshold)) {
            filtered = filtered.filter((p) => {
                if (!p.last_visit_at) return true;
                return new Date(p.last_visit_at).getTime() < threshold;
            });
        }
    }

    if (archivedOnly) {
        filtered = filtered.filter((p) => p.is_archived);
    } else {
        // by default hide archived from main list unless explicitly requested
        // (keeps current UX: archived tab shows only archived)
    }

    const total = filtered.length;
    const start = (page - 1) * perPage;
    const paged = filtered.slice(start, start + perPage);

    return list(paged, total);
}

// Mirrors StorePatientRequest::rules() — without this guard, dev-mode
// testing accepted bogus payloads (empty full_name, malformed phone)
// that the real backend rejects with 422. Mock now returns the same
// `{ message, errors }` envelope so getApiErrorMessage parses it
// identically. FA-X3 J3.
const PHONE_RX = /^\+\d{9,15}$/;
const VALID_GENDERS = new Set(['male', 'female', 'other']);

export async function POST(request: Request) {
    // POST gated by `patients.manage` on the backend.
    const denied = await requirePermission('patients.manage');
    if (denied) return denied;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const errors: Record<string, string[]> = {};
    if (typeof body.full_name !== 'string' || body.full_name.trim().length < 3) {
        errors.full_name = ['Full name must be at least 3 characters.'];
    }
    if (typeof body.phone !== 'string' || !PHONE_RX.test(body.phone)) {
        errors.phone = ['Phone must be in E.164 format (+998901234567).'];
    }
    if (body.secondary_phone !== undefined && body.secondary_phone !== null && body.secondary_phone !== '') {
        if (typeof body.secondary_phone !== 'string' || !PHONE_RX.test(body.secondary_phone)) {
            errors.secondary_phone = ['Secondary phone must be in E.164 format.'];
        }
    }
    if (body.gender !== undefined && body.gender !== null && body.gender !== '') {
        if (typeof body.gender !== 'string' || !VALID_GENDERS.has(body.gender)) {
            errors.gender = ['Gender must be one of: male, female, other.'];
        }
    }
    if (body.date_of_birth !== undefined && body.date_of_birth !== null && body.date_of_birth !== '') {
        if (typeof body.date_of_birth !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date_of_birth)) {
            errors.date_of_birth = ['Date of birth must be YYYY-MM-DD.'];
        }
    }
    if (body.email !== undefined && body.email !== null && body.email !== '') {
        if (typeof body.email !== 'string' || !body.email.includes('@')) {
            errors.email = ['Email must be a valid email address.'];
        }
    }
    if (Object.keys(errors).length > 0) {
        return NextResponse.json({ message: 'Validation failed.', errors }, { status: 422 });
    }

    const patient = {
        id: `pat-${Date.now()}`,
        patient_id: `P-${String(PATIENTS.length + 1).padStart(3, '0')}`,
        is_archived: false,
        categories: [],
        created_at: new Date().toISOString(),
        last_visit_at: null,
        ...body,
    };
    (PATIENTS as Array<Record<string, unknown>>).push(patient);

    return NextResponse.json({ data: patient }, { status: 201 });
}
