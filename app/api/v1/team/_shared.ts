import { NextResponse } from 'next/server';

import { requireDentist } from '../_auth';
import { getAdminStore } from '@/lib/mock/admin-store';
import type { ApiAssistantAccount } from '@/lib/api/types';

export const MOCK_DENTIST_ID = '1';

export const ALLOWED_ASSISTANT_PERMISSIONS = new Set([
    'patients.view',
    'patients.manage',
    'appointments.view',
    'appointments.manage',
    'payments.view',
    'payments.manage',
]);

export function getMockStaff(): ApiAssistantAccount[] {
    const store = getAdminStore();
    if (!store.staffByDentist[MOCK_DENTIST_ID]) {
        store.staffByDentist[MOCK_DENTIST_ID] = [];
    }
    return store.staffByDentist[MOCK_DENTIST_ID];
}

export function findMockAssistant(id: string) {
    const staff = getMockStaff();
    const index = staff.findIndex((assistant) => assistant.id === id);

    return index >= 0 ? { staff, index, assistant: staff[index] } : null;
}

export async function requireTeamMutationAccess(): Promise<NextResponse | null> {
    const auth = await requireDentist();
    if (auth) return auth;

    const dentist = getAdminStore().dentists.find((candidate) => candidate.id === MOCK_DENTIST_ID);
    if (dentist?.subscription?.is_read_only === true || dentist?.subscription?.status === 'read_only') {
        return NextResponse.json({
            error: {
                code: 'subscription_read_only',
                message: 'The subscription is read-only.',
            },
        }, { status: 403 });
    }

    return null;
}

export function staffLimitErrorWhenFull(excludeAssistantId?: string): NextResponse | null {
    const store = getAdminStore();
    const dentist = store.dentists.find((candidate) => candidate.id === MOCK_DENTIST_ID);
    const limit = dentist?.subscription?.staff_limit;
    if (typeof limit !== 'number') return null;

    const activeCount = getMockStaff().filter((assistant) => (
        assistant.id !== excludeAssistantId && assistant.account_status === 'active'
    )).length;
    if (activeCount < limit) return null;

    return NextResponse.json({
        error: {
            code: 'plan_staff_limit_reached',
            message: `The current plan allows ${limit} active staff accounts.`,
            meta: { limit },
        },
    }, { status: 403 });
}

export function validationFailure(errors: Record<string, string[]>): NextResponse {
    return NextResponse.json({ message: 'Validation failed.', errors }, { status: 422 });
}

export function notFound(): NextResponse {
    return NextResponse.json({ message: 'Not found.' }, { status: 404 });
}
