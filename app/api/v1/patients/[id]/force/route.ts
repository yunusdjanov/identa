import { NextResponse } from 'next/server';
import { requireAuth } from '../../../_auth';

// Mock stub for permanent (force) patient deletion. The real Laravel backend
// cascade-deletes all related records + purges storage files; locally we just
// acknowledge so the type-to-confirm delete flow can be exercised end-to-end.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    await params;
    return NextResponse.json({ message: 'Permanently deleted.' });
}
