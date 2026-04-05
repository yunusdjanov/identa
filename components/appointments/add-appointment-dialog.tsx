'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { createAppointment, getPatient, listAppointments, listPatients, updateAppointment } from '@/lib/api/dentist';
import {
    getAppointmentApiErrorMessage,
} from '@/lib/appointments/messages';
import { INPUT_LIMITS } from '@/lib/input-validation';
import { isValidTimeInput, sanitizeTimeInput, toLocalDateKey, truncateForUi } from '@/lib/utils';
import type { ApiPatient } from '@/lib/api/types';
import { useI18n } from '@/components/providers/i18n-provider';

type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';
const PATIENT_LOOKUP_PAGE_SIZE = 20;
const PATIENT_LOOKUP_DEBOUNCE_MS = 250;
const APPOINTMENT_LOOKUP_NAME_UI_LIMIT = 25;
const APPOINTMENT_LOOKUP_PHONE_UI_LIMIT = 20;
const APPOINTMENT_SELECTED_PATIENT_UI_LIMIT = 40;

type PatientLookupOption = Pick<ApiPatient, 'id' | 'patient_id' | 'full_name' | 'phone' | 'secondary_phone'>;

interface EditableAppointment {
    id: string;
    patientId: string;
    patientName: string;
    appointmentDate: string;
    startTime: string;
    durationMinutes: number;
    status: AppointmentStatus;
    reason?: string;
}

interface AddAppointmentDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    prefillDate?: string;
    prefillStartTime?: string;
    prefillPatientId?: string;
    editingAppointment?: EditableAppointment;
}

function createEditingPatientSnapshot(editingAppointment?: EditableAppointment): PatientLookupOption | null {
    if (!editingAppointment) {
        return null;
    }

    return {
        id: editingAppointment.patientId,
        full_name: editingAppointment.patientName,
        patient_id: '',
        phone: '',
        secondary_phone: null,
    };
}

function createInitialFormData(
    prefillDate?: string,
    prefillStartTime?: string,
    prefillPatientId?: string,
    editingAppointment?: EditableAppointment
) {
    if (editingAppointment) {
        return {
            patientId: editingAppointment.patientId,
            appointmentDate: editingAppointment.appointmentDate,
            startTime: editingAppointment.startTime,
            durationMinutes: editingAppointment.durationMinutes,
            status: editingAppointment.status,
            reason: editingAppointment.reason ?? '',
        };
    }

    const appointmentDate = isValidDateInput(prefillDate) ? prefillDate : toLocalDateKey();
    const startTime = isValidTimeInput(prefillStartTime) ? prefillStartTime : '09:00';

    return {
        patientId: prefillPatientId ?? '',
        appointmentDate,
        startTime,
        durationMinutes: 30,
        status: 'scheduled' as AppointmentStatus,
        reason: '',
    };
}

function isValidDateInput(value: string | undefined): value is string {
    if (!value) {
        return false;
    }

    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function resolveEndTime(startTime: string, durationMinutes: number): string | null {
    const [hours, minutes] = startTime.split(':').map(Number);
    const total = hours * 60 + minutes + durationMinutes;
    if (total >= 24 * 60) {
        return null;
    }
    const endHour = Math.floor(total / 60);
    const endMinute = total % 60;

    return `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
}

function formatPatientLabel(patient: { full_name: string; patient_id?: string | null }): string {
    if (!patient.patient_id) {
        return patient.full_name;
    }

    return `${patient.full_name} (${patient.patient_id})`;
}

function hasAppointmentConflict(
    appointments: Array<{
        id: string;
        start_time: string;
        end_time: string;
        status: AppointmentStatus;
    }>,
    payload: {
        startTime: string;
        endTime: string;
        status: AppointmentStatus;
        ignoreAppointmentId?: string;
    }
): boolean {
    if (payload.status === 'cancelled' || payload.status === 'no_show') {
        return false;
    }

    return appointments.some((appointment) => {
        if (appointment.id === payload.ignoreAppointmentId) {
            return false;
        }
        if (appointment.status === 'cancelled' || appointment.status === 'no_show') {
            return false;
        }

        return appointment.start_time < payload.endTime && appointment.end_time > payload.startTime;
    });
}

export function AddAppointmentDialog({
    open,
    onOpenChange,
    prefillDate,
    prefillStartTime,
    prefillPatientId,
    editingAppointment,
}: AddAppointmentDialogProps) {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const isEditing = Boolean(editingAppointment);
    const patientComboboxRef = useRef<HTMLDivElement | null>(null);
    const [formData, setFormData] = useState(() =>
        createInitialFormData(prefillDate, prefillStartTime, prefillPatientId, editingAppointment)
    );
    const [patientSearch, setPatientSearch] = useState(editingAppointment?.patientName ?? '');
    const [debouncedPatientSearch, setDebouncedPatientSearch] = useState(editingAppointment?.patientName ?? '');
    const [isPatientMenuOpen, setIsPatientMenuOpen] = useState(false);
    const [submitAttempted, setSubmitAttempted] = useState(false);
    const [selectedPatientSnapshot, setSelectedPatientSnapshot] = useState<PatientLookupOption | null>(createEditingPatientSnapshot(editingAppointment));

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            setDebouncedPatientSearch(patientSearch.trim());
        }, PATIENT_LOOKUP_DEBOUNCE_MS);

        return () => window.clearTimeout(timeoutId);
    }, [patientSearch]);

    const patientsQuery = useQuery({
        queryKey: ['patients', 'lookup', debouncedPatientSearch],
        enabled: open && isPatientMenuOpen,
        queryFn: () =>
            listPatients({
                page: 1,
                perPage: PATIENT_LOOKUP_PAGE_SIZE,
                sort: 'full_name',
                filter: {
                    search: debouncedPatientSearch || undefined,
                },
            }),
        placeholderData: (previousData) => previousData,
    });
    const patients = useMemo(() => patientsQuery.data?.data ?? [], [patientsQuery.data]);
    const selectedPatientFromList = useMemo(
        () => patients.find((patient) => patient.id === formData.patientId),
        [formData.patientId, patients]
    );
    const selectedPatientQuery = useQuery({
        queryKey: ['patients', 'lookup', 'selected', formData.patientId],
        enabled: open && formData.patientId !== '' && !selectedPatientFromList,
        queryFn: () => getPatient(formData.patientId),
    });
    const selectedPatient = selectedPatientFromList
        ?? selectedPatientQuery.data
        ?? (selectedPatientSnapshot?.id === formData.patientId ? selectedPatientSnapshot : undefined);
    const patientOptions = patients;
    const dayAppointmentsQuery = useQuery({
        queryKey: ['appointments', 'availability', formData.appointmentDate],
        enabled: open && formData.appointmentDate !== '',
        queryFn: () =>
            listAppointments({
                page: 1,
                perPage: 100,
                sort: 'start_time',
                filter: {
                    date_from: formData.appointmentDate,
                    date_to: formData.appointmentDate,
                },
            }),
    });
    const reasonError = formData.reason.trim().length > INPUT_LIMITS.shortText
        ? t('appointments.dialog.reasonMax', { max: INPUT_LIMITS.shortText })
        : null;
    const timeError = !isValidTimeInput(formData.startTime)
        ? t('appointments.dialog.timeInvalid')
        : null;

    useEffect(() => {
        if (!isPatientMenuOpen) {
            return;
        }

        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) {
                return;
            }

            if (patientComboboxRef.current?.contains(target)) {
                return;
            }

            setIsPatientMenuOpen(false);
        };

        document.addEventListener('mousedown', handlePointerDown);

        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
        };
    }, [isPatientMenuOpen]);

    const mutation = useMutation({
        mutationFn: () => {
            const endTime = resolveEndTime(formData.startTime, formData.durationMinutes);
            if (!endTime) {
                throw new Error(t('appointments.toast.endOfDay'));
            }
            const reasonPayload = formData.reason.trim() || undefined;

            if (editingAppointment) {
                return updateAppointment(editingAppointment.id, {
                    patient_id: formData.patientId,
                    appointment_date: formData.appointmentDate,
                    start_time: formData.startTime,
                    end_time: endTime,
                    status: formData.status,
                    reason: reasonPayload,
                });
            }

            return createAppointment({
                patient_id: formData.patientId,
                appointment_date: formData.appointmentDate,
                start_time: formData.startTime,
                end_time: endTime,
                status: 'scheduled',
                reason: reasonPayload,
            });
        },
        onSuccess: () => {
            toast.success(isEditing ? t('appointments.dialog.toast.updated') : t('appointments.dialog.toast.scheduled'));
            setFormData(createInitialFormData(prefillDate, prefillStartTime, prefillPatientId, editingAppointment));
            setPatientSearch(editingAppointment?.patientName ?? '');
            setDebouncedPatientSearch(editingAppointment?.patientName ?? '');
            setSubmitAttempted(false);
            setSelectedPatientSnapshot(createEditingPatientSnapshot(editingAppointment));
            setIsPatientMenuOpen(false);
            onOpenChange(false);
            queryClient.invalidateQueries({ queryKey: ['appointments'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        },
        onError: (error) => {
            toast.error(
                getAppointmentApiErrorMessage(
                    error,
                    isEditing ? t('appointments.dialog.toast.updateFailed') : t('appointments.dialog.toast.scheduleFailed')
                )
            );
        },
    });

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        setSubmitAttempted(true);

        if (!formData.patientId) {
            toast.error(t('appointments.dialog.toast.selectPatient'));
            return;
        }

        if (timeError) {
            toast.error(timeError);
            return;
        }

        if (reasonError) {
            toast.error(reasonError);
            return;
        }

        const endTime = resolveEndTime(formData.startTime, formData.durationMinutes);
        if (!endTime) {
            toast.error(t('appointments.toast.endOfDay'));
            return;
        }

        const dayAppointments = dayAppointmentsQuery.data?.data ?? [];
        const hasConflict = hasAppointmentConflict(dayAppointments, {
            startTime: formData.startTime,
            endTime,
            status: formData.status,
            ignoreAppointmentId: editingAppointment?.id,
        });
        if (hasConflict) {
            toast.error(t('appointments.toast.conflict'));
            return;
        }

        mutation.mutate();
    };

    const handleDialogOpenChange = (nextOpen: boolean) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
            setSubmitAttempted(false);
        }
    };

    const handlePatientInputChange = (value: string) => {
        setPatientSearch(value);
        setIsPatientMenuOpen(true);
        if (!selectedPatient || value !== formatPatientLabel(selectedPatient)) {
            setSelectedPatientSnapshot(null);
        }

        setFormData((current) => {
            if (!current.patientId) {
                return current;
            }

            const selected = selectedPatient;
            if (selected && value === formatPatientLabel(selected)) {
                return current;
            }

            return {
                ...current,
                patientId: '',
            };
        });
    };

    const handlePatientSelect = (patientId: string) => {
        const patient = patients.find((candidate) => candidate.id === patientId);
        if (!patient) {
            return;
        }

        setFormData((current) => ({
            ...current,
            patientId: patient.id,
        }));
        setPatientSearch(formatPatientLabel(patient));
        setSelectedPatientSnapshot(patient);
        setIsPatientMenuOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={handleDialogOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{isEditing ? t('appointments.dialog.editTitle') : t('appointments.dialog.newTitle')}</DialogTitle>
                    <DialogDescription>
                        {isEditing
                            ? t('appointments.dialog.editDescription')
                            : t('appointments.dialog.newDescription')}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="patient">
                            {t('appointments.dialog.patient')} <span className="text-red-500">*</span>
                        </Label>
                        <div ref={patientComboboxRef} className="relative">
                            <Input
                                id="patient"
                                role="combobox"
                                aria-expanded={isPatientMenuOpen}
                                aria-controls="patient-options"
                                aria-haspopup="listbox"
                                aria-autocomplete="list"
                                value={patientSearch || (selectedPatient ? formatPatientLabel(selectedPatient) : '')}
                                onClick={() => setIsPatientMenuOpen(true)}
                                onChange={(event) => handlePatientInputChange(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Escape') {
                                        setIsPatientMenuOpen(false);
                                    }
                                }}
                                placeholder={t('appointments.dialog.patientSearchPlaceholder')}
                                autoComplete="off"
                                maxLength={INPUT_LIMITS.shortText}
                            />
                            {isPatientMenuOpen ? (
                                <div
                                    id="patient-options"
                                    role="listbox"
                                    className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-md"
                                >
                                    {patientsQuery.isLoading || (patientsQuery.isFetching && patientOptions.length === 0) ? (
                                        <p className="px-3 py-2 text-sm text-gray-500">{t('appointments.dialog.loadingPatients')}</p>
                                    ) : patientsQuery.isError ? (
                                        <p className="px-3 py-2 text-sm text-red-600">{t('appointments.dialog.patientsLoadFailed')}</p>
                                    ) : patientOptions.length === 0 ? (
                                        <p className="px-3 py-2 text-sm text-gray-500">{t('appointments.dialog.noPatientsFound')}</p>
                                    ) : (
                                        patientOptions.map((patient) => (
                                            <button
                                                key={patient.id}
                                                type="button"
                                                role="option"
                                                aria-selected={patient.id === formData.patientId}
                                                onClick={() => handlePatientSelect(patient.id)}
                                                className="w-full px-3 py-2 text-left hover:bg-gray-50"
                                            >
                                                <p className="text-sm font-medium text-gray-900 truncate" title={patient.full_name}>
                                                    {truncateForUi(patient.full_name, APPOINTMENT_LOOKUP_NAME_UI_LIMIT)}
                                                </p>
                                                <p className="text-xs text-gray-500 truncate" title={patient.phone}>
                                                    {truncateForUi(patient.phone, APPOINTMENT_LOOKUP_PHONE_UI_LIMIT)}
                                                </p>
                                            </button>
                                        ))
                                    )}
                                </div>
                            ) : null}
                        </div>
                        {selectedPatient ? (
                            <p
                                className="text-xs text-gray-500 [overflow-wrap:anywhere] break-words"
                                title={t('appointments.dialog.selectedPatient', { patient: formatPatientLabel(selectedPatient) })}
                            >
                                {t('appointments.dialog.selectedPatient', {
                                    patient: truncateForUi(formatPatientLabel(selectedPatient), APPOINTMENT_SELECTED_PATIENT_UI_LIMIT),
                                })}
                            </p>
                        ) : null}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="date">
                                {t('appointments.dialog.date')} <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="date"
                                type="date"
                                required
                                value={formData.appointmentDate}
                                onChange={(event) =>
                                    setFormData({ ...formData, appointmentDate: event.target.value })
                                }
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="time">
                                {t('appointments.dialog.time')} <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="time"
                                type="text"
                                inputMode="text"
                                maxLength={5}
                                required
                                value={formData.startTime}
                                onChange={(event) =>
                                    setFormData({ ...formData, startTime: sanitizeTimeInput(event.target.value) })
                                }
                                placeholder="09:00"
                                aria-invalid={Boolean(submitAttempted && timeError)}
                            />
                            {submitAttempted && timeError ? (
                                <p className="text-xs text-red-600">{timeError}</p>
                            ) : null}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="duration">{t('appointments.dialog.duration')}</Label>
                        <Select
                            value={String(formData.durationMinutes)}
                            onValueChange={(value) =>
                                setFormData({ ...formData, durationMinutes: Number(value) })
                            }
                        >
                            <SelectTrigger id="duration" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="15">{t('appointments.dialog.duration.15')}</SelectItem>
                                <SelectItem value="30">{t('appointments.dialog.duration.30')}</SelectItem>
                                <SelectItem value="45">{t('appointments.dialog.duration.45')}</SelectItem>
                                <SelectItem value="60">{t('appointments.dialog.duration.60')}</SelectItem>
                                <SelectItem value="90">{t('appointments.dialog.duration.90')}</SelectItem>
                                <SelectItem value="120">{t('appointments.dialog.duration.120')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {isEditing ? (
                        <div className="space-y-2">
                            <Label htmlFor="status">{t('appointments.dialog.status')}</Label>
                            <Select
                                value={formData.status}
                                onValueChange={(value: AppointmentStatus) =>
                                    setFormData({ ...formData, status: value })
                                }
                            >
                                <SelectTrigger id="status" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="scheduled">{t('status.scheduled')}</SelectItem>
                                    <SelectItem value="completed">{t('status.completed')}</SelectItem>
                                    <SelectItem value="cancelled">{t('status.cancelled')}</SelectItem>
                                    <SelectItem value="no_show">{t('status.no_show')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    ) : null}

                    <div className="space-y-2">
                        <Label htmlFor="reason">{t('appointments.dialog.reason')}</Label>
                        <Input
                            id="reason"
                            value={formData.reason}
                            onChange={(event) =>
                                setFormData({ ...formData, reason: event.target.value })
                            }
                            placeholder={t('appointments.dialog.reasonPlaceholder')}
                            maxLength={INPUT_LIMITS.shortText}
                            aria-invalid={Boolean(submitAttempted && formData.reason && reasonError)}
                        />
                        {submitAttempted && formData.reason && reasonError ? (
                            <p className="text-xs text-red-600">{reasonError}</p>
                        ) : null}
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleDialogOpenChange(false)}
                            disabled={mutation.isPending}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit" disabled={mutation.isPending || patientsQuery.isLoading || Boolean(timeError)}>
                            {mutation.isPending
                                ? isEditing ? t('common.saving') : t('appointments.dialog.scheduling')
                                : isEditing ? t('common.saveChanges') : t('appointments.dialog.newTitle')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
