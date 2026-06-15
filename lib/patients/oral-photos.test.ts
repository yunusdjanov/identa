import { describe, expect, it } from 'vitest';
import { getPatientOralPhoto, hasPendingOralPhotoProcessing } from '@/lib/patients/oral-photos';
import type { ApiPatient } from '@/lib/api/types';

const basePatient = {
    id: 'patient-1',
    full_name: 'Test Patient',
} as ApiPatient;

describe('oral photo helpers', () => {
    it('falls back to the legacy smile alias when slot map is missing', () => {
        const patient = {
            ...basePatient,
            oral_photo: {
                id: 'photo-1',
                view_type: 'smile',
                scan_status: 'approved',
            },
        } as ApiPatient;

        expect(getPatientOralPhoto(patient, 'smile')?.id).toBe('photo-1');
        expect(getPatientOralPhoto(patient, 'top')).toBeNull();
    });

    it('detects pending processing across all oral photo slots', () => {
        expect(hasPendingOralPhotoProcessing(undefined)).toBe(false);
        expect(hasPendingOralPhotoProcessing(basePatient)).toBe(false);
        expect(hasPendingOralPhotoProcessing({
            ...basePatient,
            oral_photos: {
                top: {
                    id: 'top-photo',
                    view_type: 'top',
                    scan_status: 'pending',
                },
            },
        } as ApiPatient)).toBe(true);
        expect(hasPendingOralPhotoProcessing({
            ...basePatient,
            oral_photos: {
                smile: {
                    id: 'smile-photo',
                    view_type: 'smile',
                    scan_status: 'approved',
                },
                bottom: null,
            },
        } as ApiPatient)).toBe(false);
    });
});
