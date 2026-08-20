import { describe, expect, it, vi } from 'vitest';
import { redirect } from 'next/navigation';
import LegacyOdontogramPage from '@/app/(protected)/patients/[id]/odontogram/page';

vi.mock('next/navigation', () => ({
    redirect: vi.fn(),
}));

describe('legacy odontogram route', () => {
    it('preserves old links by redirecting to patient history', async () => {
        await LegacyOdontogramPage({ params: Promise.resolve({ id: 'patient/one' }) });

        expect(redirect).toHaveBeenCalledWith('/patients/patient%2Fone/history');
    });
});
