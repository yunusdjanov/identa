import { afterEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '../../_auth';
import { resolveMockUser } from '../../_mock-users';
import { POST } from './route';

vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({
        get: (name: string) => ({
            mock_role: { value: 'dentist' },
            mock_user_id: { value: 'dentist-1' },
        }[name]),
    })),
}));
vi.mock('../../_auth', () => ({ requireAuth: vi.fn(async () => null) }));

const dentist = resolveMockUser('dentist', 'dentist-1');
const initialDentist = structuredClone(dentist);

function passwordRequest(body: unknown) {
    return new Request('http://localhost/api/v1/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

describe('change-password mock route', () => {
    afterEach(() => {
        vi.mocked(requireAuth).mockResolvedValue(null);
        Object.assign(dentist, structuredClone(initialDentist));
    });

    it('rejects missing current password, weak password, and mismatched confirmation', async () => {
        const response = await POST(passwordRequest({
            new_password: 'weak',
            new_password_confirmation: 'different',
        }));

        expect(response.status).toBe(422);
        expect(await response.json()).toMatchObject({
            errors: {
                current_password: expect.any(Array),
                new_password: expect.any(Array),
                new_password_confirmation: expect.any(Array),
            },
        });
    });

    it('persists the completed password state in subsequent mock reads', async () => {
        dentist.must_change_password = true;
        dentist.has_password = true;

        const response = await POST(passwordRequest({
            new_password: 'StrongPass123',
            new_password_confirmation: 'StrongPass123',
        }));

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            data: { must_change_password: false, has_password: true },
        });
        expect(resolveMockUser('dentist', 'dentist-1').must_change_password).toBe(false);
    });
});
