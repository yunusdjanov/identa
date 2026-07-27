import { apiClient, ensureCsrfCookie, invalidateCsrfCookie, withCsrfRetry } from '@/lib/api/client';
import type {
    ApiAdminDentist,
    ApiAdminDentistBilling,
    ApiAdminPasswordResetPayload,
    ApiAdminPayment,
    ApiAdminPaymentsEnvelope,
    ApiAdminAnalyticsSummary,
    ApiAnalyticsSummary,
    ApiAppointment,
    ApiAssistantAccount,
    ApiAssistantPasswordResetPayload,
    ApiAuditLogEntry,
    ApiCollectionEnvelope,
    ApiEnvelope,
    ApiMoneyCurrency,
    ApiBillingPayment,
    ApiPatient,
    ApiPatientLookup,
    ApiRecentPatient,
    ApiPatientOverview,
    ApiPatientCategory,
    ApiPatientClinicalPhotoViewType,
    ApiPaymentExpense,
    ApiPaymentHistoryLedgerRow,
    ApiPaymentPatientLedgerRow,
    ApiPlan,
    ApiProfile,
    ApiSubscriptionSummary,
    ApiTreatment,
    ApiUser,
    UpdatePlanPayload,
} from '@/lib/api/types';

type FilterValue = string | number | boolean;
type LoginPortal = 'app' | 'admin';

export interface AnalyticsSummaryParams {
    range: '7d' | '30d' | '90d' | '180d' | '365d' | 'ytd';
    current_from: string;
    current_to: string;
    previous_from: string;
    previous_to: string;
    currency?: ApiMoneyCurrency;
}

interface QueryOptions {
    page?: number;
    perPage?: number;
    sort?: string;
    filter?: Record<string, FilterValue | undefined>;
    includeImages?: boolean;
    includeSummary?: boolean;
}

interface ApiDirectUploadTicket {
    supported: boolean;
    upload_id?: string;
    method?: 'PUT';
    url?: string;
    headers?: Record<string, string>;
    expires_at?: string;
}

interface ApiDirectUploadBatchTicket {
    supported: boolean;
    uploads?: ApiDirectUploadBatchItem[];
    expires_at?: string;
}

interface ApiDirectUploadBatchItem extends ApiDirectUploadTicket {
    client_id: string;
    upload_id: string;
    url: string;
}

interface ApiDirectUploadBatchCompletion {
    completed_count: number;
    failed: Array<{
        upload_id: string;
        reason: string;
    }>;
}

export type AdminDentistSubscriptionAction =
    | 'apply_monthly'
    | 'apply_yearly'
    | 'activate_monthly'
    | 'activate_yearly'
    | 'extend_monthly'
    | 'extend_yearly'
    | 'set_trial'
    | 'set_basic_monthly'
    | 'set_basic_yearly'
    | 'set_pro_monthly'
    | 'set_pro_yearly'
    | 'mark_read_only'
    | 'mark_active'
    | 'cancel_at_period_end'
    | 'cancel_now';

const MAX_API_PER_PAGE = 500;
const MAX_COLLECT_ALL_PAGES_CONCURRENCY = 3;
const MAX_TREATMENT_IMAGE_UPLOAD_CONCURRENCY = 3;

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

    if (options?.includeSummary !== undefined) {
        params.include_summary = options.includeSummary ? '1' : '0';
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

function patientOralPhotoEndpoint(id: string, viewType: ApiPatientClinicalPhotoViewType): string {
    return `/patients/${id}/oral-photos/${viewType}`;
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

    for (let index = 0; index < remainingPages.length; index += MAX_COLLECT_ALL_PAGES_CONCURRENCY) {
        const pageBatch = remainingPages.slice(index, index + MAX_COLLECT_ALL_PAGES_CONCURRENCY);
        const responses = await Promise.all(pageBatch.map((page) => fetchPage(page)));

        responses.forEach((response) => {
            results.push(...response.data);
        });
    }

    return results;
}

async function mapSettledWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
    const results = new Array<PromiseSettledResult<R>>(items.length);
    const workerCount = Math.max(1, Math.min(concurrency, items.length));
    let currentIndex = 0;

    await Promise.all(Array.from({ length: workerCount }, async () => {
        while (true) {
            const nextIndex = currentIndex;
            currentIndex += 1;

            if (nextIndex >= items.length) {
                return;
            }

            try {
                results[nextIndex] = {
                    status: 'fulfilled',
                    value: await mapper(items[nextIndex], nextIndex),
                };
            } catch (reason) {
                results[nextIndex] = {
                    status: 'rejected',
                    reason,
                };
            }
        }
    }));

    return results;
}

export async function loginWithPassword(
    email: string,
    password: string,
    remember = false,
    portal: LoginPortal = 'app'
): Promise<ApiUser> {
    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiUser>>('/auth/login', {
            email,
            password,
            remember,
            portal,
        })
    );
    invalidateCsrfCookie();

    return data.data;
}

export async function registerWithPassword(payload: {
    name: string;
    email: string;
    password: string;
    password_confirmation: string;
}): Promise<ApiUser> {
    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiUser>>('/auth/register', payload)
    );
    invalidateCsrfCookie();

    return data.data;
}

export async function loginWithGoogleIdToken(idToken: string): Promise<ApiUser> {
    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiUser>>('/auth/google', {
            id_token: idToken,
        })
    );
    invalidateCsrfCookie();

    return data.data;
}

/**
 * Connected Accounts → Link Google
 *
 * Posts a fresh Google Identity Services ID token to the authenticated
 * link endpoint. The backend re-verifies the token (audience / subject /
 * email-match) before binding `google_id` to the current user, so the
 * client only has to hand over the credential.
 */
export async function linkGoogleAccount(idToken: string): Promise<ApiUser> {
    const { data } = await withCsrfRetry(() =>
        apiClient.post<{ data: ApiUser }>('/auth/google/link', {
            id_token: idToken,
        })
    );

    return data.data;
}

/**
 * Connected Accounts → Unlink Google
 *
 * Backend refuses if the user has no password fallback — otherwise they
 * would lock themselves out. The frontend mirrors that guard by hiding
 * the disconnect button when `has_password === false`, but the server
 * remains the source of truth.
 */
export async function unlinkGoogleAccount(): Promise<ApiUser> {
    const { data } = await withCsrfRetry(() =>
        apiClient.delete<{ data: ApiUser }>('/auth/google/link')
    );

    return data.data;
}

export async function resendEmailVerification(): Promise<string> {
    const { data } = await withCsrfRetry(() =>
        apiClient.post<{ message?: string }>('/auth/email/verification-notification')
    );

    return data.message ?? '';
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

export async function changeCurrentPassword(payload: {
    current_password?: string;
    new_password: string;
    new_password_confirmation: string;
}): Promise<ApiUser> {
    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiUser>>('/auth/change-password', payload)
    );
    invalidateCsrfCookie();

    return data.data;
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

export async function listBillingPlans(): Promise<ApiPlan[]> {
    const { data } = await apiClient.get<ApiCollectionEnvelope<ApiPlan>>('/billing/plans');

    return data.data;
}

export async function getCurrentSubscription(): Promise<ApiSubscriptionSummary | null> {
    const { data } = await apiClient.get<ApiEnvelope<ApiSubscriptionSummary | null>>('/billing/current-subscription');

    return data.data;
}

export async function createBillingCheckout(payload: {
    plan_code: 'basic' | 'pro';
    billing_period: 'monthly' | 'yearly';
    selected_active_staff_ids?: number[];
}): Promise<{ checkout_url: string; payment: ApiBillingPayment }> {
    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<{ checkout_url: string; payment: ApiBillingPayment }>>('/billing/checkout', payload)
    );

    return data.data;
}

/**
 * Schedule a downgrade (Pro → Basic) for the end of the current paid period
 * WITHOUT payment. Returns the refreshed subscription summary (now carrying
 * the pending change). Unlike createBillingCheckout there is no PayX redirect.
 */
export async function scheduleBillingDowngrade(payload: {
    plan_code: 'basic';
    billing_period: 'monthly' | 'yearly';
    selected_active_staff_ids?: number[];
}): Promise<ApiSubscriptionSummary> {
    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiSubscriptionSummary>>('/billing/downgrade', payload)
    );

    return data.data;
}

export async function listBillingPayments(): Promise<ApiBillingPayment[]> {
    const { data } = await apiClient.get<ApiCollectionEnvelope<ApiBillingPayment>>('/billing/payments');

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

export async function lookupPatients(options?: QueryOptions): Promise<ApiCollectionEnvelope<ApiPatientLookup>> {
    const { data } = await apiClient.get<ApiCollectionEnvelope<ApiPatientLookup>>('/lookups/patients', {
        params: buildQueryParams(options),
    });

    return data;
}

export async function getPatient(
    id: string,
    options: { rememberRecent?: boolean } = {}
): Promise<ApiPatient> {
    const { data } = await apiClient.get<ApiEnvelope<ApiPatient>>(`/patients/${id}`, {
        params: options.rememberRecent ? { remember_recent: 1 } : undefined,
    });

    return data.data;
}

/**
 * Loads the current user's profile-scoped recently opened patients.
 */
export async function listRecentPatients(): Promise<ApiRecentPatient[]> {
    const { data } = await apiClient.get<ApiCollectionEnvelope<ApiRecentPatient>>('/patients/recent');

    return data.data;
}

/**
 * Removes one patient from the current user's recent-patient shortcuts.
 */
export async function forgetRecentPatient(id: string): Promise<void> {
    await withCsrfRetry(() => apiClient.delete(`/patients/recent/${id}`));
}

/**
 * Clears all recent-patient shortcuts for the current user.
 */
export async function clearRecentPatients(): Promise<void> {
    await withCsrfRetry(() => apiClient.delete('/patients/recent'));
}

export async function getPatientOverview(id: string): Promise<ApiPatientOverview> {
    const { data } = await apiClient.get<ApiEnvelope<ApiPatientOverview>>(`/patients/${id}/overview`);

    return data.data;
}

export interface CreatePatientPayload {
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

export interface GuestAppointmentPatientCardResult {
    appointment: ApiAppointment;
    patient: ApiPatient;
}

export async function createPatient(payload: CreatePatientPayload): Promise<ApiPatient> {
    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiPatient>>('/patients', payload)
    );

    return data.data;
}

export async function createPatientCardFromGuestAppointment(
    appointmentId: string,
    payload: CreatePatientPayload
): Promise<GuestAppointmentPatientCardResult> {
    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<GuestAppointmentPatientCardResult>>(
            `/appointments/${appointmentId}/patient-card`,
            payload
        )
    );

    return data.data;
}

export async function updatePatient(
    id: string,
    payload: {
        full_name: string;
        phone: string;
        secondary_phone?: string | null;
        category_id?: string | null;
        address?: string | null;
        date_of_birth?: string | null;
        gender?: 'male' | 'female';
        medical_history?: string | null;
        allergies?: string | null;
        current_medications?: string | null;
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

/**
 * Upload or replace one of the patient's oral clinical photo slots.
 */
export async function uploadPatientOralPhoto(
    id: string,
    photo: File,
    viewType: ApiPatientClinicalPhotoViewType = 'smile'
): Promise<ApiPatient> {
    const directUpload = await preparePatientOralPhotoDirectUpload(id, photo, viewType);

    if (directUpload.supported && directUpload.upload_id && directUpload.url) {
        try {
            await performDirectSignedUpload(photo, directUpload);
        } catch {
            return uploadPatientOralPhotoViaApi(id, photo, viewType);
        }

        return finalizePatientOralPhotoDirectUpload(id, directUpload.upload_id, viewType);
    }

    return uploadPatientOralPhotoViaApi(id, photo, viewType);
}

export async function deletePatientPhoto(id: string): Promise<ApiPatient> {
    const { data } = await withCsrfRetry(() =>
        apiClient.delete<ApiEnvelope<ApiPatient>>(`/patients/${id}/photo`)
    );

    return data.data;
}

/**
 * Delete one of the patient's oral clinical photo slots.
 */
export async function deletePatientOralPhoto(
    id: string,
    viewType: ApiPatientClinicalPhotoViewType = 'smile',
    photoId?: string
): Promise<ApiPatient> {
    const endpoint = photoId
        ? `${patientOralPhotoEndpoint(id, viewType)}/${photoId}`
        : patientOralPhotoEndpoint(id, viewType);
    const { data } = await withCsrfRetry(() =>
        apiClient.delete<ApiEnvelope<ApiPatient>>(endpoint)
    );

    return data.data;
}

export async function replacePatientOralPhoto(
    id: string,
    viewType: ApiPatientClinicalPhotoViewType,
    photoId: string,
    photo: File
): Promise<ApiPatient> {
    const formData = new FormData();
    formData.append('photo', photo);

    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiPatient>>(
            `${patientOralPhotoEndpoint(id, viewType)}/${photoId}/replace`,
            formData
        )
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

async function uploadPatientPhotoViaApi(id: string, photo: File): Promise<ApiPatient> {
    const formData = new FormData();
    formData.append('photo', photo);

    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiPatient>>(`/patients/${id}/photo`, formData)
    );

    return data.data;
}

async function uploadPatientOralPhotoViaApi(
    id: string,
    photo: File,
    viewType: ApiPatientClinicalPhotoViewType
): Promise<ApiPatient> {
    const formData = new FormData();
    formData.append('photo', photo);

    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiPatient>>(patientOralPhotoEndpoint(id, viewType), formData)
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

async function preparePatientOralPhotoDirectUpload(
    id: string,
    photo: File,
    viewType: ApiPatientClinicalPhotoViewType
): Promise<ApiDirectUploadTicket> {
    try {
        const { data } = await withCsrfRetry(() =>
            apiClient.post<ApiEnvelope<ApiDirectUploadTicket>>(`${patientOralPhotoEndpoint(id, viewType)}/direct-upload`, {
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

async function finalizePatientOralPhotoDirectUpload(
    id: string,
    uploadId: string,
    viewType: ApiPatientClinicalPhotoViewType
): Promise<ApiPatient> {
    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiPatient>>(`${patientOralPhotoEndpoint(id, viewType)}/direct-upload/${uploadId}/complete`)
    );

    return data.data;
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

/**
 * Fetches server-aggregated patient balances for the payments page.
 */
export async function listPaymentLedgerPatients(
    options?: QueryOptions
): Promise<ApiCollectionEnvelope<ApiPaymentPatientLedgerRow>> {
    const { data } = await apiClient.get<ApiCollectionEnvelope<ApiPaymentPatientLedgerRow>>(
        '/payments/ledger/patients',
        {
            params: buildQueryParams(options),
        }
    );

    return data;
}

/**
 * Fetches paginated treatment-ledger rows for the payments history tab.
 */
export async function listPaymentLedgerHistory(
    options?: QueryOptions
): Promise<ApiCollectionEnvelope<ApiPaymentHistoryLedgerRow>> {
    const { data } = await apiClient.get<ApiCollectionEnvelope<ApiPaymentHistoryLedgerRow>>(
        '/payments/ledger/history',
        {
            params: buildQueryParams(options),
        }
    );

    return data;
}

/**
 * Fetches practice expenses for the payments Expenses tab.
 */
export async function listPaymentExpenses(
    options?: QueryOptions
): Promise<ApiCollectionEnvelope<ApiPaymentExpense>> {
    const { data } = await apiClient.get<ApiCollectionEnvelope<ApiPaymentExpense>>(
        '/payments/expenses',
        {
            params: buildQueryParams(options),
        }
    );

    return data;
}

/**
 * Fetches server-aggregated clinic analytics. The payload replaces the old
 * browser-side "load all treatments/appointments/patients then aggregate"
 * flow, keeping the analytics page bounded as the clinic grows.
 */
export async function getAnalyticsSummary(params: AnalyticsSummaryParams): Promise<ApiAnalyticsSummary> {
    const { data } = await apiClient.get<ApiEnvelope<ApiAnalyticsSummary>>('/analytics/summary', {
        params,
    });

    return data.data;
}

/**
 * Creates a practice expense in the payments Expenses tab.
 */
export async function createPaymentExpense(payload: {
    title: string;
    amount: number;
    quantity?: number;
    currency?: ApiPaymentExpense['currency'];
    expense_date: string;
}): Promise<ApiPaymentExpense> {
    // Keep one key across the CSRF retry so a successful first request whose
    // response was lost cannot create the same expense twice.
    const idempotencyKey =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? `expense-${crypto.randomUUID()}`
            : `expense-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiPaymentExpense>>(
            '/payments/expenses',
            payload,
            {
                headers: {
                    'Idempotency-Key': idempotencyKey,
                },
            }
        )
    );

    return data.data;
}

/**
 * Updates a practice expense in the payments Expenses tab.
 */
export async function updatePaymentExpense(
    expenseId: string,
    payload: {
        title: string;
        amount: number;
        quantity?: number;
        currency?: ApiPaymentExpense['currency'];
        expense_date: string;
    }
): Promise<ApiPaymentExpense> {
    const { data } = await withCsrfRetry(() =>
        apiClient.put<ApiEnvelope<ApiPaymentExpense>>(
            `/payments/expenses/${expenseId}`,
            payload
        )
    );

    return data.data;
}

/**
 * Deletes a practice expense from the payments Expenses tab.
 */
export async function deletePaymentExpense(expenseId: string): Promise<void> {
    await withCsrfRetry(() => apiClient.delete(`/payments/expenses/${expenseId}`));
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
        currency?: ApiMoneyCurrency;
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
        currency?: ApiMoneyCurrency;
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

export async function uploadPatientTreatmentImages(
    patientId: string,
    treatmentId: string,
    images: File[]
): Promise<number> {
    if (images.length === 0) {
        return 0;
    }

    const directUpload = await preparePatientTreatmentImageBatchDirectUpload(patientId, treatmentId, images);
    if (directUpload.supported && directUpload.uploads?.length === images.length) {
        const filesByClientId = new Map(
            images.map((image, index) => [buildTreatmentImageClientId(index), image])
        );
        const fallbackFiles: File[] = [];
        const queuedFallbackFiles = new Set<File>();
        const queueFallbackFile = (image: File | undefined) => {
            if (!image || queuedFallbackFiles.has(image)) {
                return;
            }

            queuedFallbackFiles.add(image);
            fallbackFiles.push(image);
        };
        const uploadResults = await mapSettledWithConcurrency(
            directUpload.uploads,
            MAX_TREATMENT_IMAGE_UPLOAD_CONCURRENCY,
            (upload) => {
                const image = filesByClientId.get(upload.client_id);
                if (!image) {
                    throw new Error('Missing file for direct upload ticket');
                }

                return performDirectSignedUpload(image, upload);
            }
        );
        const completedUploads = directUpload.uploads
            .filter((_, index) => uploadResults[index]?.status === 'fulfilled');
        const completedUploadIds = completedUploads.map((upload) => upload.upload_id);

        directUpload.uploads.forEach((upload, index) => {
            if (uploadResults[index]?.status === 'rejected') {
                queueFallbackFile(filesByClientId.get(upload.client_id));
            }
        });

        if (completedUploadIds.length > 0) {
            try {
                const completion = await finalizePatientTreatmentImageBatchDirectUpload(
                    patientId,
                    treatmentId,
                    completedUploadIds
                );
                const failedUploadIds = new Set(completion.failed.map((failed) => failed.upload_id));
                directUpload.uploads.forEach((upload) => {
                    if (failedUploadIds.has(upload.upload_id)) {
                        queueFallbackFile(filesByClientId.get(upload.client_id));
                    }
                });
            } catch {
                completedUploads.forEach((upload) => {
                    queueFallbackFile(filesByClientId.get(upload.client_id));
                });
            }
        }

        if (fallbackFiles.length === 0) {
            return 0;
        }

        return uploadPatientTreatmentImagesViaApi(patientId, treatmentId, fallbackFiles);
    }

    return uploadPatientTreatmentImagesViaApi(patientId, treatmentId, images);
}

async function uploadPatientTreatmentImagesViaApi(
    patientId: string,
    treatmentId: string,
    images: File[]
): Promise<number> {
    const fallbackResults = await mapSettledWithConcurrency(
        images,
        MAX_TREATMENT_IMAGE_UPLOAD_CONCURRENCY,
        (image) => uploadPatientTreatmentImageViaApi(patientId, treatmentId, image)
    );

    return fallbackResults.filter((result) => result.status === 'rejected').length;
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
            formData
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

async function preparePatientTreatmentImageBatchDirectUpload(
    patientId: string,
    treatmentId: string,
    images: File[]
): Promise<ApiDirectUploadBatchTicket> {
    try {
        const { data } = await withCsrfRetry(() =>
            apiClient.post<ApiEnvelope<ApiDirectUploadBatchTicket>>(
                `/patients/${patientId}/treatments/${treatmentId}/images/direct-upload-batch`,
                {
                    files: images.map((image, index) => ({
                        client_id: buildTreatmentImageClientId(index),
                        filename: image.name,
                        content_type: resolveDirectUploadContentType(image),
                        file_size: image.size,
                    })),
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

async function finalizePatientTreatmentImageBatchDirectUpload(
    patientId: string,
    treatmentId: string,
    uploadIds: string[]
): Promise<ApiDirectUploadBatchCompletion> {
    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiDirectUploadBatchCompletion>>(
            `/patients/${patientId}/treatments/${treatmentId}/images/direct-upload-batch/complete`,
            {
                upload_ids: uploadIds,
            }
        )
    );

    return data.data;
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

function buildTreatmentImageClientId(index: number): string {
    return `image-${index}`;
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

export async function replacePatientTreatmentImage(
    patientId: string,
    treatmentId: string,
    imageId: string,
    image: File
): Promise<ApiTreatment> {
    const formData = new FormData();
    formData.append('image', image);

    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiTreatment>>(
            `/patients/${patientId}/treatments/${treatmentId}/images/${imageId}/replace`,
            formData
        )
    );

    return data.data;
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
    patient_id?: string | null;
    guest_name?: string;
    guest_phone?: string;
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
        patient_id?: string | null;
        guest_name?: string;
        guest_phone?: string;
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
    show_record_authors?: boolean;
}): Promise<ApiProfile> {
    // Wrap with withCsrfRetry so a stale XSRF-TOKEN cookie (e.g. after the
    // backend recycled it because of a server restart) doesn't surface as a
    // 419 to the user. Every other admin / settings mutation in this file
    // uses the same pattern; updateProfile was the lone outlier.
    const { data } = await withCsrfRetry(() =>
        apiClient.put<ApiEnvelope<ApiProfile>>('/settings/profile', payload)
    );

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

export async function getAdminDentist(id: string): Promise<ApiAdminDentist> {
    const { data } = await apiClient.get<ApiEnvelope<ApiAdminDentist>>(`/admin/dentists/${id}`);

    return data.data;
}

export async function getAdminDentistBilling(id: string): Promise<ApiAdminDentistBilling> {
    const { data } = await apiClient.get<ApiEnvelope<ApiAdminDentistBilling>>(`/admin/dentists/${id}/billing`);

    return data.data;
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
    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiAdminDentist>>('/admin/dentists', payload)
    );

    return data.data;
}

export async function updateAdminDentistStatus(
    id: string,
    status: 'active' | 'blocked'
): Promise<ApiAdminDentist> {
    const { data } = await withCsrfRetry(() =>
        apiClient.patch<ApiEnvelope<ApiAdminDentist>>(
            `/admin/dentists/${id}/status`,
            { status }
        )
    );

    return data.data;
}

export async function resetAdminDentistPassword(
    id: string,
    payload: { new_password: string; new_password_confirmation: string }
): Promise<ApiAdminPasswordResetPayload> {
    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiAdminPasswordResetPayload>>(
            `/admin/dentists/${id}/reset-password`,
            payload
        )
    );

    return data.data;
}

export async function verifyAdminDentistEmail(id: string): Promise<ApiAdminDentist> {
    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiAdminDentist>>(
            `/admin/dentists/${id}/verify-email`
        )
    );

    return data.data;
}

export async function restoreAdminDentist(id: string): Promise<ApiAdminDentist> {
    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiAdminDentist>>(
            `/admin/dentists/${id}/restore`
        )
    );

    return data.data;
}

export async function listAdminPayments(
    options?: QueryOptions
): Promise<ApiAdminPaymentsEnvelope> {
    const { data } = await apiClient.get<ApiAdminPaymentsEnvelope>('/admin/payments', {
        params: buildQueryParams(options),
    });

    return data;
}

export async function refundAdminPayment(id: string): Promise<ApiAdminPayment> {
    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiAdminPayment>>(
            `/admin/payments/${id}/refund`
        )
    );

    return data.data;
}

export async function deleteAdminDentist(id: string): Promise<void> {
    await withCsrfRetry(() => apiClient.delete(`/admin/dentists/${id}`));
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
    const { data } = await withCsrfRetry(() =>
        apiClient.post<ApiEnvelope<ApiAdminDentist>>(
            `/admin/dentists/${id}/subscription`,
            payload
        )
    );

    return data.data;
}

export async function listAdminDentistStaff(id: string): Promise<ApiCollectionEnvelope<ApiAssistantAccount>> {
    const { data } = await apiClient.get<ApiCollectionEnvelope<ApiAssistantAccount>>(
        `/admin/dentists/${id}/staff`
    );

    return data;
}

export async function listAdminPlans(): Promise<ApiPlan[]> {
    const { data } = await apiClient.get<ApiCollectionEnvelope<ApiPlan>>('/admin/plans');

    return data.data;
}

/**
 * Fetches pre-aggregated SaaS/admin analytics without transferring the whole
 * dentist roster to the browser.
 */
export async function getAdminAnalyticsSummary(
    params: AnalyticsSummaryParams
): Promise<ApiAdminAnalyticsSummary> {
    const { data } = await apiClient.get<ApiEnvelope<ApiAdminAnalyticsSummary>>(
        '/admin/analytics/summary',
        {
            params,
        }
    );

    return data.data;
}

export async function updateAdminPlan(
    code: ApiPlan['code'],
    payload: UpdatePlanPayload,
): Promise<ApiPlan> {
    const { data } = await withCsrfRetry(() =>
        apiClient.put<ApiEnvelope<ApiPlan>>(`/admin/plans/${code}`, payload)
    );

    return data.data;
}

export interface DashboardRevenuePoint {
    month: string;
    revenue: number;
    debt: number;
}

export interface DashboardPatientGrowthPoint {
    month: string;
    total: number;
    new: number;
}

export interface DashboardAppointmentStatusPoint {
    status: ApiAppointment['status'];
    count: number;
}
