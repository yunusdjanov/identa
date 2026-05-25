import { NextResponse } from 'next/server';

export async function POST() {
    const response = NextResponse.json({
        data: {
            id: 'dentist-1',
            name: 'Zohid Yunusjonov',
            email: 'yunusdjanov@gmail.com',
            role: 'dentist',
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
    response.cookies.set('mock_session', '1', { httpOnly: true, path: '/' });
    return response;
}
