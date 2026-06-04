import { list } from '../../_auth';
import { getAdminStore } from '@/lib/mock/admin-store';

// Public marketing-landing plan list (NO auth) — mirrors the Laravel
// `/v1/landing/plans` endpoint so the landing pricing reflects the same
// admin-configured plans the billing flow uses, even in local/mock mode.
export async function GET() {
    const plans = getAdminStore().plans
        .filter((plan) => plan.is_active)
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order);

    return list(plans);
}
