import { NextResponse } from 'next/server';
import { getAdminStore, isoDaysFromNow } from '@/lib/mock/admin-store';

// Local mock: update a subscription plan's pricing/limits.
export async function PUT(request: Request, { params }: { params: Promise<{ code: string }> }) {
    const { code } = await params;
    const plan = getAdminStore().plans.find((item) => item.code === code);
    if (!plan) {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    // `??` only falls back on null/undefined, so explicit `false`/`0` are honoured.
    plan.name = body?.name ?? plan.name;
    plan.description = body?.description ?? plan.description;
    plan.trial_days = body?.trial_days ?? plan.trial_days;
    plan.monthly_price = body?.monthly_price ?? plan.monthly_price;
    plan.yearly_price = body?.yearly_price ?? plan.yearly_price;
    plan.currency = body?.currency ?? plan.currency;
    plan.staff_limit = body?.staff_limit ?? plan.staff_limit;
    plan.entry_image_limit = body?.entry_image_limit ?? plan.entry_image_limit;
    plan.upload_max_mb = body?.upload_max_mb ?? plan.upload_max_mb;
    plan.stored_image_max_mb = body?.stored_image_max_mb ?? plan.stored_image_max_mb;
    plan.can_export = typeof body?.can_export === 'boolean' ? body.can_export : plan.can_export;
    plan.is_active = typeof body?.is_active === 'boolean' ? body.is_active : plan.is_active;
    plan.sort_order = body?.sort_order ?? plan.sort_order;
    plan.updated_at = isoDaysFromNow(0);

    return NextResponse.json({ data: plan });
}
