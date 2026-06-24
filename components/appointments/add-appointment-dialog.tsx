'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDirtyFormWarning } from '@/lib/hooks/use-dirty-form-warning';
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
import { createAppointment, listAppointments, lookupPatients, updateAppointment } from '@/lib/api/dentist';
import {
    getAppointmentApiErrorMessage,
} from '@/lib/appointments/messages';
import {
    INPUT_LIMITS,
    formatPhoneInputValue,
    normalizePhoneForApi,
} from '@/lib/input-validation';
import { isValidTimeInput, toLocalDateKey, truncateForUi } from '@/lib/utils';
import {
    createAppointmentStartSlots,
    isAppointmentWithinWorkingHours,
    normalizeAppointmentWorkingHours,
    resolveAppointmentEndTime,
    type AppointmentWorkingHours,
    type NormalizedAppointmentWorkingHours,
} from '@/lib/appointments/time-slots';
import type { ApiAppointment, ApiCollectionEnvelope, ApiPatientLookup } from '@/lib/api/types';
import { useI18n } from '@/components/providers/i18n-provider';
import { AppointmentTimePicker } from '@/components/appointments/appointment-time-picker';

type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';
const PATIENT_LOOKUP_PAGE_SIZE = 20;
const PATIENT_LOOKUP_DEBOUNCE_MS = 250;
const APPOINTMENT_LOOKUP_NAME_UI_LIMIT = 25;
const APPOINTMENT_LOOKUP_PHONE_UI_LIMIT = 20;
const APPOINTMENT_SELECTED_PATIENT_UI_LIMIT = 40;
const GUEST_PHONE_RX = /^\+\d{9,15}$/;

type PatientLookupOption = ApiPatientLookup;

interface EditableAppointment {
    id: string;
    patientId: string | null;
    patientName: string;
    guestName?: string | null;
    guestPhone?: string | null;
    isGuest?: boolean;
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
    workingHours?: AppointmentWorkingHours;
}

function createEditingPatientSnapshot(editingAppointment?: EditableAppointment): PatientLookupOption | null {
    if (!editingAppointment?.patientId) {
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
    editingAppointment?: EditableAppointment,
    workingHours?: AppointmentWorkingHours
) {
    const normalizedWorkingHours = normalizeAppointmentWorkingHours(workingHours);

    if (editingAppointment) {
        return {
            patientId: editingAppointment.patientId,
            guestName: editingAppointment.guestName ?? '',
            guestPhone: editingAppointment.guestPhone ?? '',
            appointmentDate: editingAppointment.appointmentDate,
            startTime: editingAppointment.startTime,
            durationMinutes: editingAppointment.durationMinutes,
            status: editingAppointment.status,
            reason: editingAppointment.reason ?? '',
        };
    }

    const appointmentDate = isValidDateInput(prefillDate) ? prefillDate : toLocalDateKey();
    const startTime = isValidTimeInput(prefillStartTime)
        ? prefillStartTime
        : createAppointmentStartSlots(normalizedWorkingHours)[0] ?? normalizedWorkingHours.start;

    return {
        patientId: prefillPatientId ?? '',
        guestName: '',
        guestPhone: '',
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

function formatPatientLabel(patient: { full_name: string; patient_id?: string | null }): string {
    return patient.full_name;
}

function normalizeLookupText(value: string | null | undefined): string {
    return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function patientMatchesLookupSearch(patient: PatientLookupOption, search: string): boolean {
    const normalizedSearch = normalizeLookupText(search);
    if (!normalizedSearch) {
        return true;
    }

    const digitsSearch = normalizedSearch.replace(/\D/g, '');
    const haystack = normalizeLookupText([
        patient.full_name,
        patient.phone,
        patient.secondary_phone ?? '',
        patient.patient_id ?? '',
    ].join(' '));
    const digitHaystack = haystack.replace(/\D/g, '');

    return haystack.includes(normalizedSearch) || (digitsSearch !== '' && digitHaystack.includes(digitsSearch));
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

function getAvailableStartTimes(
    appointments: Array<{
        id: string;
        start_time: string;
        end_time: string;
        status: AppointmentStatus;
    }>,
    payload: {
        durationMinutes: number;
        status: AppointmentStatus;
        workingHours: NormalizedAppointmentWorkingHours;
        ignoreAppointmentId?: string;
        includeStartTime?: string;
    }
): string[] {
    const startSlots = createAppointmentStartSlots(payload.workingHours, {
        extraSlots: payload.includeStartTime ? [payload.includeStartTime] : [],
    });

    return startSlots.filter((startTime) => {
        const endTime = resolveAppointmentEndTime(startTime, payload.durationMinutes);
        if (!endTime) {
            return false;
        }
        if (
            startTime !== payload.includeStartTime
            && !isAppointmentWithinWorkingHours(startTime, endTime, payload.workingHours)
        ) {
            return false;
        }

        return !hasAppointmentConflict(appointments, {
            startTime,
            endTime,
            status: payload.status,
            ignoreAppointmentId: payload.ignoreAppointmentId,
        });
    });
}

function upsertAppointmentInCollection(
    collection: ApiCollectionEnvelope<ApiAppointment> | undefined,
    appointment: ApiAppointment
): ApiCollectionEnvelope<ApiAppointment> | undefined {
    if (!collection) {
        return collection;
    }

    const nextItems = collection.data.some((item) => item.id === appointment.id)
        ? collection.data.map((item) => (item.id === appointment.id ? appointment : item))
        : [...collection.data, appointment];

    nextItems.sort((a, b) => {
        const dateCompare = a.appointment_date.localeCompare(b.appointment_date);
        if (dateCompare !== 0) {
            return dateCompare;
        }

        return a.start_time.localeCompare(b.start_time);
    });

    return {
        ...collection,
        data: nextItems,
    };
}

function removeAppointmentFromCollection(
    collection: ApiCollectionEnvelope<ApiAppointment> | undefined,
    appointmentId: string
): ApiCollectionEnvelope<ApiAppointment> | undefined {
    if (!collection) {
        return collection;
    }

    return {
        ...collection,
        data: collection.data.filter((item) => item.id !== appointmentId),
    };
}

export function AddAppointmentDialog({
    open,
    onOpenChange,
    prefillDate,
    prefillStartTime,
    prefillPatientId,
    editingAppointment,
    workingHours,
}: AddAppointmentDialogProps) {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const isEditing = Boolean(editingAppointment);
    const patientComboboxRef = useRef<HTMLDivElement | null>(null);
    const normalizedWorkingHours = normalizeAppointmentWorkingHours(workingHours);
    const [formData, setFormData] = useState(() =>
        createInitialFormData(prefillDate, prefillStartTime, prefillPatientId, editingAppointment, normalizedWorkingHours)
    );
    const [patientSearch, setPatientSearch] = useState(editingAppointment?.patientName ?? '');
    const [debouncedPatientSearch, setDebouncedPatientSearch] = useState(editingAppointment?.patientName ?? '');
    const [isPatientMenuOpen, setIsPatientMenuOpen] = useState(false);
    const [submitAttempted, setSubmitAttempted] = useState(false);
    const [selectedPatientSnapshot, setSelectedPatientSnapshot] = useState<PatientLookupOption | null>(createEditingPatientSnapshot(editingAppointment));
    const [isGuestMode, setIsGuestMode] = useState(Boolean(editingAppointment?.isGuest));
    // Dirty detection: compare formData to the initial snapshot. Browser-
    // tab warning fires when the user has any unsaved change (selected a
    // patient, picked a date, etc.) so a tab close doesn't silently drop
    // the booking. Closes only the OS-level navigation hole; in-app
    // dialog dismiss is intentional and untracked. FA-X7 G9.
    const initialFormSnapshot = useMemo(
        () => createInitialFormData(prefillDate, prefillStartTime, prefillPatientId, editingAppointment, normalizedWorkingHours),
        [prefillDate, prefillStartTime, prefillPatientId, editingAppointment, normalizedWorkingHours]
    );
    const isDirty = open && JSON.stringify(formData) !== JSON.stringify(initialFormSnapshot);
    useDirtyFormWarning(isDirty);

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
            lookupPatients({
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
        enabled: open && Boolean(formData.patientId) && !selectedPatientFromList,
        queryFn: async () => {
            const response = await lookupPatients({
                page: 1,
                perPage: 1,
                filter: {
                    id: formData.patientId ?? '',
                },
            });

            return response.data[0] ?? null;
        },
    });
    const selectedPatient = selectedPatientFromList
        ?? selectedPatientQuery.data
        ?? (selectedPatientSnapshot?.id === formData.patientId ? selectedPatientSnapshot : undefined);
    const patientOptions = useMemo(
        () => patients.filter((patient) => patientMatchesLookupSearch(patient, patientSearch)),
        [patientSearch, patients]
    );
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
    const dayAppointments = useMemo(() => dayAppointmentsQuery.data?.data ?? [], [dayAppointmentsQuery.data]);
    const availableStartTimes = getAvailableStartTimes(dayAppointments, {
        durationMinutes: formData.durationMinutes,
        status: formData.status,
        workingHours: normalizedWorkingHours,
        ignoreAppointmentId: editingAppointment?.id,
        includeStartTime: editingAppointment?.startTime,
    });
    const isSelectedTimeAvailable = availableStartTimes.includes(formData.startTime);
    const hasLoadedAvailability = !dayAppointmentsQuery.isLoading && !dayAppointmentsQuery.isFetching;
    const effectiveStartTime = hasLoadedAvailability && !isSelectedTimeAvailable
        ? availableStartTimes[0] ?? formData.startTime
        : formData.startTime;
    const isEffectiveTimeAvailable = availableStartTimes.includes(effectiveStartTime);
    const reasonError = formData.reason.trim().length > INPUT_LIMITS.shortText
        ? t('appointments.dialog.reasonMax', { max: INPUT_LIMITS.shortText })
        : null;
    const guestNameError = isGuestMode && formData.guestName.trim().length < 3
        ? t('appointments.dialog.guestNameRequired')
        : null;
    const guestPhoneError = isGuestMode && !GUEST_PHONE_RX.test(normalizePhoneForApi(formData.guestPhone))
        ? t('appointments.dialog.guestPhoneInvalid')
        : null;
    const timeError = !isValidTimeInput(effectiveStartTime)
        ? t('appointments.dialog.timeInvalid')
        : null;
    const slotError = hasLoadedAvailability && !isEffectiveTimeAvailable
        ? t('appointments.dialog.timeUnavailable')
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
            const endTime = resolveAppointmentEndTime(effectiveStartTime, formData.durationMinutes);
            if (!endTime) {
                throw new Error(t('appointments.toast.endOfDay'));
            }
            const reasonPayload = formData.reason.trim() || undefined;
            const identityPayload = isGuestMode
                ? {
                    patient_id: null,
                    guest_name: formData.guestName.trim(),
                    guest_phone: normalizePhoneForApi(formData.guestPhone),
                }
                : {
                    patient_id: formData.patientId || null,
                };

            if (editingAppointment) {
                return updateAppointment(editingAppointment.id, {
                    ...identityPayload,
                    appointment_date: formData.appointmentDate,
                    start_time: effectiveStartTime,
                    end_time: endTime,
                    status: formData.status,
                    reason: reasonPayload,
                });
            }

            return createAppointment({
                ...identityPayload,
                appointment_date: formData.appointmentDate,
                start_time: effectiveStartTime,
                end_time: endTime,
                status: 'scheduled',
                reason: reasonPayload,
            });
        },
        onSuccess: (savedAppointment) => {
            toast.success(isEditing ? t('appointments.dialog.toast.updated') : t('appointments.dialog.toast.scheduled'));
            if (editingAppointment && editingAppointment.appointmentDate !== savedAppointment.appointment_date) {
                queryClient.setQueryData<ApiCollectionEnvelope<ApiAppointment>>(
                    ['appointments', 'availability', editingAppointment.appointmentDate],
                    (current) => removeAppointmentFromCollection(current, savedAppointment.id)
                );
            }
            queryClient.setQueryData<ApiCollectionEnvelope<ApiAppointment>>(
                ['appointments', 'availability', savedAppointment.appointment_date],
                (current) => upsertAppointmentInCollection(current, savedAppointment)
            );
            setFormData(createInitialFormData(prefillDate, prefillStartTime, prefillPatientId, editingAppointment, normalizedWorkingHours));
            setPatientSearch(editingAppointment?.patientName ?? '');
            setDebouncedPatientSearch(editingAppointment?.patientName ?? '');
            setSubmitAttempted(false);
            setSelectedPatientSnapshot(createEditingPatientSnapshot(editingAppointment));
            setIsGuestMode(Boolean(editingAppointment?.isGuest));
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

        if (!isGuestMode && !formData.patientId) {
            const guestName = patientSearch.trim();
            if (guestName.length >= 3) {
                setFormData((current) => ({
                    ...current,
                    patientId: '',
                    guestName,
                    guestPhone: current.guestPhone,
                }));
                setSelectedPatientSnapshot(null);
                setIsGuestMode(true);
                setIsPatientMenuOpen(false);
                setSubmitAttempted(false);
                return;
            }

            toast.error(t('appointments.dialog.toast.selectPatientOrVisitor'));
            return;
        }

        if (guestNameError || guestPhoneError) {
            toast.error(guestNameError ?? guestPhoneError);
            return;
        }

        if (timeError || slotError) {
            toast.error(timeError ?? slotError);
            return;
        }

        if (reasonError) {
            toast.error(reasonError);
            return;
        }

        const endTime = resolveAppointmentEndTime(effectiveStartTime, formData.durationMinutes);
        if (!endTime) {
            toast.error(t('appointments.toast.endOfDay'));
            return;
        }

        const hasConflict = hasAppointmentConflict(dayAppointments, {
            startTime: effectiveStartTime,
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
        setIsGuestMode(false);
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
                guestName: '',
                guestPhone: '',
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
        setIsGuestMode(false);
        setIsPatientMenuOpen(false);
    };

    const handleGuestSelect = () => {
        const guestName = patientSearch.trim();
        if (guestName.length < 3) {
            toast.error(t('appointments.dialog.guestNameRequired'));
            return;
        }

        setFormData((current) => ({
            ...current,
            patientId: '',
            guestName,
            guestPhone: current.guestPhone,
        }));
        setSelectedPatientSnapshot(null);
        setIsGuestMode(true);
        setIsPatientMenuOpen(false);
        setSubmitAttempted(false);
    };

    const handleGuestSearchReset = () => {
        setIsGuestMode(false);
        setPatientSearch('');
        setSelectedPatientSnapshot(null);
        setSubmitAttempted(false);
        setFormData((current) => ({
            ...current,
            patientId: '',
            guestName: '',
            guestPhone: '',
        }));
    };

    return (
        <Dialog open={open} onOpenChange={handleDialogOpenChange}>
            <DialogContent className="max-h-[calc(100dvh-1.5rem)] max-w-md overflow-y-auto p-5 sm:p-6">
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
                        {!isGuestMode ? (
                            <>
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
                                            className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-md"
                                        >
                                            {patientsQuery.isLoading || (patientsQuery.isFetching && patientOptions.length === 0) ? (
                                                <p className="px-3 py-2 text-sm text-slate-500">{t('appointments.dialog.loadingPatients')}</p>
                                            ) : patientsQuery.isError ? (
                                                <p className="px-3 py-2 text-sm text-red-600">{t('appointments.dialog.patientsLoadFailed')}</p>
                                            ) : patientOptions.length === 0 ? (
                                                <div className="space-y-2 px-3 py-2">
                                                    <p className="text-sm text-slate-500">{t('appointments.dialog.noPatientsFound')}</p>
                                                    {patientSearch.trim().length >= 3 ? (
                                                        <button
                                                            type="button"
                                                            onClick={handleGuestSelect}
                                                            className="w-full rounded-lg border border-dashed border-teal-200 bg-teal-50/60 px-3 py-2 text-left text-sm font-semibold text-teal-700 transition hover:bg-teal-50"
                                                        >
                                                            {t('appointments.dialog.addGuestVisitor', {
                                                                name: truncateForUi(patientSearch.trim(), APPOINTMENT_LOOKUP_NAME_UI_LIMIT),
                                                            })}
                                                        </button>
                                                    ) : null}
                                                </div>
                                            ) : (
                                                patientOptions.map((patient) => (
                                                    <button
                                                        key={patient.id}
                                                        type="button"
                                                        role="option"
                                                        aria-selected={patient.id === formData.patientId}
                                                        onClick={() => handlePatientSelect(patient.id)}
                                                        className="w-full px-3 py-2 text-left hover:bg-slate-50"
                                                    >
                                                        <p className="text-sm font-medium text-slate-900 truncate" title={patient.full_name}>
                                                            {truncateForUi(patient.full_name, APPOINTMENT_LOOKUP_NAME_UI_LIMIT)}
                                                        </p>
                                                        <p className="text-xs text-slate-500 truncate" title={patient.phone}>
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
                                        className="text-xs text-slate-500 [overflow-wrap:anywhere] break-words"
                                        title={t('appointments.dialog.selectedPatient', { patient: formatPatientLabel(selectedPatient) })}
                                    >
                                        {t('appointments.dialog.selectedPatient', {
                                            patient: truncateForUi(formatPatientLabel(selectedPatient), APPOINTMENT_SELECTED_PATIENT_UI_LIMIT),
                                        })}
                                    </p>
                                ) : null}
                            </>
                        ) : null}
                        {isGuestMode ? (
                            <div className="rounded-xl border border-teal-100 bg-teal-50/60 p-3">
                                <div className="mb-3 flex items-center justify-between gap-2">
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-wide text-teal-700">
                                            {t('appointments.dialog.guestVisitor')}
                                        </p>
                                        <p className="text-xs text-teal-700/80">{t('appointments.dialog.guestVisitorHint')}</p>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 px-2 text-xs text-slate-600"
                                        onClick={handleGuestSearchReset}
                                    >
                                        {t('appointments.dialog.searchExisting')}
                                    </Button>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="guest-name">
                                            {t('appointments.dialog.guestName')} <span className="text-red-500">*</span>
                                        </Label>
                                        <Input
                                            id="guest-name"
                                            value={formData.guestName}
                                            onChange={(event) => {
                                                setFormData({ ...formData, guestName: event.target.value });
                                                setPatientSearch(event.target.value);
                                            }}
                                            maxLength={INPUT_LIMITS.shortText}
                                            aria-invalid={Boolean(submitAttempted && guestNameError)}
                                        />
                                        {submitAttempted && guestNameError ? (
                                            <p className="text-xs text-red-600">{guestNameError}</p>
                                        ) : null}
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="guest-phone">
                                            {t('appointments.dialog.guestPhone')} <span className="text-red-500">*</span>
                                        </Label>
                                        <Input
                                            id="guest-phone"
                                            value={formData.guestPhone}
                                            onChange={(event) =>
                                                setFormData({
                                                    ...formData,
                                                    guestPhone: formatPhoneInputValue(event.target.value),
                                                })
                                            }
                                            placeholder="+998901234567"
                                            inputMode="tel"
                                            maxLength={INPUT_LIMITS.phoneFormatted}
                                            aria-invalid={Boolean(submitAttempted && guestPhoneError)}
                                        />
                                        {submitAttempted && guestPhoneError ? (
                                            <p className="text-xs text-red-600">{guestPhoneError}</p>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                            <AppointmentTimePicker
                                id="time"
                                value={effectiveStartTime}
                                onValueChange={(value) => setFormData({ ...formData, startTime: value })}
                                disabled={dayAppointmentsQuery.isLoading || availableStartTimes.length === 0}
                                options={availableStartTimes}
                                placeholder={
                                    dayAppointmentsQuery.isLoading
                                        ? t('appointments.dialog.loadingSlots')
                                        : t('appointments.dialog.time')
                                }
                                emptyLabel={t('appointments.dialog.noAvailableSlots')}
                                ariaInvalid={Boolean(submitAttempted && (timeError || slotError))}
                            />
                            {submitAttempted && (timeError || slotError) ? (
                                <p className="text-xs text-red-600">{timeError ?? slotError}</p>
                            ) : null}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="duration">
                            {t('appointments.dialog.duration')} <span className="text-red-500">*</span>
                        </Label>
                        <Select
                            value={String(formData.durationMinutes)}
                            onValueChange={(value) => {
                                const nextDuration = Number(value);
                                const nextAvailableStartTimes = getAvailableStartTimes(dayAppointments, {
                                    durationMinutes: nextDuration,
                                    status: formData.status,
                                    workingHours: normalizedWorkingHours,
                                    ignoreAppointmentId: editingAppointment?.id,
                                    includeStartTime: editingAppointment?.startTime,
                                });

                                setFormData({
                                    ...formData,
                                    durationMinutes: nextDuration,
                                    startTime: nextAvailableStartTimes.includes(formData.startTime)
                                        ? formData.startTime
                                        : nextAvailableStartTimes[0] ?? formData.startTime,
                                });
                            }}
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
                            <Label htmlFor="status">
                                {t('appointments.dialog.status')} <span className="text-red-500">*</span>
                            </Label>
                            <Select
                                value={formData.status}
                                onValueChange={(value: AppointmentStatus) => {
                                    const nextAvailableStartTimes = getAvailableStartTimes(dayAppointments, {
                                        durationMinutes: formData.durationMinutes,
                                        status: value,
                                        workingHours: normalizedWorkingHours,
                                        ignoreAppointmentId: editingAppointment?.id,
                                        includeStartTime: editingAppointment?.startTime,
                                    });

                                    setFormData({
                                        ...formData,
                                        status: value,
                                        startTime: nextAvailableStartTimes.includes(formData.startTime)
                                            ? formData.startTime
                                            : nextAvailableStartTimes[0] ?? formData.startTime,
                                    });
                                }}
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
                        <Button
                            type="submit"
                            disabled={
                                mutation.isPending
                                || patientsQuery.isLoading
                                || dayAppointmentsQuery.isLoading
                                || availableStartTimes.length === 0
                                || Boolean(timeError)
                            }
                        >
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
