import { NextResponse } from 'next/server';
import { requirePermission } from '../_auth';
import { PATIENTS } from '../_mock-data';
import { normalizePatientPayload } from './_contract';

function normalize(value: string): string {
    return value.toLowerCase().trim();
}

function booleanQuery(value: string | null): boolean {
    return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase());
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
    const categoryIds = [
        ...params.getAll('filter[category_ids]'),
        ...params.getAll('filter[category_ids][]'),
    ]
        .flatMap((value) => value.split(',').map((id) => id.trim()))
        .filter(Boolean);
    const inactiveBefore = params.get('filter[inactive_before]') ?? params.get('inactive_before');
    const archivedOnly = booleanQuery(params.get('filter[archived_only]') ?? params.get('archived_only'));
    const includeArchived = booleanQuery(params.get('filter[include_archived]') ?? params.get('include_archived'));
    const rawPage = params.get('page') ?? '1';
    const rawPerPage = params.get('per_page') ?? '15';
    const page = Number(rawPage);
    const requestedPerPage = Number(rawPerPage);
    const queryErrors: Record<string, string[]> = {};
    if (!Number.isInteger(page) || page < 1 || page > 1_000_000) {
        queryErrors.page = ['Page must be an integer from 1 to 1000000.'];
    }
    if (!Number.isInteger(requestedPerPage) || requestedPerPage < 1 || requestedPerPage > 500) {
        queryErrors.per_page = ['Per page must be an integer from 1 to 500.'];
    }
    if (search.length > 160) {
        queryErrors['filter.search'] = ['Search may not exceed 160 characters.'];
    }
    if (categoryIds.length > 50) {
        queryErrors['filter.category_ids'] = ['At most 50 categories may be selected.'];
    }
    if (Object.keys(queryErrors).length > 0) {
        return NextResponse.json({ message: 'Validation failed.', errors: queryErrors }, { status: 422 });
    }
    const perPage = Math.min(requestedPerPage, 100);

    let filtered = PATIENTS.slice();

    if (search) {
        filtered = filtered.filter((p) => {
            const haystack = [
                p.full_name,
                p.phone,
                p.secondary_phone ?? '',
            ].join(' ').toLowerCase();
            return haystack.includes(search);
        });
    }

    if (categoryId && categoryId !== 'all') {
        filtered = filtered.filter((p) => (p.categories ?? []).some((c) => c.id === categoryId));
    }
    else if (categoryIds.length > 0) {
        filtered = filtered.filter((p) => (p.categories ?? []).some((c) => categoryIds.includes(c.id)));
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
    } else if (!includeArchived) {
        filtered = filtered.filter((p) => !p.is_archived);
    }

    const total = filtered.length;
    const start = (page - 1) * perPage;
    const paged = filtered.slice(start, start + perPage);

    return NextResponse.json({
        data: paged,
        meta: {
            pagination: {
                page,
                per_page: perPage,
                total,
                total_pages: Math.max(1, Math.ceil(total / perPage)),
            },
        },
    });
}

// Mirrors StorePatientRequest::rules() — without this guard, dev-mode
// testing accepted bogus payloads (empty full_name, malformed phone)
// that the real backend rejects with 422. Mock now returns the same
// `{ message, errors }` envelope so getApiErrorMessage parses it
// identically. FA-X3 J3.
export async function POST(request: Request) {
    // POST gated by `patients.manage` on the backend.
    const denied = await requirePermission('patients.manage');
    if (denied) return denied;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const { errors, payload } = normalizePatientPayload(body);
    if (Object.keys(errors).length > 0) {
        return NextResponse.json({ message: 'Validation failed.', errors }, { status: 422 });
    }

    const patient = {
        id: `pat-${Date.now()}`,
        patient_id: `PT-${String(PATIENTS.length + 1).padStart(4, '0')}MO`,
        ...payload,
        is_archived: false,
        archived_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_visit_at: null,
    };
    (PATIENTS as Array<Record<string, unknown>>).push(patient);

    return NextResponse.json({ data: patient }, { status: 201 });
}
