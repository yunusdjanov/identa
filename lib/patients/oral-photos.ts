import type { ApiPatient, ApiPatientClinicalPhotoViewType } from '@/lib/api/types';

export const ORAL_PHOTO_POLL_INTERVAL_MS = 2500;

export const ORAL_PHOTO_SLOTS: Array<{
    viewType: ApiPatientClinicalPhotoViewType;
    labelKey: string;
}> = [
    { viewType: 'smile', labelKey: 'patientDetail.oralPhoto.slot.smile' },
    { viewType: 'top', labelKey: 'patientDetail.oralPhoto.slot.top' },
    { viewType: 'bottom', labelKey: 'patientDetail.oralPhoto.slot.bottom' },
];

/**
 * Return the slot photo while preserving the legacy single-photo response alias.
 */
export function getPatientOralPhoto(patient: ApiPatient, viewType: ApiPatientClinicalPhotoViewType) {
    return patient.oral_photos?.[viewType] ?? (viewType === 'smile' ? patient.oral_photo ?? null : null);
}

/**
 * Return true while any oral photo is waiting for backend scan/compression.
 */
export function hasPendingOralPhotoProcessing(patient: ApiPatient | undefined): boolean {
    if (!patient) {
        return false;
    }

    return ORAL_PHOTO_SLOTS.some((slot) => getPatientOralPhoto(patient, slot.viewType)?.scan_status === 'pending');
}
