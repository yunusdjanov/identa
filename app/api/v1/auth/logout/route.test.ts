import { describe, expect, it } from 'vitest';
import { POST } from '@/app/api/v1/auth/logout/route';

describe('mock auth logout route', () => {
    it('expires every mock identity cookie', async () => {
        const response = await POST();
        const setCookies = response.headers.getSetCookie().join('\n');

        expect(setCookies).toContain('mock_session=');
        expect(setCookies).toContain('mock_role=');
        expect(setCookies).toContain('mock_user_id=');
    });
});
