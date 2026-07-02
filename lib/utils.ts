import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { formatLocalizedDate, getActiveDisplayLocale } from "@/lib/i18n/date"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a monetary amount with a currency suffix. The `currency` parameter
 * is optional and defaults to `'UZS'` so existing call sites that don't
 * know the currency (legacy helpers, generic widgets) keep working — but
 * any UI that has access to a `plan.currency` / `payment.currency` /
 * `subscription.currency` field SHOULD pass it explicitly. Without that,
 * multi-currency tenants see e.g. a Pro plan priced in USD rendered as
 * "100 UZS" — a real and visible labelling bug.
 *
 * Guards against NaN / Infinity (e.g. when a KPI denominator is zero and
 * the caller forgot to clamp). `Intl.NumberFormat` happily prints "NaN"
 * which leaks bad math straight to the UI; "0 UZS" is the safer default.
 */
export function formatCurrency(amount: number, currency: string = 'UZS'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const normalizedCurrency = currency.toUpperCase();
  const fractionDigits = normalizedCurrency === 'UZS' ? 0 : 2;
  // Uppercase to match the ApiPlan.currency / ApiBillingPayment.currency
  // convention. We don't pass `style: 'currency'` because that injects a
  // locale-specific symbol (₽, $, etc.) which is wrong for UZS — that's
  // a 3-letter suffix the user expects, not a symbol.
  return new Intl.NumberFormat('uz-UZ', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(safe) + ' ' + normalizedCurrency;
}

export function formatDate(date: string): string {
  // Formats in the app's active locale (RU/UZ/EN) instead of a hardcoded
  // en-US, so dates match the chosen language everywhere formatDate is used.
  return formatLocalizedDate(date, getActiveDisplayLocale(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatTime(time: string): string {
  return time;
}

export function extractPrimaryPhone(phone: string | null | undefined): string {
  const raw = (phone ?? '').trim();
  if (!raw) {
    return '';
  }

  const parts = raw.split(/\s*(?:\||,|;|\/)\s*/).filter(Boolean);
  return (parts[0] ?? raw).trim();
}

export function sanitizeTimeInput(value: string): string {
  return value.replace(/[^\d:]/g, '').slice(0, 5);
}

export function isValidTimeInput(value: string | undefined): value is string {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }

  const [hours, minutes] = value.split(':').map(Number);
  return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60;
}

export function toLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDaysSinceLastVisit(lastVisitDate?: string): number {
  if (!lastVisitDate) return Infinity;
  const lastVisit = new Date(lastVisitDate);
  const today = new Date();
  const diffTime = Math.abs(today.getTime() - lastVisit.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

export function getToothConditionColor(type: string): string {
  const colors: Record<string, string> = {
    healthy: 'bg-slate-100 border-slate-300 text-slate-900',
    cavity: 'bg-red-100 border-red-500 text-slate-900',
    filling: 'bg-teal-100 border-teal-500 text-slate-900',
    crown: 'bg-yellow-100 border-yellow-600 text-slate-900',
    root_canal: 'bg-purple-100 border-purple-500 text-slate-900',
    extraction: 'bg-slate-300 border-slate-600 text-slate-900',
    implant: 'bg-green-100 border-green-500 text-slate-900',
  };
  return colors[type] || colors.healthy;
}

export function getStatusBadgeColor(status: string): string {
  const colors: Record<string, string> = {
    scheduled: 'bg-teal-100 text-teal-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-slate-100 text-slate-800',
    no_show: 'bg-red-100 text-red-800',
    paid: 'bg-green-100 text-green-800',
    partially_paid: 'bg-yellow-100 text-yellow-800',
    unpaid: 'bg-red-100 text-red-800',
  };
  return colors[status] || 'bg-slate-100 text-slate-800';
}

export function truncateForUi(value: string, maxChars: number): string {
  if (maxChars <= 0) {
    return '';
  }

  if (value.length <= maxChars) {
    return value;
  }

  if (maxChars === 1) {
    return '…';
  }

  return `${value.slice(0, maxChars - 1)}…`;
}
