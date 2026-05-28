import { requireAuth, ok } from '../../../_auth';
import { PATIENTS } from '../../../_mock-data';

// Mock stub for restoring an archived patient.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    const { id } = await params;
    const patient = PATIENTS.find((p) => p.id === id) ?? PATIENTS[0];
    return ok({ ...patient, is_archived: false });
}
