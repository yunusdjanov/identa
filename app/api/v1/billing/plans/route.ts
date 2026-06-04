import { requireAuth, list } from '../../_auth';
import { getAdminStore } from '@/lib/mock/admin-store';

// Public-facing plan list (used by registration, pricing page, billing flow).
// Sourced from the admin store so admin edits propagate immediately, and
// inactive plans are filtered out — dentists never see drafts or retired tiers.
export async function GET() {
    const auth = await requireAuth();
    if (auth) return auth;

    const plans = getAdminStore().plans
        .filter((plan) => plan.is_active)
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order);

    return list(plans);
}
