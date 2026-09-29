import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROFILE } from '../../_mock-data';
import { requireAuth } from '../../_auth';
import { resolveMockUser } from '../../_mock-users';
import { PUT } from './route';

vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({
        get: (name: string) => ({
            mock_role: { value: 'dentist' },
            mock_user_id: { value: 'dentist-1' },
        }[name]),
    })),
}));
vi.mock('../../_auth', () => ({
    requireAuth: vi.fn(async () => null),
    ok: (data: unknown) => Response.json({ data }),
}));

const dentist = resolveMockUser('dentist', 'dentist-1');
const initialProfile = structuredClone(PROFILE);
const initialDentist = structuredClone(dentist);

function updateRequest(body: unknown) {
    return new Request('http://localhost/api/v1/settings/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

describe('settings profile mock route', () => {
    afterEach(() => {
        vi.mocked(requireAuth).mockResolvedValue(null);
        Object.assign(PROFILE, structuredClone(initialProfile));
        Object.assign(dentist, structuredClone(initialDentist));
    });

    it('validates a partial working-hours update against the stored counterpart', async () => {
        const response = await PUT(updateRequest({ working_hours_start: '19:00' }));

        expect(response.status).toBe(422);
        expect(await response.json()).toMatchObject({
            errors: { working_hours_end: expect.any(Array) },
        });
        expect(PROFILE.working_hours).toEqual(initialProfile.working_hours);
    });

    it('requires current-password confirmation only when email changes', async () => {
        const unchanged = await PUT(updateRequest({ email: initialProfile.email, name: 'Updated Dentist' }));
        expect(unchanged.status).toBe(200);

        const changed = await PUT(updateRequest({ email: 'new-dentist@identa.test' }));
        expect(changed.status).toBe(422);
        expect(await changed.json()).toMatchObject({
            errors: { current_password: expect.any(Array) },
        });
    });

    it('persists a cleared optional phone without exposing before/after values', async () => {
        const response = await PUT(updateRequest({ phone: null }));

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ data: { phone: null } });
        expect(PROFILE.phone).toBeNull();
        expect(dentist.phone).toBeNull();
    });
});
