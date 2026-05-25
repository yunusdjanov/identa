import { NextResponse } from 'next/server';
import { requireAuth, list } from '../_auth';
import { PATIENTS } from '../_mock-data';

function normalize(value: string): string {
    return value.toLowerCase().trim();
}

export async function GET(request: Request) {
    const auth = await requireAuth();
    if (auth) return auth;

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

export async function POST(request: Request) {
    const auth = await requireAuth();
    if (auth) return auth;
    const body = await request.json();
    const patient = { id: `pat-${Date.now()}`, patient_id: `P-${String(PATIENTS.length + 1).padStart(3, '0')}`, is_archived: false, categories: [], created_at: new Date().toISOString(), last_visit_at: null, ...body };
    return NextResponse.json({ data: patient }, { status: 201 });
}
