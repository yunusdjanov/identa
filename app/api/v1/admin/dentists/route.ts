import { NextResponse } from 'next/server';
import { buildSubscription, dentistSummary, getAdminStore, isoDaysFromNow, pushAuditEntry } from '@/lib/mock/admin-store';
import { requireAdmin } from '../../_auth';

// Local mock: admin dentist directory (list + create).
export async function GET(request: Request) {
    const auth = await requireAdmin();
    if (auth) return auth;

    const store = getAdminStore();
    const url = new URL(request.url);
    const search = (url.searchParams.get('filter[search]') ?? url.searchParams.get('search') ?? '')
        .trim()
        .toLowerCase();
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
    const perPage = Math.max(1, Number(url.searchParams.get('per_page') ?? '10') || 10);

    const statusFilter = url.searchParams.get('filter[status]');
    const includeDeleted = url.searchParams.get('filter[include_deleted]') === '1';

    let items = store.dentists;
    if (statusFilter) {
        items = items.filter((dentist) => dentist.status === statusFilter);
    } else if (!includeDeleted) {
        // Match backend: hide soft-deleted accounts unless explicitly requested.
        items = items.filter((dentist) => dentist.status !== 'deleted');
    }
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
    const auth = await requireAdmin();
    if (auth) return auth;

    const store = getAdminStore();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    // Mirror backend StoreDentistRequest validation. Without these checks
    // the mock accepts any payload (even `{}`) and would happily produce
    // duplicate-email rows that the real backend would reject with 422.
    const errors: Record<string, string[]> = {};

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 3 || name.length > 255) {
        errors.name = ['Name must be between 3 and 255 characters.'];
    }

    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!isValidEmail) {
        errors.email = ['Provide a valid email address.'];
    } else if (store.dentists.some((d) => d.email.toLowerCase() === email.toLowerCase())) {
        errors.email = ['An account already uses this email. Restore it from the archive if it was deleted.'];
    }

    const password = typeof body.password === 'string' ? body.password : '';
    const confirmation = typeof body.password_confirmation === 'string' ? body.password_confirmation : '';
    const hasLetters = /[A-Za-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    if (password.length < 8) {
        errors.password = ['Password must be at least 8 characters.'];
    } else if (!hasLetters || !hasNumbers) {
        errors.password = ['Password must contain both letters and numbers.'];
    } else if (password !== confirmation) {
        errors.password = ['Password confirmation does not match.'];
    }

    if (typeof body.phone === 'string' && body.phone !== '' && !/^\+\d{9,15}$/.test(body.phone)) {
        errors.phone = ['Phone must start with + and contain 9–15 digits.'];
    }

    if (Object.keys(errors).length > 0) {
        return NextResponse.json({ message: 'Validation failed.', errors }, { status: 422 });
    }

    const id = String(store.nextDentistId++);
    // Read live trial plan so renames / staff_limit / trial_days tweaks via
    // /admin/plans flow through to the new dentist's seed subscription —
    // matches production behaviour of reading the Plan row.
    const trialPlan = store.plans.find((p) => p.code === 'trial');
    const trialDays = trialPlan?.trial_days ?? 30;

    const dentist = {
        id,
        name,
        email,
        email_verified: true,
        avatar_url: null,
        practice_name: typeof body.practice_name === 'string' && body.practice_name !== ''
            ? body.practice_name
            : null,
        registration_date: isoDaysFromNow(0),
        status: 'active' as const,
        last_login: null,
        patient_count: 0,
        appointment_count: 0,
        active_staff_count: 0,
        total_staff_count: 0,
        subscription: buildSubscription({
            plan: 'trial',
            plan_name: trialPlan?.name ?? 'Trial',
            billing_period: 'trial',
            status: 'trialing',
            starts_at: isoDaysFromNow(0),
            ends_at: isoDaysFromNow(trialDays),
            trial_ends_at: isoDaysFromNow(trialDays),
            staff_limit: trialPlan?.staff_limit ?? 1,
            payment_method: null,
            payment_amount: null,
        }),
    };

    store.dentists.unshift(dentist);

    pushAuditEntry({
        eventType: 'admin.dentist.created',
        entityType: 'user',
        entityId: id,
        metadata: {
            email,
            subscription_plan: 'trial',
        },
    });

    return NextResponse.json({ data: dentist }, { status: 201 });
}
