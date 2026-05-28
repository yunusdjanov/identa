import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
    const cookieStore = await cookies();
    if (!cookieStore.get('mock_session')) {
        return NextResponse.json({ message: 'Unauthenticated.' }, { status: 401 });
    }

    return NextResponse.json({
        data: {
            id: 'dentist-1',
            name: 'Zohid Yunusjonov',
            email: 'yunusdjanov@gmail.com',
            role: 'dentist',
            email_verified: false,
            subscription: {
                status: 'active',
                plan: 'pro',
                trial_ends_at: null,
                upload_max_mb: 8,
                stored_image_max_mb: 80,
                can_export: true,
                staff_limit: 5,
                entry_image_limit: 10,
            },
        },
    });
}
