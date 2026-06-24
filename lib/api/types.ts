export interface PaginationMeta {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
}

export interface ApiEnvelope<T> {
    data: T;
}

export interface ApiCollectionEnvelope<T> {
    data: T[];
    meta?: {
        pagination?: PaginationMeta;
        summary?: Record<string, number>;
    };
}

export interface ApiSubscriptionSummary {
    is_configured: boolean;
    plan: 'trial' | 'basic' | 'pro' | 'monthly' | 'yearly' | null;
    plan_name?: string | null;
    billing_period?: 'trial' | 'monthly' | 'yearly' | null;
    status: 'none' | 'trialing' | 'active' | 'grace' | 'read_only' | 'canceled';
    access_mode: 'full' | 'read_only';
    starts_at: string | null;
    ends_at: string | null;
    trial_ends_at: string | null;
    grace_ends_at: string | null;
    cancel_at_period_end: boolean;
    cancelled_at: string | null;
    pending_plan_id?: string | null;
    pending_plan_code?: 'trial' | 'basic' | 'pro' | null;
    pending_plan_name?: string | null;
    pending_billing_period?: 'monthly' | 'yearly' | null;
    pending_change_effective_at?: string | null;
    days_remaining: number | null;
    staff_limit: number | null;
    active_staff_count: number;
    entry_image_limit?: number | null;
    upload_max_mb?: number | null;
    stored_image_max_mb?: number | null;
    can_export?: boolean;
    is_read_only: boolean;
    payment_method: 'cash' | 'p2p' | 'bank_transfer' | null;
    payment_amount: number | null;
    note: string | null;
}

export interface ApiUser {
    id: string;
    name: string;
    email: string;
    role: 'admin' | 'dentist' | 'assistant';
    provider?: 'email' | 'google' | string | null;
    avatar_url?: string | null;
    email_verified_at?: string | null;
    email_verified?: boolean;
    has_password?: boolean;
    // Mirrors the backend google_id boolean projection — drives the
    // Settings → Connected Accounts panel without exposing the raw
    // Google subject. Decoupled from `provider` because a user can
    // sign up with one method and later link the other.
    google_linked?: boolean;
    account_status: 'active' | 'blocked' | 'deleted';
    dentist_owner_id?: string | null;
    assistant_permissions?: string[];
    must_change_password?: boolean;
    show_record_authors?: boolean;
    subscription?: ApiSubscriptionSummary | null;
}

export interface ApiRecordActor {
    id: string;
    name: string;
    role: ApiUser['role'];
}

export interface ApiPlan {
    id: string;
    code: 'trial' | 'basic' | 'pro';
    name: string;
    description: string | null;
    is_trial: boolean;
    is_paid: boolean;
    trial_days: number | null;
    monthly_price: number | null;
    yearly_price: number | null;
    currency: string;
    staff_limit: number;
    entry_image_limit: number;
    upload_max_mb: number;
    stored_image_max_mb: number;
    can_export: boolean;
    is_active: boolean;
    sort_order: number;
    updated_at?: string | null;
}

/**
 * Payload contract for `PUT /admin/plans/{code}`. Mirrors the backend
 * `UpdatePlanRequest` rules — keep these in sync. Immutable identity fields
 * (id, code, is_trial, is_paid) are intentionally omitted: code is the URL
 * segment, the others are derived server-side from the plan type.
 */
export interface UpdatePlanPayload {
    name: string;
    description: string | null;
    trial_days: number | null;
    monthly_price: number | null;
    yearly_price: number | null;
    currency: string;
    staff_limit: number;
    entry_image_limit: number;
    upload_max_mb: number;
    stored_image_max_mb: number;
    can_export: boolean;
    is_active: boolean;
    sort_order: number;
}

export interface ApiBillingPayment {
    id: string;
    /**
     * Subscription the payment funded — present on backend rows. Used by the
     * admin refund cascade to distinguish "this funds the current sub"
     * (cascade to read-only) from "this funds a past sub" (no access change).
     */
    subscription_id?: string | null;
    plan_code: 'basic' | 'pro';
    plan_name: string;
    billing_period: 'monthly' | 'yearly';
    amount: number;
    currency: string;
    status: 'pending' | 'paid' | 'failed' | 'canceled' | 'refunded';
    provider: 'payx';
    provider_payment_id: string | null;
    provider_order_id: string;
    paid_at: string | null;
    created_at: string | null;
}

export interface ApiPatientCategory {
    id: string;
    name: string;
    color: string;
    sort_order: number;
}

export type ApiMediaScanStatus = 'pending' | 'approved' | 'rejected';

export type ApiPatientClinicalPhotoViewType = 'smile' | 'top' | 'bottom';

export interface ApiPatientClinicalPhoto {
    id: string;
    view_type: ApiPatientClinicalPhotoViewType | string;
    scan_status?: ApiMediaScanStatus | null;
    url?: string | null;
    thumbnail_url?: string | null;
    preview_url?: string | null;
    thumbnail_ready?: boolean;
    preview_ready?: boolean;
    is_primary?: boolean;
    sort_order?: number;
    created_at?: string | null;
    updated_at?: string | null;
}

export interface ApiPatient {
    id: string;
    patient_id: string;
    full_name: string;
    phone: string;
    secondary_phone?: string | null;
    address?: string | null;
    date_of_birth?: string | null;
    gender?: 'male' | 'female' | null;
    medical_history?: string | null;
    allergies?: string | null;
    current_medications?: string | null;
    photo_url?: string | null;
    photo_thumbnail_url?: string | null;
    photo_preview_url?: string | null;
    photo_thumbnail_ready?: boolean;
    photo_preview_ready?: boolean;
    photo_scan_status?: ApiMediaScanStatus | null;
    oral_photo?: ApiPatientClinicalPhoto | null;
    oral_photos?: Partial<Record<ApiPatientClinicalPhotoViewType, ApiPatientClinicalPhoto | null>>;
    oral_photo_galleries?: Partial<Record<ApiPatientClinicalPhotoViewType, ApiPatientClinicalPhoto[]>>;
    created_at?: string | null;
    updated_at?: string | null;
    created_by?: ApiRecordActor | null;
    updated_by?: ApiRecordActor | null;
    last_visit_at?: string | null;
    is_archived?: boolean;
    archived_at?: string | null;
    categories?: ApiPatientCategory[];
}

export interface ApiPatientLookup {
    id: string;
    patient_id: string;
    full_name: string;
    phone: string;
    secondary_phone?: string | null;
}

/**
 * Compact patient shape used by the profile-scoped recent search menu.
 */
export interface ApiRecentPatient {
    id: string;
    full_name: string;
}

export interface ApiPatientOverview {
    appointment_count: number;
    visit_count?: number;
    upcoming_appointments: ApiAppointment[];
    total_debt: number;
    total_paid: number;
    total_balance: number;
}

export interface ApiAppointment {
    id: string;
    patient_id: string | null;
    patient_name?: string | null;
    guest_name?: string | null;
    guest_phone?: string | null;
    is_guest?: boolean;
    appointment_date: string;
    start_time: string;
    end_time: string;
    status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
    notes: string | null;
    created_by?: ApiRecordActor | null;
    updated_by?: ApiRecordActor | null;
}

export interface ApiAppointmentLookup {
    id: string;
    appointment_date: string;
    start_time: string;
    patient_name?: string | null;
    guest_phone?: string | null;
    is_guest?: boolean;
    status: ApiAppointment['status'];
}

export interface ApiOdontogramEntry {
    id: string;
    patient_id: string;
    tooth_number: number;
    condition_type: 'healthy' | 'cavity' | 'filling' | 'crown' | 'root_canal' | 'extraction' | 'implant';
    surface: string | null;
    material: string | null;
    severity: string | null;
    condition_date: string;
    notes: string | null;
    created_at: string | null;
    images?: ApiOdontogramEntryImage[];
}

export interface ApiOdontogramEntryImage {
    id: string;
    stage: 'before' | 'after';
    mime_type: string;
    file_size: number;
    captured_at: string | null;
    created_at: string | null;
    url?: string | null;
    thumbnail_url?: string | null;
    preview_url?: string | null;
    thumbnail_ready?: boolean;
    preview_ready?: boolean;
    scan_status?: ApiMediaScanStatus | null;
}

export interface ApiOdontogramSummaryEntry {
    tooth_number: number;
    condition_type: ApiOdontogramEntry['condition_type'];
    history_count: number;
    condition_date: string | null;
    created_at: string | null;
}

export interface ApiOdontogramSummary {
    total_entries: number;
    affected_teeth_count: number;
    latest_conditions: ApiOdontogramSummaryEntry[];
}

export interface ApiTreatment {
    id: string;
    patient_id: string;
    patient_name?: string | null;
    patient_phone?: string | null;
    patient_secondary_phone?: string | null;
    patient_code?: string | null;
    tooth_number: number | null;
    teeth: number[];
    treatment_type: string;
    description: string | null;
    comment: string | null;
    treatment_date: string;
    cost: number | null;
    debt_amount: number;
    paid_amount: number;
    balance: number;
    notes: string | null;
    image_count: number;
    primary_image?: ApiTreatmentImage | null;
    images: ApiTreatmentImage[];
    created_at: string | null;
    updated_at: string | null;
    created_by?: ApiRecordActor | null;
    updated_by?: ApiRecordActor | null;
}

export interface ApiPaymentLedgerSummary {
    total_debt: number;
    total_paid: number;
    total_balance: number;
    total_patients?: number;
    total_entries: number;
}

export interface ApiPaymentPatientLedgerRow {
    patient_id: string;
    patient_code?: string | null;
    patient_name: string;
    patient_phone?: string | null;
    patient_secondary_phone?: string | null;
    total_debt: number;
    total_paid: number;
    balance: number;
    entry_count: number;
    last_entry_date: string | null;
}

export interface ApiPaymentHistoryLedgerRow {
    id: string;
    patient_id: string;
    patient_name?: string | null;
    patient_phone?: string | null;
    patient_secondary_phone?: string | null;
    patient_code?: string | null;
    date: string | null;
    teeth: number[];
    work_done: string;
    comment: string | null;
    debt: number;
    paid: number;
    balance_delta: number;
    created_by?: ApiRecordActor | null;
    updated_by?: ApiRecordActor | null;
}

export interface ApiTreatmentImage {
    id: string;
    mime_type: string;
    file_size: number;
    created_at: string | null;
    url?: string | null;
    thumbnail_url?: string | null;
    preview_url?: string | null;
    thumbnail_ready?: boolean;
    preview_ready?: boolean;
    scan_status?: ApiMediaScanStatus | null;
}

export interface ApiInvoiceItem {
    id: string;
    description: string;
    odontogram_entry_id?: string | null;
    quantity: number;
    unit_price: number;
    total_price: number;
}

export interface ApiInvoice {
    id: string;
    patient_id: string;
    patient_name?: string | null;
    patient_phone?: string | null;
    invoice_number: string;
    invoice_date: string;
    due_date: string | null;
    total_amount: number;
    paid_amount: number;
    balance: number;
    status: 'unpaid' | 'partially_paid' | 'paid';
    notes: string | null;
    items?: ApiInvoiceItem[];
}

export interface ApiPayment {
    id: string;
    invoice_id: string;
    patient_id: string;
    amount: number;
    payment_method: 'cash' | 'card' | 'bank_transfer';
    payment_date: string;
    notes: string | null;
    created_at: string | null;
}

export interface ApiProfile {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    practice_name: string | null;
    license_number: string | null;
    address: string | null;
    working_hours: {
        start: string | null;
        end: string | null;
    };
    default_appointment_duration: number;
    show_record_authors: boolean;
}

export interface ApiAdminDentist {
    id: string;
    name: string;
    email: string;
    practice_name: string | null;
    registration_date: string;
    status: 'active' | 'blocked' | 'deleted';
    last_login: string | null;
    email_verified: boolean;
    avatar_url: string | null;
    patient_count: number;
    appointment_count: number;
    active_staff_count?: number;
    total_staff_count?: number;
    subscription: ApiSubscriptionSummary;
}

export interface ApiAdminDentistBilling {
    dentist: ApiAdminDentist;
    subscription: ApiSubscriptionSummary;
    payments: ApiBillingPayment[];
    staff: {
        active: number;
        total: number;
    };
    usage: {
        patients: number;
        appointments: number;
        payments: number;
    };
}

export interface ApiAdminPayment extends ApiBillingPayment {
    dentist: {
        id: string;
        name: string;
        email: string;
        avatar_url: string | null;
    } | null;
}

export interface ApiAdminPaymentsSummary {
    this_month: number;
    this_year: number;
    all_time: number;
    paid_count: number;
    currency: string;
    /**
     * Per-currency revenue breakdown — backend always returns this; the UI
     * may opt to render it when a tenant bills in more than one currency.
     */
    totals_by_currency?: Record<string, number>;
}

export interface ApiAdminPaymentsEnvelope {
    data: ApiAdminPayment[];
    meta: {
        pagination: PaginationMeta;
        summary: ApiAdminPaymentsSummary;
    };
}

export interface ApiAdminPasswordResetPayload {
    dentist_id: string;
    password_reset: boolean;
}

export interface ApiAssistantAccount {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    avatar_url: string | null;
    account_status: 'active' | 'blocked' | 'deleted';
    assistant_permissions: string[];
    must_change_password: boolean;
    last_login_at: string | null;
    created_at: string | null;
}

export interface ApiAssistantPasswordResetPayload {
    assistant_id: string;
    password_reset: boolean;
}

export interface ApiAuditActor {
    id: string;
    name: string;
    email: string;
    role: 'admin' | 'dentist' | 'assistant';
}

export interface ApiAuditLogEntry {
    id: string;
    event_type: string;
    entity_type: string | null;
    entity_id: string | null;
    actor_role: string | null;
    actor: ApiAuditActor | null;
    ip_address: string | null;
    user_agent: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string | null;
}
