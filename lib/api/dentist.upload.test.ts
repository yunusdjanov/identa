import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api/client';
import {
    deletePatientOralPhoto,
    replacePatientOralPhoto,
    replacePatientTreatmentImage,
    uploadPatientOralPhoto,
    uploadPatientPhoto,
    uploadPatientTreatmentImages,
} from '@/lib/api/dentist';

vi.mock('@/lib/api/client', () => ({
    apiClient: {
        post: vi.fn(),
        delete: vi.fn(),
    },
    ensureCsrfCookie: vi.fn(),
    invalidateCsrfCookie: vi.fn(),
    withCsrfRetry: vi.fn((operation: () => Promise<unknown>) => operation()),
}));

const patient = {
    id: 'patient-1',
    full_name: 'Test Patient',
};
const testImageBytes = 'image-bytes';

function makePhoto(): File {
    return new File([testImageBytes], 'avatar.png', { type: 'image/png' });
}

function makeTreatmentPhoto(index: number): File {
    return new File([testImageBytes], `treatment-${index}.png`, { type: 'image/png' });
}

describe('uploadPatientPhoto', () => {
    beforeEach(() => {
        vi.mocked(apiClient.post).mockReset();
        vi.stubGlobal('fetch', vi.fn());
    });

    it('uploads directly to the signed URL and completes the direct upload ticket', async () => {
        vi.mocked(apiClient.post)
            .mockResolvedValueOnce({
                data: {
                    data: {
                        supported: true,
                        upload_id: 'upload-1',
                        method: 'PUT',
                        url: 'https://bucket.account.r2.cloudflarestorage.com/photo.png',
                    },
                },
            })
            .mockResolvedValueOnce({ data: { data: patient } });
        vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);

        await expect(uploadPatientPhoto('patient-1', makePhoto())).resolves.toEqual(patient);

        expect(fetch).toHaveBeenCalledWith(
            'https://bucket.account.r2.cloudflarestorage.com/photo.png',
            expect.objectContaining({
                method: 'PUT',
                mode: 'cors',
                headers: expect.objectContaining({
                    'Content-Type': 'image/png',
                }),
            })
        );
        expect(apiClient.post).toHaveBeenLastCalledWith(
            '/patients/patient-1/photo/direct-upload/upload-1/complete'
        );
    });

    it('falls back to multipart API upload without overriding the browser boundary', async () => {
        vi.mocked(apiClient.post)
            .mockResolvedValueOnce({
                data: {
                    data: {
                        supported: true,
                        upload_id: 'upload-1',
                        method: 'PUT',
                        url: 'https://bucket.account.r2.cloudflarestorage.com/photo.png',
                    },
                },
            })
            .mockResolvedValueOnce({ data: { data: patient } });
        vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Blocked by CSP'));

        await expect(uploadPatientPhoto('patient-1', makePhoto())).resolves.toEqual(patient);

        expect(apiClient.post).toHaveBeenLastCalledWith(
            '/patients/patient-1/photo',
            expect.any(FormData)
        );
    });
});

describe('uploadPatientOralPhoto', () => {
    beforeEach(() => {
        vi.mocked(apiClient.post).mockReset();
        vi.stubGlobal('fetch', vi.fn());
    });

    it('uploads oral photos directly to the signed URL and completes the ticket', async () => {
        vi.mocked(apiClient.post)
            .mockResolvedValueOnce({
                data: {
                    data: {
                        supported: true,
                        upload_id: 'oral-upload-1',
                        method: 'PUT',
                        url: 'https://bucket.account.r2.cloudflarestorage.com/oral-photo.png',
                    },
                },
            })
            .mockResolvedValueOnce({ data: { data: patient } });
        vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);

        await expect(uploadPatientOralPhoto('patient-1', makePhoto())).resolves.toEqual(patient);

        expect(fetch).toHaveBeenCalledWith(
            'https://bucket.account.r2.cloudflarestorage.com/oral-photo.png',
            expect.objectContaining({
                method: 'PUT',
                mode: 'cors',
                headers: expect.objectContaining({
                    'Content-Type': 'image/png',
                }),
            })
        );
        expect(apiClient.post).toHaveBeenLastCalledWith(
            '/patients/patient-1/oral-photos/smile/direct-upload/oral-upload-1/complete'
        );
    });

    it('uploads a requested oral photo slot through its slot endpoint', async () => {
        vi.mocked(apiClient.post)
            .mockResolvedValueOnce({
                data: {
                    data: {
                        supported: true,
                        upload_id: 'top-upload-1',
                        method: 'PUT',
                        url: 'https://bucket.account.r2.cloudflarestorage.com/top-photo.png',
                    },
                },
            })
            .mockResolvedValueOnce({ data: { data: patient } });
        vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);

        await expect(uploadPatientOralPhoto('patient-1', makePhoto(), 'top')).resolves.toEqual(patient);

        expect(apiClient.post).toHaveBeenNthCalledWith(
            1,
            '/patients/patient-1/oral-photos/top/direct-upload',
            {
                filename: 'avatar.png',
                content_type: 'image/png',
                file_size: testImageBytes.length,
            }
        );
        expect(apiClient.post).toHaveBeenLastCalledWith(
            '/patients/patient-1/oral-photos/top/direct-upload/top-upload-1/complete'
        );
    });

    it('falls back to multipart API upload for oral photos when direct upload is blocked', async () => {
        vi.mocked(apiClient.post)
            .mockResolvedValueOnce({
                data: {
                    data: {
                        supported: true,
                        upload_id: 'oral-upload-1',
                        method: 'PUT',
                        url: 'https://bucket.account.r2.cloudflarestorage.com/oral-photo.png',
                    },
                },
            })
            .mockResolvedValueOnce({ data: { data: patient } });
        vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Blocked by CSP'));

        await expect(uploadPatientOralPhoto('patient-1', makePhoto())).resolves.toEqual(patient);

        expect(apiClient.post).toHaveBeenLastCalledWith(
            '/patients/patient-1/oral-photos/smile',
            expect.any(FormData)
        );
    });
});

describe('deletePatientOralPhoto', () => {
    beforeEach(() => {
        vi.mocked(apiClient.delete).mockReset();
    });

    it('deletes a specific oral gallery photo when a photo id is provided', async () => {
        vi.mocked(apiClient.delete).mockResolvedValueOnce({ data: { data: patient } });

        await expect(deletePatientOralPhoto('patient-1', 'top', 'photo-2')).resolves.toEqual(patient);

        expect(apiClient.delete).toHaveBeenCalledWith('/patients/patient-1/oral-photos/top/photo-2');
    });

    it('keeps the legacy slot delete endpoint when no photo id is provided', async () => {
        vi.mocked(apiClient.delete).mockResolvedValueOnce({ data: { data: patient } });

        await expect(deletePatientOralPhoto('patient-1', 'smile')).resolves.toEqual(patient);

        expect(apiClient.delete).toHaveBeenCalledWith('/patients/patient-1/oral-photos/smile');
    });
});

describe('replacePatientOralPhoto', () => {
    beforeEach(() => {
        vi.mocked(apiClient.post).mockReset();
    });

    it('replaces one oral gallery photo through the replace endpoint', async () => {
        vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: patient } });

        await expect(replacePatientOralPhoto('patient-1', 'bottom', 'photo-1', makePhoto()))
            .resolves.toEqual(patient);

        expect(apiClient.post).toHaveBeenCalledWith(
            '/patients/patient-1/oral-photos/bottom/photo-1/replace',
            expect.any(FormData)
        );
    });
});

describe('replacePatientTreatmentImage', () => {
    beforeEach(() => {
        vi.mocked(apiClient.post).mockReset();
    });

    it('replaces one treatment image through the replace endpoint', async () => {
        const treatment = { id: 'treatment-1', images: [] };
        vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: treatment } });

        await expect(replacePatientTreatmentImage('patient-1', 'treatment-1', 'image-1', makePhoto()))
            .resolves.toEqual(treatment);

        expect(apiClient.post).toHaveBeenCalledWith(
            '/patients/patient-1/treatments/treatment-1/images/image-1/replace',
            expect.any(FormData)
        );
    });
});

describe('uploadPatientTreatmentImages', () => {
    beforeEach(() => {
        vi.mocked(apiClient.post).mockReset();
        vi.stubGlobal('fetch', vi.fn());
    });

    it('limits concurrent direct uploads to three files', async () => {
        const files = Array.from({ length: 5 }, (_, index) => makeTreatmentPhoto(index));
        const releaseUpload = new Map<number, () => void>();
        let activeUploads = 0;
        let maxActiveUploads = 0;

        vi.mocked(apiClient.post).mockImplementation(async (url, payload) => {
            if (url === '/patients/patient-1/treatments/treatment-1/images/direct-upload-batch') {
                const filesPayload = (payload as { files: Array<{ client_id: string }> }).files;

                return {
                    data: {
                        data: {
                            supported: true,
                            uploads: filesPayload.map((file, index) => ({
                                client_id: file.client_id,
                                upload_id: `upload-${index}`,
                                method: 'PUT',
                                url: `https://bucket.test/upload-${index}.png`,
                            })),
                        },
                    },
                };
            }

            if (url === '/patients/patient-1/treatments/treatment-1/images/direct-upload-batch/complete') {
                return { data: { data: { completed_count: files.length, failed: [] } } };
            }

            throw new Error(`Unexpected request: ${url}`);
        });
        vi.mocked(fetch).mockImplementation((url) => {
            const index = Number(String(url).match(/upload-(\d+)/)?.[1] ?? -1);
            activeUploads += 1;
            maxActiveUploads = Math.max(maxActiveUploads, activeUploads);

            return new Promise((resolve) => {
                releaseUpload.set(index, () => {
                    activeUploads -= 1;
                    resolve({ ok: true } as Response);
                });
            });
        });

        const uploadPromise = uploadPatientTreatmentImages('patient-1', 'treatment-1', files);
        await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
        expect(releaseUpload.has(3)).toBe(false);

        releaseUpload.get(0)?.();
        await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
        expect(maxActiveUploads).toBe(3);

        releaseUpload.get(1)?.();
        await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(5));
        expect(maxActiveUploads).toBe(3);

        releaseUpload.get(2)?.();
        releaseUpload.get(3)?.();
        releaseUpload.get(4)?.();

        await expect(uploadPromise).resolves.toBe(0);
        expect(maxActiveUploads).toBe(3);
    });

    it('limits concurrent fallback multipart uploads to three files', async () => {
        const files = Array.from({ length: 5 }, (_, index) => makeTreatmentPhoto(index));
        const releaseUpload = new Map<number, () => void>();
        let activeUploads = 0;
        let maxActiveUploads = 0;

        vi.mocked(apiClient.post).mockImplementation((url, payload) => {
            if (url === '/patients/patient-1/treatments/treatment-1/images/direct-upload-batch') {
                return Promise.resolve({ data: { data: { supported: false } } });
            }

            if (url === '/patients/patient-1/treatments/treatment-1/images') {
                const image = (payload as FormData).get('image') as File;
                const index = Number(image.name.match(/treatment-(\d+)/)?.[1] ?? -1);
                activeUploads += 1;
                maxActiveUploads = Math.max(maxActiveUploads, activeUploads);

                return new Promise((resolve) => {
                    releaseUpload.set(index, () => {
                        activeUploads -= 1;
                        resolve({ data: { data: {} } });
                    });
                });
            }

            throw new Error(`Unexpected request: ${url}`);
        });

        const uploadPromise = uploadPatientTreatmentImages('patient-1', 'treatment-1', files);
        await vi.waitFor(() => expect(releaseUpload.size).toBe(3));
        expect(releaseUpload.has(3)).toBe(false);

        releaseUpload.get(0)?.();
        await vi.waitFor(() => expect(releaseUpload.has(3)).toBe(true));
        expect(maxActiveUploads).toBe(3);

        releaseUpload.get(1)?.();
        await vi.waitFor(() => expect(releaseUpload.has(4)).toBe(true));
        expect(maxActiveUploads).toBe(3);

        releaseUpload.get(2)?.();
        releaseUpload.get(3)?.();
        releaseUpload.get(4)?.();

        await expect(uploadPromise).resolves.toBe(0);
        expect(maxActiveUploads).toBe(3);
    });
});
