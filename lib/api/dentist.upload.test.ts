import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api/client';
import { uploadPatientPhoto } from '@/lib/api/dentist';

vi.mock('@/lib/api/client', () => ({
    apiClient: {
        post: vi.fn(),
    },
    ensureCsrfCookie: vi.fn(),
    invalidateCsrfCookie: vi.fn(),
    withCsrfRetry: vi.fn((operation: () => Promise<unknown>) => operation()),
}));

const patient = {
    id: 'patient-1',
    full_name: 'Test Patient',
};

function makePhoto(): File {
    return new File(['image-bytes'], 'avatar.png', { type: 'image/png' });
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
