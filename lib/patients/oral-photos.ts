import type { ApiPatient, ApiPatientClinicalPhotoViewType } from '@/lib/api/types';

export const ORAL_PHOTO_POLL_INTERVAL_MS = 2500;
export const ORAL_PHOTO_MAX_PER_SLOT = 6;

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
    return getPatientOralPhotoGallery(patient, viewType)[0] ?? null;
}

/**
 * Return all photos for a slot while preserving the legacy single-photo response.
 */
export function getPatientOralPhotoGallery(patient: ApiPatient, viewType: ApiPatientClinicalPhotoViewType) {
    const gallery = patient.oral_photo_galleries?.[viewType]?.filter(Boolean) ?? [];
    if (gallery.length > 0) {
        return gallery;
    }

    const legacyPhoto = patient.oral_photos?.[viewType] ?? (viewType === 'smile' ? patient.oral_photo ?? null : null);
    return legacyPhoto ? [legacyPhoto] : [];
}

/**
 * Return true while any oral photo is waiting for backend scan/compression.
 */
export function hasPendingOralPhotoProcessing(patient: ApiPatient | undefined): boolean {
    if (!patient) {
        return false;
    }

    return ORAL_PHOTO_SLOTS.some((slot) =>
        getPatientOralPhotoGallery(patient, slot.viewType).some((photo) => photo.scan_status === 'pending')
    );
}
