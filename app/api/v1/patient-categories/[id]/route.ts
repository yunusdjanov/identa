import { NextResponse } from 'next/server';
import { requirePermission } from '../../_auth';
import { PATIENTS } from '../../_mock-data';
import { normalizePatientCategoryPayload, patientCategoryStore } from '../_contract';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requirePermission('patients.manage');
    if (denied) return denied;
    const { id } = await params;
    const category = patientCategoryStore().find((candidate) => candidate.id === id);
    if (!category) {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { errors, payload } = normalizePatientCategoryPayload(body, id);
    if (Object.keys(errors).length > 0) {
        return NextResponse.json({ message: 'Validation failed.', errors }, { status: 422 });
    }
    Object.assign(category, payload);
    return NextResponse.json({ data: category });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requirePermission('patients.manage');
    if (denied) return denied;
    const { id } = await params;
    const categoryIndex = patientCategoryStore().findIndex((category) => category.id === id);
    if (categoryIndex < 0) {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }

    patientCategoryStore().splice(categoryIndex, 1);
    for (const patient of PATIENTS) {
        patient.categories = patient.categories.filter((category) => category.id !== id);
    }
    return new NextResponse(null, { status: 204 });
}
