import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// Mock stub for the email-verification resend endpoint. The real Laravel
// backend sends an actual verification email; locally we just acknowledge so
// the in-app banner + resend UX can be exercised without a mail server.
export async function POST() {
    const cookieStore = await cookies();
    if (!cookieStore.get('mock_session')) {
        return NextResponse.json({ message: 'Unauthenticated.' }, { status: 401 });
    }

    return NextResponse.json({
        message: 'A verification link has been sent to your email.',
        email_verified: false,
    });
}
