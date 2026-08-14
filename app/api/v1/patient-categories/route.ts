import { NextResponse } from 'next/server';
import { requirePermission } from '../_auth';
import { normalizePatientCategoryPayload, patientCategoryStore } from './_contract';

export async function GET() {
    // Patient categories are scoped to `patients.view` on the backend
    // (routes/api.php line 158). Without this gate the mock leaked the
    // category list to assistants without patients.view.
    const denied = await requirePermission('patients.view');
    if (denied) return denied;
    return NextResponse.json({ data: patientCategoryStore() });
}

export async function POST(request: Request) {
    // POST gated by `patients.manage`.
    const denied = await requirePermission('patients.manage');
    if (denied) return denied;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { errors, payload } = normalizePatientCategoryPayload(body);
    if (Object.keys(errors).length > 0) {
        return NextResponse.json({ message: 'Validation failed.', errors }, { status: 422 });
    }
    const cat = { id: `cat-${Date.now()}`, ...payload };
    patientCategoryStore().push(cat);
    return NextResponse.json({ data: cat }, { status: 201 });
}
