import { afterEach, describe, expect, it, vi } from 'vitest';

import { getAdminStore } from '@/lib/mock/admin-store';
import { requireDentist } from '../../_auth';
import { DELETE, PUT } from './[id]/route';
import { POST as RESET_PASSWORD } from './[id]/reset-password/route';
import { PATCH as UPDATE_STATUS } from './[id]/status/route';
import { GET, POST } from './route';

vi.mock('../../_auth', () => ({
    requireDentist: vi.fn(async () => null),
}));

const initialStore = structuredClone(getAdminStore());

function jsonRequest(url: string, method: string, body: unknown): Request {
    return new Request(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function createPayload(overrides: Record<string, unknown> = {}) {
    return {
        name: 'Test Assistant',
        email: 'test.assistant@example.com',
        phone: '+998901234567',
        password: 'StrongPassword123!',
        password_confirmation: 'StrongPassword123!',
        permissions: ['patients.view'],
        ...overrides,
    };
}

describe('team assistants mock routes', () => {
    afterEach(() => {
        vi.mocked(requireDentist).mockResolvedValue(null);
        Object.assign(getAdminStore(), structuredClone(initialStore));
    });

    it('filters and paginates the roster while keeping tenant-wide summary counts', async () => {
        const response = await GET(new Request(
            'http://localhost/api/v1/team/assistants?filter[search]=zulfiya&filter[status]=active&page=1&per_page=1'
        ));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.data).toEqual([expect.objectContaining({ id: '101' })]);
        expect(payload.meta).toMatchObject({
            pagination: { page: 1, per_page: 1, total: 1, total_pages: 1 },
            summary: { total_count: 3, active_count: 2, blocked_count: 1 },
        });
    });

    it('rejects unsupported permissions, duplicate emails, and a full staff plan', async () => {
        const invalid = await POST(jsonRequest(
            'http://localhost/api/v1/team/assistants',
            'POST',
            createPayload({
                email: 'zulfiya@identa.uz',
                permissions: ['admin.everything'],
            })
        ));
        expect(invalid.status).toBe(422);
        expect(await invalid.json()).toMatchObject({
            errors: {
                email: expect.any(Array),
                permissions: expect.any(Array),
            },
        });

        const store = getAdminStore();
        const dentist = store.dentists.find((candidate) => candidate.id === '1');
        if (!dentist?.subscription) throw new Error('Mock dentist subscription is missing.');
        dentist.subscription.staff_limit = 2;

        const full = await POST(jsonRequest(
            'http://localhost/api/v1/team/assistants',
            'POST',
            createPayload()
        ));
        expect(full.status).toBe(403);
        expect(await full.json()).toMatchObject({
            error: { code: 'plan_staff_limit_reached', meta: { limit: 2 } },
        });
    });

    it('keeps lifecycle validation and audit metadata free of contact details', async () => {
        const createdResponse = await POST(jsonRequest(
            'http://localhost/api/v1/team/assistants',
            'POST',
            createPayload()
        ));
        expect(createdResponse.status).toBe(201);
        const created = await createdResponse.json() as { data: { id: string } };

        const updatedResponse = await PUT(
            jsonRequest(
                `http://localhost/api/v1/team/assistants/${created.data.id}`,
                'PUT',
                {
                    name: 'Updated Assistant',
                    email: 'updated.assistant@example.com',
                    phone: '+998909876543',
                    permissions: ['patients.manage'],
                }
            ),
            { params: Promise.resolve({ id: created.data.id }) }
        );
        expect(updatedResponse.status).toBe(200);
        expect(await updatedResponse.json()).toMatchObject({
            data: {
                assistant_permissions: ['patients.view', 'patients.manage'],
            },
        });

        const deleteResponse = await DELETE(
            new Request(`http://localhost/api/v1/team/assistants/${created.data.id}`, { method: 'DELETE' }),
            { params: Promise.resolve({ id: created.data.id }) }
        );
        expect(deleteResponse.status).toBe(204);

        const deleted = getAdminStore().staffByDentist['1'].find((assistant) => assistant.id === created.data.id);
        expect(deleted).toMatchObject({
            account_status: 'deleted',
            email: `deleted-${created.data.id}@deleted.invalid`,
            phone: null,
        });

        const resetResponse = await RESET_PASSWORD(
            jsonRequest(
                `http://localhost/api/v1/team/assistants/${created.data.id}/reset-password`,
                'POST',
                { new_password: 'AnotherStrong123', new_password_confirmation: 'AnotherStrong123' }
            ),
            { params: Promise.resolve({ id: created.data.id }) }
        );
        expect(resetResponse.status).toBe(404);

        const auditJson = JSON.stringify(getAdminStore().dynamicAuditEntries);
        expect(auditJson).not.toContain('test.assistant@example.com');
        expect(auditJson).not.toContain('updated.assistant@example.com');
        expect(auditJson).not.toContain('+998901234567');
        expect(auditJson).not.toContain('+998909876543');
    });

    it('blocks all team mutations while the subscription is read-only', async () => {
        const store = getAdminStore();
        const dentist = store.dentists.find((candidate) => candidate.id === '1');
        if (!dentist?.subscription) throw new Error('Mock dentist subscription is missing.');
        dentist.subscription.status = 'read_only';
        dentist.subscription.is_read_only = true;

        const response = await UPDATE_STATUS(
            jsonRequest(
                'http://localhost/api/v1/team/assistants/103/status',
                'PATCH',
                { status: 'active' }
            ),
            { params: Promise.resolve({ id: '103' }) }
        );

        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({
            error: { code: 'subscription_read_only' },
        });
        expect(store.staffByDentist['1'].find((assistant) => assistant.id === '103')?.account_status).toBe('blocked');
    });
});
