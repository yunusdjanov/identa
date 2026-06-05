'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Info, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-shell';
import { AdminPlansPanelSkeleton } from '@/components/layout/page-loading-skeletons';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { DataTableShell, getDataTableClassName } from '@/components/ui/data-table-shell';
import { AdminHeader } from '@/components/admin/admin-header';
import { AppErrorState } from '@/components/error/app-error-state';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import { getApiErrorMessage } from '@/lib/api/client';
import { getCurrentUser, listAdminPlans, updateAdminPlan } from '@/lib/api/dentist';
import type { ApiPlan } from '@/lib/api/types';
import { useI18n } from '@/components/providers/i18n-provider';
import { useInstantLogout } from '@/lib/auth/use-instant-logout';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface PlanForm {
    name: string;
    description: string;
    trial_days: string;
    monthly_price: string;
    yearly_price: string;
    currency: string;
    staff_limit: string;
    entry_image_limit: string;
    upload_max_mb: string;
    stored_image_max_mb: string;
    can_export: boolean;
    is_active: boolean;
    sort_order: string;
}

type FieldErrors = Partial<Record<keyof PlanForm, string>>;

function buildForm(plan: ApiPlan): PlanForm {
    return {
        name: plan.name,
        description: plan.description ?? '',
        trial_days: plan.trial_days?.toString() ?? '',
        monthly_price: plan.monthly_price?.toString() ?? '',
        yearly_price: plan.yearly_price?.toString() ?? '',
        currency: plan.currency,
        staff_limit: plan.staff_limit.toString(),
        entry_image_limit: plan.entry_image_limit.toString(),
        upload_max_mb: plan.upload_max_mb.toString(),
        stored_image_max_mb: plan.stored_image_max_mb.toString(),
        can_export: plan.can_export,
        is_active: plan.is_active,
        sort_order: plan.sort_order.toString(),
    };
}

function toNumber(value: string): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function getServerFieldErrors(error: unknown): FieldErrors {
    if (!axios.isAxiosError(error)) return {};
    const raw = (error.response?.data as { errors?: Record<string, string[] | string> } | undefined)?.errors;
    if (!raw || typeof raw !== 'object') return {};
    const mapped: FieldErrors = {};
    for (const [key, value] of Object.entries(raw)) {
        if (Array.isArray(value)) {
            mapped[key as keyof PlanForm] = value[0];
        } else if (typeof value === 'string') {
            mapped[key as keyof PlanForm] = value;
        }
    }
    return mapped;
}

export default function AdminPlansPage() {
    const { t } = useI18n();
    const router = useRouter();
    const queryClient = useQueryClient();
    const handleLogout = useInstantLogout('/admin/login');
    const [editingPlan, setEditingPlan] = useState<ApiPlan | null>(null);
    const [form, setForm] = useState<PlanForm | null>(null);
    const [originalForm, setOriginalForm] = useState<PlanForm | null>(null);
    const [errors, setErrors] = useState<FieldErrors>({});
    const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);

    const authQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        retry: false,
    });
    const plansQuery = useQuery({
        queryKey: ['admin', 'plans'],
        queryFn: listAdminPlans,
        enabled: authQuery.data?.role === 'admin',
    });

    useEffect(() => {
        if (authQuery.isError && !authQuery.isLoading) {
            router.push('/admin/login');
            return;
        }

        if (authQuery.data && authQuery.data.role !== 'admin') {
            router.push('/dashboard');
        }
    }, [authQuery.data, authQuery.isError, authQuery.isLoading, router]);

    const updateField = useCallback(<K extends keyof PlanForm>(key: K, value: PlanForm[K]) => {
        setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
        setErrors((prev) => {
            if (!(key in prev)) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
    }, []);

    const validateLocally = useCallback(
        (plan: ApiPlan, current: PlanForm): FieldErrors => {
            const issues: FieldErrors = {};

            if (!current.name.trim()) {
                issues.name = t('admin.plans.validation.priceRequired');
            }

            const staff = Math.round(toNumber(current.staff_limit));
            if (staff < 1) {
                issues.staff_limit = t('admin.plans.validation.staffMin');
            }

            if (!plan.is_trial) {
                const monthly = toNumber(current.monthly_price);
                const yearly = toNumber(current.yearly_price);
                if (monthly <= 0) {
                    issues.monthly_price = t('admin.plans.validation.priceRequired');
                }
                if (yearly <= 0) {
                    issues.yearly_price = t('admin.plans.validation.priceRequired');
                }
                if (monthly > 0 && yearly > monthly * 12) {
                    issues.yearly_price = t('admin.plans.validation.yearlyOverMonthly');
                }
            }

            return issues;
        },
        [t],
    );

    const performClose = useCallback(() => {
        setEditingPlan(null);
        setForm(null);
        setOriginalForm(null);
        setErrors({});
        setConfirmCloseOpen(false);
    }, []);

    const isDirty = useMemo(() => {
        if (!form || !originalForm) return false;
        return (Object.keys(form) as (keyof PlanForm)[]).some((key) => form[key] !== originalForm[key]);
    }, [form, originalForm]);

    const updateMutation = useMutation({
        mutationKey: ['admin', 'plans', 'update', editingPlan?.code ?? null],
        mutationFn: () => {
            if (!editingPlan || !form) {
                throw new Error('No plan selected.');
            }

            return updateAdminPlan(editingPlan.code, {
                name: form.name.trim(),
                description: form.description.trim() || null,
                trial_days: editingPlan.is_trial ? Math.max(1, Math.round(toNumber(form.trial_days))) : null,
                monthly_price: editingPlan.is_trial ? 0 : Math.max(0, toNumber(form.monthly_price)),
                yearly_price: editingPlan.is_trial ? 0 : Math.max(0, toNumber(form.yearly_price)),
                currency: form.currency.trim().toUpperCase() || 'UZS',
                staff_limit: Math.max(1, Math.round(toNumber(form.staff_limit))),
                entry_image_limit: Math.max(0, Math.round(toNumber(form.entry_image_limit))),
                upload_max_mb: Math.max(0, toNumber(form.upload_max_mb)),
                stored_image_max_mb: Math.max(0, toNumber(form.stored_image_max_mb)),
                can_export: form.can_export,
                is_active: form.is_active,
                sort_order: Math.max(0, Math.round(toNumber(form.sort_order))),
            });
        },
        onSuccess: () => {
            toast.success(t('admin.plans.saved'), { duration: 3000 });
            performClose();
            queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] });
            queryClient.invalidateQueries({ queryKey: ['billing', 'plans'] });
            queryClient.invalidateQueries({ queryKey: ['plans'] });
        },
        onError: (error) => {
            const serverErrors = getServerFieldErrors(error);
            if (Object.keys(serverErrors).length > 0) {
                setErrors(serverErrors);
            }
            toast.error(getApiErrorMessage(error, t('admin.plans.saveFailed')));
        },
    });

    const openEditor = (plan: ApiPlan) => {
        const initial = buildForm(plan);
        setEditingPlan(plan);
        setForm(initial);
        setOriginalForm(initial);
        setErrors({});
    };

    const closeEditor = useCallback(() => {
        if (updateMutation.isPending) return;
        if (isDirty) {
            setConfirmCloseOpen(true);
            return;
        }
        performClose();
    }, [isDirty, performClose, updateMutation.isPending]);

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!editingPlan || !form) return;

        const local = validateLocally(editingPlan, form);
        if (Object.keys(local).length > 0) {
            setErrors(local);
            return;
        }

        updateMutation.mutate();
    };

    const isLoading = authQuery.isLoading || plansQuery.isLoading;

    const trialActiveLocked = editingPlan?.is_trial ?? false;

    // Errors keep an icon — they signal a state change the user must address.
    // Hints stay text-only — modern form UI (Stripe, Linear, Vercel) avoids
    // icon noise for purely descriptive helper text.
    const renderError = (key: keyof FieldErrors) => {
        const message = errors[key];
        if (!message) return null;
        return (
            <p className="flex items-start gap-1 text-xs leading-snug text-red-600">
                <AlertCircle className="mt-px h-3 w-3 shrink-0" aria-hidden />
                <span>{message}</span>
            </p>
        );
    };

    const renderHint = (text: string) => (
        <p className="text-xs leading-snug text-slate-500">{text}</p>
    );

    const renderInfoBanner = (text: string) => (
        <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
            <p className="text-xs leading-relaxed text-slate-600">{text}</p>
        </div>
    );

    const renderWarningBanner = (text: string) => (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2.5">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden />
            <p className="text-xs leading-relaxed text-amber-900">{text}</p>
        </div>
    );

    const planTierBadgeClass = (code: ApiPlan['code']) => {
        switch (code) {
            case 'trial':
                return 'border-slate-200 bg-slate-50 text-slate-700';
            case 'basic':
                return 'border-sky-200 bg-sky-50 text-sky-700';
            case 'pro':
                return 'border-amber-200 bg-amber-50 text-amber-700';
            default:
                return 'border-slate-200 bg-slate-50 text-slate-700';
        }
    };

    // Plan display copy (name/description) is product metadata, not editable
    // tenant data — sourced from i18n so it stays consistent across locales.
    const getPlanName = (code: ApiPlan['code']) => t(`plan.${code}.name`);
    const getPlanDescription = (code: ApiPlan['code']) => t(`plan.${code}.description`);

    const formatPrice = (amount: number | null | undefined) => {
        if (amount === null || amount === undefined) return '—';
        return new Intl.NumberFormat('ru-RU').format(amount);
    };

    const formatUpdatedAt = (iso: string | null | undefined) => {
        if (!iso) return null;
        try {
            return new Date(iso).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: '2-digit',
            });
        } catch {
            return null;
        }
    };

    const dialogOpen = editingPlan !== null && form !== null;

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(219,234,254,0.55),transparent_34rem),linear-gradient(180deg,#f8fbff_0%,#f8fafc_42%,#f1f5f9_100%)]">
            <AdminHeader active="plans" onLogout={handleLogout} />
            <main className="px-3 py-3 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
                <div className="mx-auto max-w-[1440px] space-y-5 lg:space-y-6">
                    <PageHeader title={t('admin.plans.title')} description={t('admin.plans.subtitle')} />

                    {isLoading ? (
                        <AdminPlansPanelSkeleton />
                    ) : plansQuery.isError ? (
                        <AppErrorState
                            title={t('common.loadErrorTitle')}
                            description={getApiErrorMessage(plansQuery.error, t('admin.plans.loadFailed'))}
                            retryLabel={t('common.retry')}
                            onRetry={() => plansQuery.refetch()}
                            className="min-h-[24rem] px-0 py-0"
                        />
                    ) : (
                        <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
                            <CardHeader>
                                <CardTitle>{t('admin.plans.tableTitle')}</CardTitle>
                            </CardHeader>
                            <CardContent className="px-4 pb-5 sm:px-5">
                                <DataTableShell>
                                    <Table className={getDataTableClassName('standard')}>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>{t('admin.plans.code')}</TableHead>
                                            <TableHead>{t('admin.plans.name')}</TableHead>
                                            <TableHead>{t('admin.plans.price')}</TableHead>
                                            <TableHead>{t('admin.plans.limits')}</TableHead>
                                            <TableHead>{t('admin.plans.status')}</TableHead>
                                            <TableHead />
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {(plansQuery.data ?? []).map((plan) => {
                                            const updatedDate = formatUpdatedAt(plan.updated_at);
                                            return (
                                                <TableRow key={plan.code}>
                                                    <TableCell>
                                                        <Badge
                                                            variant="outline"
                                                            className={`font-mono text-[11px] uppercase tracking-wide ${planTierBadgeClass(plan.code)}`}
                                                        >
                                                            {plan.code}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="max-w-[20rem]">
                                                        <p className="font-medium text-slate-950">{getPlanName(plan.code)}</p>
                                                        <p className="break-words text-sm text-slate-500">{getPlanDescription(plan.code)}</p>
                                                        {updatedDate ? (
                                                            <p className="mt-1 text-[11px] text-slate-400">
                                                                {t('admin.plans.updatedAt', { date: updatedDate })}
                                                            </p>
                                                        ) : null}
                                                    </TableCell>
                                                    <TableCell>
                                                        {plan.is_trial ? (
                                                            <span className="text-slate-500">{t('billing.free')}</span>
                                                        ) : (
                                                            <span className="tabular-nums">
                                                                {formatPrice(plan.monthly_price)} / {formatPrice(plan.yearly_price)}{' '}
                                                                {/* Currency comes from the plan row, not a hardcoded
                                                                    "UZS" suffix — otherwise a USD-priced plan still
                                                                    renders as UZS, mislabelling the row in the only
                                                                    table where the price actually lives. */}
                                                                <span className="text-xs text-slate-400">
                                                                    {(plan.currency ?? 'UZS').toUpperCase()}
                                                                </span>
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-sm text-slate-600">
                                                        {t('admin.plans.limitSummary', {
                                                            staff: plan.staff_limit,
                                                            images: plan.entry_image_limit,
                                                            upload: plan.upload_max_mb,
                                                        })}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant={plan.is_active ? 'secondary' : 'outline'}>
                                                            {plan.is_active ? t('admin.plans.active') : t('admin.plans.inactive')}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => openEditor(plan)}
                                                            disabled={updateMutation.isPending}
                                                        >
                                                            {t('common.edit')}
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                    </Table>
                                </DataTableShell>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </main>

            <Dialog
                open={dialogOpen}
                onOpenChange={(open) => {
                    if (!open) {
                        closeEditor();
                    }
                }}
            >
                <DialogContent className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto p-5 sm:max-w-2xl sm:p-6">
                    <DialogHeader>
                        <DialogTitle>
                            {editingPlan
                                ? t('admin.plans.editTitle', { code: getPlanName(editingPlan.code) })
                                : t('admin.plans.editFallback')}
                        </DialogTitle>
                        <DialogDescription className="sr-only">
                            {t('admin.plans.subtitle')}
                        </DialogDescription>
                    </DialogHeader>
                    {form && editingPlan ? (
                        <form className="space-y-6" onSubmit={handleSubmit}>
                            {/* Plan identity (name/description) is read-only product metadata
                                shown for context. Name/description/currency/sort_order stay
                                in form state with their current values so the PUT submission
                                still satisfies backend validation. */}
                            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white px-4 py-3">
                                <Badge
                                    variant="outline"
                                    className={`font-mono text-[10px] uppercase tracking-wide ${planTierBadgeClass(editingPlan.code)}`}
                                >
                                    {editingPlan.code}
                                </Badge>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold text-slate-900">
                                        {getPlanName(editingPlan.code)}
                                    </p>
                                    <p className="truncate text-xs text-slate-500">
                                        {getPlanDescription(editingPlan.code)}
                                    </p>
                                </div>
                            </div>

                            {/* Section: Pricing — only shown for paid plans. Trial duration
                                stays at its current DB value (30 by default) and is not editable. */}
                            {!editingPlan.is_trial ? (
                                <section className="space-y-4">
                                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                        {t('admin.plans.section.pricing')}
                                    </h3>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="plan-monthly">{t('admin.plans.monthlyPrice')}</Label>
                                            <Input
                                                id="plan-monthly"
                                                inputMode="decimal"
                                                value={form.monthly_price}
                                                onChange={(event) => updateField('monthly_price', event.target.value)}
                                                aria-invalid={Boolean(errors.monthly_price)}
                                            />
                                            {renderError('monthly_price')}
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="plan-yearly">{t('admin.plans.yearlyPrice')}</Label>
                                            <Input
                                                id="plan-yearly"
                                                inputMode="decimal"
                                                value={form.yearly_price}
                                                onChange={(event) => updateField('yearly_price', event.target.value)}
                                                aria-invalid={Boolean(errors.yearly_price)}
                                            />
                                            {renderError('yearly_price') ?? renderHint(t('admin.plans.yearlyOverMonthlyHint'))}
                                        </div>
                                    </div>
                                </section>
                            ) : null}

                            {/* Section: Plan limits. stored_image_max_mb is no longer admin-
                                tunable — the backend image pipeline auto-compresses with
                                quality-preserving heuristics. The field stays in form state
                                with its current value so PUT validation still passes. */}
                            <section className="space-y-4">
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    {t('admin.plans.section.limits')}
                                </h3>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="plan-staff">{t('admin.plans.staffLimit')}</Label>
                                        <Input
                                            id="plan-staff"
                                            inputMode="numeric"
                                            value={form.staff_limit}
                                            onChange={(event) => updateField('staff_limit', event.target.value)}
                                            aria-invalid={Boolean(errors.staff_limit)}
                                        />
                                        {renderError('staff_limit') ?? renderHint(t('admin.plans.minStaffHint'))}
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="plan-images">{t('admin.plans.imageLimit')}</Label>
                                        <Input
                                            id="plan-images"
                                            inputMode="numeric"
                                            value={form.entry_image_limit}
                                            onChange={(event) => updateField('entry_image_limit', event.target.value)}
                                            aria-invalid={Boolean(errors.entry_image_limit)}
                                        />
                                        {renderError('entry_image_limit') ?? renderHint(t('admin.plans.imageLimitHint'))}
                                    </div>
                                    <div className="space-y-1.5 sm:col-span-2">
                                        <Label htmlFor="plan-upload">{t('admin.plans.uploadMax')}</Label>
                                        <Input
                                            id="plan-upload"
                                            inputMode="decimal"
                                            value={form.upload_max_mb}
                                            onChange={(event) => updateField('upload_max_mb', event.target.value)}
                                            aria-invalid={Boolean(errors.upload_max_mb)}
                                        />
                                        {renderError('upload_max_mb') ?? renderHint(t('admin.plans.uploadMaxHint'))}
                                    </div>
                                </div>
                                {renderInfoBanner(t('admin.plans.autoCompressionNote'))}
                            </section>

                            {/* Section 4: Availability & features */}
                            <section className="space-y-4">
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    {t('admin.plans.section.toggles')}
                                </h3>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm transition hover:border-slate-300">
                                        <input
                                            type="checkbox"
                                            checked={form.can_export}
                                            onChange={(event) => updateField('can_export', event.target.checked)}
                                            className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                        />
                                        <span className="font-medium text-slate-700">{t('admin.plans.canExport')}</span>
                                    </label>
                                    <label
                                        className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition ${
                                            trialActiveLocked
                                                ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
                                                : 'cursor-pointer border-slate-200 bg-white hover:border-slate-300'
                                        }`}
                                        title={trialActiveLocked ? t('admin.plans.trialLockedHint') : undefined}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={trialActiveLocked ? true : form.is_active}
                                            disabled={trialActiveLocked}
                                            onChange={(event) => updateField('is_active', event.target.checked)}
                                            className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 disabled:opacity-60"
                                        />
                                        <span className={trialActiveLocked ? '' : 'font-medium text-slate-700'}>
                                            {t('admin.plans.isActive')}
                                        </span>
                                    </label>
                                </div>
                                {trialActiveLocked ? renderWarningBanner(t('admin.plans.trialLockedHint')) : null}
                                {errors.is_active ? renderError('is_active') : null}
                            </section>

                            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={closeEditor}
                                    disabled={updateMutation.isPending}
                                    className="sm:min-w-[6rem]"
                                >
                                    {t('common.cancel')}
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={updateMutation.isPending}
                                    className="sm:min-w-[8rem]"
                                >
                                    {updateMutation.isPending ? t('common.saving') : t('common.save')}
                                </Button>
                            </div>
                        </form>
                    ) : null}
                </DialogContent>
            </Dialog>

            <ConfirmActionDialog
                open={confirmCloseOpen}
                onOpenChange={(open) => setConfirmCloseOpen(open)}
                title={t('admin.plans.unsavedTitle')}
                description={t('admin.plans.unsavedDescription')}
                confirmLabel={t('admin.plans.unsavedConfirm')}
                cancelLabel={t('admin.plans.unsavedCancel')}
                confirmVariant="destructive"
                onConfirm={performClose}
            />
        </div>
    );
}
