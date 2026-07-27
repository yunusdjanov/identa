'use client';

import Link from 'next/link';
import { useDeferredValue, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { DataTableShell, getDataTableClassName } from '@/components/ui/data-table-shell';
import { PaymentsLoadingState } from '@/components/layout/page-loading-skeletons';
import { PageHeader } from '@/components/ui/page-shell';
import { getApiErrorMessage } from '@/lib/api/client';
import {
    createPaymentExpense,
    deletePaymentExpense,
    getCurrentUser,
    listPaymentExpenses,
    listPaymentLedgerPatients,
    updatePaymentExpense,
} from '@/lib/api/dentist';
import type {
    ApiMoneyCurrency,
    ApiPaymentExpense,
    ApiPaymentExpenseCurrency,
    ApiPaymentPatientLedgerRow,
    ApiSummaryValue,
} from '@/lib/api/types';
import { useI18n } from '@/components/providers/i18n-provider';
import { formatLocalizedDate } from '@/lib/i18n/date';
import { extractPrimaryPhone, formatCurrency } from '@/lib/utils';
import { AlertCircle, CalendarDays, Download, History, Pencil, Phone, Plus, Receipt, Search, Trash2, Users, Wallet, X } from 'lucide-react';
import { buildPdfFilename, exportRowsToPdf } from '@/lib/export/pdf';
import { EmptyState } from '@/components/ui/empty-state';
import { AppErrorState } from '@/components/error/app-error-state';
import { AccessDeniedState } from '@/components/error/access-denied-state';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import { canManage, canView } from '@/lib/auth/permissions';
import { toast } from 'sonner';

const PAGE_SIZE = 10;
const OUTSTANDING_FILTER_PARAM = 'outstanding';
const OUTSTANDING_FILTER_VALUE = '1';
const LEDGER_EXPORT_PAGE_SIZE = 100;
const EXPENSE_EXPORT_PAGE_SIZE = 100;
const MAX_EXPORT_ROWS = 5_000;
const MAX_EXPORT_PAGE_REQUESTS = 100;
const URL_SEARCH_CHANGE_EVENT = 'identa:payments-url-search-change';
const EXPENSE_CURRENCIES = ['UZS', 'USD'] as const satisfies readonly ApiPaymentExpenseCurrency[];
const MONEY_CURRENCIES = ['UZS', 'USD'] as const satisfies readonly ApiMoneyCurrency[];
const NET_BALANCE_SUMMARY_VARIANTS = {
    advance: {
        statusKey: 'patientHistory.balanceStatus.advance',
        hintKey: 'payments.summary.netBalanceAdvanceHint',
        cardClassName: 'metric-hover-blue border-blue-100 shadow-blue-100/60',
        labelClassName: 'text-blue-600',
        iconClassName: 'text-blue-500',
        valueClassName: 'text-blue-700',
        badgeClassName: 'border-blue-200 bg-blue-50 text-blue-700',
        hintClassName: 'text-blue-500/80',
    },
    settled: {
        statusKey: 'patientHistory.balanceStatus.paid',
        hintKey: 'payments.summary.netBalanceSettledHint',
        cardClassName: 'metric-hover-slate border-slate-200 shadow-slate-200/60',
        labelClassName: 'text-slate-600',
        iconClassName: 'text-slate-500',
        valueClassName: 'text-slate-700',
        badgeClassName: 'border-slate-200 bg-slate-50 text-slate-600',
        hintClassName: 'text-slate-500',
    },
    debt: {
        statusKey: 'patientHistory.balanceStatus.debt',
        hintKey: 'payments.summary.netBalanceHint',
        cardClassName: 'metric-hover-amber border-amber-100 shadow-amber-100/60',
        labelClassName: 'text-amber-600',
        iconClassName: 'text-amber-500',
        valueClassName: 'text-amber-700',
        badgeClassName: 'border-amber-200 bg-amber-50 text-amber-700',
        hintClassName: 'text-amber-500/80',
    },
    mixed: {
        statusKey: 'payments.summary.netBalanceMixedStatus',
        hintKey: 'payments.summary.netBalanceMixedHint',
        cardClassName: 'metric-hover-slate border-slate-200 shadow-slate-200/60',
        labelClassName: 'text-slate-600',
        iconClassName: 'text-slate-500',
        valueClassName: 'text-slate-700',
        badgeClassName: 'border-slate-200 bg-slate-50 text-slate-600',
        hintClassName: 'text-slate-500',
    },
} as const;
type TranslateFn = ReturnType<typeof useI18n>['t'];

function subscribeToUrlSearch(onStoreChange: () => void) {
    if (typeof window === 'undefined') {
        return () => undefined;
    }

    window.addEventListener('popstate', onStoreChange);
    window.addEventListener(URL_SEARCH_CHANGE_EVENT, onStoreChange);

    return () => {
        window.removeEventListener('popstate', onStoreChange);
        window.removeEventListener(URL_SEARCH_CHANGE_EVENT, onStoreChange);
    };
}

function getUrlSearchSnapshot() {
    return typeof window === 'undefined' ? '' : window.location.search;
}

function getServerUrlSearchSnapshot() {
    return '';
}

function replaceUrl(nextUrl: URL) {
    window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    window.dispatchEvent(new Event(URL_SEARCH_CHANGE_EVENT));
}

function getNetBalanceSummary(balance: number) {
    if (balance < 0) {
        return { ...NET_BALANCE_SUMMARY_VARIANTS.advance, amount: Math.abs(balance) };
    }

    if (balance === 0) {
        return { ...NET_BALANCE_SUMMARY_VARIANTS.settled, amount: 0 };
    }

    return { ...NET_BALANCE_SUMMARY_VARIANTS.debt, amount: balance };
}

function shouldShowBalanceStatus(debt: number, paid: number, balance: number) {
    return debt !== 0 || paid !== 0 || balance !== 0;
}

interface PatientBalanceRow {
    patientId: string;
    patientName: string;
    patientPhone: string;
    totalDebt: number;
    totalPaid: number;
    balance: number;
    balancesByCurrency: Record<ApiMoneyCurrency, {
        totalDebt: number;
        totalPaid: number;
        balance: number;
    }>;
    entryCount: number;
    lastEntryDate: string | null;
}

function getEmptyMoneyBalances(): PatientBalanceRow['balancesByCurrency'] {
    return {
        UZS: { totalDebt: 0, totalPaid: 0, balance: 0 },
        USD: { totalDebt: 0, totalPaid: 0, balance: 0 },
    };
}

function getPatientBalancesByCurrency(row: ApiPaymentPatientLedgerRow): PatientBalanceRow['balancesByCurrency'] {
    const balances = getEmptyMoneyBalances();
    const rawBalances = row.balances_by_currency;

    if (rawBalances && typeof rawBalances === 'object') {
        for (const currency of MONEY_CURRENCIES) {
            const raw = rawBalances[currency];
            if (!raw || typeof raw !== 'object') {
                continue;
            }

            balances[currency] = {
                totalDebt: Number(raw.total_debt ?? 0),
                totalPaid: Number(raw.total_paid ?? 0),
                balance: Number(raw.balance ?? 0),
            };
        }

        return balances;
    }

    balances.UZS = {
        totalDebt: Number(row.total_debt ?? 0),
        totalPaid: Number(row.total_paid ?? 0),
        balance: Number(row.balance ?? 0),
    };

    return balances;
}

function getVisibleBalanceLines(
    balances: PatientBalanceRow['balancesByCurrency'],
    field: 'totalDebt' | 'totalPaid' | 'balance'
) {
    const lines = MONEY_CURRENCIES
        .map((currency) => ({
            currency,
            amount: field === 'balance' ? Math.abs(balances[currency][field]) : balances[currency][field],
            rawAmount: balances[currency][field],
        }))
        .filter(({ amount, rawAmount }) => amount !== 0 || rawAmount !== 0);

    return lines.length > 0 ? lines : [{ currency: 'UZS' as const, amount: 0, rawAmount: 0 }];
}

function formatBalanceBreakdown(
    balances: PatientBalanceRow['balancesByCurrency'],
    field: 'totalDebt' | 'totalPaid' | 'balance'
) {
    return getVisibleBalanceLines(balances, field)
        .map(({ currency, amount }) => formatCurrency(amount, currency))
        .join(' / ');
}

function getRepresentativeBalance(balances: PatientBalanceRow['balancesByCurrency']) {
    const activeBalances = MONEY_CURRENCIES
        .map((currency) => balances[currency].balance)
        .filter((balance) => balance !== 0);

    if (activeBalances.length === 0) {
        return 0;
    }

    if (activeBalances.every((balance) => balance > 0)) {
        return Math.max(...activeBalances);
    }

    if (activeBalances.every((balance) => balance < 0)) {
        return Math.min(...activeBalances);
    }

    return 0;
}

function canShowSingleBalanceStatus(balances: PatientBalanceRow['balancesByCurrency']) {
    const activeBalances = MONEY_CURRENCIES
        .map((currency) => balances[currency].balance)
        .filter((balance) => balance !== 0);

    return activeBalances.length > 0
        && (activeBalances.every((balance) => balance > 0) || activeBalances.every((balance) => balance < 0));
}

function hasMixedBalanceStatus(balances: PatientBalanceRow['balancesByCurrency']) {
    const activeBalances = MONEY_CURRENCIES
        .map((currency) => balances[currency].balance)
        .filter((balance) => balance !== 0);

    return activeBalances.some((balance) => balance > 0) && activeBalances.some((balance) => balance < 0);
}

function renderBalanceBreakdownWithStatusBadges(
    balances: PatientBalanceRow['balancesByCurrency'],
    t: TranslateFn
) {
    return (
        <div className="flex flex-col gap-0.5 leading-tight">
            {getVisibleBalanceLines(balances, 'balance').map(({ currency, amount, rawAmount }) => {
                const summary = getNetBalanceSummary(rawAmount);

                return (
                    <span key={currency} className="flex flex-wrap items-center gap-1.5">
                        <span className={`whitespace-nowrap tabular-nums ${summary.valueClassName}`}>
                            {formatCurrency(amount, currency)}
                        </span>
                        {rawAmount !== 0 ? (
                            <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${summary.badgeClassName}`}>
                                {t(summary.statusKey)}
                            </span>
                        ) : null}
                    </span>
                );
            })}
        </div>
    );
}

function BalanceAmount({ balances }: { balances: PatientBalanceRow['balancesByCurrency'] }) {
    const { t } = useI18n();
    const lines = getVisibleBalanceLines(balances, 'balance');

    return (
        <div className="flex min-w-[128px] flex-col gap-1">
            {lines.map(({ currency, amount, rawAmount }) => {
                const summary = getNetBalanceSummary(rawAmount);
                const showStatus = shouldShowBalanceStatus(
                    balances[currency].totalDebt,
                    balances[currency].totalPaid,
                    balances[currency].balance
                );

                return (
                    <div key={currency} className="flex flex-wrap items-center gap-1.5">
                        <span className={`font-semibold tabular-nums ${summary.valueClassName}`}>
                            {formatCurrency(amount, currency)}
                        </span>
                        {showStatus ? (
                            <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${summary.badgeClassName}`}>
                                {t(summary.statusKey)}
                            </span>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
}

interface ExpenseRow {
    id: string;
    title: string;
    amount: number;
    quantity: number;
    currency: ApiPaymentExpenseCurrency;
    date: string;
}

type PaymentsTab = 'patients' | 'expenses';

function parsePaymentsTab(value: string | null): PaymentsTab {
    return value === 'expenses' || value === 'history' ? 'expenses' : 'patients';
}

function toPatientBalanceRow(row: ApiPaymentPatientLedgerRow): PatientBalanceRow {
    const balancesByCurrency = getPatientBalancesByCurrency(row);

    return {
        patientId: row.patient_id,
        patientName: row.patient_name,
        patientPhone: extractPrimaryPhone(row.patient_phone ?? '') || '-',
        totalDebt: balancesByCurrency.UZS.totalDebt,
        totalPaid: balancesByCurrency.UZS.totalPaid,
        balance: balancesByCurrency.UZS.balance,
        balancesByCurrency,
        entryCount: Number(row.entry_count ?? 0),
        lastEntryDate: row.last_entry_date ?? null,
    };
}

function toExpenseRow(row: ApiPaymentExpense): ExpenseRow {
    return {
        id: row.id,
        title: row.title,
        amount: Number(row.amount ?? 0),
        quantity: Number(row.quantity ?? 1),
        currency: coerceExpenseCurrency(row.currency),
        date: row.expense_date ?? '',
    };
}

function getTodayInputValue() {
    return new Date().toISOString().slice(0, 10);
}

function coerceExpenseCurrency(value: unknown): ApiPaymentExpenseCurrency {
    return EXPENSE_CURRENCIES.includes(value as ApiPaymentExpenseCurrency)
        ? value as ApiPaymentExpenseCurrency
        : 'UZS';
}

function normalizeDecimalInput(value: string, maxFractionDigits: number) {
    const normalized = value
        .replace(/\s/g, '')
        .replace(',', '.')
        .replace(/[^\d.]/g, '');
    const [rawWhole = '', ...rawDecimals] = normalized.split('.');
    const whole = rawWhole.replace(/^0+(?=\d)/, '');
    const decimal = rawDecimals.join('').slice(0, maxFractionDigits);
    const groupedWhole = (whole || (normalized.startsWith('0') ? '0' : '')).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

    if (maxFractionDigits > 0 && normalized.includes('.')) {
        return `${groupedWhole || '0'}.${decimal}`;
    }

    return groupedWhole;
}

function formatMoneyInput(value: string, currency: ApiPaymentExpenseCurrency) {
    return normalizeDecimalInput(value, currency === 'USD' ? 2 : 0);
}

function formatQuantityInput(value: string) {
    return normalizeDecimalInput(value, 2);
}

function parseDecimalInput(value: string) {
    const normalized = value.replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, '');
    const amount = Number(normalized);

    return Number.isFinite(amount) ? amount : 0;
}

function parseMoneyInput(value: string, currency: ApiPaymentExpenseCurrency) {
    const amount = parseDecimalInput(value);

    return currency === 'UZS' ? Math.round(amount) : amount;
}

function formatExpenseAmount(amount: number, currency: ApiPaymentExpenseCurrency, locale: string) {
    if (currency === 'UZS') {
        return formatCurrency(amount);
    }

    const formatted = new Intl.NumberFormat(locale, {
        maximumFractionDigits: 2,
        minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);

    return `${formatted} USD`;
}

function currencyTotalsFromSummary(value: unknown): Record<ApiPaymentExpenseCurrency, number> {
    const totals: Record<ApiPaymentExpenseCurrency, number> = { UZS: 0, USD: 0 };
    if (!value || typeof value !== 'object') {
        return totals;
    }

    for (const currency of EXPENSE_CURRENCIES) {
        const amount = Number((value as Record<string, unknown>)[currency] ?? 0);
        totals[currency] = Number.isFinite(amount) ? amount : 0;
    }

    return totals;
}

function ledgerTotalsFromSummary(value: unknown): PatientBalanceRow['balancesByCurrency'] {
    const totals = getEmptyMoneyBalances();
    if (!value || typeof value !== 'object') {
        return totals;
    }

    for (const currency of MONEY_CURRENCIES) {
        const raw = (value as Record<string, unknown>)[currency];
        if (!raw || typeof raw !== 'object') {
            continue;
        }

        totals[currency] = {
            totalDebt: Number((raw as Record<string, unknown>).total_debt ?? 0),
            totalPaid: Number((raw as Record<string, unknown>).total_paid ?? 0),
            balance: Number((raw as Record<string, unknown>).total_balance ?? 0),
        };
    }

    return totals;
}

function ledgerSummaryFromResponse(summary: Record<string, ApiSummaryValue> | undefined) {
    const balancesByCurrency = ledgerTotalsFromSummary(summary?.totals_by_currency);
    const hasCurrencySummary = MONEY_CURRENCIES.some((currency) => (
        balancesByCurrency[currency].totalDebt !== 0
        || balancesByCurrency[currency].totalPaid !== 0
        || balancesByCurrency[currency].balance !== 0
    ));

    if (!hasCurrencySummary && summary) {
        balancesByCurrency.UZS = {
            totalDebt: Number(summary.total_debt ?? 0),
            totalPaid: Number(summary.total_paid ?? 0),
            balance: Number(summary.total_balance ?? 0),
        };
    }

    return {
        totalDebt: balancesByCurrency.UZS.totalDebt,
        totalPaid: balancesByCurrency.UZS.totalPaid,
        totalBalance: balancesByCurrency.UZS.balance,
        balancesByCurrency,
        totalEntries: Number(summary?.total_entries ?? 0),
        totalPatients: Number(summary?.total_patients ?? 0),
    };
}

function formatExpenseTotals(totals: Record<ApiPaymentExpenseCurrency, number>, locale: string) {
    const visibleTotals = EXPENSE_CURRENCIES
        .filter((currency) => totals[currency] > 0)
        .map((currency) => formatExpenseAmount(totals[currency], currency, locale));

    return visibleTotals.length > 0 ? visibleTotals.join(' / ') : formatExpenseAmount(0, 'UZS', locale);
}

async function fetchExpenseExportRows(search: string): Promise<ExpenseRow[]> {
    const rows: ExpenseRow[] = [];
    let page = 1;
    let totalPages = 1;
    let requestCount = 0;

    do {
        requestCount += 1;
        if (requestCount > MAX_EXPORT_PAGE_REQUESTS) {
            throw new Error('Expense export exceeded the page limit.');
        }
        const response = await listPaymentExpenses({
            page,
            perPage: EXPENSE_EXPORT_PAGE_SIZE,
            filter: {
                search: search || undefined,
            },
        });
        rows.push(...response.data.map(toExpenseRow));
        if (rows.length > MAX_EXPORT_ROWS) {
            throw new Error('Expense export exceeded the row limit.');
        }
        totalPages = response.meta?.pagination?.total_pages ?? 1;
        if (!Number.isInteger(totalPages) || totalPages < 1) {
            throw new Error('Expense export received invalid pagination.');
        }
        page += 1;
    } while (page <= totalPages);

    return rows;
}

export default function PaymentsPage() {
    const { t, locale } = useI18n();
    const queryClient = useQueryClient();
    const urlSearch = useSyncExternalStore(
        subscribeToUrlSearch,
        getUrlSearchSnapshot,
        getServerUrlSearchSnapshot
    );
    const urlParams = useMemo(() => new URLSearchParams(urlSearch), [urlSearch]);
    const patientIdFromUrl = (urlParams.get('patientId') ?? '').trim();
    const activeTab = parsePaymentsTab(urlParams.get('tab'));
    const showOutstandingOnly = urlParams.get(OUTSTANDING_FILTER_PARAM) === OUTSTANDING_FILTER_VALUE;
    const [patientSearch, setPatientSearch] = useState('');
    const [expenseSearch, setExpenseSearch] = useState('');
    const [patientPage, setPatientPage] = useState(1);
    const [expensePage, setExpensePage] = useState(1);
    const [expenseForm, setExpenseForm] = useState({
        title: '',
        amount: '',
        quantity: '1',
        currency: 'UZS' as ApiPaymentExpenseCurrency,
        expense_date: getTodayInputValue(),
    });
    const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
    const [expensePendingDelete, setExpensePendingDelete] = useState<ExpenseRow | null>(null);
    const [isUrlPatientFilterDismissed, setIsUrlPatientFilterDismissed] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const patientFilterId = isUrlPatientFilterDismissed ? '' : patientIdFromUrl;
    const deferredPatientSearch = useDeferredValue(patientSearch.trim());
    const deferredExpenseSearch = useDeferredValue(expenseSearch.trim());
    const currentUserQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        staleTime: 5 * 60_000,
    });
    const currentUser = currentUserQuery.data;
    const canViewPayments = canView(currentUser, 'payments');
    const canManagePayments = canManage(currentUser, 'payments');

    const patientLedgerQuery = useQuery({
        queryKey: [
            'payments',
            'ledger',
            'patients',
            patientFilterId,
            showOutstandingOnly,
            deferredPatientSearch,
            patientPage,
        ],
        enabled: canViewPayments,
        queryFn: () =>
            listPaymentLedgerPatients({
                page: patientPage,
                perPage: PAGE_SIZE,
                filter: {
                    patient_id: patientFilterId || undefined,
                    outstanding: showOutstandingOnly ? OUTSTANDING_FILTER_VALUE : undefined,
                    search: deferredPatientSearch || undefined,
                },
            }),
        placeholderData: (previousData) => previousData,
        staleTime: 300000,
        gcTime: 900000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });
    const patientOverviewQuery = useQuery({
        queryKey: ['payments', 'ledger', 'patients', 'overview'],
        enabled: canViewPayments,
        queryFn: () =>
            listPaymentLedgerPatients({
                page: 1,
                perPage: 1,
            }),
        staleTime: 300000,
        gcTime: 900000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });
    const expensesQuery = useQuery({
        queryKey: [
            'payments',
            'expenses',
            deferredExpenseSearch,
            expensePage,
        ],
        enabled: canViewPayments && activeTab === 'expenses',
        queryFn: () =>
            listPaymentExpenses({
                page: expensePage,
                perPage: PAGE_SIZE,
                filter: {
                    search: deferredExpenseSearch || undefined,
                },
            }),
        placeholderData: (previousData) => previousData,
        staleTime: 300000,
        gcTime: 900000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });
    const expenseOverviewQuery = useQuery({
        queryKey: ['payments', 'expenses', 'overview'],
        enabled: canViewPayments && activeTab === 'expenses',
        queryFn: () =>
            listPaymentExpenses({
                page: 1,
                perPage: 1,
            }),
        staleTime: 300000,
        gcTime: 900000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });
    const createExpenseMutation = useMutation({
        mutationFn: createPaymentExpense,
        onSuccess: () => {
            toast.success(t('payments.expenses.created'));
            resetExpenseForm();
            setExpensePage(1);
            queryClient.invalidateQueries({ queryKey: ['payments', 'expenses'] });
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('payments.expenses.createFailed')));
        },
    });
    const updateExpenseMutation = useMutation({
        mutationFn: ({ id, payload }: {
            id: string;
            payload: Parameters<typeof updatePaymentExpense>[1];
        }) => updatePaymentExpense(id, payload),
        onSuccess: () => {
            toast.success(t('payments.expenses.updated'));
            resetExpenseForm();
            queryClient.invalidateQueries({ queryKey: ['payments', 'expenses'] });
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('payments.expenses.updateFailed')));
        },
    });
    const deleteExpenseMutation = useMutation({
        mutationFn: deletePaymentExpense,
        onSuccess: () => {
            toast.success(t('payments.expenses.deleted'));
            setExpensePendingDelete(null);
            queryClient.invalidateQueries({ queryKey: ['payments', 'expenses'] });
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('payments.expenses.deleteFailed')));
        },
    });

    const formatDate = (value: string | null) => {
        if (!value) {
            return '-';
        }

        return formatLocalizedDate(value, locale, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    };

    const patientRows = useMemo(
        () => (patientLedgerQuery.data?.data ?? []).map(toPatientBalanceRow),
        [patientLedgerQuery.data]
    );

    const expenseRows = useMemo(
        () => (expensesQuery.data?.data ?? []).map(toExpenseRow),
        [expensesQuery.data]
    );

    const overallSummary = useMemo(
        () => ledgerSummaryFromResponse(patientOverviewQuery.data?.meta?.summary),
        [patientOverviewQuery.data]
    );
    const filteredPaymentSummary = useMemo(
        () => ledgerSummaryFromResponse(patientLedgerQuery.data?.meta?.summary),
        [patientLedgerQuery.data]
    );

    const expenseSummary = useMemo(() => {
        const summary = expenseOverviewQuery.data?.meta?.summary;
        return {
            totalCount: Number(summary?.total_count ?? 0),
            totalAmount: Number(summary?.total_amount ?? 0),
            currentMonthAmount: Number(summary?.current_month_amount ?? 0),
            totalsByCurrency: currencyTotalsFromSummary(summary?.totals_by_currency),
            currentMonthByCurrency: currencyTotalsFromSummary(summary?.current_month_by_currency),
            latestExpenseDate: typeof summary?.latest_expense_date === 'string' ? summary.latest_expense_date : null,
        };
    }, [expenseOverviewQuery.data]);

    const patientPagination = patientLedgerQuery.data?.meta?.pagination;
    const expensePagination = expensesQuery.data?.meta?.pagination;
    const patientTotalCount = patientPagination?.total ?? 0;
    const expenseTotalCount = expensePagination?.total ?? 0;
    const patientTotalPages = Math.max(1, patientPagination?.total_pages ?? 1);
    const expenseTotalPages = Math.max(1, expensePagination?.total_pages ?? 1);
    const effectivePatientPage = Math.min(patientPage, patientTotalPages);
    const effectiveExpensePage = Math.min(expensePage, expenseTotalPages);
    const paginatedPatientRows = patientRows;
    const paginatedExpenseRows = expenseRows;

    useEffect(() => {
        if (activeTab === 'expenses' && expensesQuery.data && expensePage > expenseTotalPages) {
            setExpensePage(expenseTotalPages);
        }
    }, [activeTab, expensePage, expenseTotalPages, expensesQuery.data]);

    const updateUrlSearch = (update: (params: URLSearchParams) => void) => {
        if (typeof window === 'undefined') {
            return;
        }

        const nextUrl = new URL(window.location.href);
        update(nextUrl.searchParams);
        replaceUrl(nextUrl);
    };

    const resetExpenseForm = () => {
        setEditingExpenseId(null);
        setExpenseForm({
            title: '',
            amount: '',
            quantity: '1',
            currency: 'UZS',
            expense_date: getTodayInputValue(),
        });
    };

    const handleEditExpense = (row: ExpenseRow) => {
        setEditingExpenseId(row.id);
        setExpenseForm({
            title: row.title,
            amount: formatMoneyInput(String(row.amount), row.currency),
            quantity: formatQuantityInput(String(row.quantity)),
            currency: row.currency,
            expense_date: row.date || getTodayInputValue(),
        });
    };

    const clearPatientFilter = () => {
        setIsUrlPatientFilterDismissed(true);
        setPatientPage(1);
        setExpensePage(1);
        updateUrlSearch((params) => params.delete('patientId'));
    };

    const handleOutstandingFilterChange = () => {
        const nextShowOutstandingOnly = !showOutstandingOnly;
        setPatientPage(1);
        setExpensePage(1);
        updateUrlSearch((params) => {
            if (nextShowOutstandingOnly) {
                params.set(OUTSTANDING_FILTER_PARAM, OUTSTANDING_FILTER_VALUE);
                return;
            }

            params.delete(OUTSTANDING_FILTER_PARAM);
        });
    };

    const handleTabChange = (tab: PaymentsTab) => {
        setPatientPage(1);
        setExpensePage(1);
        updateUrlSearch((params) => {
            if (tab === 'expenses') {
                params.set('tab', 'expenses');
            } else {
                params.delete('tab');
            }
        });
    };

    const handleExpenseSubmit = () => {
        const title = expenseForm.title.trim();
        const currency = coerceExpenseCurrency(expenseForm.currency);
        const amount = parseMoneyInput(expenseForm.amount, currency);
        const quantity = parseDecimalInput(expenseForm.quantity);

        if (!title || amount <= 0 || quantity <= 0 || !expenseForm.expense_date) {
            toast.error(t('payments.expenses.validation'));
            return;
        }

        const payload = {
            title,
            amount,
            quantity,
            currency,
            expense_date: expenseForm.expense_date,
        };

        if (editingExpenseId) {
            updateExpenseMutation.mutate({ id: editingExpenseId, payload });
            return;
        }

        createExpenseMutation.mutate(payload);
    };

    const handleExportPayments = async () => {
        if (overallSummary.totalPatients === 0) {
            toast.error(t('export.empty'));
            return;
        }

        setIsExporting(true);
        try {
            const rows: PatientBalanceRow[] = [];
            let page = 1;
            let totalPages = 1;
            let requestCount = 0;

            do {
                requestCount += 1;
                if (requestCount > MAX_EXPORT_PAGE_REQUESTS) {
                    throw new Error('Payment export exceeded the page limit.');
                }
                const response = await listPaymentLedgerPatients({
                    page,
                    perPage: LEDGER_EXPORT_PAGE_SIZE,
                    filter: {
                        patient_id: patientFilterId || undefined,
                        outstanding: showOutstandingOnly ? OUTSTANDING_FILTER_VALUE : undefined,
                        search: patientSearch.trim() || undefined,
                    },
                });
                rows.push(...response.data.map(toPatientBalanceRow));
                if (rows.length > MAX_EXPORT_ROWS) {
                    throw new Error('Payment export exceeded the row limit.');
                }
                totalPages = response.meta?.pagination?.total_pages ?? 1;
                if (!Number.isInteger(totalPages) || totalPages < 1) {
                    throw new Error('Payment export received invalid pagination.');
                }
                page += 1;
            } while (page <= totalPages);

            if (rows.length === 0) {
                toast.error(t('export.empty'));
                return;
            }

            exportRowsToPdf({
                filename: buildPdfFilename('payments'),
                title: t('payments.title'),
                subtitle: t('payments.subtitle'),
                locale,
                columns: [
                    t('payments.table.patient'),
                    t('patients.table.phone'),
                    t('payments.table.entries'),
                    t('payments.table.debt'),
                    t('payments.table.paid'),
                    t('payments.table.balance'),
                    t('payments.table.lastEntry'),
                ],
                rows: rows.map((row) => [
                    row.patientName,
                    row.patientPhone,
                    String(row.entryCount),
                    formatBalanceBreakdown(row.balancesByCurrency, 'totalDebt'),
                    formatBalanceBreakdown(row.balancesByCurrency, 'totalPaid'),
                    getVisibleBalanceLines(row.balancesByCurrency, 'balance')
                        .map(({ currency, amount, rawAmount }) => {
                            const balanceStatus = shouldShowBalanceStatus(
                                row.balancesByCurrency[currency].totalDebt,
                                row.balancesByCurrency[currency].totalPaid,
                                row.balancesByCurrency[currency].balance
                            )
                                ? ` (${t(getNetBalanceSummary(rawAmount).statusKey)})`
                                : '';

                            return `${formatCurrency(amount, currency)}${balanceStatus}`;
                        })
                        .join(' / '),
                    row.lastEntryDate ? formatLocalizedDate(row.lastEntryDate, locale, { year: 'numeric', month: 'short', day: 'numeric' }) : '-',
                ]),
                summary: [
                    { label: t('payments.summary.totalDebt'), value: formatBalanceBreakdown(filteredPaymentSummary.balancesByCurrency, 'totalDebt') },
                    { label: t('payments.summary.totalPaid'), value: formatBalanceBreakdown(filteredPaymentSummary.balancesByCurrency, 'totalPaid') },
                    {
                        label: t('payments.summary.totalBalance'),
                        value: formatBalanceBreakdown(filteredPaymentSummary.balancesByCurrency, 'balance'),
                    },
                ],
                orientation: 'landscape',
            });
            toast.success(t('export.downloaded'));
        } catch (error) {
            toast.error(getApiErrorMessage(error, t('payments.error.loadFailed')));
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportExpenses = async () => {
        if (expenseSummary.totalCount === 0) {
            toast.error(t('export.empty'));
            return;
        }

        setIsExporting(true);
        try {
            const rows = await fetchExpenseExportRows(expenseSearch.trim());

            if (rows.length === 0) {
                toast.error(t('export.empty'));
                return;
            }

            exportRowsToPdf({
                filename: buildPdfFilename('expenses'),
                title: t('payments.expensesTitle'),
                subtitle: t('payments.expensesSubtitle'),
                locale,
                columns: [
                    t('payments.expenses.date'),
                    t('payments.table.expenseTitle'),
                    t('payments.expenses.quantity'),
                    t('payments.expenses.amount'),
                ],
                rows: rows.map((row) => [
                    formatDate(row.date),
                    row.title,
                    String(row.quantity),
                    formatExpenseAmount(row.amount, row.currency, locale),
                ]),
                orientation: 'portrait',
            });
            toast.success(t('export.downloaded'));
        } catch (error) {
            toast.error(getApiErrorMessage(error, t('payments.error.loadFailed')));
        } finally {
            setIsExporting(false);
        }
    };

    if (
        currentUserQuery.isLoading
        || (patientLedgerQuery.isLoading && !patientLedgerQuery.data)
        || (patientOverviewQuery.isLoading && !patientOverviewQuery.data)
        || (activeTab === 'expenses' && expensesQuery.isLoading && !expensesQuery.data)
        || (activeTab === 'expenses' && expenseOverviewQuery.isLoading && !expenseOverviewQuery.data)
    ) {
        return <PaymentsLoadingState tab={activeTab} />;
    }

    if (!canViewPayments) {
        return (
            <div className="space-y-6">
                <PageHeader title={t('payments.title')} description={t('payments.subtitle')} />
                <AccessDeniedState
                    title={t('common.forbiddenTitle')}
                    description={t('permissions.deniedDescription')}
                    actionLabel={t('dashboard.title')}
                    className="min-h-[20rem] px-0 py-0"
                />
            </div>
        );
    }

    if (
        (
            currentUserQuery.isError
            || (patientLedgerQuery.isError && !patientLedgerQuery.data)
            || (patientOverviewQuery.isError && !patientOverviewQuery.data)
            || (activeTab === 'expenses' && expensesQuery.isError && !expensesQuery.data)
            || (activeTab === 'expenses' && expenseOverviewQuery.isError && !expenseOverviewQuery.data)
        )
    ) {
        return (
            <div className="space-y-6">
                <PageHeader title={t('payments.title')} description={t('payments.subtitle')} />
                <AppErrorState
                    title={t('common.loadErrorTitle')}
                    description={getApiErrorMessage(
                        currentUserQuery.error
                        || patientLedgerQuery.error
                        || patientOverviewQuery.error
                        || expensesQuery.error
                        || expenseOverviewQuery.error,
                        t('payments.error.loadFailed')
                    )}
                    retryLabel={t('common.retry')}
                    onRetry={() => {
                        currentUserQuery.refetch();
                        patientLedgerQuery.refetch();
                        patientOverviewQuery.refetch();
                        expensesQuery.refetch();
                        expenseOverviewQuery.refetch();
                    }}
                    className="min-h-[20rem] px-0 py-0"
                />
            </div>
        );
    }

    const isAccountingLoading = patientOverviewQuery.isLoading && !patientOverviewQuery.data;
    const isExpensesLoading = expenseOverviewQuery.isLoading && !expenseOverviewQuery.data;
    const isExpenseFormPending = createExpenseMutation.isPending || updateExpenseMutation.isPending;
    const isEditingExpense = editingExpenseId !== null;
    const hasMixedNetBalanceStatus = hasMixedBalanceStatus(overallSummary.balancesByCurrency);
    const netBalanceSummary = hasMixedNetBalanceStatus
        ? NET_BALANCE_SUMMARY_VARIANTS.mixed
        : getNetBalanceSummary(getRepresentativeBalance(overallSummary.balancesByCurrency));
    const shouldShowNetBalanceStatus = !hasMixedNetBalanceStatus && canShowSingleBalanceStatus(overallSummary.balancesByCurrency);

    return (
        <div className="space-y-5 lg:space-y-6">
            <PageHeader
                title={t('payments.title')}
                description={t('payments.subtitle')}
                actions={currentUser?.subscription?.can_export ? (
                    <Button
                        variant="outline"
                        className="w-full sm:w-auto"
                        disabled={
                            isExporting
                            || (activeTab === 'patients' ? overallSummary.totalPatients === 0 : expenseSummary.totalCount === 0)
                        }
                        onClick={activeTab === 'patients' ? handleExportPayments : handleExportExpenses}
                    >
                        <Download className="mr-2 h-4 w-4" />
                        {t('common.export')}
                    </Button>
                ) : undefined}
            />

            {activeTab === 'expenses' ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="interactive-card metric-hover-card metric-hover-red rounded-2xl border border-red-100 bg-white p-4 shadow-sm shadow-red-100/60 md:p-5">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                            <Receipt className="h-4 w-4 text-red-500" />
                            {t('payments.summary.expenseTotal')}
                        </div>
                        <p className="mt-2 text-lg font-semibold leading-none tabular-nums text-red-700">
                            {isExpensesLoading ? '...' : formatExpenseTotals(expenseSummary.totalsByCurrency, locale)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{t('payments.summary.expenseTotalHint')}</p>
                    </div>

                    <div className="interactive-card metric-hover-card metric-hover-emerald rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm shadow-emerald-100/60 md:p-5">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                            <Wallet className="h-4 w-4 text-green-600" />
                            {t('payments.summary.expenseCurrentMonth')}
                        </div>
                        <p className="mt-2 text-lg font-semibold leading-none tabular-nums text-green-700">
                            {isExpensesLoading ? '...' : formatExpenseTotals(expenseSummary.currentMonthByCurrency, locale)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{t('payments.summary.expenseCurrentMonthHint')}</p>
                    </div>

                    <div className="interactive-card metric-hover-card metric-hover-teal rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 via-teal-50/80 to-white p-4 shadow-sm shadow-cyan-100/70 md:p-5">
                        <div className="flex items-center gap-2 text-sm font-medium text-cyan-700">
                            <Receipt className="h-4 w-4 text-teal-600" />
                            {t('payments.summary.expenseRecords')}
                        </div>
                        <p className="mt-2 text-lg font-semibold leading-none tabular-nums text-cyan-950">
                            {isExpensesLoading ? '...' : expenseSummary.totalCount}
                        </p>
                        <p className="mt-1 text-xs text-cyan-600/80">{t('payments.summary.expenseRecordsHint')}</p>
                    </div>

                    <div className="interactive-card metric-hover-card metric-hover-slate rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60 md:p-5">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                            <CalendarDays className="h-4 w-4 text-slate-500" />
                            {t('payments.summary.expenseLatest')}
                        </div>
                        <p className="mt-2 text-lg font-semibold leading-none tabular-nums text-slate-800">
                            {isExpensesLoading ? '...' : formatDate(expenseSummary.latestExpenseDate)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{t('payments.summary.expenseLatestHint')}</p>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="interactive-card metric-hover-card metric-hover-red rounded-2xl border border-red-100 bg-white p-4 shadow-sm shadow-red-100/60 md:p-5">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                            <AlertCircle className="h-4 w-4 text-red-500" />
                            {t('payments.summary.totalDebt')}
                        </div>
                        <p className="mt-2 text-lg font-semibold leading-none tabular-nums text-red-700">
                            {isAccountingLoading ? '...' : formatBalanceBreakdown(overallSummary.balancesByCurrency, 'totalDebt')}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{t('payments.summary.totalDebtHint')}</p>
                    </div>

                    <div className="interactive-card metric-hover-card metric-hover-emerald rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm shadow-emerald-100/60 md:p-5">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                            <Wallet className="h-4 w-4 text-green-600" />
                            {t('payments.summary.totalPaid')}
                        </div>
                        <p className="mt-2 text-lg font-semibold leading-none tabular-nums text-green-700">
                            {isAccountingLoading ? '...' : formatBalanceBreakdown(overallSummary.balancesByCurrency, 'totalPaid')}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{t('payments.summary.totalPaidHint')}</p>
                    </div>

                    <div className={`interactive-card metric-hover-card rounded-2xl border bg-white p-4 shadow-sm md:p-5 ${netBalanceSummary.cardClassName}`}>
                        <div className={`flex flex-wrap items-center gap-2 text-sm font-medium ${netBalanceSummary.labelClassName}`}>
                            <History className={`h-4 w-4 ${netBalanceSummary.iconClassName}`} />
                            <span>{t('payments.summary.netBalance')}</span>
                            {!isAccountingLoading && shouldShowNetBalanceStatus ? (
                                <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${netBalanceSummary.badgeClassName}`}>
                                    {t(netBalanceSummary.statusKey)}
                                </span>
                            ) : null}
                        </div>
                        <div className={`mt-2 text-lg font-semibold leading-tight tabular-nums ${netBalanceSummary.valueClassName}`}>
                            {isAccountingLoading
                                ? '...'
                                : hasMixedNetBalanceStatus
                                    ? renderBalanceBreakdownWithStatusBadges(overallSummary.balancesByCurrency, t)
                                    : formatBalanceBreakdown(overallSummary.balancesByCurrency, 'balance')}
                        </div>
                        <p className={`mt-1 text-xs ${netBalanceSummary.hintClassName}`}>{t(netBalanceSummary.hintKey)}</p>
                    </div>

                    <div className="interactive-card metric-hover-card metric-hover-teal rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 via-teal-50/80 to-white p-4 shadow-sm shadow-cyan-100/70 md:p-5">
                        <div className="flex items-center gap-2 text-sm font-medium text-cyan-700">
                            <Users className="h-4 w-4 text-teal-600" />
                            {t('payments.summary.totalPatients')}
                        </div>
                        <p className="mt-2 text-lg font-semibold leading-none tabular-nums text-cyan-950">
                            {isAccountingLoading ? '...' : overallSummary.totalPatients}
                        </p>
                        <p className="mt-1 text-xs text-cyan-600/80">
                            {t('payments.summary.entryCount', { count: overallSummary.totalEntries })}
                        </p>
                    </div>
                </div>
            )}

            <Card className="overflow-hidden rounded-2xl bg-white">
                <CardContent className="space-y-5 p-4 sm:p-5">
                    <div className="flex flex-col gap-4 rounded-2xl border border-teal-100/80 bg-white p-3 shadow-xs lg:flex-row lg:items-center lg:justify-between">
                        <div className="inline-flex w-full items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-100/70 p-1 shadow-xs sm:w-auto">
                            <Button
                                type="button"
                                variant="ghost"
                                className={`flex-1 gap-2 rounded-lg sm:flex-none ${
                                    activeTab === 'patients'
                                        ? 'bg-teal-50 text-teal-700 shadow-sm ring-1! ring-teal-300! focus-visible:border-transparent! hover:bg-teal-50 hover:text-teal-700'
                                        : 'text-slate-600 hover:bg-white hover:text-slate-900'
                                }`}
                                onClick={() => handleTabChange('patients')}
                            >
                                <Users className="h-4 w-4" />
                                {t('payments.tabs.patients')}
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                className={`flex-1 gap-2 rounded-lg sm:flex-none ${
                                    activeTab === 'expenses'
                                        ? 'bg-teal-50 text-teal-700 shadow-sm ring-1! ring-teal-300! focus-visible:border-transparent! hover:bg-teal-50 hover:text-teal-700'
                                        : 'text-slate-600 hover:bg-white hover:text-slate-900'
                                }`}
                                onClick={() => handleTabChange('expenses')}
                            >
                                <Receipt className="h-4 w-4" />
                                {t('payments.tabs.expenses')}
                            </Button>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                            <div className="relative min-w-0 sm:w-[22rem]">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <Input
                                    value={activeTab === 'patients' ? patientSearch : expenseSearch}
                                    onChange={(event) => {
                                        if (activeTab === 'patients') {
                                            setPatientSearch(event.target.value);
                                            setPatientPage(1);
                                            return;
                                        }

                                        setExpenseSearch(event.target.value);
                                        setExpensePage(1);
                                    }}
                                    placeholder={activeTab === 'patients' ? t('payments.search.patientPlaceholder') : t('payments.search.expensePlaceholder')}
                                    className="h-9 rounded-xl border-slate-200 bg-white pl-9 shadow-xs"
                                />
                            </div>
                            {activeTab === 'patients' ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    aria-pressed={showOutstandingOnly}
                                    aria-label={t('payments.filters.outstandingOnly')}
                                    title={showOutstandingOnly ? t('payments.filters.clearOutstanding') : t('payments.filters.outstandingHint')}
                                    className={`h-9 w-full justify-center rounded-xl px-3 sm:w-auto ${
                                        showOutstandingOnly
                                            ? 'border-red-200 bg-red-50 text-red-700 shadow-xs ring-1 ring-red-100 hover:bg-red-50 hover:text-red-700'
                                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                    }`}
                                    onClick={handleOutstandingFilterChange}
                                >
                                    <AlertCircle className={`h-4 w-4 ${showOutstandingOnly ? 'text-red-600' : 'text-slate-400'}`} />
                                    <span>{t('payments.filters.outstandingOnly')}</span>
                                    {showOutstandingOnly ? <X className="h-3.5 w-3.5 text-red-600" aria-hidden="true" /> : null}
                                </Button>
                            ) : null}
                            {activeTab === 'patients' && patientFilterId ? (
                                <Button variant="outline" className="rounded-xl bg-white" onClick={clearPatientFilter}>{t('payments.clearFilter')}</Button>
                            ) : null}
                        </div>
                    </div>

                    {activeTab === 'patients' && patientFilterId ? (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-100 bg-teal-50/80 px-4 py-3">
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-teal-900">{t('payments.patientFilterActive')}</p>
                                <p className="text-xs text-teal-700">{t('payments.patientFilterDescription')}</p>
                            </div>
                            <Button variant="outline" size="sm" onClick={clearPatientFilter}>{t('payments.clearFilter')}</Button>
                        </div>
                    ) : null}

                    {activeTab === 'patients' ? (
                        <div className="space-y-4">
                            {patientTotalCount === 0 ? (
                                <div className="rounded-2xl border border-dashed border-slate-200">
                                    <EmptyState
                                        icon={Wallet}
                                        title={showOutstandingOnly ? t('payments.empty.outstandingPatients') : t('payments.empty.patients')}
                                    />
                                </div>
                            ) : (
                                <>
                                    <DataTableShell>
                                        <Table className={getDataTableClassName('standard')}>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>{t('payments.table.number')}</TableHead>
                                                    <TableHead>{t('payments.table.patient')}</TableHead>
                                                    <TableHead>{t('payments.table.lastEntry')}</TableHead>
                                                    <TableHead>{t('payments.table.entries')}</TableHead>
                                                    <TableHead>{t('payments.table.debt')}</TableHead>
                                                    <TableHead>{t('payments.table.paid')}</TableHead>
                                                    <TableHead>{t('payments.table.balance')}</TableHead>
                                                    <TableHead className="text-right">{t('payments.table.actions')}</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {paginatedPatientRows.map((row, index) => (
                                                    <TableRow key={row.patientId}>
                                                        <TableCell>{(effectivePatientPage - 1) * PAGE_SIZE + index + 1}</TableCell>
                                                        <TableCell>
                                                            <div className="space-y-1">
                                                                <p className="font-medium text-slate-900">{row.patientName}</p>
                                                                <p className="text-xs text-slate-500">
                                                                    <Phone aria-hidden="true" className="mr-1 inline-block h-3 w-3 text-slate-400" />
                                                                    {row.patientPhone}
                                                                </p>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>{formatDate(row.lastEntryDate)}</TableCell>
                                                        <TableCell>{row.entryCount}</TableCell>
                                                        <TableCell className="whitespace-pre-line text-red-700">{formatBalanceBreakdown(row.balancesByCurrency, 'totalDebt')}</TableCell>
                                                        <TableCell className="whitespace-pre-line text-green-700">{formatBalanceBreakdown(row.balancesByCurrency, 'totalPaid')}</TableCell>
                                                        <TableCell>
                                                            <BalanceAmount
                                                                balances={row.balancesByCurrency}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Button asChild variant="outline" size="sm">
                                                                <Link href={`/payments/patients/${row.patientId}`}>
                                                                    {t('payments.openPatient')}
                                                                </Link>
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </DataTableShell>

                                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                        <p className="text-sm text-slate-500">{t('payments.pagination.pageOf', { page: effectivePatientPage, total: patientTotalPages })}</p>
                                        <div className="flex flex-wrap items-center gap-2 md:justify-end">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="min-w-[96px]"
                                                disabled={effectivePatientPage === 1}
                                                onClick={() => setPatientPage((current) => Math.max(1, current - 1))}
                                            >
                                                {t('payments.pagination.previous')}
                                            </Button>
                                            <span className="inline-flex min-w-[132px] justify-center rounded-xl border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600 shadow-xs">
                                                {t('payments.pagination.pageOf', { page: effectivePatientPage, total: patientTotalPages })}
                                            </span>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="min-w-[80px]"
                                                disabled={effectivePatientPage >= patientTotalPages}
                                                onClick={() => setPatientPage((current) => Math.min(patientTotalPages, current + 1))}
                                            >
                                                {t('payments.pagination.next')}
                                            </Button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-teal-100 bg-teal-50/40 p-4 shadow-xs">
                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_11rem_8rem_8rem_11rem_auto] xl:items-end">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500" htmlFor="expense-title">
                                            {t('payments.expenses.title')}
                                        </label>
                                        <Input
                                            id="expense-title"
                                            value={expenseForm.title}
                                            onChange={(event) => setExpenseForm((current) => ({ ...current, title: event.target.value }))}
                                            placeholder={t('payments.expenses.titlePlaceholder')}
                                            className="h-10 rounded-xl border-slate-200 bg-white shadow-xs"
                                            disabled={!canManagePayments || isExpenseFormPending}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500" htmlFor="expense-amount">
                                            {t('payments.expenses.amount')}
                                        </label>
                                        <Input
                                            id="expense-amount"
                                            value={expenseForm.amount}
                                            onChange={(event) =>
                                                setExpenseForm((current) => ({
                                                    ...current,
                                                    amount: formatMoneyInput(event.target.value, current.currency),
                                                }))
                                            }
                                            placeholder={t('payments.expenses.amountPlaceholder')}
                                            inputMode="decimal"
                                            className="h-10 rounded-xl border-slate-200 bg-white shadow-xs"
                                            disabled={!canManagePayments || isExpenseFormPending}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500" htmlFor="expense-quantity">
                                            {t('payments.expenses.quantity')}
                                        </label>
                                        <Input
                                            id="expense-quantity"
                                            value={expenseForm.quantity}
                                            onChange={(event) =>
                                                setExpenseForm((current) => ({
                                                    ...current,
                                                    quantity: formatQuantityInput(event.target.value),
                                                }))
                                            }
                                            inputMode="decimal"
                                            className="h-10 rounded-xl border-slate-200 bg-white shadow-xs"
                                            disabled={!canManagePayments || isExpenseFormPending}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500" htmlFor="expense-currency">
                                            {t('payments.expenses.currency')}
                                        </label>
                                        <Select
                                            value={expenseForm.currency}
                                            onValueChange={(value) => {
                                                const currency = coerceExpenseCurrency(value);
                                                setExpenseForm((current) => ({
                                                    ...current,
                                                    currency,
                                                    amount: formatMoneyInput(current.amount, currency),
                                                }));
                                            }}
                                            disabled={!canManagePayments || isExpenseFormPending}
                                        >
                                            <SelectTrigger
                                                id="expense-currency"
                                                aria-label={t('payments.expenses.currency')}
                                                className="h-10 w-full rounded-xl border-slate-200 bg-white text-slate-900 shadow-xs"
                                            >
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent
                                                position="popper"
                                                align="start"
                                                className="min-w-[var(--radix-select-trigger-width)] border-slate-200 bg-white shadow-xl shadow-slate-200/70"
                                            >
                                                {EXPENSE_CURRENCIES.map((currency) => (
                                                    <SelectItem key={currency} value={currency} className="rounded-lg">
                                                        {t(`payments.expenses.currency.${currency.toLowerCase()}`)}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500" htmlFor="expense-date">
                                            {t('payments.expenses.date')}
                                        </label>
                                        <Input
                                            id="expense-date"
                                            type="date"
                                            value={expenseForm.expense_date}
                                            onChange={(event) => setExpenseForm((current) => ({ ...current, expense_date: event.target.value }))}
                                            className="h-10 rounded-xl border-slate-200 bg-white shadow-xs"
                                            disabled={!canManagePayments || isExpenseFormPending}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2 sm:flex-row md:col-span-2 md:justify-end xl:col-span-1 xl:justify-start">
                                        <Button
                                            type="button"
                                            className="h-10 min-w-[128px] rounded-xl bg-slate-950 text-white hover:bg-slate-900"
                                            disabled={!canManagePayments || isExpenseFormPending}
                                            onClick={handleExpenseSubmit}
                                        >
                                            <Plus className="mr-2 h-4 w-4" />
                                            {isEditingExpense
                                                ? (updateExpenseMutation.isPending ? t('payments.expenses.updating') : t('payments.expenses.update'))
                                                : (createExpenseMutation.isPending ? t('payments.expenses.adding') : t('payments.expenses.add'))}
                                        </Button>
                                        {isEditingExpense ? (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="h-10 min-w-[104px] rounded-xl bg-white"
                                                disabled={isExpenseFormPending}
                                                onClick={resetExpenseForm}
                                            >
                                                {t('common.cancel')}
                                            </Button>
                                        ) : null}
                                    </div>
                                </div>
                                {!canManagePayments ? (
                                    <p className="mt-3 text-xs text-slate-500">{t('permissions.deniedDescription')}</p>
                                ) : null}
                            </div>

                            {expenseTotalCount === 0 ? (
                                <div className="rounded-xl border border-dashed border-slate-200 px-6 py-10 text-center">
                                    <Receipt className="mx-auto h-10 w-10 text-slate-300" />
                                    <p className="mt-4 text-sm text-slate-500">{t('payments.empty.expenses')}</p>
                                </div>
                            ) : (
                                <>
                                    <DataTableShell>
                                        <Table className={getDataTableClassName('standard')}>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>{t('payments.table.date')}</TableHead>
                                                    <TableHead>{t('payments.table.expenseTitle')}</TableHead>
                                                    <TableHead className="text-right">{t('payments.expenses.quantity')}</TableHead>
                                                    <TableHead className="text-right">{t('payments.expenses.amount')}</TableHead>
                                                    <TableHead className="text-right">{t('payments.table.actions')}</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {paginatedExpenseRows.map((row) => (
                                                    <TableRow key={row.id}>
                                                        <TableCell>{formatDate(row.date)}</TableCell>
                                                        <TableCell className="font-medium text-slate-900">{row.title}</TableCell>
                                                        <TableCell className="text-right tabular-nums text-slate-600">
                                                            {row.quantity}
                                                        </TableCell>
                                                        <TableCell className="text-right font-semibold tabular-nums text-red-700">
                                                            {formatExpenseAmount(row.amount, row.currency, locale)}
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex justify-end gap-2">
                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    size="icon"
                                                                    className="h-9 w-9 rounded-xl"
                                                                    disabled={!canManagePayments || isExpenseFormPending || deleteExpenseMutation.isPending}
                                                                    aria-label={t('payments.expenses.editAria', { title: row.title })}
                                                                    onClick={() => handleEditExpense(row)}
                                                                >
                                                                    <Pencil className="h-4 w-4" />
                                                                </Button>
                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    size="icon"
                                                                    className="h-9 w-9 rounded-xl border-red-100 text-red-600 hover:bg-red-50 hover:text-red-700"
                                                                    disabled={!canManagePayments || deleteExpenseMutation.isPending}
                                                                    aria-label={t('payments.expenses.deleteAria', { title: row.title })}
                                                                    onClick={() => setExpensePendingDelete(row)}
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </DataTableShell>

                                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                        <p className="text-sm text-slate-500">{t('payments.pagination.pageOf', { page: effectiveExpensePage, total: expenseTotalPages })}</p>
                                        <div className="flex flex-wrap items-center gap-2 md:justify-end">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="min-w-[96px]"
                                                disabled={effectiveExpensePage === 1}
                                                onClick={() => setExpensePage((current) => Math.max(1, current - 1))}
                                            >
                                                {t('payments.pagination.previous')}
                                            </Button>
                                            <span className="inline-flex min-w-[132px] justify-center rounded-xl border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600 shadow-xs">
                                                {t('payments.pagination.pageOf', { page: effectiveExpensePage, total: expenseTotalPages })}
                                            </span>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="min-w-[80px]"
                                                disabled={effectiveExpensePage >= expenseTotalPages}
                                                onClick={() => setExpensePage((current) => Math.min(expenseTotalPages, current + 1))}
                                            >
                                                {t('payments.pagination.next')}
                                            </Button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
            <ConfirmActionDialog
                open={expensePendingDelete !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setExpensePendingDelete(null);
                    }
                }}
                title={t('payments.expenses.deleteTitle')}
                description={t('payments.expenses.deleteDescription', {
                    title: expensePendingDelete?.title ?? '',
                })}
                confirmLabel={t('payments.expenses.delete')}
                pendingLabel={t('payments.expenses.deleting')}
                cancelLabel={t('common.cancel')}
                isPending={deleteExpenseMutation.isPending}
                onConfirm={() => {
                    if (expensePendingDelete) {
                        deleteExpenseMutation.mutate(expensePendingDelete.id);
                    }
                }}
            />
        </div>
    );
}
