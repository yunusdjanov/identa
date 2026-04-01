import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('uz-UZ', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount) + ' UZS';
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
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
    healthy: 'bg-gray-100 border-gray-300 text-gray-900',
    cavity: 'bg-red-100 border-red-500 text-gray-900',
    filling: 'bg-blue-100 border-blue-500 text-gray-900',
    crown: 'bg-yellow-100 border-yellow-600 text-gray-900',
    root_canal: 'bg-purple-100 border-purple-500 text-gray-900',
    extraction: 'bg-gray-300 border-gray-600 text-gray-900',
    implant: 'bg-green-100 border-green-500 text-gray-900',
  };
  return colors[type] || colors.healthy;
}

export function getStatusBadgeColor(status: string): string {
  const colors: Record<string, string> = {
    scheduled: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-gray-100 text-gray-800',
    no_show: 'bg-red-100 text-red-800',
    paid: 'bg-green-100 text-green-800',
    partially_paid: 'bg-yellow-100 text-yellow-800',
    unpaid: 'bg-red-100 text-red-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
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
