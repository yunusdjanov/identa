'use client';

import { AlertTriangle } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import type { AdminDentistSubscriptionAction } from '@/lib/api/dentist';
import type { ApiAdminDentist, ApiPlan } from '@/lib/api/types';
import { useI18n } from '@/components/providers/i18n-provider';
import { formatLocalizedDate } from '@/lib/i18n/date';

// These constants are imported by the parent so they stay in sync with the
// admin controller; re-exported here for the dialog's internal logic.
const BILLING_SUBSCRIPTION_ACTIONS = new Set<AdminDentistSubscriptionAction>([
    'apply_monthly', 'apply_yearly',
    'activate_monthly', 'activate_yearly',
    'extend_monthly', 'extend_yearly',
    'set_basic_monthly', 'set_basic_yearly',
    'set_pro_monthly', 'set_pro_yearly',
]);

export interface SubscriptionDialogState {
    account: ApiAdminDentist;
    action: AdminDentistSubscriptionAction;
}

export interface ManageSubscriptionForm {
    paymentMethod: 'cash' | 'p2p' | 'bank_transfer';
    paymentAmount: string;
    note: string;
}

const SUBSCRIPTION_NOTE_MAX_LENGTH = 500;

interface SubscriptionActionDialogProps {
    state: SubscriptionDialogState | null;
    form: ManageSubscriptionForm;
    onFormChange: (updater: (current: ManageSubscriptionForm) => ManageSubscriptionForm) => void;
    isPending: boolean;
    plans: ApiPlan[];
    onClose: () => void;
    onSubmit: () => void;
    getSubscriptionActionLabel: (action: AdminDentistSubscriptionAction) => string;
    getSubscriptionPlanLabel: (sub: ApiAdminDentist['subscription']) => string;
    getSubscriptionStatusLabel: (sub: ApiAdminDentist['subscription']) => string;
}

/**
 * Modal for confirming an admin-initiated subscription action.
 *
 * Encapsulates:
 *  - title + summary of the affected dentist
 *  - apply-hint (for paid-plan extension semantics)
 *  - period-switch warning (when monthly↔yearly on same plan)
 *  - staff-downgrade warning (when target staff_limit < active count)
 *  - payment method/amount fields (only for paid-plan actions)
 *  - free-form note
 *
 * Extracting this out of the page component keeps the parent under 1100 lines
 * and lets us unit-test the warning conditions in isolation.
 */
export function SubscriptionActionDialog({
    state,
    form,
    onFormChange,
    isPending,
    plans,
    onClose,
    onSubmit,
    getSubscriptionActionLabel,
    getSubscriptionPlanLabel,
    getSubscriptionStatusLabel,
}: SubscriptionActionDialogProps) {
    const { locale, t } = useI18n();

    const requiresPaymentDetails = state !== null
        && BILLING_SUBSCRIPTION_ACTIONS.has(state.action);

    // Parse a "set_<plan>_<period>" action once and reuse for both warning
    // computations. Returns null when the current action isn't a paid-plan
    // assignment (in which case neither warning applies).
    const parsedAction = (() => {
        if (!state) return null;
        const match = state.action.match(/^set_(basic|pro)_(monthly|yearly)$/);
        if (!match) return null;
        return { plan: match[1], period: match[2] };
    })();

    const showPeriodSwitchWarning = (() => {
        if (!state || !parsedAction) return false;
        const sub = state.account.subscription;
        return sub.plan === parsedAction.plan
            && sub.billing_period !== null
            && sub.billing_period !== 'trial'
            && sub.billing_period !== parsedAction.period
            && (sub.status === 'active' || sub.status === 'grace');
    })();

    const staffDowngradeInfo = (() => {
        if (!state || !parsedAction) return null;
        const targetPlan = plans.find((p) => p.code === parsedAction.plan);
        if (!targetPlan || targetPlan.staff_limit === null) return null;
        const activeCount = state.account.subscription.active_staff_count;
        if (activeCount <= targetPlan.staff_limit) return null;
        return {
            excess: activeCount - targetPlan.staff_limit,
            limit: targetPlan.staff_limit,
            active: activeCount,
        };
    })();

    // Dirty-form guard: if the admin typed a non-empty paymentAmount or note
    // and dismisses the dialog (outside-click / Escape), the click should
    // surface a confirmation rather than silently discarding what they
    // intended to submit. Plain window.confirm is sufficient — the dialog
    // doesn't justify a second nested Dialog for the confirmation step.
    const isDirty = form.paymentAmount.trim() !== '' || form.note.trim() !== '';

    return (
        <Dialog
            open={state !== null}
            onOpenChange={(open) => {
                if (open) return;
                // Refuse to close mid-mutation — the admin would lose the
                // form they just filled while the API call resolves. The
                // success/error handler closes the dialog explicitly.
                if (isPending) return;
                if (isDirty && !window.confirm(t('admin.subscription.confirmDiscardChanges'))) {
                    return;
                }
                onClose();
            }}
        >
            <DialogContent className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto p-5 sm:max-w-lg sm:p-6">
                <DialogHeader>
                    <DialogTitle>
                        {state
                            ? t('admin.subscription.dialogTitle', {
                                action: getSubscriptionActionLabel(state.action),
                                name: state.account.name,
                            })
                            : t('admin.subscription.dialogFallback')}
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        {t('admin.billing.manualActions')}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    {state ? (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                            <p className="font-medium text-slate-900">
                                {t('common.doctorPrefix')} {state.account.name}
                            </p>
                            <p className="mt-1">
                                {t('admin.subscription.planSummary', {
                                    plan: getSubscriptionPlanLabel(state.account.subscription),
                                    status: getSubscriptionStatusLabel(state.account.subscription),
                                })}
                            </p>
                            {state.account.subscription.ends_at ? (
                                <p className="mt-1 text-xs text-slate-600">
                                    {t('admin.subscription.paidUntil', {
                                        date: formatLocalizedDate(
                                            state.account.subscription.ends_at,
                                            locale,
                                            { year: 'numeric', month: 'short', day: 'numeric' }
                                        ),
                                    })}
                                </p>
                            ) : null}
                        </div>
                    ) : null}

                    {state && BILLING_SUBSCRIPTION_ACTIONS.has(state.action) ? (
                        <p className="text-sm text-slate-600">
                            {t('admin.subscription.applyHint')}
                        </p>
                    ) : null}

                    {showPeriodSwitchWarning ? (
                        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <div>
                                <p className="font-semibold">
                                    {t('admin.subscription.warning.periodSwitch.title')}
                                </p>
                                <p className="mt-0.5 text-amber-800">
                                    {t('admin.subscription.warning.periodSwitch.description')}
                                </p>
                            </div>
                        </div>
                    ) : null}

                    {staffDowngradeInfo ? (
                        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <div>
                                <p className="font-semibold">
                                    {t('admin.subscription.warning.staffDowngrade.title')}
                                </p>
                                <p className="mt-0.5 text-amber-800">
                                    {t('admin.subscription.warning.staffDowngrade.description', {
                                        excess: staffDowngradeInfo.excess,
                                        limit: staffDowngradeInfo.limit,
                                        active: staffDowngradeInfo.active,
                                    })}
                                </p>
                            </div>
                        </div>
                    ) : null}

                    {requiresPaymentDetails ? (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="subscription-payment-method">
                                    {t('admin.subscription.paymentMethod')}
                                </Label>
                                <Select
                                    value={form.paymentMethod}
                                    onValueChange={(value) =>
                                        onFormChange((current) => ({
                                            ...current,
                                            paymentMethod: value as ManageSubscriptionForm['paymentMethod'],
                                        }))
                                    }
                                >
                                    <SelectTrigger id="subscription-payment-method" className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="cash">{t('admin.subscription.paymentMethod.cash')}</SelectItem>
                                        <SelectItem value="p2p">{t('admin.subscription.paymentMethod.p2p')}</SelectItem>
                                        <SelectItem value="bank_transfer">{t('admin.subscription.paymentMethod.bank_transfer')}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="subscription-payment-amount">
                                    {t('admin.subscription.paymentAmount')}
                                </Label>
                                <Input
                                    id="subscription-payment-amount"
                                    inputMode="decimal"
                                    placeholder={t('admin.subscription.paymentAmountPlaceholder')}
                                    value={form.paymentAmount}
                                    onChange={(event) =>
                                        onFormChange((current) => ({
                                            ...current,
                                            paymentAmount: event.target.value,
                                        }))
                                    }
                                />
                            </div>
                        </div>
                    ) : null}

                    <div className="space-y-2">
                        <Label htmlFor="subscription-note">{t('admin.subscription.note')}</Label>
                        <Textarea
                            id="subscription-note"
                            placeholder={t('admin.subscription.notePlaceholder')}
                            value={form.note}
                            onChange={(event) =>
                                onFormChange((current) => ({
                                    ...current,
                                    note: event.target.value,
                                }))
                            }
                            maxLength={SUBSCRIPTION_NOTE_MAX_LENGTH}
                        />
                    </div>

                    <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            className="flex-1"
                            disabled={isPending}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            type="button"
                            className="flex-1"
                            onClick={onSubmit}
                            disabled={isPending}
                        >
                            {isPending
                                ? t('admin.subscription.processing')
                                : state
                                    ? getSubscriptionActionLabel(state.action)
                                    : t('admin.subscription.dialogFallback')}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
