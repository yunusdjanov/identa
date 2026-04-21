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
    plan: 'trial' | 'monthly' | 'yearly' | null;
    status: 'none' | 'trialing' | 'active' | 'grace' | 'read_only';
    access_mode: 'full' | 'read_only';
    starts_at: string | null;
    ends_at: string | null;
    trial_ends_at: string | null;
    grace_ends_at: string | null;
    cancel_at_period_end: boolean;
    cancelled_at: string | null;
    days_remaining: number | null;
    staff_limit: number | null;
    active_staff_count: number;
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
    account_status: 'active' | 'blocked' | 'deleted';
    dentist_owner_id?: string | null;
    assistant_permissions?: string[];
    must_change_password?: boolean;
    subscription?: ApiSubscriptionSummary | null;
}

export interface ApiPatientCategory {
    id: string;
    name: string;
    color: string;
    sort_order: number;
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
    created_at?: string | null;
    last_visit_at?: string | null;
    is_archived?: boolean;
    archived_at?: string | null;
    categories?: ApiPatientCategory[];
}

export interface ApiAppointment {
    id: string;
    patient_id: string;
    patient_name?: string | null;
    appointment_date: string;
    start_time: string;
    end_time: string;
    status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
    notes: string | null;
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
}

export interface ApiTreatmentImage {
    id: string;
    mime_type: string;
    file_size: number;
    created_at: string | null;
    url: string;
    thumbnail_url?: string | null;
    preview_url?: string | null;
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
}

export interface ApiAdminDentist {
    id: string;
    name: string;
    email: string;
    practice_name: string | null;
    registration_date: string;
    status: 'active' | 'blocked' | 'deleted';
    last_login: string | null;
    patient_count: number;
    appointment_count: number;
    subscription: ApiSubscriptionSummary;
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

export interface ApiLandingSettings {
    trial_price_amount: number;
    monthly_price_amount: number;
    yearly_price_amount: number;
    currency: string;
    telegram_contact_url: string | null;
}

export interface ApiLeadRequest {
    id: string;
    name: string;
    phone: string;
    clinic_name: string;
    city: string;
    note: string | null;
    status: 'new' | 'contacted' | 'closed';
    handled_at: string | null;
    created_at: string | null;
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
