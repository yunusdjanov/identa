import { canViewFinancials, forbidden, list, requireAuth } from '../_auth';
import { AUDIT_LOGS } from '../_mock-data';
import { getDynamicAuditEntries } from '@/lib/mock/admin-store';
import { cookies } from 'next/headers';

// Mirrors `AuditLogResource::FINANCIAL_METADATA_KEYS` on the backend.
// When the viewer lacks payments.view, scrub money-shaped keys from the
// metadata so an audit-logs.view-permissioned viewer (e.g. an assistant
// who somehow has audit access in a future role expansion) cannot read
// out payment amounts via the audit feed.
const FINANCIAL_METADATA_KEYS = new Set([
    'amount',
    'cost',
    'debt_amount',
    'paid_amount',
    'total_amount',
    'total_paid',
    'total_debt',
    'balance',
    'unit_price',
    'total_price',
    'refund_amount',
    'payment_amount',
    'price',
]);

function scrubFinancialMetadata(metadata: unknown): unknown {
    if (metadata === null || metadata === undefined) return metadata;
    if (Array.isArray(metadata)) {
        return metadata.map((item) => scrubFinancialMetadata(item));
    }
    if (typeof metadata !== 'object') return metadata;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
        if (FINANCIAL_METADATA_KEYS.has(key)) {
            result[key] = '[REDACTED]';
            continue;
        }
        result[key] = value !== null && typeof value === 'object'
            ? scrubFinancialMetadata(value)
            : value;
    }
    return result;
}

export async function GET(request: Request) {
    const auth = await requireAuth();
    if (auth) return auth;

    // /audit-logs is dentist-only on the real backend (see
    // backend/routes/api.php — route is in `role:dentist` group). Even an
    // assistant with `audit_logs.view` permission gets 403 — the feature
    // doesn't exist for staff because the audit feed includes the
    // dentist's billing actions and we never want staff seeing those.
    // Without this gate the mock silently lets every authed session read
    // the entire audit table, masking the real backend's denial path.
    const cookieStore = await cookies();
    if (cookieStore.get('mock_role')?.value !== 'dentist') {
        return forbidden();
    }

    const canSeeFinancials = await canViewFinancials();

    const url = new URL(request.url);
    const entityType = url.searchParams.get('filter[entity_type]');
    const entityId = url.searchParams.get('filter[entity_id]');
    const eventType = url.searchParams.get('filter[event_type]');
    const actorId = url.searchParams.get('filter[actor_id]');
    const dateFrom = url.searchParams.get('filter[date_from]');
    const dateTo = url.searchParams.get('filter[date_to]');
    const search = url.searchParams.get('filter[search]');

    // Merge runtime entries (admin mutations performed in mock mode) with
    // the static seed so the UI audit panel reflects everything an admin
    // has done in this session.
    let items = [...getDynamicAuditEntries(), ...AUDIT_LOGS];

    if (entityType) {
        items = items.filter((entry) => entry.entity_type === entityType);
    }
    if (entityId) {
        items = items.filter((entry) => entry.entity_id === entityId);
    }
    if (eventType) {
        items = items.filter((entry) => entry.event_type === eventType);
    }
    if (actorId) {
        items = items.filter((entry) => entry.actor?.id === actorId);
    }
    if (dateFrom) {
        const from = new Date(dateFrom).getTime();
        if (!Number.isNaN(from)) {
            items = items.filter((entry) => new Date(entry.created_at ?? 0).getTime() >= from);
        }
    }
    if (dateTo) {
        const to = new Date(dateTo).getTime();
        if (!Number.isNaN(to)) {
            items = items.filter((entry) => new Date(entry.created_at ?? 0).getTime() <= to);
        }
    }
    if (search) {
        const needle = search.toLowerCase();
        items = items.filter((entry) =>
            entry.event_type.toLowerCase().includes(needle)
            || (entry.actor?.name?.toLowerCase().includes(needle) ?? false)
        );
    }

    // Newest first.
    items = [...items].sort((a, b) => {
        const ta = new Date(a.created_at ?? 0).getTime();
        const tb = new Date(b.created_at ?? 0).getTime();
        return tb - ta;
    });

    // Scrub financial metadata for viewers without payments.view —
    // matches backend AuditLogResource.
    const scrubbed = canSeeFinancials
        ? items
        : items.map((entry) => ({
            ...entry,
            metadata: scrubFinancialMetadata(entry.metadata) as typeof entry.metadata,
        }));

    return list(scrubbed);
}
