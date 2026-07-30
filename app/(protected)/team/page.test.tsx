import { describe, expect, it, vi } from 'vitest';
import LegacyTeamPage from '@/app/(protected)/team/page';
import { redirect } from 'next/navigation';

vi.mock('next/navigation', () => ({
    redirect: vi.fn(),
}));

describe('LegacyTeamPage', () => {
    it('redirects the legacy /team route to /staff', () => {
        LegacyTeamPage();
        expect(redirect).toHaveBeenCalledWith('/staff');
    });
});
