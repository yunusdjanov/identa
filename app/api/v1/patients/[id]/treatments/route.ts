import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { canViewFinancials, hasMockPermission, requirePracticePermission } from '../../../_auth';
import { PATIENTS } from '../../../_mock-data';
import { resolveMockUser } from '../../../_mock-users';
import {
    mockTreatmentStore,
    normalizeTreatmentPayload,
    parseTreatmentListQuery,
    scrubTreatmentFinancials,
    sortTreatments,
    treatmentSummary,
} from './_contract';

function validationResponse(errors: Record<string, string[]>) {
    return NextResponse.json({ message: 'Validation failed.', errors }, { status: 422 });
}

async function actorSummary() {
    const cookieStore = await cookies();
    const user = resolveMockUser(cookieStore.get('mock_role')?.value, cookieStore.get('mock_user_id')?.value);
    return { id: user.id, name: user.name, role: user.role };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requirePracticePermission('patients.view');
    if (denied) return denied;
    const { id } = await params;
    if (!PATIENTS.some((patient) => patient.id === id)) return NextResponse.json({ message: 'Not Found.' }, { status: 404 });

    const canSeeFinancials = await canViewFinancials();
    const query = parseTreatmentListQuery(new URL(request.url), canSeeFinancials);
    if (Object.keys(query.errors).length > 0) return validationResponse(query.errors);
    const allItems = sortTreatments(
        mockTreatmentStore.filter((treatment) => treatment.patient_id === id),
        query.sortSegments
    );
    const start = (query.page - 1) * query.perPage;
    const data = allItems.slice(start, start + query.perPage).map((item) => scrubTreatmentFinancials({
        ...item,
        images: query.includeImages ? (item.images ?? []) : [],
    }, canSeeFinancials));

    return NextResponse.json({
        data,
        meta: {
            pagination: {
                page: query.page,
                per_page: query.perPage,
                total: allItems.length,
                total_pages: Math.max(1, Math.ceil(allItems.length / query.perPage)),
            },
            summary: query.includeSummary && canSeeFinancials ? treatmentSummary(allItems) : null,
        },
    });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requirePracticePermission('patients.manage');
    if (denied) return denied;
    const { id } = await params;
    const patient = PATIENTS.find((item) => item.id === id);
    if (!patient) return NextResponse.json({ message: 'Not Found.' }, { status: 404 });
    if (patient.is_archived) return validationResponse({ patient: ['Restore the archived patient before adding entries.'] });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { errors, payload } = normalizeTreatmentPayload(body);
    if (Object.keys(errors).length > 0) return validationResponse(errors);
    const canSetFinancials = await hasMockPermission('payments.manage');
    const canSeeFinancials = await canViewFinancials();
    const safePayload = { ...payload };
    if (!canSetFinancials) {
        delete safePayload.cost;
        delete safePayload.debt_amount;
        delete safePayload.paid_amount;
        delete safePayload.currency;
    }
    const actor = await actorSummary();
    const debtAmount = Number(safePayload.debt_amount ?? safePayload.cost ?? 0);
    const paidAmount = Number(safePayload.paid_amount ?? 0);
    const now = new Date().toISOString();
    const treatment = {
        id: `trt-${Date.now()}`,
        patient_id: id,
        tooth_number: payload.tooth_number ?? null,
        teeth: payload.teeth ?? [],
        description: null,
        comment: null,
        notes: null,
        currency: safePayload.currency ?? 'UZS',
        image_count: 0,
        primary_image: null,
        images: [],
        created_at: now,
        updated_at: now,
        created_by: actor,
        updated_by: actor,
        ...safePayload,
        treatment_type: String(safePayload.treatment_type),
        treatment_date: String(safePayload.treatment_date),
        cost: debtAmount,
        debt_amount: debtAmount,
        paid_amount: paidAmount,
        balance: debtAmount - paidAmount,
    };
    mockTreatmentStore.push(treatment);
    return NextResponse.json({ data: scrubTreatmentFinancials(treatment, canSeeFinancials) }, { status: 201 });
}
