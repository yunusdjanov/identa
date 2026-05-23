import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function requireAuth(): Promise<NextResponse | null> {
    const cookieStore = await cookies();
    if (!cookieStore.get('mock_session')) {
        return NextResponse.json({ message: 'Unauthenticated.' }, { status: 401 });
    }
    return null;
}

export function ok<T>(data: T) {
    return NextResponse.json({ data });
}

export function list<T>(data: T[], total?: number) {
    return NextResponse.json({
        data,
        meta: { pagination: { page: 1, per_page: 50, total: total ?? (data as unknown[]).length, total_pages: 1 } },
    });
}
