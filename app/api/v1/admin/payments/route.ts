import { NextResponse } from 'next/server';
import { getAllPayments, paymentsSummary } from '@/lib/mock/admin-store';
import { requireAdmin } from '../../_auth';

// Local mock: global admin view of all billing payments across every dentist.
export async function GET(request: Request) {
    const auth = await requireAdmin();
    if (auth) return auth;

    const url = new URL(request.url);
    const search = (url.searchParams.get('filter[search]') ?? '').trim().toLowerCase();
    const status = (url.searchParams.get('filter[status]') ?? '').trim();
    const provider = (url.searchParams.get('filter[provider]') ?? '').trim();
    const dentistId = (url.searchParams.get('filter[dentist_id]') ?? '').trim();
    const fromRaw = (url.searchParams.get('filter[from]') ?? '').trim();
    const toRaw = (url.searchParams.get('filter[to]') ?? '').trim();
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
    const perPage = Math.max(1, Math.min(100, Number(url.searchParams.get('per_page') ?? '20') || 20));

    let items = getAllPayments();

    if (status) {
        items = items.filter((p) => p.status === status);
    }
    if (provider) {
        items = items.filter((p) => p.provider === provider);
    }
    if (dentistId) {
        items = items.filter((p) => p.dentist?.id === dentistId);
    }
    if (fromRaw) {
        const from = new Date(fromRaw);
        if (!Number.isNaN(from.getTime())) {
            items = items.filter(
                (p) => p.created_at !== null && new Date(p.created_at) >= from
            );
        }
    }
    if (toRaw) {
        const to = new Date(toRaw);
        if (!Number.isNaN(to.getTime())) {
            // Include all of the "to" day.
            to.setHours(23, 59, 59, 999);
            items = items.filter(
                (p) => p.created_at !== null && new Date(p.created_at) <= to
            );
        }
    }
    if (search) {
        items = items.filter(
            (p) =>
                (p.dentist?.name ?? '').toLowerCase().includes(search) ||
                (p.dentist?.email ?? '').toLowerCase().includes(search)
        );
    }

    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const paged = items.slice((page - 1) * perPage, (page - 1) * perPage + perPage);

    return NextResponse.json({
        data: paged,
        meta: {
            pagination: { page, per_page: perPage, total, total_pages: totalPages },
            summary: paymentsSummary(),
        },
    });
}
