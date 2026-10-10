import { afterEach, describe, expect, it, vi } from 'vitest';

import { requireDentist } from './_auth';
import { resolveMockUser } from './_mock-users';

const { cookieValues } = vi.hoisted(() => ({
    cookieValues: {
        mock_session: 'active',
        mock_role: 'dentist',
        mock_user_id: 'dentist-1',
    } as Record<string, string | undefined>,
}));

vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({
        get: (name: string) => {
            const value = cookieValues[name];
            return value === undefined ? undefined : { value };
        },
    })),
}));

describe('mock dentist auth guard', () => {
    const dentist = resolveMockUser('dentist', 'dentist-1');
    const initialDentist = structuredClone(dentist);

    afterEach(() => {
        Object.assign(dentist, structuredClone(initialDentist));
        Object.assign(cookieValues, {
            mock_session: 'active',
            mock_role: 'dentist',
            mock_user_id: 'dentist-1',
        });
    });

    it('denies application access until a forced password rotation is complete', async () => {
        dentist.must_change_password = true;

        const response = await requireDentist();

        expect(response?.status).toBe(403);
        expect(await response?.json()).toMatchObject({
            error: { code: 'password_change_required' },
        });
    });
});
