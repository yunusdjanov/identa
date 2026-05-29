import { NextResponse } from 'next/server';
import { getAdminStore } from '@/lib/mock/admin-store';

// Local mock: list landing-page lead requests (optionally filtered by status).
export async function GET(request: Request) {
    const store = getAdminStore();
    const url = new URL(request.url);
    const status = url.searchParams.get('filter[status]') ?? url.searchParams.get('status');
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
    const perPage = Math.max(1, Number(url.searchParams.get('per_page') ?? '15') || 15);

    let items = store.leads;
    if (status === 'new' || status === 'contacted' || status === 'closed') {
        items = items.filter((lead) => lead.status === status);
    }

    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const paged = items.slice((page - 1) * perPage, (page - 1) * perPage + perPage);

    return NextResponse.json({
        data: paged,
        meta: {
            pagination: { page, per_page: perPage, total, total_pages: totalPages },
            summary: {
                total_count: store.leads.length,
                new_count: store.leads.filter((lead) => lead.status === 'new').length,
                contacted_count: store.leads.filter((lead) => lead.status === 'contacted').length,
                closed_count: store.leads.filter((lead) => lead.status === 'closed').length,
            },
        },
    });
}
