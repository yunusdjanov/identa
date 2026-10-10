import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamAccessTab } from '@/components/settings/team-access-tab';
import { listAssistants, updateAssistantStatus } from '@/lib/api/dentist';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
    usePathname: () => '/staff',
    useRouter: () => ({ replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/api/dentist', () => ({
    createAssistant: vi.fn(),
    deleteAssistant: vi.fn(),
    listAssistants: vi.fn(),
    resetAssistantPassword: vi.fn(),
    updateAssistant: vi.fn(),
    updateAssistantStatus: vi.fn(),
}));

vi.mock('@/components/ui/avatar', () => ({
    Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    AvatarImage: (props: React.ImgHTMLAttributes<HTMLImageElement>) =>
        React.createElement('img', props),
    AvatarFallback: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

function translate(key: string, variables?: Record<string, string | number>): string {
    const template = DICTIONARIES.en[key] ?? key;
    return Object.entries(variables ?? {}).reduce(
        (value, [name, replacement]) =>
            value.replaceAll(`{{${name}}}`, String(replacement)),
        template
    );
}

function renderTeamAccess() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });

    return render(
        <QueryClientProvider client={queryClient}>
            <TeamAccessTab canManageTeam t={translate} />
        </QueryClientProvider>
    );
}

describe('TeamAccessTab', () => {
    beforeEach(() => {
        vi.mocked(listAssistants).mockResolvedValue({
            data: [{
                id: 'assistant-1',
                name: 'Photo Assistant',
                email: 'assistant@example.com',
                phone: '+998901234567',
                avatar_url: 'https://cdn.example.com/assistant.jpg',
                account_status: 'active',
                assistant_permissions: ['patients.view'],
                must_change_password: false,
                last_login_at: '2026-07-26T10:00:00Z',
                created_at: '2026-07-01T10:00:00Z',
            }],
            meta: {
                pagination: {
                    page: 1,
                    per_page: 10,
                    total: 1,
                    total_pages: 1,
                },
            },
        });
    });

    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it('renders staff avatars and an accessible search control', async () => {
        renderTeamAccess();

        const avatar = await screen.findByRole('img', { name: 'Photo Assistant' });
        expect(avatar).toHaveAttribute('src', 'https://cdn.example.com/assistant.jpg');
        expect(screen.getByRole('textbox', { name: /search by name/i })).toBeInTheDocument();
    });

    it('debounces staff search before requesting filtered data', async () => {
        renderTeamAccess();
        await screen.findByRole('img', { name: 'Photo Assistant' });

        fireEvent.change(screen.getByRole('textbox', { name: /search by name/i }), {
            target: { value: 'photo' },
        });

        expect(listAssistants).toHaveBeenCalledTimes(1);
        await waitFor(() => {
            expect(listAssistants).toHaveBeenLastCalledWith(expect.objectContaining({
                filter: expect.objectContaining({ search: 'photo' }),
            }));
        });
    });

    it('requires confirmation before blocking a staff account', async () => {
        vi.mocked(updateAssistantStatus).mockResolvedValue({} as never);
        renderTeamAccess();

        fireEvent.click(await screen.findByRole('button', { name: 'Block' }));
        expect(updateAssistantStatus).not.toHaveBeenCalled();

        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByRole('heading', { name: 'Block Staff Member' })).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Block' }));

        await waitFor(() => {
            expect(updateAssistantStatus).toHaveBeenCalledWith('assistant-1', 'blocked');
        });
    });

    it('offers a retry when the roster request fails', async () => {
        vi.mocked(listAssistants)
            .mockRejectedValueOnce(new Error('network failed'))
            .mockResolvedValueOnce({
                data: [],
                meta: {
                    pagination: { page: 1, per_page: 10, total: 0, total_pages: 1 },
                },
            });
        renderTeamAccess();

        fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));

        await waitFor(() => expect(listAssistants).toHaveBeenCalledTimes(2));
    });

    it('does not allow editing a deleted staff account', async () => {
        vi.mocked(listAssistants).mockResolvedValueOnce({
            data: [{
                id: 'assistant-deleted',
                name: 'Deleted Assistant',
                email: 'deleted@example.com',
                phone: null,
                avatar_url: null,
                account_status: 'deleted',
                assistant_permissions: [],
                must_change_password: false,
                last_login_at: null,
                created_at: null,
            }],
            meta: {
                pagination: { page: 1, per_page: 10, total: 1, total_pages: 1 },
            },
        });
        renderTeamAccess();

        expect(await screen.findByRole('button', { name: 'Edit' })).toBeDisabled();
    });
});
