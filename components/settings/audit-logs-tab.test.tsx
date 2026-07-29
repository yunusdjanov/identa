import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditLogsTab } from '@/components/settings/audit-logs-tab';
import { listAuditLogs } from '@/lib/api/dentist';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

vi.mock('@/lib/api/dentist', () => ({
    listAuditLogs: vi.fn(),
}));

function renderTab() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });

    return render(
        <QueryClientProvider client={queryClient}>
            <AuditLogsTab
                canViewAuditLogs
                t={(key, variables) => {
                    const template = DICTIONARIES.en[key] ?? key;
                    return Object.entries(variables ?? {}).reduce(
                        (value, [name, replacement]) =>
                            value.replaceAll(`{{${name}}}`, String(replacement)),
                        template
                    );
                }}
            />
        </QueryClientProvider>
    );
}

describe('AuditLogsTab', () => {
    beforeEach(() => {
        vi.mocked(listAuditLogs).mockResolvedValue({
            data: [
                {
                    id: 'log-profile',
                    event_type: 'settings.profile.updated',
                    entity_type: 'user',
                    entity_id: 'user-1',
                    actor_role: 'dentist',
                    actor: {
                        id: 'user-1',
                        name: 'Demo Dentist',
                        email: 'dentist@identa.test',
                        role: 'dentist',
                    },
                    ip_address: '127.0.0.1',
                    user_agent: null,
                    metadata: null,
                    created_at: '2026-07-26T10:00:00Z',
                },
                {
                    id: 'log-staff',
                    event_type: 'team.assistant.updated',
                    entity_type: 'user',
                    entity_id: 'assistant-1',
                    actor_role: 'dentist',
                    actor: {
                        id: 'user-1',
                        name: 'Demo Dentist',
                        email: 'dentist@identa.test',
                        role: 'dentist',
                    },
                    ip_address: '127.0.0.1',
                    user_agent: null,
                    metadata: null,
                    created_at: '2026-07-26T10:01:00Z',
                },
            ],
            meta: {
                event_types: [
                    'settings.profile.updated',
                    'team.assistant.updated',
                ],
                pagination: {
                    page: 1,
                    per_page: 10,
                    total: 2,
                    total_pages: 1,
                },
            },
        } as never);
    });

    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it('shows visible events and builds the filter from backend metadata', async () => {
        const user = userEvent.setup();
        renderTab();

        expect(await screen.findByText('Settings profile updated')).toBeInTheDocument();
        expect(screen.getByText('Staff member updated')).toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: /search by event/i })).toBeInTheDocument();
        expect(screen.getByLabelText('Start date')).toBeInTheDocument();
        expect(screen.getByLabelText('End date')).toBeInTheDocument();

        await user.click(screen.getByRole('combobox', { name: 'All event types' }));
        expect(screen.getByRole('option', { name: 'Settings profile updated' })).toBeInTheDocument();
        expect(screen.queryByRole('option', { name: 'Signed in' })).not.toBeInTheDocument();
        expect(screen.queryByText('No log entries found.')).not.toBeInTheDocument();
    });
});
