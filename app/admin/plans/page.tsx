'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Textarea } from '@/components/ui/textarea';
import { AdminHeader } from '@/components/admin/admin-header';
import { AppErrorState } from '@/components/error/app-error-state';
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

export default function AdminPlansPage() {
    const { t } = useI18n();
    const router = useRouter();
    const queryClient = useQueryClient();
    const handleLogout = useInstantLogout('/admin/login');
    const [editingPlan, setEditingPlan] = useState<ApiPlan | null>(null);
    const [form, setForm] = useState<PlanForm | null>(null);

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

    const updateMutation = useMutation({
        mutationFn: () => {
            if (!editingPlan || !form) {
                throw new Error('No plan selected.');
            }

            return updateAdminPlan(editingPlan.code, {
                name: form.name.trim(),
                description: form.description.trim() || null,
                trial_days: editingPlan.code === 'trial' ? Math.max(1, Math.round(toNumber(form.trial_days))) : null,
                monthly_price: editingPlan.code === 'trial' ? 0 : Math.max(0, toNumber(form.monthly_price)),
                yearly_price: editingPlan.code === 'trial' ? 0 : Math.max(0, toNumber(form.yearly_price)),
                currency: form.currency.trim().toUpperCase() || 'UZS',
                staff_limit: Math.max(0, Math.round(toNumber(form.staff_limit))),
                entry_image_limit: Math.max(0, Math.round(toNumber(form.entry_image_limit))),
                upload_max_mb: Math.max(0, toNumber(form.upload_max_mb)),
                stored_image_max_mb: Math.max(0, toNumber(form.stored_image_max_mb)),
                can_export: form.can_export,
                is_active: form.is_active,
                sort_order: Math.max(0, Math.round(toNumber(form.sort_order))),
            });
        },
        onSuccess: () => {
            toast.success(t('admin.plans.saved'));
            setEditingPlan(null);
            setForm(null);
            queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] });
            queryClient.invalidateQueries({ queryKey: ['billing', 'plans'] });
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('admin.plans.saveFailed')));
        },
    });

    const openEditor = (plan: ApiPlan) => {
        setEditingPlan(plan);
        setForm(buildForm(plan));
    };

    const isLoading = authQuery.isLoading || plansQuery.isLoading;

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(219,234,254,0.55),transparent_34rem),linear-gradient(180deg,#f8fbff_0%,#f8fafc_42%,#f1f5f9_100%)]">
            <AdminHeader active="plans" onLogout={handleLogout} />
            <main className="p-3 sm:p-5 lg:p-6">
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
                                        {(plansQuery.data ?? []).map((plan) => (
                                            <TableRow key={plan.code}>
                                                <TableCell className="font-mono text-xs">{plan.code}</TableCell>
                                                <TableCell className="max-w-[20rem]">
                                                    <p className="font-medium text-slate-950">{plan.name}</p>
                                                    <p className="break-words text-sm text-slate-500">{plan.description}</p>
                                                </TableCell>
                                                <TableCell>
                                                    {plan.is_trial
                                                        ? t('billing.free')
                                                        : `${plan.monthly_price ?? 0} / ${plan.yearly_price ?? 0} ${plan.currency}`}
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
                                                    <Button type="button" variant="outline" size="sm" onClick={() => openEditor(plan)}>
                                                        {t('common.edit')}
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                    </Table>
                                </DataTableShell>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </main>

            <Dialog
                open={editingPlan !== null && form !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setEditingPlan(null);
                        setForm(null);
                    }
                }}
            >
                <DialogContent className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto p-5 sm:max-w-2xl sm:p-6">
                    <DialogHeader>
                        <DialogTitle>
                            {editingPlan ? t('admin.plans.editTitle', { code: editingPlan.code }) : t('admin.plans.editFallback')}
                        </DialogTitle>
                        <DialogDescription className="sr-only">
                            {t('admin.plans.subtitle')}
                        </DialogDescription>
                    </DialogHeader>
                    {form && editingPlan ? (
                        <form
                            className="space-y-4"
                            onSubmit={(event) => {
                                event.preventDefault();
                                updateMutation.mutate();
                            }}
                        >
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="plan-name">{t('admin.plans.name')}</Label>
                                    <Input id="plan-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="plan-currency">{t('admin.plans.currency')}</Label>
                                    <Input id="plan-currency" value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })} maxLength={3} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="plan-description">{t('admin.plans.description')}</Label>
                                <Textarea id="plan-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
                            </div>
                            <div className="grid gap-4 sm:grid-cols-3">
                                {editingPlan.code === 'trial' ? (
                                    <div className="space-y-2">
                                        <Label htmlFor="plan-trial-days">{t('admin.plans.trialDays')}</Label>
                                        <Input id="plan-trial-days" inputMode="numeric" value={form.trial_days} onChange={(event) => setForm({ ...form, trial_days: event.target.value })} />
                                    </div>
                                ) : (
                                    <>
                                        <div className="space-y-2">
                                            <Label htmlFor="plan-monthly">{t('admin.plans.monthlyPrice')}</Label>
                                            <Input id="plan-monthly" inputMode="decimal" value={form.monthly_price} onChange={(event) => setForm({ ...form, monthly_price: event.target.value })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="plan-yearly">{t('admin.plans.yearlyPrice')}</Label>
                                            <Input id="plan-yearly" inputMode="decimal" value={form.yearly_price} onChange={(event) => setForm({ ...form, yearly_price: event.target.value })} />
                                        </div>
                                    </>
                                )}
                                <div className="space-y-2">
                                    <Label htmlFor="plan-sort">{t('admin.plans.sortOrder')}</Label>
                                    <Input id="plan-sort" inputMode="numeric" value={form.sort_order} onChange={(event) => setForm({ ...form, sort_order: event.target.value })} />
                                </div>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                <div className="space-y-2">
                                    <Label htmlFor="plan-staff">{t('admin.plans.staffLimit')}</Label>
                                    <Input id="plan-staff" inputMode="numeric" value={form.staff_limit} onChange={(event) => setForm({ ...form, staff_limit: event.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="plan-images">{t('admin.plans.imageLimit')}</Label>
                                    <Input id="plan-images" inputMode="numeric" value={form.entry_image_limit} onChange={(event) => setForm({ ...form, entry_image_limit: event.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="plan-upload">{t('admin.plans.uploadMax')}</Label>
                                    <Input id="plan-upload" inputMode="decimal" value={form.upload_max_mb} onChange={(event) => setForm({ ...form, upload_max_mb: event.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="plan-stored">{t('admin.plans.storedMax')}</Label>
                                    <Input id="plan-stored" inputMode="decimal" value={form.stored_image_max_mb} onChange={(event) => setForm({ ...form, stored_image_max_mb: event.target.value })} />
                                </div>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={form.can_export}
                                        onChange={(event) => setForm({ ...form, can_export: event.target.checked })}
                                        className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                    />
                                    {t('admin.plans.canExport')}
                                </label>
                                <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={form.is_active}
                                        onChange={(event) => setForm({ ...form, is_active: event.target.checked })}
                                        className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                    />
                                    {t('admin.plans.isActive')}
                                </label>
                            </div>
                            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
                                <Button type="button" variant="outline" className="flex-1" onClick={() => setEditingPlan(null)}>
                                    {t('common.cancel')}
                                </Button>
                                <Button type="submit" className="flex-1" disabled={updateMutation.isPending}>
                                    {updateMutation.isPending ? t('common.saving') : t('common.save')}
                                </Button>
                            </div>
                        </form>
                    ) : null}
                </DialogContent>
            </Dialog>
        </div>
    );
}
