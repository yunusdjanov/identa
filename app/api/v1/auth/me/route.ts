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
            subscription: {
                status: 'active',
                plan: 'pro',
                trial_ends_at: null,
                upload_max_mb: 50,
                stored_image_max_mb: 500,
            },
        },
    });
}
