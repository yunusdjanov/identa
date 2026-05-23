import { requireAuth, ok } from '../../../../_auth';
import { ODONTOGRAM } from '../../../../_mock-data';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    const { id } = await params;
    const entries = ODONTOGRAM[id] ?? [];
    const latest = entries.map((e: unknown) => {
        const entry = e as { tooth_number: number; condition_type: string; condition_date: string; created_at: string };
        return { tooth_number: entry.tooth_number, condition_type: entry.condition_type, history_count: 1, condition_date: entry.condition_date, created_at: entry.created_at };
    });
    return ok({ total_entries: entries.length, affected_teeth_count: entries.length, latest_conditions: latest });
}
