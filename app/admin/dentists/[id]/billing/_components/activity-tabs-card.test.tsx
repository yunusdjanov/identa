import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { History } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { ActivityTabsCard } from './activity-tabs-card';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

describe('ActivityTabsCard', () => {
    it('shows an honest limited-history label and server-wide paid total', () => {
        render(
            <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
                <ActivityTabsCard
                    payments={[{
                        id: 'payment-1',
                        plan_code: 'basic',
                        plan_name: 'Basic',
                        billing_period: 'monthly',
                        amount: 100,
                        currency: 'USD',
                        status: 'paid',
                        provider: 'payx',
                        provider_payment_id: null,
                        provider_order_id: 'order-1',
                        paid_at: '2026-06-01T00:00:00Z',
                        created_at: '2026-06-01T00:00:00Z',
                    }]}
                    paymentHistoryTotal={143}
                    paymentHistoryTruncated
                    paidPaymentCount={120}
                    auditLoading={false}
                    auditError={null}
                    auditEntries={[]}
                    onRetryAudit={() => undefined}
                    formatTotal={() => '5,000,000 UZS / 900 USD'}
                    formatPaymentAmount={() => ''}
                    getBillingPeriodLabel={() => ''}
                    getPaymentStatusBadgeClasses={() => ''}
                    getPaymentStatusLabel={() => ''}
                    getPaymentStatusIcon={() => ({ Icon: History, iconClassName: '' })}
                    getAuditEventVisual={() => ({ Icon: History, iconClassName: '' })}
                />
            </I18nProvider>
        );

        expect(screen.getByText('5,000,000 UZS / 900 USD')).toBeInTheDocument();
        expect(screen.getByText('Showing the latest 1 of 143 payments')).toBeInTheDocument();
    });

    it('keeps a failed audit log request contained and hides backend route details', async () => {
        const onRetryAudit = vi.fn();
        const user = userEvent.setup();

        const { container } = render(
            <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
                <ActivityTabsCard
                    payments={[]}
                    paymentHistoryTotal={0}
                    paymentHistoryTruncated={false}
                    paidPaymentCount={0}
                    auditLoading={false}
                    auditError="Could not load change history"
                    auditEntries={undefined}
                    onRetryAudit={onRetryAudit}
                    formatTotal={() => ''}
                    formatPaymentAmount={() => ''}
                    getBillingPeriodLabel={() => ''}
                    getPaymentStatusBadgeClasses={() => ''}
                    getPaymentStatusLabel={() => ''}
                    getPaymentStatusIcon={() => ({ Icon: History, iconClassName: '' })}
                    getAuditEventVisual={() => ({ Icon: History, iconClassName: '' })}
                />
            </I18nProvider>
        );

        const activityCard = within(container);
        await user.click(activityCard.getByRole('tab', { name: 'Change history' }));

        expect(activityCard.getByRole('alert')).toHaveTextContent('Could not load change history');
        expect(activityCard.queryByText(/api\/v1\/admin\/dentists/i)).not.toBeInTheDocument();

        await user.click(activityCard.getByRole('button', { name: 'Retry' }));
        expect(onRetryAudit).toHaveBeenCalledTimes(1);
    });
});
