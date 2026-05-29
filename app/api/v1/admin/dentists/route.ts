import { NextResponse } from 'next/server';
import { buildSubscription, dentistSummary, getAdminStore, isoDaysFromNow } from '@/lib/mock/admin-store';

// Local mock: admin dentist directory (list + create).
export async function GET(request: Request) {
    const store = getAdminStore();
    const url = new URL(request.url);
    const search = (url.searchParams.get('filter[search]') ?? url.searchParams.get('search') ?? '')
        .trim()
        .toLowerCase();
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
    const perPage = Math.max(1, Number(url.searchParams.get('per_page') ?? '10') || 10);

    let items = store.dentists;
    if (search) {
        items = items.filter(
            (dentist) =>
                dentist.name.toLowerCase().includes(search)
                || dentist.email.toLowerCase().includes(search)
                || (dentist.practice_name ?? '').toLowerCase().includes(search)
        );
    }

    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const paged = items.slice((page - 1) * perPage, (page - 1) * perPage + perPage);

    return NextResponse.json({
        data: paged,
        meta: {
            pagination: { page, per_page: perPage, total, total_pages: totalPages },
            summary: dentistSummary(),
        },
    });
}

export async function POST(request: Request) {
    const store = getAdminStore();
    const body = await request.json().catch(() => ({}));
    const id = String(store.nextDentistId++);

    const dentist = {
        id,
        name: String(body?.name ?? 'New Dentist'),
        email: String(body?.email ?? `dentist${id}@identa.test`),
        practice_name: body?.practice_name ? String(body.practice_name) : null,
        registration_date: isoDaysFromNow(0),
        status: 'active' as const,
        last_login: null,
        patient_count: 0,
        appointment_count: 0,
        active_staff_count: 0,
        total_staff_count: 0,
        subscription: buildSubscription({
            plan: 'trial',
            plan_name: 'Trial',
            billing_period: 'trial',
            status: 'trialing',
            starts_at: isoDaysFromNow(0),
            ends_at: isoDaysFromNow(30),
            trial_ends_at: isoDaysFromNow(30),
            staff_limit: 1,
            payment_method: null,
            payment_amount: null,
        }),
    };

    store.dentists.unshift(dentist);

    return NextResponse.json({ data: dentist }, { status: 201 });
}
