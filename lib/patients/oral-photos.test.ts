import { describe, expect, it } from 'vitest';
import {
    getPatientOralPhoto,
    getPatientOralPhotoGallery,
    hasPendingOralPhotoProcessing,
    hasPendingPatientMediaProcessing,
} from '@/lib/patients/oral-photos';
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
        expect(getPatientOralPhotoGallery(patient, 'smile')).toHaveLength(1);
        expect(getPatientOralPhoto(patient, 'top')).toBeNull();
    });

    it('prefers gallery photos over the legacy slot map', () => {
        const patient = {
            ...basePatient,
            oral_photos: {
                smile: {
                    id: 'legacy-smile',
                    view_type: 'smile',
                    scan_status: 'approved',
                },
            },
            oral_photo_galleries: {
                smile: [
                    {
                        id: 'gallery-smile-1',
                        view_type: 'smile',
                        scan_status: 'approved',
                    },
                    {
                        id: 'gallery-smile-2',
                        view_type: 'smile',
                        scan_status: 'approved',
                    },
                ],
            },
        } as ApiPatient;

        expect(getPatientOralPhoto(patient, 'smile')?.id).toBe('gallery-smile-1');
        expect(getPatientOralPhotoGallery(patient, 'smile').map((photo) => photo.id)).toEqual([
            'gallery-smile-1',
            'gallery-smile-2',
        ]);
    });

    it('detects pending processing across all oral photo slots', () => {
        expect(hasPendingOralPhotoProcessing(undefined)).toBe(false);
        expect(hasPendingOralPhotoProcessing(basePatient)).toBe(false);
        expect(hasPendingOralPhotoProcessing({
            ...basePatient,
            oral_photo_galleries: {
                top: [
                    {
                        id: 'top-photo',
                        view_type: 'top',
                        scan_status: 'pending',
                    },
                ],
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

    it('keeps polling while a profile-photo replacement is processing', () => {
        expect(hasPendingPatientMediaProcessing({
            ...basePatient,
            photo_scan_status: 'approved',
            photo_processing_status: 'pending',
        } as ApiPatient)).toBe(true);
        expect(hasPendingPatientMediaProcessing({
            ...basePatient,
            photo_scan_status: 'approved',
            photo_processing_status: 'rejected',
        } as ApiPatient)).toBe(false);
    });
});
