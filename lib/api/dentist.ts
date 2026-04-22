import { apiClient, ensureCsrfCookie, invalidateCsrfCookie, withCsrfRetry } from '@/lib/api/client';
import type {
    ApiAdminDentist,
    ApiAdminPasswordResetPayload,
    ApiAppointment,
    ApiAssistantAccount,
    ApiAssistantPasswordResetPayload,
    ApiAuditLogEntry,
    ApiCollectionEnvelope,
    ApiEnvelope,
    ApiInvoice,
    ApiLandingSettings,
    ApiLeadRequest,
    ApiOdontogramEntry,
    ApiOdontogramSummary,
    ApiPatient,
    ApiPatientCategory,
    ApiPayment,
    ApiProfile,
    ApiSubscriptionSummary,
    ApiTreatment,
    ApiUser,
} from '@/lib/api/types';

type FilterValue = string | number | boolean;

interface QueryOptions {
    page?: number;
    perPage?: number;
    sort?: string;
    filter?: Record<string, FilterValue | undefined>;
    includeImages?: boolean;
}

interface ApiDirectUploadTicket {
    supported: boolean;
    upload_id?: string;
    method?: 'PUT';
    url?: string;
    headers?: Record<string, string>;
    expires_at?: string;
}

export type AdminDentistSubscriptionAction =
    | 'apply_monthly'
    | 'apply_yearly'
    | 'cancel_at_period_end'
    | 'cancel_now';

export type AdminLeadRequestStatus = 'new' | 'contacted' | 'closed';

const MAX_API_PER_PAGE = 500;

function buildQueryParams(options?: QueryOptions): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    if (options?.page !== undefined) {
        params.page = options.page;
    }

    if (options?.perPage !== undefined) {
        params.per_page = options.perPage;
    }

    if (options?.sort) {
        params.sort = options.sort;
    }

    if (options?.includeImages !== undefined) {
        params.include_images = options.includeImages ? '1' : '0';
    }

    if (options?.filter) {
        const filtered = Object.entries(options.filter).filter(
            ([, value]) => value !== undefined && value !== ''
        );

        if (filtered.length > 0) {
            params.filter = Object.fromEntries(filtered);
        }
    }

    return params;
}

export async function getPublicLandingSettings(): Promise<ApiLandingSettings> {
    const { data } = await apiClient.get<ApiEnvelope<ApiLandingSettings>>('/public/landing-settings');

    return data.data;
}

export async function createPublicLeadRequest(payload: {
    name: string;
    phone: string;
    clinic_name: string;
    city: string;
    note?: string;
}): Promise<ApiLeadRequest> {
    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiLeadRequest>>('/public/lead-requests', payload)
    );

    return data.data;
}

async function collectAllPages<T>(
    fetchPage: (page: number) => Promise<ApiCollectionEnvelope<T>>
): Promise<T[]> {
    const firstPageResponse = await fetchPage(1);
    const totalPages = firstPageResponse.meta?.pagination?.total_pages ?? 1;
    const results: T[] = [...firstPageResponse.data];

    if (totalPages <= 1) {
        return results;
    }

    const remainingPages = Array.from({ length: totalPages - 1 }, (_, index) => index + 2);
    const responses = await Promise.all(remainingPages.map((page) => fetchPage(page)));

    responses.forEach((response) => {
        results.push(...response.data);
    });

    return results;
}

export async function loginWithPassword(
    email: string,
    password: string,
    remember = false
): Promise<ApiUser> {
    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiUser>>('/auth/login', {
            email,
            password,
            remember,
        })
    );
    invalidateCsrfCookie();

    return data.data;
}

export async function requestPasswordReset(email: string): Promise<string> {
    const { data } = await withCsrfRetry(() =>
        apiClient.post<{ message?: string }>('/auth/forgot-password', {
            email,
        })
    );

    return data.message ?? 'Password reset link sent.';
}

export async function resetPasswordWithToken(payload: {
    token: string;
    email: string;
    password: string;
    password_confirmation: string;
}): Promise<string> {
    const { data } = await withCsrfRetry(() =>
        apiClient.post<{ message?: string }>('/auth/reset-password', payload)
    );

    return data.message ?? 'Password reset completed.';
}

export async function logoutSession(): Promise<void> {
    await ensureCsrfCookie();
    await apiClient.post('/auth/logout');
    invalidateCsrfCookie();
}

export async function getCurrentUser(): Promise<ApiUser> {
    const { data } = await apiClient.get<ApiEnvelope<ApiUser>>('/auth/me');

    return data.data;
}

export async function listPatients(options?: QueryOptions): Promise<ApiCollectionEnvelope<ApiPatient>> {
    const { data } = await apiClient.get<ApiCollectionEnvelope<ApiPatient>>('/patients', {
        params: buildQueryParams(options),
    });

    return data;
}

export async function listAllPatients(options?: Omit<QueryOptions, 'page' | 'perPage'>): Promise<ApiPatient[]> {
    return collectAllPages((page) =>
        listPatients({
            ...options,
            page,
            perPage: MAX_API_PER_PAGE,
        })
    );
}

export async function getPatient(id: string): Promise<ApiPatient> {
    const { data } = await apiClient.get<ApiEnvelope<ApiPatient>>(`/patients/${id}`);

    return data.data;
}

export async function createPatient(payload: {
    full_name: string;
    phone: string;
    secondary_phone?: string;
    category_id?: string | null;
    address?: string;
    date_of_birth?: string;
    gender?: 'male' | 'female';
    medical_history?: string;
    allergies?: string;
    current_medications?: string;
}): Promise<ApiPatient> {
    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiPatient>>('/patients', payload)
    );

    return data.data;
}

export async function updatePatient(
    id: string,
    payload: {
        full_name: string;
        phone: string;
        secondary_phone?: string;
        category_id?: string | null;
        address?: string;
        date_of_birth?: string;
        gender?: 'male' | 'female';
        medical_history?: string;
        allergies?: string;
        current_medications?: string;
    }
): Promise<ApiPatient> {
    const { data } = await withCsrfRetry(() =>
        apiClient.put<ApiEnvelope<ApiPatient>>(`/patients/${id}`, payload)
    );

    return data.data;
}

export async function uploadPatientPhoto(id: string, photo: File): Promise<ApiPatient> {
    const directUpload = await preparePatientPhotoDirectUpload(id, photo);

    if (directUpload.supported && directUpload.upload_id && directUpload.url) {
        try {
            await performDirectSignedUpload(photo, directUpload);
        } catch {
            return uploadPatientPhotoViaApi(id, photo);
        }

        return finalizePatientPhotoDirectUpload(id, directUpload.upload_id);
    }

    return uploadPatientPhotoViaApi(id, photo);
}

export async function deletePatientPhoto(id: string): Promise<ApiPatient> {
    const { data } = await withCsrfRetry(() =>
        apiClient.delete<ApiEnvelope<ApiPatient>>(`/patients/${id}/photo`)
    );

    return data.data;
}

export async function archivePatient(id: string): Promise<void> {
    await withCsrfRetry(() => apiClient.delete(`/patients/${id}`));
}

export async function restorePatient(id: string): Promise<ApiPatient> {
    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiPatient>>(`/patients/${id}/restore`)
    );

    return data.data;
}

export async function permanentlyDeletePatient(id: string): Promise<void> {
    await withCsrfRetry(() => apiClient.delete(`/patients/${id}/force`));
}

export async function listPatientCategories(): Promise<ApiPatientCategory[]> {
    const { data } = await apiClient.get<ApiCollectionEnvelope<ApiPatientCategory>>('/patient-categories');

    return data.data;
}

export async function createPatientCategory(payload: {
    name: string;
    color?: string;
    sort_order?: number;
}): Promise<ApiPatientCategory> {
    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiPatientCategory>>('/patient-categories', payload)
    );

    return data.data;
}

export async function updatePatientCategory(
    id: string,
    payload: {
        name: string;
        color?: string;
        sort_order?: number;
    }
): Promise<ApiPatientCategory> {
    const { data } = await withCsrfRetry(() =>
        apiClient.put<ApiEnvelope<ApiPatientCategory>>(`/patient-categories/${id}`, payload)
    );

    return data.data;
}

export async function deletePatientCategory(id: string): Promise<void> {
    await withCsrfRetry(() => apiClient.delete(`/patient-categories/${id}`));
}

export async function listAppointments(
    options?: QueryOptions
): Promise<ApiCollectionEnvelope<ApiAppointment>> {
    const { data } = await apiClient.get<ApiCollectionEnvelope<ApiAppointment>>('/appointments', {
        params: buildQueryParams(options),
    });

    return data;
}

export async function listPatientOdontogram(
    patientId: string,
    options?: QueryOptions
): Promise<ApiCollectionEnvelope<ApiOdontogramEntry>> {
    const { data } = await apiClient.get<ApiCollectionEnvelope<ApiOdontogramEntry>>(
        `/patients/${patientId}/odontogram`,
        {
            params: buildQueryParams(options),
        }
    );

    return data;
}

export async function listAllPatientOdontogram(
    patientId: string,
    options?: Omit<QueryOptions, 'page' | 'perPage'>
): Promise<ApiOdontogramEntry[]> {
    return collectAllPages((page) =>
        listPatientOdontogram(patientId, {
            ...options,
            page,
            perPage: MAX_API_PER_PAGE,
        })
    );
}

export async function getPatientOdontogramSummary(
    patientId: string,
    limit = 5
): Promise<ApiOdontogramSummary> {
    const { data } = await apiClient.get<ApiEnvelope<ApiOdontogramSummary>>(
        `/patients/${patientId}/odontogram/summary`,
        {
            params: {
                limit,
            },
        }
    );

    return data.data;
}

export async function createPatientOdontogramEntry(
    patientId: string,
    payload: {
        tooth_number: number;
        condition_type: ApiOdontogramEntry['condition_type'];
        surface?: string;
        material?: string;
        severity?: string;
        condition_date: string;
        notes?: string;
    }
): Promise<ApiOdontogramEntry> {
    await ensureCsrfCookie();
    const { data } = await apiClient.post<ApiEnvelope<ApiOdontogramEntry>>(
        `/patients/${patientId}/odontogram`,
        payload
    );

    return data.data;
}

export async function updatePatientOdontogramEntry(
    patientId: string,
    entryId: string,
    payload: {
        tooth_number: number;
        condition_type: ApiOdontogramEntry['condition_type'];
        surface?: string;
        material?: string;
        severity?: string;
        condition_date: string;
        notes?: string;
    }
): Promise<ApiOdontogramEntry> {
    const { data } = await withCsrfRetry(() =>
        apiClient.put<ApiEnvelope<ApiOdontogramEntry>>(
            `/patients/${patientId}/odontogram/${entryId}`,
            payload
        )
    );

    return data.data;
}

export async function deletePatientOdontogramEntry(patientId: string, entryId: string): Promise<void> {
    await withCsrfRetry(() => apiClient.delete(`/patients/${patientId}/odontogram/${entryId}`));
}

export async function uploadPatientOdontogramEntryImage(
    patientId: string,
    entryId: string,
    payload: {
        stage: 'before' | 'after';
        image: File;
        captured_at?: string;
    }
): Promise<ApiOdontogramEntry> {
    const directUpload = await preparePatientOdontogramEntryImageDirectUpload(
        patientId,
        entryId,
        payload
    );

    if (directUpload.supported && directUpload.upload_id && directUpload.url) {
        try {
            await performDirectSignedUpload(payload.image, directUpload);
        } catch {
            return uploadPatientOdontogramEntryImageViaApi(patientId, entryId, payload);
        }

        return finalizePatientOdontogramEntryImageDirectUpload(
            patientId,
            entryId,
            directUpload.upload_id
        );
    }

    return uploadPatientOdontogramEntryImageViaApi(patientId, entryId, payload);
}

async function uploadPatientPhotoViaApi(id: string, photo: File): Promise<ApiPatient> {
    const formData = new FormData();
    formData.append('photo', photo);

    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiPatient>>(`/patients/${id}/photo`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        })
    );

    return data.data;
}

async function preparePatientPhotoDirectUpload(
    id: string,
    photo: File
): Promise<ApiDirectUploadTicket> {
    try {
        const { data } = await withCsrfRetry(() =>
            apiClient.post<ApiEnvelope<ApiDirectUploadTicket>>(`/patients/${id}/photo/direct-upload`, {
                filename: photo.name,
                content_type: resolveDirectUploadContentType(photo),
                file_size: photo.size,
            })
        );

        return data.data;
    } catch {
        return { supported: false };
    }
}

async function finalizePatientPhotoDirectUpload(id: string, uploadId: string): Promise<ApiPatient> {
    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiPatient>>(`/patients/${id}/photo/direct-upload/${uploadId}/complete`)
    );

    return data.data;
}

async function uploadPatientOdontogramEntryImageViaApi(
    patientId: string,
    entryId: string,
    payload: {
        stage: 'before' | 'after';
        image: File;
        captured_at?: string;
    }
): Promise<ApiOdontogramEntry> {
    const formData = new FormData();
    formData.append('stage', payload.stage);
    formData.append('image', payload.image);
    if (payload.captured_at) {
        formData.append('captured_at', payload.captured_at);
    }

    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiOdontogramEntry>>(
            `/patients/${patientId}/odontogram/${entryId}/images`,
            formData,
            {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            }
        )
    );

    return data.data;
}

export async function deletePatientOdontogramEntryImage(
    patientId: string,
    entryId: string,
    imageId: string
): Promise<void> {
    await withCsrfRetry(() =>
        apiClient.delete(`/patients/${patientId}/odontogram/${entryId}/images/${imageId}`)
    );
}

export async function downloadPatientOdontogramEntryImage(
    patientId: string,
    entryId: string,
    imageId: string
): Promise<Blob> {
    const response = await apiClient.get(
        `/patients/${patientId}/odontogram/${entryId}/images/${imageId}`,
        {
            responseType: 'blob',
        }
    );

    return response.data as Blob;
}

export async function listPatientTreatments(
    patientId: string,
    options?: QueryOptions
): Promise<ApiCollectionEnvelope<ApiTreatment>> {
    const { data } = await apiClient.get<ApiCollectionEnvelope<ApiTreatment>>(
        `/patients/${patientId}/treatments`,
        {
            params: buildQueryParams(options),
        }
    );

    return data;
}

export async function listTreatments(options?: QueryOptions): Promise<ApiCollectionEnvelope<ApiTreatment>> {
    const { data } = await apiClient.get<ApiCollectionEnvelope<ApiTreatment>>('/treatments', {
        params: buildQueryParams(options),
    });

    return data;
}

export async function listAllTreatments(
    options?: Omit<QueryOptions, 'page' | 'perPage'>
): Promise<ApiTreatment[]> {
    return collectAllPages((page) =>
        listTreatments({
            ...options,
            page,
            perPage: MAX_API_PER_PAGE,
        })
    );
}

export async function listAllPatientTreatments(
    patientId: string,
    options?: Omit<QueryOptions, 'page' | 'perPage'>
): Promise<ApiTreatment[]> {
    return collectAllPages((page) =>
        listPatientTreatments(patientId, {
            ...options,
            page,
            perPage: MAX_API_PER_PAGE,
        })
    );
}

export async function getPatientTreatment(
    patientId: string,
    treatmentId: string
): Promise<ApiTreatment> {
    const { data } = await apiClient.get<ApiEnvelope<ApiTreatment>>(
        `/patients/${patientId}/treatments/${treatmentId}`
    );

    return data.data;
}

async function preparePatientOdontogramEntryImageDirectUpload(
    patientId: string,
    entryId: string,
    payload: {
        stage: 'before' | 'after';
        image: File;
        captured_at?: string;
    }
): Promise<ApiDirectUploadTicket> {
    try {
        const { data } = await withCsrfRetry(() =>
            apiClient.post<ApiEnvelope<ApiDirectUploadTicket>>(
                `/patients/${patientId}/odontogram/${entryId}/images/direct-upload`,
                {
                    stage: payload.stage,
                    captured_at: payload.captured_at,
                    filename: payload.image.name,
                    content_type: resolveDirectUploadContentType(payload.image),
                    file_size: payload.image.size,
                }
            )
        );

        return data.data;
    } catch {
        return { supported: false };
    }
}

async function finalizePatientOdontogramEntryImageDirectUpload(
    patientId: string,
    entryId: string,
    uploadId: string
): Promise<ApiOdontogramEntry> {
    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiOdontogramEntry>>(
            `/patients/${patientId}/odontogram/${entryId}/images/direct-upload/${uploadId}/complete`
        )
    );

    return data.data;
}

export async function createPatientTreatment(
    patientId: string,
    payload: {
        tooth_number?: number | null;
        teeth?: number[];
        treatment_type: string;
        description?: string;
        comment?: string;
        treatment_date: string;
        cost?: number;
        debt_amount?: number;
        paid_amount?: number;
        notes?: string;
    }
): Promise<ApiTreatment> {
    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiTreatment>>(`/patients/${patientId}/treatments`, payload)
    );

    return data.data;
}

export async function updatePatientTreatment(
    patientId: string,
    treatmentId: string,
    payload: {
        tooth_number?: number | null;
        teeth?: number[];
        treatment_type: string;
        description?: string;
        comment?: string;
        treatment_date: string;
        cost?: number;
        debt_amount?: number;
        paid_amount?: number;
        notes?: string;
    }
): Promise<ApiTreatment> {
    const { data } = await withCsrfRetry(() =>
        apiClient.put<ApiEnvelope<ApiTreatment>>(
            `/patients/${patientId}/treatments/${treatmentId}`,
            payload
        )
    );

    return data.data;
}

export async function deletePatientTreatment(patientId: string, treatmentId: string): Promise<void> {
    await withCsrfRetry(() => apiClient.delete(`/patients/${patientId}/treatments/${treatmentId}`));
}

export async function uploadPatientTreatmentImage(
    patientId: string,
    treatmentId: string,
    image: File
): Promise<void> {
    const directUpload = await preparePatientTreatmentImageDirectUpload(patientId, treatmentId, image);

    if (directUpload.supported && directUpload.upload_id && directUpload.url) {
        try {
            await performDirectSignedUpload(image, directUpload);
        } catch {
            await uploadPatientTreatmentImageViaApi(patientId, treatmentId, image);

            return;
        }

        await finalizePatientTreatmentImageDirectUpload(
            patientId,
            treatmentId,
            directUpload.upload_id
        );

        return;
    }

    await uploadPatientTreatmentImageViaApi(patientId, treatmentId, image);
}

async function uploadPatientTreatmentImageViaApi(
    patientId: string,
    treatmentId: string,
    image: File
): Promise<void> {
    const formData = new FormData();
    formData.append('image', image);

    await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiTreatment>>(
            `/patients/${patientId}/treatments/${treatmentId}/images`,
            formData,
            {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            }
        )
    );
}

async function preparePatientTreatmentImageDirectUpload(
    patientId: string,
    treatmentId: string,
    image: File
): Promise<ApiDirectUploadTicket> {
    try {
        const { data } = await withCsrfRetry(() =>
            apiClient.post<ApiEnvelope<ApiDirectUploadTicket>>(
                `/patients/${patientId}/treatments/${treatmentId}/images/direct-upload`,
                {
                    filename: image.name,
                    content_type: resolveDirectUploadContentType(image),
                    file_size: image.size,
                }
            )
        );

        return data.data;
    } catch {
        return { supported: false };
    }
}

async function finalizePatientTreatmentImageDirectUpload(
    patientId: string,
    treatmentId: string,
    uploadId: string
): Promise<void> {
    await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiTreatment>>(
            `/patients/${patientId}/treatments/${treatmentId}/images/direct-upload/${uploadId}/complete`
        )
    );
}

async function performDirectSignedUpload(
    image: File,
    ticket: ApiDirectUploadTicket
): Promise<void> {
    if (!ticket.url) {
        throw new Error('Missing upload URL');
    }

    const response = await fetch(ticket.url, {
        method: ticket.method ?? 'PUT',
        headers: normalizeDirectUploadHeaders(ticket.headers ?? {}, resolveDirectUploadContentType(image)),
        body: image,
        mode: 'cors',
    });

    if (!response.ok) {
        throw new Error(`Signed upload failed with status ${response.status}`);
    }
}

function normalizeDirectUploadHeaders(
    headers: Record<string, string>,
    contentType: string
): Record<string, string> {
    const normalized: Record<string, string> = {};

    Object.entries(headers).forEach(([name, value]) => {
        const lowered = name.toLowerCase();
        if (lowered === 'host' || lowered === 'content-length') {
            return;
        }

        normalized[name] = value;
    });

    if (!Object.keys(normalized).some((name) => name.toLowerCase() === 'content-type')) {
        normalized['Content-Type'] = contentType;
    }

    return normalized;
}

function resolveDirectUploadContentType(image: File): string {
    if (image.type) {
        return image.type;
    }

    const normalizedName = image.name.toLowerCase();
    if (normalizedName.endsWith('.png')) {
        return 'image/png';
    }
    if (normalizedName.endsWith('.webp')) {
        return 'image/webp';
    }

    return 'image/jpeg';
}

export async function deletePatientTreatmentImage(
    patientId: string,
    treatmentId: string,
    imageId: string
): Promise<void> {
    await withCsrfRetry(() =>
        apiClient.delete(
            `/patients/${patientId}/treatments/${treatmentId}/images/${imageId}`
        )
    );
}

export async function downloadPatientTreatmentImage(
    patientId: string,
    treatmentId: string,
    imageId: string
): Promise<Blob> {
    const response = await apiClient.get(
        `/patients/${patientId}/treatments/${treatmentId}/images/${imageId}`,
        {
            responseType: 'blob',
        }
    );

    return response.data as Blob;
}

export async function listAllAppointments(
    options?: Omit<QueryOptions, 'page' | 'perPage'>
): Promise<ApiAppointment[]> {
    return collectAllPages((page) =>
        listAppointments({
            ...options,
            page,
            perPage: MAX_API_PER_PAGE,
        })
    );
}

export async function createAppointment(payload: {
    patient_id: string;
    appointment_date: string;
    start_time: string;
    end_time: string;
    status?: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
    reason?: string;
}): Promise<ApiAppointment> {
    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiAppointment>>('/appointments', payload)
    );

    return data.data;
}

export async function updateAppointment(
    id: string,
    payload: {
        patient_id: string;
        appointment_date: string;
        start_time: string;
        end_time: string;
        status?: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
        reason?: string;
    }
): Promise<ApiAppointment> {
    const { data } = await withCsrfRetry(() =>
        apiClient.put<ApiEnvelope<ApiAppointment>>(`/appointments/${id}`, payload)
    );

    return data.data;
}

export async function deleteAppointment(id: string): Promise<void> {
    await withCsrfRetry(() => apiClient.delete(`/appointments/${id}`));
}

export async function listInvoices(options?: QueryOptions): Promise<ApiCollectionEnvelope<ApiInvoice>> {
    const { data } = await apiClient.get<ApiCollectionEnvelope<ApiInvoice>>('/invoices', {
        params: buildQueryParams(options),
    });

    return data;
}

export async function listAllInvoices(options?: Omit<QueryOptions, 'page' | 'perPage'>): Promise<ApiInvoice[]> {
    return collectAllPages((page) =>
        listInvoices({
            ...options,
            page,
            perPage: MAX_API_PER_PAGE,
        })
    );
}

export async function createInvoice(payload: {
    patient_id: string;
    invoice_date: string;
    items: Array<{
        description: string;
        odontogram_entry_id?: string | null;
        quantity: number;
        unit_price: number;
    }>;
}): Promise<ApiInvoice> {
    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiInvoice>>('/invoices', payload)
    );

    return data.data;
}

export async function getInvoice(id: string): Promise<ApiInvoice> {
    const { data } = await apiClient.get<ApiEnvelope<ApiInvoice>>(`/invoices/${id}`);

    return data.data;
}

export async function updateInvoice(
    id: string,
    payload: {
        patient_id: string;
        invoice_date: string;
        items: Array<{
            description: string;
            odontogram_entry_id?: string | null;
            quantity: number;
            unit_price: number;
        }>;
    }
): Promise<ApiInvoice> {
    const { data } = await withCsrfRetry(() =>
        apiClient.put<ApiEnvelope<ApiInvoice>>(`/invoices/${id}`, payload)
    );

    return data.data;
}

export async function deleteInvoice(id: string): Promise<void> {
    await withCsrfRetry(() => apiClient.delete(`/invoices/${id}`));
}

export async function downloadInvoicePdf(
    invoiceId: string,
    fallbackInvoiceNumber?: string
): Promise<void> {
    const response = await apiClient.get(`/invoices/${invoiceId}/download`, {
        responseType: 'blob',
    });

    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return;
    }

    const dispositionHeader = response.headers['content-disposition'] as string | undefined;
    const fileNameMatch = dispositionHeader?.match(/filename="?([^"]+)"?/i);
    const fileName = fileNameMatch?.[1] || `${fallbackInvoiceNumber ?? `invoice-${invoiceId}`}.pdf`;

    const blobUrl = window.URL.createObjectURL(response.data as Blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
}

export async function listPayments(options?: QueryOptions): Promise<ApiCollectionEnvelope<ApiPayment>> {
    const { data } = await apiClient.get<ApiCollectionEnvelope<ApiPayment>>('/payments', {
        params: buildQueryParams(options),
    });

    return data;
}

export async function listAllPayments(options?: Omit<QueryOptions, 'page' | 'perPage'>): Promise<ApiPayment[]> {
    return collectAllPages((page) =>
        listPayments({
            ...options,
            page,
            perPage: MAX_API_PER_PAGE,
        })
    );
}

export async function createPayment(payload: {
    invoice_id: string;
    amount: number;
    payment_method: 'cash' | 'card' | 'bank_transfer';
    payment_date: string;
}): Promise<ApiPayment> {
    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiPayment>>('/payments', payload)
    );

    return data.data;
}

export async function updatePayment(
    id: string,
    payload: {
        amount: number;
        payment_method: 'cash' | 'card' | 'bank_transfer';
        payment_date: string;
    }
): Promise<ApiPayment> {
    const { data } = await withCsrfRetry(() =>
        apiClient.put<ApiEnvelope<ApiPayment>>(`/payments/${id}`, payload)
    );

    return data.data;
}

export async function deletePayment(id: string): Promise<void> {
    await withCsrfRetry(() => apiClient.delete(`/payments/${id}`));
}

export async function getProfile(): Promise<ApiProfile> {
    const { data } = await apiClient.get<ApiEnvelope<ApiProfile>>('/settings/profile');

    return data.data;
}

export async function updateProfile(payload: {
    name?: string;
    email?: string;
    phone?: string;
    practice_name?: string;
    license_number?: string;
    address?: string;
    working_hours_start?: string;
    working_hours_end?: string;
    default_appointment_duration?: number;
}): Promise<ApiProfile> {
    await ensureCsrfCookie();
    const { data } = await apiClient.put<ApiEnvelope<ApiProfile>>('/settings/profile', payload);

    return data.data;
}

export async function listAssistants(
    options?: QueryOptions
): Promise<ApiCollectionEnvelope<ApiAssistantAccount>> {
    const { data } = await apiClient.get<ApiCollectionEnvelope<ApiAssistantAccount>>('/team/assistants', {
        params: buildQueryParams(options),
    });

    return data;
}

export async function createAssistant(payload: {
    name: string;
    email: string;
    password: string;
    password_confirmation: string;
    phone?: string;
    permissions?: string[];
}): Promise<ApiAssistantAccount> {
    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiAssistantAccount>>('/team/assistants', payload)
    );

    return data.data;
}

export async function updateAssistant(
    id: string,
    payload: {
        name: string;
        email: string;
        phone?: string;
        permissions?: string[];
    }
): Promise<ApiAssistantAccount> {
    const { data } = await withCsrfRetry(() =>
        apiClient.put<ApiEnvelope<ApiAssistantAccount>>(`/team/assistants/${id}`, payload)
    );

    return data.data;
}

export async function updateAssistantStatus(
    id: string,
    status: 'active' | 'blocked'
): Promise<ApiAssistantAccount> {
    const { data } = await withCsrfRetry(() =>
        apiClient.patch<ApiEnvelope<ApiAssistantAccount>>(`/team/assistants/${id}/status`, { status })
    );

    return data.data;
}

export async function resetAssistantPassword(
    id: string,
    payload: { new_password: string; new_password_confirmation: string }
): Promise<ApiAssistantPasswordResetPayload> {
    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiAssistantPasswordResetPayload>>(
            `/team/assistants/${id}/reset-password`,
            payload
        )
    );

    return data.data;
}

export async function deleteAssistant(id: string): Promise<void> {
    await withCsrfRetry(() => apiClient.delete(`/team/assistants/${id}`));
}

export async function listAuditLogs(
    options?: QueryOptions
): Promise<ApiCollectionEnvelope<ApiAuditLogEntry>> {
    const { data } = await apiClient.get<ApiCollectionEnvelope<ApiAuditLogEntry>>('/audit-logs', {
        params: buildQueryParams(options),
    });

    return data;
}

export async function listAdminDentists(
    options?: QueryOptions
): Promise<ApiCollectionEnvelope<ApiAdminDentist>> {
    const { data } = await apiClient.get<ApiCollectionEnvelope<ApiAdminDentist>>('/admin/dentists', {
        params: buildQueryParams(options),
    });

    return data;
}

export async function listAllAdminDentists(
    options?: Omit<QueryOptions, 'page' | 'perPage'>
): Promise<ApiAdminDentist[]> {
    return collectAllPages((page) =>
        listAdminDentists({
            ...options,
            page,
            perPage: MAX_API_PER_PAGE,
        })
    );
}

export async function createAdminDentist(payload: {
    name: string;
    email: string;
    password: string;
    password_confirmation: string;
    phone?: string;
    practice_name?: string;
    license_number?: string;
    address?: string;
}): Promise<ApiAdminDentist> {
    await ensureCsrfCookie();
    const { data } = await apiClient.post<ApiEnvelope<ApiAdminDentist>>('/admin/dentists', payload);

    return data.data;
}

export async function updateAdminDentistStatus(
    id: string,
    status: 'active' | 'blocked'
): Promise<ApiAdminDentist> {
    await ensureCsrfCookie();
    const { data } = await apiClient.patch<ApiEnvelope<ApiAdminDentist>>(
        `/admin/dentists/${id}/status`,
        { status }
    );

    return data.data;
}

export async function resetAdminDentistPassword(
    id: string,
    payload: { new_password: string; new_password_confirmation: string }
): Promise<ApiAdminPasswordResetPayload> {
    await ensureCsrfCookie();
    const { data } = await apiClient.post<ApiEnvelope<ApiAdminPasswordResetPayload>>(
        `/admin/dentists/${id}/reset-password`,
        payload
    );

    return data.data;
}

export async function deleteAdminDentist(id: string): Promise<void> {
    await ensureCsrfCookie();
    await apiClient.delete(`/admin/dentists/${id}`);
}

export async function manageAdminDentistSubscription(
    id: string,
    payload: {
        action: AdminDentistSubscriptionAction;
        payment_method?: ApiSubscriptionSummary['payment_method'];
        payment_amount?: number;
        note?: string;
    }
): Promise<ApiAdminDentist> {
    await ensureCsrfCookie();
    const { data } = await apiClient.post<ApiEnvelope<ApiAdminDentist>>(
        `/admin/dentists/${id}/subscription`,
        payload
    );

    return data.data;
}

export async function getAdminLandingSettings(): Promise<ApiLandingSettings> {
    const { data } = await apiClient.get<ApiEnvelope<ApiLandingSettings>>('/admin/landing-settings');

    return data.data;
}

export async function updateAdminLandingSettings(payload: {
    trial_price_amount: number;
    monthly_price_amount: number;
    yearly_price_amount: number;
    telegram_contact_url?: string | null;
}): Promise<ApiLandingSettings> {
    await ensureCsrfCookie();
    const { data } = await apiClient.put<ApiEnvelope<ApiLandingSettings>>('/admin/landing-settings', payload);

    return data.data;
}

export async function listAdminLeadRequests(
    options?: QueryOptions
): Promise<ApiCollectionEnvelope<ApiLeadRequest>> {
    const { data } = await apiClient.get<ApiCollectionEnvelope<ApiLeadRequest>>('/admin/lead-requests', {
        params: buildQueryParams(options),
    });

    return data;
}

export async function updateAdminLeadRequestStatus(
    id: string,
    status: AdminLeadRequestStatus
): Promise<ApiLeadRequest> {
    await ensureCsrfCookie();
    const { data } = await apiClient.patch<ApiEnvelope<ApiLeadRequest>>(
        `/admin/lead-requests/${id}`,
        { status }
    );

    return data.data;
}

export interface DashboardAppointmentView {
    id: string;
    patientName: string;
    appointmentDate: string;
    startTime: string;
    durationMinutes: number;
    status: ApiAppointment['status'];
    reason?: string;
}

export interface DashboardSnapshot {
    revenueThisMonth: number;
    outstandingDebtTotal: number;
    todayAppointments: DashboardAppointmentView[];
}

interface DashboardSnapshotOptions {
    includeFinancials?: boolean;
}

export async function getDashboardSnapshot(
    options: DashboardSnapshotOptions = {}
): Promise<DashboardSnapshot> {
    const { data } = await apiClient.get<ApiEnvelope<DashboardSnapshot>>('/dashboard/snapshot', {
        params: {
            include_financials: options.includeFinancials === false ? '0' : '1',
        },
    });

    return data.data;
}
