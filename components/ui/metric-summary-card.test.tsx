import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { getBalanceMetricTone, MetricSummaryCard } from '@/components/ui/metric-summary-card';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

function renderCard(props: React.ComponentProps<typeof MetricSummaryCard>) {
    return render(
        <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
            <MetricSummaryCard {...props} />
        </I18nProvider>
    );
}

describe('MetricSummaryCard', () => {
    afterEach(() => {
        cleanup();
    });

    it('renders label and value in the default state', () => {
        renderCard({ label: 'Total debt', value: '350,000 UZS', tone: 'red' });
        expect(screen.getByText('Total debt')).toBeInTheDocument();
        expect(screen.getByText('350,000 UZS')).toBeInTheDocument();
    });

    it('renders an optional status badge beside the label', () => {
        renderCard({ label: 'Remaining', value: '250,000 UZS', tone: 'blue', badge: 'Advance', badgeTone: 'blue' });
        expect(screen.getByText('Remaining')).toBeInTheDocument();
        expect(screen.getByText('Advance')).toBeInTheDocument();
        expect(screen.getByText('250,000 UZS')).toBeInTheDocument();
    });

    it('uses a soft tonal gradient when gradient=true', () => {
        renderCard({ label: 'Paid', value: '250,000 UZS', tone: 'emerald', compact: true, gradient: true });
        expect(screen.getByText('Paid').closest('.interactive-card')).toHaveClass('bg-gradient-to-br', 'via-emerald-50/70');
    });

    it('maps net balance direction to debt advance and settled tones', () => {
        expect(getBalanceMetricTone(250000)).toBe('yellow');
        expect(getBalanceMetricTone(-250000)).toBe('blue');
        expect(getBalanceMetricTone(0)).toBe('slate');
    });

    it('hides the value and shows the locked label when locked=true', () => {
        // AFD3-C1: viewers without payments.view see the card keep its
        // shape but display the lock placeholder instead of the real
        // currency value. Verifying both halves of the contract — label
        // present, value absent.
        renderCard({ label: 'Total debt', value: '350,000 UZS', tone: 'red', locked: true });
        expect(screen.getByText('Total debt')).toBeInTheDocument();
        expect(screen.queryByText('350,000 UZS')).not.toBeInTheDocument();
        expect(screen.getByText('No access')).toBeInTheDocument();
    });

    it('uses the lockedKpi label for the aria-label so screen readers announce the lock state', () => {
        renderCard({ label: 'Outstanding', value: '1,200,000 UZS', tone: 'red', locked: true });
        // The component composes the aria-label as `${label}: ${locked label}`
        // so a user navigating with VoiceOver hears "Outstanding: No access".
        expect(screen.getByLabelText('Outstanding: No access')).toBeInTheDocument();
    });
});
