import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminLayout from '@/app/admin/layout';
import { getCurrentUser } from '@/lib/api/dentist';
import { useAuthStore } from '@/lib/store';

const replaceMock = vi.fn();
let pathname = '/admin';

vi.mock('next/navigation', () => ({
    usePathname: () => pathname,
    useRouter: () => ({ replace: replaceMock }),
}));
vi.mock('@/lib/api/dentist', () => ({
    getCurrentUser: vi.fn(),
}));

const admin = {
    id: 'admin-1',
    name: 'Admin',
    email: 'admin@identa.test',
    role: 'admin' as const,
    account_status: 'active' as const,
};

describe('AdminLayout', () => {
    beforeEach(() => {
        pathname = '/admin';
        replaceMock.mockClear();
        vi.mocked(getCurrentUser).mockReset();
        useAuthStore.getState().setLoggingOut(false);
    });

    afterEach(() => cleanup());

    it('does not mount admin page content before the session role is verified', async () => {
        vi.mocked(getCurrentUser).mockRejectedValue(new Error('Unauthenticated'));
        render(<AdminLayout><div>private admin content</div></AdminLayout>);

        expect(screen.queryByText('private admin content')).not.toBeInTheDocument();
        await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/admin/login'));
    });

    it('redirects a forced-reset admin before mounting another admin page', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({
            ...admin,
            must_change_password: true,
        } as never);
        render(<AdminLayout><div>private admin content</div></AdminLayout>);

        expect(screen.queryByText('private admin content')).not.toBeInTheDocument();
        await waitFor(() => expect(replaceMock).toHaveBeenCalledWith(
            '/admin/settings?forceReset=1'
        ));
    });

    it('mounts verified admin content', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(admin as never);
        render(<AdminLayout><div>private admin content</div></AdminLayout>);

        expect(await screen.findByText('private admin content')).toBeInTheDocument();
    });
});
