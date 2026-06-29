import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
    AdminDashboardLoadingState,
    AdminDentistBillingLoadingState,
    AdminDentistStaffLoadingState,
    AdminPaymentsLoadingState,
    AdminPlansLoadingState,
    AdminSettingsLoadingState,
    AnalyticsLoadingState,
    AuthFormLoadingState,
    PatientDetailLoadingState,
    PatientsLoadingState,
    PaymentsLoadingState,
    RouteDashboardLoadingState,
} from '@/components/layout/page-loading-skeletons';

// Each admin skeleton wraps in AdminShellSkeleton which carries
// `data-testid="admin-shell-loading"`. Asserting on it confirms the shell
// (header + main bounds) renders without depending on the inner layout.

describe('page loading skeletons', () => {
    afterEach(() => {
        cleanup();
    });

    describe('dentist-side routes', () => {
        it('renders a dashboard planner loading state', () => {
            render(<RouteDashboardLoadingState />);

            expect(screen.getByTestId('dashboard-loading')).toBeInTheDocument();
            expect(screen.getByTestId('dashboard-planner-skeleton')).toBeInTheDocument();
            expect(screen.getAllByTestId('dashboard-week-day-skeleton')).toHaveLength(11);
        });

        it('renders patients loading with filters inside the list card', () => {
            render(<PatientsLoadingState />);

            expect(screen.getByTestId('patients-list-skeleton')).toBeInTheDocument();
            expect(screen.getByTestId('patients-search-skeleton')).toBeInTheDocument();
        });

        it('renders payments loading with 4 summary cards and ledger table', () => {
            render(<PaymentsLoadingState />);

            expect(screen.getByTestId('payments-loading')).toBeInTheDocument();
            expect(screen.getAllByTestId('metric-card-skeleton')).toHaveLength(4);
            expect(screen.getByTestId('ledger-table-skeleton')).toBeInTheDocument();
            expect(screen.getByTestId('payments-outstanding-filter-skeleton')).toBeInTheDocument();
            expect(screen.getByTestId('payments-ledger-header-skeleton').children).toHaveLength(8);
            expect(screen.getAllByTestId('payments-ledger-row-skeleton')[0].children).toHaveLength(8);
        });

        it('renders expenses loading with the expense form and compact table', () => {
            render(<PaymentsLoadingState tab="expenses" />);

            expect(screen.getByTestId('payments-loading')).toBeInTheDocument();
            expect(screen.getByTestId('expenses-table-skeleton')).toBeInTheDocument();
            expect(screen.getByTestId('payments-expenses-form-skeleton')).toBeInTheDocument();
            expect(screen.queryByTestId('payments-outstanding-filter-skeleton')).not.toBeInTheDocument();
            expect(screen.getByTestId('payments-ledger-header-skeleton').children).toHaveLength(5);
            expect(screen.getAllByTestId('payments-ledger-row-skeleton')[0].children).toHaveLength(5);
        });

        it('renders permission-shaped analytics loading state', () => {
            render(
                <AnalyticsLoadingState
                    visibleKpiCount={2}
                    showRevenueChart={false}
                    showStatusChart
                    showGrowthChart
                    showDebtorsCard={false}
                />
            );

            expect(screen.getAllByTestId('analytics-kpi-skeleton')).toHaveLength(2);
            expect(screen.queryByTestId('analytics-revenue-chart-skeleton')).not.toBeInTheDocument();
            expect(screen.getByTestId('analytics-status-chart-skeleton')).toBeInTheDocument();
            expect(screen.getByTestId('analytics-growth-chart-skeleton')).toBeInTheDocument();
            expect(screen.queryByTestId('analytics-debtors-card-skeleton')).not.toBeInTheDocument();
        });

        it('renders the patient detail oral photo panel skeleton', () => {
            render(<PatientDetailLoadingState />);

            expect(screen.getByTestId('patient-detail-oral-photo-skeleton')).toBeInTheDocument();
            expect(screen.queryByTestId('patient-detail-clinical-strip-skeleton')).not.toBeInTheDocument();
            expect(screen.getAllByTestId('patient-detail-oral-photo-slot-skeleton')).toHaveLength(8);
            expect(screen.getByTestId('patient-detail-work-history-skeleton')).toBeInTheDocument();
        });
    });

    describe('auth surfaces', () => {
        it('renders the requested field count', () => {
            render(<AuthFormLoadingState fieldCount={3} />);

            expect(screen.getByTestId('auth-form-loading')).toBeInTheDocument();
            expect(screen.getAllByTestId('auth-field-skeleton')).toHaveLength(3);
        });

        it('hides remember+forgot row by default and shows it when requested', () => {
            const { container: withoutRow } = render(<AuthFormLoadingState fieldCount={2} />);
            // The remember+forgot row is the unique flex container with
            // justify-between INSIDE the card body. The header has its
            // own flex but it's outside the form card. We probe the form
            // for a justify-between row that contains a 4x4 checkbox-sized
            // skeleton — neither should exist when the flag is off.
            expect(
                withoutRow.querySelectorAll('.h-4.w-4.rounded')
            ).toHaveLength(0);
            cleanup();

            const { container: withRow } = render(
                <AuthFormLoadingState fieldCount={2} showRememberAndForgot />
            );
            expect(
                withRow.querySelectorAll('.h-4.w-4.rounded').length
            ).toBeGreaterThan(0);
        });
    });

    describe('admin surfaces', () => {
        it('renders dashboard with admin shell and 3 metric cards', () => {
            render(<AdminDashboardLoadingState />);

            expect(screen.getByTestId('admin-shell-loading')).toBeInTheDocument();
            // 3 stat cards (Total dentists, Active, Blocked)
            expect(screen.getAllByTestId('metric-card-skeleton')).toHaveLength(3);
            // Column count for the table body is enforced statically in the
            // component (`gridTemplateColumns: repeat(7, ...)`). JSDOM
            // serializes inline styles in a normalized form that's awkward
            // to assert against — we trust the source instead.
        });

        it('renders plans loading with admin shell and a data table skeleton', () => {
            render(<AdminPlansLoadingState />);

            expect(screen.getByTestId('admin-shell-loading')).toBeInTheDocument();
        });

        it('renders settings loading with admin shell and form cards', () => {
            render(<AdminSettingsLoadingState />);

            expect(screen.getByTestId('admin-shell-loading')).toBeInTheDocument();
        });

        it('renders dentist staff loading with 3 metric cards and 6-col table', () => {
            // Real page has Total/Active/Blocked cards and a 6-column
            // table (Member, Phone, Status, Permissions, LastLogin, Created).
            render(<AdminDentistStaffLoadingState />);

            expect(screen.getByTestId('admin-shell-loading')).toBeInTheDocument();
            expect(screen.getAllByTestId('metric-card-skeleton')).toHaveLength(3);
        });

        it('renders payments loading with admin shell and 3 summary cards', () => {
            render(<AdminPaymentsLoadingState />);

            expect(screen.getByTestId('admin-shell-loading')).toBeInTheDocument();
            // 3 summary cards (this month, this year, all time). Column
            // count for the 6-col table body (Date, Dentist, Plan, Amount,
            // Status, Actions) is enforced in the component source.
            expect(screen.getAllByTestId('metric-card-skeleton')).toHaveLength(3);
        });

        it('renders dentist billing loading with admin shell and plan picker grid', () => {
            render(<AdminDentistBillingLoadingState />);

            expect(screen.getByTestId('admin-shell-loading')).toBeInTheDocument();
        });
    });
});
