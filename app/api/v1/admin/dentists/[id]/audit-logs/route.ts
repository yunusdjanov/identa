import { NextResponse } from 'next/server';
import { getDynamicAuditEntries } from '@/lib/mock/admin-store';
import { requireAdmin } from '../../../../_auth';

export async function GET(
    request: Request,
    context: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin();
    if (auth) return auth;

    const { id } = await context.params;
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
    const perPage = Math.min(
        100,
        Math.max(1, Number(url.searchParams.get('per_page') ?? '10') || 10)
    );

    const entries = getDynamicAuditEntries().filter((entry) => {
        const metadataUserId =
            entry.metadata && typeof entry.metadata === 'object'
                ? entry.metadata.user_id
                : undefined;

        return (entry.entity_type === 'user' && entry.entity_id === id)
            || metadataUserId === id;
    });
    const total = entries.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const data = entries.slice((page - 1) * perPage, page * perPage);

    return NextResponse.json({
        data,
        meta: {
            pagination: {
                page,
                per_page: perPage,
                total,
                total_pages: totalPages,
            },
        },
    });
}
