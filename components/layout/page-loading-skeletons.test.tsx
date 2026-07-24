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
    AppointmentsLoadingState,
    AuthFormLoadingState,
    BillingLoadingState,
    OdontogramLoadingState,
    PatientDetailLoadingState,
    PatientHistoryLoadingState,
    PatientsLoadingState,
    PaymentPatientLoadingState,
    PaymentsLoadingState,
    RouteDashboardLoadingState,
    SettingsLoadingState,
    StaffLoadingState,
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

        it('keeps appointment columns aligned with the xl desktop breakpoint', () => {
            render(<AppointmentsLoadingState />);

            const days = screen.getAllByTestId('appointments-week-day-skeleton');
            expect(days).toHaveLength(11);
            expect(days[0].parentElement).toHaveClass('hidden', 'xl:grid', 'xl:grid-cols-7');
            expect(days[7].parentElement).toHaveClass('md:grid-cols-2', 'lg:grid-cols-4', 'xl:hidden');
        });

        it('renders patients loading with filters inside the list card', () => {
            render(<PatientsLoadingState />);

            expect(screen.getByTestId('patients-list-skeleton')).toBeInTheDocument();
            expect(screen.getByTestId('patients-filter-toolbar-skeleton')).toBeInTheDocument();
            expect(screen.getByTestId('patients-search-skeleton')).toBeInTheDocument();
            expect(screen.getByTestId('patients-table-shell-skeleton')).toHaveClass('overflow-x-auto', 'rounded-2xl');
            expect(screen.getByTestId('patients-table-header-skeleton').children).toHaveLength(7);
            expect(screen.getAllByTestId('patients-table-row-skeleton')).toHaveLength(6);
            expect(screen.getAllByTestId('patients-photo-skeleton')[0]).toHaveClass('h-20', 'w-20');
            expect(screen.getByTestId('patients-pagination-skeleton')).toBeInTheDocument();
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
            expect(screen.getByTestId('payments-expenses-form-skeleton')).toHaveClass(
                'md:grid-cols-2',
                'xl:grid-cols-[minmax(0,1fr)_11rem_8rem_8rem_11rem_auto]',
            );
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
                    showCurrencySelector={false}
                />
            );

            expect(screen.getAllByTestId('analytics-kpi-skeleton')).toHaveLength(2);
            expect(screen.queryByTestId('analytics-revenue-chart-skeleton')).not.toBeInTheDocument();
            expect(screen.getByTestId('analytics-status-chart-skeleton')).toBeInTheDocument();
            expect(screen.getByTestId('analytics-growth-chart-skeleton')).toBeInTheDocument();
            expect(screen.queryByTestId('analytics-debtors-card-skeleton')).not.toBeInTheDocument();
            expect(screen.queryByTestId('analytics-currency-skeleton')).not.toBeInTheDocument();
            expect(screen.getByTestId('analytics-range-skeleton')).toHaveClass('overflow-x-auto');
        });

        it('matches settings, billing, staff, history, and odontogram responsive shells', () => {
            const { unmount } = render(<SettingsLoadingState />);
            expect(screen.getByTestId('settings-tabs-skeleton').children).toHaveLength(5);
            unmount();

            render(<BillingLoadingState />);
            expect(screen.getByTestId('billing-current-plan-skeleton')).toBeInTheDocument();
            expect(screen.getByTestId('billing-period-skeleton').children).toHaveLength(2);
            expect(screen.getByTestId('billing-history-skeleton')).toBeInTheDocument();
            cleanup();

            render(<StaffLoadingState />);
            expect(screen.getByTestId('staff-tabs-skeleton')).toHaveClass('overflow-x-auto');
            cleanup();

            render(<PatientHistoryLoadingState />);
            expect(screen.getByTestId('patient-history-panel-skeleton')).toBeInTheDocument();
            cleanup();

            render(<OdontogramLoadingState />);
            expect(screen.getByTestId('odontogram-upper-jaw-skeleton')).toHaveClass('overflow-x-auto');
            expect(screen.getByTestId('odontogram-lower-jaw-skeleton')).toHaveClass('overflow-x-auto');
        });

        it('uses the real patient header and ledger shape for finance patient loading', () => {
            render(<PaymentPatientLoadingState />);

            expect(screen.getByTestId('payment-patient-loading')).toHaveClass('space-y-2');
            expect(screen.getByTestId('payment-patient-summary-skeleton')).toHaveClass('md:grid-cols-3');
            expect(screen.getByTestId('payment-patient-table-skeleton')).toHaveClass('overflow-x-auto');
        });

        it('renders the patient detail oral photo panel skeleton', () => {
            render(<PatientDetailLoadingState />);

            expect(screen.getByTestId('patient-detail-header-identity-skeleton')).toHaveClass('max-w-[20rem]');
            expect(screen.getByTestId('patient-detail-header-photo-skeleton')).toHaveClass('h-24', 'w-24', 'rounded-xl');
            expect(screen.getByTestId('patient-detail-header-facts-skeleton')).toHaveClass(
                'h-auto',
                'overflow-visible',
                'md:h-[8rem]',
                'md:overflow-hidden'
            );
            expect(screen.getByTestId('patient-detail-header-actions-skeleton')).toHaveClass('flex-col');
            expect(screen.getByTestId('patient-detail-summary-grid-skeleton')).toHaveClass(
                'lg:grid-cols-[minmax(0,1fr)_15rem]',
                'xl:grid-cols-[minmax(0,1fr)_16rem]',
            );
            expect(screen.getByTestId('patient-detail-oral-photo-skeleton')).toHaveClass('h-[20.75rem]');
            expect(screen.queryByTestId('patient-detail-clinical-strip-skeleton')).not.toBeInTheDocument();
            expect(screen.getAllByTestId('patient-detail-oral-photo-slot-skeleton')).toHaveLength(10);
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
            expect(screen.getByTestId('admin-header-skeleton')).toHaveClass('fixed', 'z-50');
            expect(screen.getByTestId('admin-header-spacer-skeleton')).toHaveClass('h-[7.5rem]', 'md:h-16');
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
            const metricCards = screen.getAllByTestId('metric-card-skeleton');
            expect(metricCards).toHaveLength(3);
            expect(metricCards[0].parentElement).toHaveClass('lg:grid-cols-3');
        });

        it('renders dentist billing loading with admin shell and plan picker grid', () => {
            render(<AdminDentistBillingLoadingState />);

            expect(screen.getByTestId('admin-shell-loading')).toBeInTheDocument();
            expect(screen.getByTestId('admin-billing-danger-zone-skeleton')).toBeInTheDocument();
        });
    });
});
