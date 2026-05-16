import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
    AdminLandingLoadingState,
    AuthFormLoadingState,
    PaymentsLoadingState,
    RouteDashboardLoadingState,
} from '@/components/layout/page-loading-skeletons';

describe('page loading skeletons', () => {
    afterEach(() => {
        cleanup();
    });

    it('renders a dashboard-shaped loading state with metric cards and activity panel', () => {
        render(<RouteDashboardLoadingState />);

        expect(screen.getByTestId('dashboard-loading')).toBeInTheDocument();
        expect(screen.getAllByTestId('metric-card-skeleton')).toHaveLength(3);
        expect(screen.getByTestId('activity-panel-skeleton')).toBeInTheDocument();
    });

    it('renders payments loading with summary cards and ledger table blocks', () => {
        render(<PaymentsLoadingState />);

        expect(screen.getByTestId('payments-loading')).toBeInTheDocument();
        expect(screen.getAllByTestId('metric-card-skeleton')).toHaveLength(4);
        expect(screen.getByTestId('ledger-table-skeleton')).toBeInTheDocument();
    });

    it('renders auth form loading states with the requested field count', () => {
        render(<AuthFormLoadingState fieldCount={3} />);

        expect(screen.getByTestId('auth-form-loading')).toBeInTheDocument();
        expect(screen.getAllByTestId('auth-field-skeleton')).toHaveLength(3);
    });

    it('renders admin landing loading with an admin shell and settings panel', () => {
        render(<AdminLandingLoadingState />);

        expect(screen.getByTestId('admin-shell-loading')).toBeInTheDocument();
        expect(screen.getByTestId('admin-landing-panel-skeleton')).toBeInTheDocument();
    });
});
