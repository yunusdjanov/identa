import { NextResponse } from 'next/server';
import { getAdminStore } from '@/lib/mock/admin-store';

// Local mock: landing-page pricing/contact settings (admin editor).
export async function GET() {
    const store = getAdminStore();
    return NextResponse.json({ data: { ...store.landing, plans: store.plans } });
}

export async function PUT(request: Request) {
    const store = getAdminStore();
    const body = await request.json().catch(() => ({}));

    store.landing = {
        ...store.landing,
        trial_price_amount: body?.trial_price_amount ?? store.landing.trial_price_amount,
        monthly_price_amount: body?.monthly_price_amount ?? store.landing.monthly_price_amount,
        yearly_price_amount: body?.yearly_price_amount ?? store.landing.yearly_price_amount,
        telegram_contact_url:
            body?.telegram_contact_url !== undefined
                ? body.telegram_contact_url
                : store.landing.telegram_contact_url,
    };

    return NextResponse.json({ data: { ...store.landing, plans: store.plans } });
}
