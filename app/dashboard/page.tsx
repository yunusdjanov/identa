'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    CalendarDays,
    CalendarPlus,
    CalendarRange,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Clock3,
    LayoutGrid,
    ListChecks,
    Lock,
    Plus,
    UserRound,
    XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AccessDeniedState } from '@/components/error/access-denied-state';
import { AppErrorState } from '@/components/error/app-error-state';
import { RouteDashboardLoadingState } from '@/components/layout/page-loading-skeletons';
import { useI18n } from '@/components/providers/i18n-provider';
import { getApiErrorMessage } from '@/lib/api/client';
import { getCurrentUser, getProfile, listAllAppointments } from '@/lib/api/dentist';
import type { ApiAppointment } from '@/lib/api/types';
import { canManage, canView, getManageDeniedMessage, isSubscriptionReadOnly } from '@/lib/auth/permissions';
import { getStatusTone } from '@/lib/appointments/status-tone';
import {
    createAppointmentCoveredSlots,
    createAppointmentStartSlots,
    normalizeAppointmentWorkingHours,
} from '@/lib/appointments/time-slots';
import { formatLocalizedDate } from '@/lib/i18n/date';
import type { AppLocale } from '@/lib/i18n/config';
import { toLocalDateKey, truncateForUi } from '@/lib/utils';

const AddAppointmentDialog = dynamic(
    () => import('@/components/appointments/add-appointment-dialog').then((module) => module.AddAppointmentDialog),
    { ssr: false }
);

const noopSubscribe = () => () => undefined;
const STARTING_SOON_WINDOW_MINUTES = 120;
const WEEK_DAY_VISIBLE_APPOINTMENTS = 5;
const MONTH_CELL_VISIBLE_APPOINTMENTS = 3;
const APPOINTMENT_NAME_UI_LIMIT = 22;
const APPOINTMENT_REASON_UI_LIMIT = 34;

type PlannerView = 'day' | 'week' | 'month';
type AppointmentStatus = ApiAppointment['status'];

interface AppointmentRow {
    id: string;
    patientId: string | null;
    patientName: string;
    guestName?: string | null;
    guestPhone?: string | null;
    isGuest: boolean;
    appointmentDate: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    status: AppointmentStatus;
    reason: string;
}

interface DateRange {
    startDate: string;
    endDate: string;
}

function toMinutesFromTime(timeInput: string): number {
    const [hours, minutes] = timeInput.split(':').map(Number);
    return hours * 60 + minutes;
}

function getDurationMinutes(startTime: string, endTime: string): number {
    return Math.max(0, toMinutesFromTime(endTime) - toMinutesFromTime(startTime));
}

function extractReason(notes: string | null): string {
    if (!notes) {
        return '';
    }

    return notes.split('|').map((part) => part.trim()).filter(Boolean)[0] ?? '';
}

function getWeekStart(date: Date): Date {
    const weekStart = new Date(date);
    const normalizedDay = (weekStart.getDay() + 6) % 7;
    weekStart.setDate(weekStart.getDate() - normalizedDay);
    weekStart.setHours(0, 0, 0, 0);
    return weekStart;
}

function getMonthStart(date: Date): Date {
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);
    return monthStart;
}

function getMonthEnd(date: Date): Date {
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    monthEnd.setHours(0, 0, 0, 0);
    return monthEnd;
}

function addDays(date: Date, days: number): Date {
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + days);
    return nextDate;
}

function getPlannerRange(view: PlannerView, currentDate: Date): DateRange {
    if (view === 'day') {
        const dateKey = toLocalDateKey(currentDate);
        return { startDate: dateKey, endDate: dateKey };
    }

    if (view === 'month') {
        return {
            startDate: toLocalDateKey(getMonthStart(currentDate)),
            endDate: toLocalDateKey(getMonthEnd(currentDate)),
        };
    }

    const weekStart = getWeekStart(currentDate);
    return {
        startDate: toLocalDateKey(weekStart),
        endDate: toLocalDateKey(addDays(weekStart, 6)),
    };
}

function getWeekDays(currentDate: Date): Date[] {
    const weekStart = getWeekStart(currentDate);
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

function getMonthGridDays(currentDate: Date): Date[] {
    const gridStart = getWeekStart(getMonthStart(currentDate));
    return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

function groupAppointmentsByDate(appointments: AppointmentRow[]): Map<string, AppointmentRow[]> {
    const grouped = new Map<string, AppointmentRow[]>();

    for (const appointment of appointments) {
        const existing = grouped.get(appointment.appointmentDate);
        if (existing) {
            existing.push(appointment);
        } else {
            grouped.set(appointment.appointmentDate, [appointment]);
        }
    }

    for (const [dateKey, items] of grouped.entries()) {
        grouped.set(dateKey, [...items].sort(compareAppointments));
    }

    return grouped;
}

function compareAppointments(left: AppointmentRow, right: AppointmentRow): number {
    const dateCompare = left.appointmentDate.localeCompare(right.appointmentDate);
    if (dateCompare !== 0) {
        return dateCompare;
    }

    const timeCompare = left.startTime.localeCompare(right.startTime);
    if (timeCompare !== 0) {
        return timeCompare;
    }

    return left.patientName.localeCompare(right.patientName);
}

function getRangeLabel(view: PlannerView, currentDate: Date, locale: AppLocale): string {
    if (view === 'day') {
        return formatLocalizedDate(currentDate, locale, { weekday: 'long', day: 'numeric', month: 'long' });
    }

    if (view === 'month') {
        return formatLocalizedDate(currentDate, locale, { month: 'long', year: 'numeric' });
    }

    const weekStart = getWeekStart(currentDate);
    const weekEnd = addDays(weekStart, 6);
    return `${formatLocalizedDate(weekStart, locale, { day: 'numeric', month: 'short' })} - ${formatLocalizedDate(weekEnd, locale, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function shiftPlannerDate(view: PlannerView, currentDate: Date, direction: -1 | 1): Date {
    const nextDate = new Date(currentDate);
    if (view === 'day') {
        nextDate.setDate(nextDate.getDate() + direction);
    } else if (view === 'month') {
        nextDate.setMonth(nextDate.getMonth() + direction);
    } else {
        nextDate.setDate(nextDate.getDate() + direction * 7);
    }

    return nextDate;
}

function mapApiAppointment(appointment: ApiAppointment, unknownPatientLabel: string): AppointmentRow {
    const patientName = appointment.patient_name ?? appointment.guest_name ?? unknownPatientLabel;
    return {
        id: appointment.id,
        patientId: appointment.patient_id,
        patientName,
        guestName: appointment.guest_name ?? null,
        guestPhone: appointment.guest_phone ?? null,
        isGuest: appointment.is_guest === true || appointment.patient_id === null,
        appointmentDate: appointment.appointment_date,
        startTime: appointment.start_time,
        endTime: appointment.end_time,
        durationMinutes: getDurationMinutes(appointment.start_time, appointment.end_time),
        status: appointment.status,
        reason: extractReason(appointment.notes),
    };
}

function getStatusBadgeClass(status: AppointmentStatus): string {
    switch (status) {
        case 'completed':
            return 'bg-teal-50 text-teal-700 ring-teal-100';
        case 'cancelled':
            return 'bg-slate-100 text-slate-700 ring-slate-200';
        case 'no_show':
            return 'bg-rose-50 text-rose-700 ring-rose-100';
        case 'scheduled':
        default:
            return 'bg-blue-50 text-blue-700 ring-blue-100';
    }
}

function AppointmentMiniCard({ appointment }: { appointment: AppointmentRow }) {
    const { t } = useI18n();
    const tone = getStatusTone(appointment.status);
    const statusLabel = t(`status.${appointment.status}`);
    const reason = appointment.reason || t('dashboard.generalAppointment');

    return (
        <Link
            href={appointment.patientId ? `/patients/${appointment.patientId}` : `/appointments?date=${appointment.appointmentDate}&view=day`}
            className="group block rounded-xl border border-slate-100 bg-white p-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-teal-100 hover:shadow-md"
        >
            <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-bold text-slate-500">{appointment.startTime.slice(0, 5)}</span>
                <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-label={statusLabel} />
            </div>
            <p className="mt-1 truncate text-xs font-bold text-slate-950">
                {truncateForUi(appointment.patientName, APPOINTMENT_NAME_UI_LIMIT)}
            </p>
            <p className="truncate text-[11px] text-slate-400">
                {truncateForUi(reason, APPOINTMENT_REASON_UI_LIMIT)}
            </p>
            {appointment.isGuest ? (
                <span className="mt-1 inline-flex rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-100">
                    {t('dashboard.guestBadge')}
                </span>
            ) : null}
        </Link>
    );
}

function PlannerStatCard({
    title,
    value,
    helper,
    tone,
    icon,
}: {
    title: string;
    value: number;
    helper: string;
    tone: 'teal' | 'blue' | 'amber' | 'rose';
    icon: ReactNode;
}) {
    const toneClass = {
        teal: 'border-teal-100 bg-gradient-to-br from-white via-teal-50/70 to-white text-teal-700',
        blue: 'border-blue-100 bg-gradient-to-br from-white via-blue-50/70 to-white text-blue-700',
        amber: 'border-amber-100 bg-gradient-to-br from-white via-amber-50/70 to-white text-amber-700',
        rose: 'border-rose-100 bg-gradient-to-br from-white via-rose-50/70 to-white text-rose-700',
    }[tone];

    return (
        <Card className={`rounded-2xl shadow-sm ${toneClass}`}>
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="truncate text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{title}</p>
                        <p className="mt-1 text-3xl font-black tracking-tight text-slate-950">{value}</p>
                    </div>
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/85 shadow-sm ring-1 ring-white">
                        {icon}
                    </span>
                </div>
                <p className="mt-2 truncate text-xs font-medium text-slate-500">{helper}</p>
            </CardContent>
        </Card>
    );
}

function PlannerToolbar({
    view,
    rangeLabel,
    canManageAppointments,
    canViewAppointments,
    isReadOnly,
    onViewChange,
    onPrevious,
    onNext,
    onToday,
    onNewAppointment,
    onDenied,
}: {
    view: PlannerView;
    rangeLabel: string;
    canManageAppointments: boolean;
    canViewAppointments: boolean;
    isReadOnly: boolean;
    onViewChange: (view: PlannerView) => void;
    onPrevious: () => void;
    onNext: () => void;
    onToday: () => void;
    onNewAppointment: () => void;
    onDenied: () => void;
}) {
    const { t } = useI18n();
    const viewOptions: Array<{ value: PlannerView; label: string; icon: ReactNode }> = [
        { value: 'day', label: t('dashboard.planner.day'), icon: <ListChecks className="h-3.5 w-3.5" /> },
        { value: 'week', label: t('dashboard.planner.week'), icon: <CalendarRange className="h-3.5 w-3.5" /> },
        { value: 'month', label: t('dashboard.planner.month'), icon: <LayoutGrid className="h-3.5 w-3.5" /> },
    ];

    return (
        <section className="rounded-3xl border border-teal-100/80 bg-white p-4 shadow-sm shadow-teal-950/5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-teal-600">{t('dashboard.planner.eyebrow')}</p>
                    <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">{t('dashboard.planner.title')}</h1>
                    <p className="mt-1 text-sm text-slate-500">{t('dashboard.planner.subtitle')}</p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                    <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
                        {viewOptions.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => onViewChange(option.value)}
                                className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-bold transition ${
                                    view === option.value
                                        ? 'bg-white text-teal-700 shadow-sm ring-1 ring-slate-200'
                                        : 'text-slate-500 hover:text-slate-900'
                                }`}
                            >
                                {option.icon}
                                {option.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={onPrevious}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="flex h-9 min-w-[13rem] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 shadow-sm">
                            {rangeLabel}
                        </div>
                        <Button type="button" variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={onNext}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>

                    <Button type="button" variant="outline" className="h-9 rounded-xl px-4" onClick={onToday}>
                        {t('appointments.today')}
                    </Button>

                    {canManageAppointments ? (
                        <Button type="button" className="h-9 rounded-xl px-4" onClick={onNewAppointment}>
                            <Plus className="mr-2 h-4 w-4" />
                            {t('appointments.new')}
                        </Button>
                    ) : isReadOnly && canViewAppointments ? (
                        <Button type="button" className="h-9 rounded-xl px-4" disabled onClick={onDenied}>
                            <Plus className="mr-2 h-4 w-4" />
                            {t('appointments.new')}
                        </Button>
                    ) : null}
                </div>
            </div>
        </section>
    );
}

function WeekPlannerView({
    currentDate,
    todayKey,
    appointmentsByDate,
    canManageAppointments,
    onAdd,
    onOpenDay,
}: {
    currentDate: Date;
    todayKey: string;
    appointmentsByDate: Map<string, AppointmentRow[]>;
    canManageAppointments: boolean;
    onAdd: (date: Date) => void;
    onOpenDay: (date: Date) => void;
}) {
    const { locale, t } = useI18n();
    const displayLocale = locale as AppLocale;
    const weekDays = getWeekDays(currentDate);

    return (
        <div className="grid gap-3 xl:grid-cols-7">
            {weekDays.map((date) => {
                const dateKey = toLocalDateKey(date);
                const appointments = appointmentsByDate.get(dateKey) ?? [];
                const visibleAppointments = appointments.slice(0, WEEK_DAY_VISIBLE_APPOINTMENTS);
                const hiddenCount = Math.max(0, appointments.length - visibleAppointments.length);
                const isToday = dateKey === todayKey;

                return (
                    <section
                        key={dateKey}
                        className={`flex min-h-[24rem] flex-col rounded-2xl border p-2.5 shadow-sm ${
                            isToday
                                ? 'border-teal-200 bg-teal-50/70 shadow-teal-100'
                                : 'border-slate-200 bg-white'
                        }`}
                    >
                        <button
                            type="button"
                            onClick={() => onOpenDay(date)}
                            className={`flex items-center justify-between rounded-xl px-2.5 py-2 text-left transition hover:bg-white/80 ${
                                isToday ? 'text-teal-900' : 'text-slate-900'
                            }`}
                        >
                            <span>
                                <span className="block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                                    {formatLocalizedDate(date, displayLocale, { weekday: 'short' })}
                                </span>
                                <span className="mt-0.5 block text-lg font-black">
                                    {formatLocalizedDate(date, displayLocale, { day: '2-digit', month: '2-digit' })}
                                </span>
                            </span>
                            <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-white px-2 text-xs font-black text-slate-600 shadow-sm ring-1 ring-slate-200">
                                {appointments.length}
                            </span>
                        </button>

                        <div className="mt-2 flex-1 space-y-2">
                            {visibleAppointments.length > 0 ? (
                                visibleAppointments.map((appointment) => (
                                    <AppointmentMiniCard key={appointment.id} appointment={appointment} />
                                ))
                            ) : (
                                <div className="flex min-h-[8rem] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 text-sm font-medium text-slate-400">
                                    {t('appointments.noAppointments')}
                                </div>
                            )}
                            {hiddenCount > 0 ? (
                                <button
                                    type="button"
                                    onClick={() => onOpenDay(date)}
                                    className="w-full rounded-xl border border-slate-100 bg-white px-3 py-2 text-sm font-bold text-teal-700 shadow-sm transition hover:bg-teal-50"
                                >
                                    {t('appointments.moreCount', { count: hiddenCount })}
                                </button>
                            ) : null}
                        </div>

                        {canManageAppointments ? (
                            <Button
                                type="button"
                                variant="outline"
                                className="mt-2 h-9 rounded-xl border-teal-100 bg-white text-teal-700 hover:bg-teal-50"
                                onClick={() => onAdd(date)}
                            >
                                <Plus className="mr-1.5 h-3.5 w-3.5" />
                                {t('dashboard.planner.addShort')}
                            </Button>
                        ) : null}
                    </section>
                );
            })}
        </div>
    );
}

function DayPlannerView({
    currentDate,
    appointmentsByDate,
    timeSlots,
    canManageAppointments,
    onAdd,
}: {
    currentDate: Date;
    appointmentsByDate: Map<string, AppointmentRow[]>;
    timeSlots: string[];
    canManageAppointments: boolean;
    onAdd: (date: Date, startTime?: string) => void;
}) {
    const { t } = useI18n();
    const dateKey = toLocalDateKey(currentDate);
    const dayAppointments = appointmentsByDate.get(dateKey) ?? [];
    const appointmentsByTime = new Map<string, AppointmentRow[]>();

    for (const appointment of dayAppointments) {
        const existing = appointmentsByTime.get(appointment.startTime);
        if (existing) {
            existing.push(appointment);
        } else {
            appointmentsByTime.set(appointment.startTime, [appointment]);
        }
    }

    return (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="grid grid-cols-[4.5rem_1fr] border-b border-slate-100 bg-slate-50/70 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                <span>{t('appointments.dialog.time')}</span>
                <span>{t('dashboard.planner.dayAgenda')}</span>
            </div>
            <div className="divide-y divide-slate-100">
                {timeSlots.map((time) => {
                    const slotAppointments = appointmentsByTime.get(time) ?? [];
                    return (
                        <div key={time} className="grid min-h-[4.75rem] grid-cols-[4.5rem_1fr] gap-3 px-3 py-2.5">
                            <div className="pt-2 font-mono text-sm font-bold text-slate-500">{time}</div>
                            {slotAppointments.length > 0 ? (
                                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                    {slotAppointments.map((appointment) => (
                                        <DayAppointmentCard key={appointment.id} appointment={appointment} />
                                    ))}
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    disabled={!canManageAppointments}
                                    onClick={() => onAdd(currentDate, time)}
                                    className={`flex min-h-[3.25rem] items-center justify-center rounded-2xl border border-dashed text-sm font-semibold transition ${
                                        canManageAppointments
                                            ? 'border-teal-100 bg-teal-50/30 text-teal-700 hover:bg-teal-50'
                                            : 'border-slate-100 bg-slate-50 text-slate-300'
                                    }`}
                                >
                                    {canManageAppointments ? (
                                        <>
                                            <Plus className="mr-1.5 h-3.5 w-3.5" />
                                            {t('dashboard.planner.addShort')}
                                        </>
                                    ) : (
                                        t('appointments.noAppointments')
                                    )}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function DayAppointmentCard({ appointment }: { appointment: AppointmentRow }) {
    const { t } = useI18n();
    const tone = getStatusTone(appointment.status);
    const reason = appointment.reason || t('dashboard.generalAppointment');

    return (
        <Link
            href={appointment.patientId ? `/patients/${appointment.patientId}` : `/appointments?date=${appointment.appointmentDate}&view=day`}
            className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-100 hover:shadow-md"
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-950">{appointment.patientName}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{reason}</p>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ring-1 ${getStatusBadgeClass(appointment.status)}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                    {t(`status.${appointment.status}`)}
                </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 ring-1 ring-slate-100">
                    <Clock3 className="h-3.5 w-3.5" />
                    {appointment.startTime.slice(0, 5)} - {appointment.endTime.slice(0, 5)}
                </span>
                {appointment.isGuest ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-amber-700 ring-1 ring-amber-100">
                        <UserRound className="h-3.5 w-3.5" />
                        {t('dashboard.guestBadge')}
                    </span>
                ) : null}
            </div>
        </Link>
    );
}

function MonthPlannerView({
    currentDate,
    todayKey,
    appointmentsByDate,
    onOpenDay,
}: {
    currentDate: Date;
    todayKey: string;
    appointmentsByDate: Map<string, AppointmentRow[]>;
    onOpenDay: (date: Date) => void;
}) {
    const { locale, t } = useI18n();
    const displayLocale = locale as AppLocale;
    const monthGridDays = getMonthGridDays(currentDate);
    const currentMonth = currentDate.getMonth();

    return (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
            {monthGridDays.map((date) => {
                const dateKey = toLocalDateKey(date);
                const appointments = appointmentsByDate.get(dateKey) ?? [];
                const visibleAppointments = appointments.slice(0, MONTH_CELL_VISIBLE_APPOINTMENTS);
                const isOutsideMonth = date.getMonth() !== currentMonth;
                const isToday = dateKey === todayKey;

                return (
                    <button
                        key={dateKey}
                        type="button"
                        onClick={() => onOpenDay(date)}
                        className={`min-h-[9.25rem] rounded-2xl border p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-teal-100 hover:shadow-md ${
                            isToday
                                ? 'border-teal-200 bg-teal-50/80'
                                : isOutsideMonth
                                    ? 'border-slate-100 bg-slate-50/60 opacity-80'
                                    : 'border-slate-200 bg-white'
                        }`}
                    >
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-black text-slate-900">
                                {formatLocalizedDate(date, displayLocale, { day: 'numeric' })}
                            </span>
                            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-slate-500 ring-1 ring-slate-200">
                                {appointments.length}
                            </span>
                        </div>
                        <div className="mt-3 space-y-1.5">
                            {visibleAppointments.length > 0 ? (
                                visibleAppointments.map((appointment) => {
                                    const tone = getStatusTone(appointment.status);
                                    return (
                                        <div key={appointment.id} className="flex items-center gap-1.5 rounded-lg bg-white/80 px-2 py-1 text-[11px] shadow-sm ring-1 ring-slate-100">
                                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
                                            <span className="font-mono font-bold text-slate-500">{appointment.startTime.slice(0, 5)}</span>
                                            <span className="truncate font-semibold text-slate-700">{appointment.patientName}</span>
                                        </div>
                                    );
                                })
                            ) : (
                                <p className="pt-4 text-center text-xs font-medium text-slate-300">{t('appointments.noAppointments')}</p>
                            )}
                            {appointments.length > visibleAppointments.length ? (
                                <p className="rounded-lg bg-teal-50 px-2 py-1 text-center text-[11px] font-black text-teal-700">
                                    {t('appointments.moreCount', { count: appointments.length - visibleAppointments.length })}
                                </p>
                            ) : null}
                        </div>
                    </button>
                );
            })}
        </div>
    );
}

function PlannerLegend() {
    const { t } = useI18n();
    const statuses: AppointmentStatus[] = ['scheduled', 'completed', 'cancelled', 'no_show'];

    return (
        <div className="flex flex-wrap justify-center gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-2 text-xs font-semibold text-slate-500">
            {statuses.map((status) => {
                const tone = getStatusTone(status);
                return (
                    <span key={status} className="inline-flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
                        {t(`status.${status}`)}
                    </span>
                );
            })}
        </div>
    );
}

export default function DashboardPage() {
    const { locale, t } = useI18n();
    const displayLocale = locale as AppLocale;
    const isClient = useSyncExternalStore(
        noopSubscribe,
        () => true,
        () => false
    );
    const [view, setView] = useState<PlannerView>('week');
    const [currentDate, setCurrentDate] = useState(() => new Date());
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [prefillDate, setPrefillDate] = useState<string | undefined>(undefined);
    const [prefillStartTime, setPrefillStartTime] = useState<string | undefined>(undefined);
    const [dialogVersion, setDialogVersion] = useState(0);
    const today = useMemo(() => new Date(), []);
    const todayKey = isClient ? toLocalDateKey(today) : '';
    const visibleRange = useMemo(() => getPlannerRange(view, currentDate), [currentDate, view]);
    const rangeLabel = isClient ? getRangeLabel(view, currentDate, displayLocale) : t('dashboard.currentMonth');

    const currentUserQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        retry: false,
        staleTime: 5 * 60_000,
    });
    const currentUser = currentUserQuery.data;
    const canViewAppointments = canView(currentUser, 'appointments');
    const canManageAppointments = canManage(currentUser, 'appointments');
    const denyManageAction = () => toast.error(getManageDeniedMessage(currentUser, t));

    const appointmentsQuery = useQuery({
        queryKey: ['dashboard', 'planner', visibleRange.startDate, visibleRange.endDate],
        queryFn: () =>
            listAllAppointments({
                sort: 'appointment_date,start_time',
                filter: {
                    date_from: visibleRange.startDate,
                    date_to: visibleRange.endDate,
                },
            }),
        enabled: canViewAppointments,
        placeholderData: (previousData) => previousData,
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });

    const profileQuery = useQuery({
        queryKey: ['settings', 'profile'],
        queryFn: getProfile,
        enabled: canViewAppointments,
        staleTime: 5 * 60_000,
        gcTime: 15 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });

    const workingHours = useMemo(
        () => normalizeAppointmentWorkingHours(profileQuery.data?.working_hours),
        [profileQuery.data?.working_hours]
    );
    const appointmentRows = useMemo(
        () => (appointmentsQuery.data ?? [])
            .map((appointment) => mapApiAppointment(appointment, t('appointments.unknownPatient')))
            .sort(compareAppointments),
        [appointmentsQuery.data, t]
    );
    const appointmentsByDate = useMemo(() => groupAppointmentsByDate(appointmentRows), [appointmentRows]);
    const timeSlots = useMemo(
        () => createAppointmentStartSlots(workingHours, {
            extraSlots: appointmentRows.flatMap((appointment) =>
                createAppointmentCoveredSlots(appointment.startTime, appointment.endTime)
            ),
        }),
        [appointmentRows, workingHours]
    );
    const todayAppointments = appointmentsByDate.get(todayKey) ?? [];
    const nowMinutes = isClient ? new Date().getHours() * 60 + new Date().getMinutes() : 0;
    const visibleRangeSummary = useMemo(() => {
        const scheduled = appointmentRows.filter((appointment) => appointment.status === 'scheduled').length;
        const cancelledNoShow = appointmentRows.filter((appointment) =>
            appointment.status === 'cancelled' || appointment.status === 'no_show'
        ).length;

        return {
            total: appointmentRows.length,
            scheduled,
            cancelledNoShow,
        };
    }, [appointmentRows]);
    const startingSoonCount = todayAppointments.filter((appointment) => {
        if (appointment.status !== 'scheduled') {
            return false;
        }

        const startMinutes = toMinutesFromTime(appointment.startTime);
        return startMinutes >= nowMinutes && startMinutes <= nowMinutes + STARTING_SOON_WINDOW_MINUTES;
    }).length;

    const openAddDialog = (options?: { date?: Date; startTime?: string }) => {
        if (!canManageAppointments) {
            denyManageAction();
            return;
        }

        const dialogDate = options?.date ?? currentDate;
        setPrefillDate(toLocalDateKey(dialogDate));
        setPrefillStartTime(options?.startTime ?? timeSlots[0] ?? workingHours.start);
        setDialogVersion((version) => version + 1);
        setIsAddDialogOpen(true);
    };

    if (!isClient || currentUserQuery.isLoading) {
        return <RouteDashboardLoadingState />;
    }

    if (currentUserQuery.isError || !currentUser) {
        return (
            <AppErrorState
                title={t('common.loadErrorTitle')}
                description={getApiErrorMessage(currentUserQuery.error, t('dashboard.error'))}
                retryLabel={t('common.retry')}
                onRetry={() => currentUserQuery.refetch()}
            />
        );
    }

    if (!canViewAppointments) {
        return (
            <AccessDeniedState
                title={t('permissions.deniedTitle')}
                description={t('permissions.deniedDescription')}
                actionLabel={t('dashboard.title')}
                actionHref="/dashboard"
            />
        );
    }

    if (appointmentsQuery.isError && !appointmentsQuery.data) {
        return (
            <AppErrorState
                title={t('common.loadErrorTitle')}
                description={getApiErrorMessage(appointmentsQuery.error, t('appointments.error.loadFailed'))}
                retryLabel={t('common.retry')}
                onRetry={() => appointmentsQuery.refetch()}
            />
        );
    }

    if ((appointmentsQuery.isLoading && !appointmentsQuery.data) || profileQuery.isLoading) {
        return <RouteDashboardLoadingState />;
    }

    return (
        <div className="space-y-4">
            <PlannerToolbar
                view={view}
                rangeLabel={rangeLabel}
                canManageAppointments={canManageAppointments}
                canViewAppointments={canViewAppointments}
                isReadOnly={isSubscriptionReadOnly(currentUser)}
                onViewChange={setView}
                onPrevious={() => setCurrentDate((date) => shiftPlannerDate(view, date, -1))}
                onNext={() => setCurrentDate((date) => shiftPlannerDate(view, date, 1))}
                onToday={() => setCurrentDate(new Date())}
                onNewAppointment={() => openAddDialog()}
                onDenied={denyManageAction}
            />

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <PlannerStatCard
                    title={t('dashboard.planner.total')}
                    value={visibleRangeSummary.total}
                    helper={t('dashboard.planner.rangeTotal')}
                    tone="teal"
                    icon={<CalendarDays className="h-4 w-4" />}
                />
                <PlannerStatCard
                    title={t('dashboard.planner.confirmed')}
                    value={visibleRangeSummary.scheduled}
                    helper={t('dashboard.planner.scheduledHelper')}
                    tone="blue"
                    icon={<CheckCircle2 className="h-4 w-4" />}
                />
                <PlannerStatCard
                    title={t('dashboard.startingSoon')}
                    value={startingSoonCount}
                    helper={t('dashboard.nextTwoHours')}
                    tone="amber"
                    icon={<Clock3 className="h-4 w-4" />}
                />
                <PlannerStatCard
                    title={t('dashboard.planner.cancelledNoShow')}
                    value={visibleRangeSummary.cancelledNoShow}
                    helper={t('dashboard.planner.cancelledNoShowHelper')}
                    tone="rose"
                    icon={<XCircle className="h-4 w-4" />}
                />
            </div>

            <Card className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-sm">
                <CardContent className="space-y-4 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-teal-600">
                                {t('dashboard.planner.board')}
                            </p>
                            <h2 className="mt-1 text-xl font-black text-slate-950">{rangeLabel}</h2>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button asChild variant="outline" className="h-9 rounded-xl">
                                <Link href={`/appointments?view=${view}&date=${toLocalDateKey(currentDate)}`}>
                                    <CalendarPlus className="mr-2 h-4 w-4" />
                                    {t('dashboard.planner.openAppointments')}
                                </Link>
                            </Button>
                            {!canManageAppointments && isSubscriptionReadOnly(currentUser) ? (
                                <span className="inline-flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-400">
                                    <Lock className="h-4 w-4" />
                                    {t('dashboard.lockedKpi.label')}
                                </span>
                            ) : null}
                        </div>
                    </div>

                    {view === 'week' ? (
                        <WeekPlannerView
                            currentDate={currentDate}
                            todayKey={todayKey}
                            appointmentsByDate={appointmentsByDate}
                            canManageAppointments={canManageAppointments}
                            onAdd={(date) => openAddDialog({ date })}
                            onOpenDay={(date) => {
                                setCurrentDate(date);
                                setView('day');
                            }}
                        />
                    ) : null}

                    {view === 'day' ? (
                        <DayPlannerView
                            currentDate={currentDate}
                            appointmentsByDate={appointmentsByDate}
                            timeSlots={timeSlots}
                            canManageAppointments={canManageAppointments}
                            onAdd={(date, startTime) => openAddDialog({ date, startTime })}
                        />
                    ) : null}

                    {view === 'month' ? (
                        <MonthPlannerView
                            currentDate={currentDate}
                            todayKey={todayKey}
                            appointmentsByDate={appointmentsByDate}
                            onOpenDay={(date) => {
                                setCurrentDate(date);
                                setView('day');
                            }}
                        />
                    ) : null}
                </CardContent>
            </Card>

            <PlannerLegend />

            {isAddDialogOpen ? (
                <AddAppointmentDialog
                    key={`dashboard-add-appointment-${dialogVersion}`}
                    open={isAddDialogOpen}
                    onOpenChange={setIsAddDialogOpen}
                    prefillDate={prefillDate}
                    prefillStartTime={prefillStartTime}
                    workingHours={workingHours}
                />
            ) : null}
        </div>
    );
}
