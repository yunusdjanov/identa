export const CATEGORIES = [
    { id: 'cat-1', name: 'VIP', color: '#8B5CF6', sort_order: 1 },
    { id: 'cat-2', name: 'Doimiy', color: '#14B8A6', sort_order: 2 },
    { id: 'cat-3', name: 'Yangi', color: '#F59E0B', sort_order: 3 },
];

export const PATIENTS = [
    // photo_* fields mirror the backend PatientResource shape — mock used
    // to omit them, which hid degraded photo UI in dev. pat-2 carries a
    // populated photo (approved state) so the dev preview matches what
    // production would return for a patient with an uploaded portrait.
    { id: 'pat-1', patient_id: 'P-001', full_name: 'Alisher Karimov', phone: '+998901001001', gender: 'male', date_of_birth: '1985-03-15', created_at: '2025-01-10T08:00:00Z', last_visit_at: '2026-05-23T10:00:00Z', is_archived: false, archived_at: null, categories: [CATEGORIES[1]], photo_url: null, photo_thumbnail_url: null, photo_preview_url: null, photo_thumbnail_ready: false, photo_preview_ready: false, photo_scan_status: null },
    { id: 'pat-2', patient_id: 'P-002', full_name: 'Malika Yusupova', phone: '+998901002002', secondary_phone: '+998909002002', gender: 'female', date_of_birth: '1992-07-22', address: "Yunusobod t., 12-mavze, 5-uy", allergies: "Penitsillinga allergiya (og'ir shakl)", current_medications: "Vitamin D3 1000 IU, Omega-3 kapsulalar", medical_history: "2019 — gipotireoz (qalqonsimon bez), Levotiroxin qabul qiladi", created_at: '2025-02-15T09:00:00Z', last_visit_at: '2026-05-23T11:30:00Z', is_archived: false, archived_at: null, categories: [CATEGORIES[0]], photo_url: 'https://i.pravatar.cc/200?u=pat-2', photo_thumbnail_url: 'https://i.pravatar.cc/96?u=pat-2', photo_preview_url: 'https://i.pravatar.cc/400?u=pat-2', photo_thumbnail_ready: true, photo_preview_ready: true, photo_scan_status: 'approved' },
    { id: 'pat-3', patient_id: 'P-003', full_name: 'Bobur Rahimov', phone: '+998901003003', gender: 'male', date_of_birth: '1978-11-05', created_at: '2025-03-01T10:00:00Z', last_visit_at: '2026-05-23T14:00:00Z', is_archived: false, archived_at: null, categories: [CATEGORIES[1]], photo_url: null, photo_thumbnail_url: null, photo_preview_url: null, photo_thumbnail_ready: false, photo_preview_ready: false, photo_scan_status: null },
    { id: 'pat-4', patient_id: 'P-004', full_name: 'Nilufar Hasanova', phone: '+998901004004', gender: 'female', date_of_birth: '1995-05-30', created_at: '2025-04-20T11:00:00Z', last_visit_at: '2026-05-22T15:00:00Z', is_archived: false, archived_at: null, categories: [CATEGORIES[0], CATEGORIES[1]], photo_url: null, photo_thumbnail_url: null, photo_preview_url: null, photo_thumbnail_ready: false, photo_preview_ready: false, photo_scan_status: null },
    { id: 'pat-5', patient_id: 'P-005', full_name: 'Jasur Toshmatov', phone: '+998901005005', gender: 'male', date_of_birth: '1988-09-12', created_at: '2025-06-01T08:00:00Z', last_visit_at: '2026-05-22T09:00:00Z', is_archived: false, archived_at: null, categories: [CATEGORIES[2]], photo_url: null, photo_thumbnail_url: null, photo_preview_url: null, photo_thumbnail_ready: false, photo_preview_ready: false, photo_scan_status: null },
    { id: 'pat-6', patient_id: 'P-006', full_name: 'Dilnoza Ergasheva', phone: '+998901006006', gender: 'female', date_of_birth: '2000-04-18', created_at: '2026-01-15T10:00:00Z', last_visit_at: '2026-05-20T10:00:00Z', is_archived: false, archived_at: null, categories: [CATEGORIES[2]], photo_url: null, photo_thumbnail_url: null, photo_preview_url: null, photo_thumbnail_ready: false, photo_preview_ready: false, photo_scan_status: null },
];

export const RECENT_PATIENT_IDS: string[] = [];

export const APPOINTMENTS = [
    { id: 'apt-1', patient_id: 'pat-1', patient_name: 'Alisher Karimov', appointment_date: '2026-05-23', start_time: '10:00', end_time: '10:45', status: 'scheduled', notes: "Tish tekshiruvi" },
    { id: 'apt-2', patient_id: 'pat-2', patient_name: 'Malika Yusupova', appointment_date: '2026-05-23', start_time: '11:30', end_time: '12:30', status: 'completed', notes: 'Tish tozalash' },
    { id: 'apt-3', patient_id: 'pat-3', patient_name: 'Bobur Rahimov', appointment_date: '2026-05-23', start_time: '14:00', end_time: '14:30', status: 'scheduled', notes: "Ko'rik" },
    { id: 'apt-4', patient_id: 'pat-4', patient_name: 'Nilufar Hasanova', appointment_date: '2026-05-22', start_time: '09:00', end_time: '10:30', status: 'completed', notes: 'Implant maslahat' },
    { id: 'apt-5', patient_id: 'pat-5', patient_name: 'Jasur Toshmatov', appointment_date: '2026-05-22', start_time: '15:00', end_time: '15:30', status: 'completed', notes: "Ko'rik" },
    { id: 'apt-6', patient_id: 'pat-6', patient_name: 'Dilnoza Ergasheva', appointment_date: '2026-05-20', start_time: '10:00', end_time: '11:00', status: 'completed', notes: 'Oqartirish' },
    { id: 'apt-7', patient_id: 'pat-1', patient_name: 'Alisher Karimov', appointment_date: '2026-05-19', start_time: '09:30', end_time: '10:00', status: 'completed', notes: 'X-ray' },
    { id: 'apt-8', patient_id: 'pat-2', patient_name: 'Malika Yusupova', appointment_date: '2026-05-27', start_time: '11:00', end_time: '12:00', status: 'scheduled', notes: 'Oqartirish kursi' },
    { id: 'apt-9', patient_id: 'pat-3', patient_name: 'Bobur Rahimov', appointment_date: '2026-05-28', start_time: '14:30', end_time: '15:30', status: 'scheduled', notes: 'Protez maslahat' },
    { id: 'apt-10', patient_id: 'pat-4', patient_name: 'Nilufar Hasanova', appointment_date: '2026-06-02', start_time: '10:00', end_time: '11:30', status: 'scheduled', notes: 'Implant 1-bosqich' },
    // 22.05 (Friday) — to'liq ish kuni
    { id: 'apt-11', patient_id: 'pat-1', patient_name: 'Alisher Karimov', appointment_date: '2026-05-22', start_time: '10:45', end_time: '11:30', status: 'completed', notes: "Plomba qo'yish" },
    { id: 'apt-12', patient_id: 'pat-2', patient_name: 'Malika Yusupova', appointment_date: '2026-05-22', start_time: '11:45', end_time: '12:30', status: 'completed', notes: 'Konsultatsiya' },
    { id: 'apt-13', patient_id: 'pat-3', patient_name: 'Bobur Rahimov', appointment_date: '2026-05-22', start_time: '13:00', end_time: '13:45', status: 'completed', notes: "X-ray va ko'rik" },
    { id: 'apt-14', patient_id: 'pat-6', patient_name: 'Dilnoza Ergasheva', appointment_date: '2026-05-22', start_time: '14:00', end_time: '14:45', status: 'completed', notes: 'Tish tozalash' },
    { id: 'apt-15', patient_id: 'pat-1', patient_name: 'Alisher Karimov', appointment_date: '2026-05-22', start_time: '16:00', end_time: '16:45', status: 'completed', notes: 'Nazorat ko\'rigi' },
    { id: 'apt-16', patient_id: 'pat-4', patient_name: 'Nilufar Hasanova', appointment_date: '2026-05-22', start_time: '17:00', end_time: '17:45', status: 'scheduled', notes: 'Qo\'shimcha maslahat' },
];

export const TREATMENTS = [
    { id: 'trt-1', patient_id: 'pat-1', patient_name: 'Alisher Karimov', patient_phone: '+998901001001', patient_secondary_phone: null, patient_code: 'P-001', tooth_number: 21, teeth: [21], treatment_type: "Dolg to'ldirish", description: "Kompozit material", comment: null, treatment_date: '2026-05-19', cost: 350000, debt_amount: 350000, paid_amount: 200000, balance: 150000, notes: null, primary_image: { url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><rect width='400' height='300' fill='%23ef4444'/></svg>", thumbnail_url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><rect width='400' height='300' fill='%23ef4444'/></svg>" }, image_count: 3, images: [
        { id: 'img-trt1-1', mime_type: 'image/svg+xml', file_size: 320, created_at: '2026-05-19T09:31:00Z', url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><rect width='400' height='300' fill='%23ef4444'/></svg>", thumbnail_url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><rect width='400' height='300' fill='%23ef4444'/></svg>", preview_url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><rect width='400' height='300' fill='%23ef4444'/></svg>", thumbnail_ready: true, preview_ready: true, scan_status: 'approved' },
        { id: 'img-trt1-2', mime_type: 'image/svg+xml', file_size: 320, created_at: '2026-05-19T09:32:00Z', url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><rect width='400' height='300' fill='%2322c55e'/></svg>", thumbnail_url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><rect width='400' height='300' fill='%2322c55e'/></svg>", preview_url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><rect width='400' height='300' fill='%2322c55e'/></svg>", thumbnail_ready: true, preview_ready: true, scan_status: 'approved' },
        { id: 'img-trt1-3', mime_type: 'image/svg+xml', file_size: 320, created_at: '2026-05-19T09:33:00Z', url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><rect width='400' height='300' fill='%23eab308'/></svg>", thumbnail_url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><rect width='400' height='300' fill='%23eab308'/></svg>", preview_url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><rect width='400' height='300' fill='%23eab308'/></svg>", thumbnail_ready: true, preview_ready: true, scan_status: 'approved' },
    ], created_at: '2026-05-19T09:30:00Z', updated_at: '2026-05-19T10:00:00Z' },
    { id: 'trt-2', patient_id: 'pat-2', patient_name: 'Malika Yusupova', patient_phone: '+998901002002', patient_secondary_phone: '+998909002002', patient_code: 'P-002', tooth_number: null, teeth: [], treatment_type: 'Tish tozalash (ultratovush)', description: null, comment: null, treatment_date: '2026-05-23', cost: 150000, debt_amount: 150000, paid_amount: 150000, balance: 0, notes: null, primary_image: null, image_count: 0, images: [], created_at: '2026-05-23T11:30:00Z', updated_at: '2026-05-23T12:30:00Z' },
    { id: 'trt-3', patient_id: 'pat-3', patient_name: 'Bobur Rahimov', patient_phone: '+998901003003', patient_secondary_phone: null, patient_code: 'P-003', tooth_number: 46, teeth: [46], treatment_type: "Tish olib tashlash", description: null, comment: null, treatment_date: '2026-04-15', cost: 200000, debt_amount: 200000, paid_amount: 200000, balance: 0, notes: null, primary_image: null, image_count: 0, images: [], created_at: '2026-04-15T10:00:00Z', updated_at: '2026-04-15T10:30:00Z' },
    { id: 'trt-4', patient_id: 'pat-4', patient_name: 'Nilufar Hasanova', patient_phone: '+998901004004', patient_secondary_phone: null, patient_code: 'P-004', tooth_number: 16, teeth: [16], treatment_type: 'Metall-keramik toj', description: null, comment: null, treatment_date: '2026-05-22', cost: 1500000, debt_amount: 1500000, paid_amount: 0, balance: 1500000, notes: 'Ikkinchi bosqich', primary_image: null, image_count: 0, images: [], created_at: '2026-05-22T09:00:00Z', updated_at: '2026-05-22T10:30:00Z' },
    { id: 'trt-5', patient_id: 'pat-5', patient_name: 'Jasur Toshmatov', patient_phone: '+998901005005', patient_secondary_phone: null, patient_code: 'P-005', tooth_number: 36, teeth: [36], treatment_type: 'Implant (Nobel Biocare)', description: null, comment: null, treatment_date: '2026-04-01', cost: 4500000, debt_amount: 4500000, paid_amount: 2000000, balance: 2500000, notes: 'Jarayon davom etmoqda', primary_image: null, image_count: 0, images: [], created_at: '2026-04-01T09:00:00Z', updated_at: '2026-05-01T10:00:00Z' },
    { id: 'trt-6', patient_id: 'pat-6', patient_name: 'Dilnoza Ergasheva', patient_phone: '+998901006006', patient_secondary_phone: null, patient_code: 'P-006', tooth_number: null, teeth: [], treatment_type: 'Tishlarni oqartirish (Zoom)', description: null, comment: null, treatment_date: '2026-05-20', cost: 850000, debt_amount: 850000, paid_amount: 850000, balance: 0, notes: null, primary_image: null, image_count: 0, images: [], created_at: '2026-05-20T10:00:00Z', updated_at: '2026-05-20T11:00:00Z' },
];

export const PAYMENT_EXPENSES = [
    { id: 'exp-1', title: 'Materials', amount: 450000, quantity: 1, currency: 'UZS', expense_date: '2026-05-24', created_at: '2026-05-24T09:00:00Z', updated_at: '2026-05-24T09:00:00Z' },
    { id: 'exp-2', title: 'Rent', amount: 1200000, quantity: 1, currency: 'UZS', expense_date: '2026-05-01', created_at: '2026-05-01T09:00:00Z', updated_at: '2026-05-01T09:00:00Z' },
];

export const PROFILE = {
    id: 'dentist-1',
    name: 'Zohid Yunusjonov',
    email: 'yunusdjanov@gmail.com',
    phone: '+998901234567',
    practice_name: 'Identa Dental Clinic',
    license_number: 'DL-2024-001',
    address: 'Toshkent sh., Yunusobod tumani, 7-mavze',
    working_hours: { start: '09:00', end: '18:00' },
    default_appointment_duration: 45,
    show_record_authors: false,
};

export const AUDIT_LOGS = [
    { id: 'log-1', event_type: 'patient.created', entity_type: 'patient', entity_id: 'pat-6', actor_role: 'dentist', actor: { id: 'dentist-1', name: 'Zohid Yunusjonov', email: 'yunusdjanov@gmail.com', role: 'dentist' }, ip_address: '127.0.0.1', user_agent: null, metadata: { patient_name: 'Dilnoza Ergasheva' }, created_at: '2026-01-15T10:00:00Z' },
    { id: 'log-2', event_type: 'appointment.created', entity_type: 'appointment', entity_id: 'apt-8', actor_role: 'assistant', actor: { id: 'ast-1', name: 'Zulfiya Nazarova', email: 'zulfiya@identa.uz', role: 'assistant' }, ip_address: '127.0.0.1', user_agent: null, metadata: { patient_name: 'Malika Yusupova' }, created_at: '2026-05-22T09:00:00Z' },
    { id: 'log-3', event_type: 'patient.treatment.updated', entity_type: 'treatment', entity_id: 'trt-6', actor_role: 'dentist', actor: { id: 'dentist-1', name: 'Zohid Yunusjonov', email: 'yunusdjanov@gmail.com', role: 'dentist' }, ip_address: '127.0.0.1', user_agent: null, metadata: { paid_amount: 850000 }, created_at: '2026-05-20T11:00:00Z' },
    { id: 'log-4', event_type: 'auth.login', entity_type: null, entity_id: null, actor_role: 'dentist', actor: { id: 'dentist-1', name: 'Zohid Yunusjonov', email: 'yunusdjanov@gmail.com', role: 'dentist' }, ip_address: '127.0.0.1', user_agent: null, metadata: null, created_at: '2026-05-23T08:00:00Z' },
    // Admin actions on dentist 1 (Zohid) — sorted recent-first when listed
    { id: 'log-adm-1', event_type: 'admin.dentist.subscription_updated', entity_type: 'user', entity_id: '1', actor_role: 'admin', actor: { id: 'admin-1', name: 'Admin', email: 'admin@identa.uz', role: 'admin' }, ip_address: '127.0.0.1', user_agent: null, metadata: { action: 'mark_active', note: 'Aktivatsiya qildim' }, created_at: '2026-05-15T14:00:00Z' },
    { id: 'log-adm-2', event_type: 'admin.dentist.subscription_updated', entity_type: 'user', entity_id: '1', actor_role: 'admin', actor: { id: 'admin-1', name: 'Admin', email: 'admin@identa.uz', role: 'admin' }, ip_address: '127.0.0.1', user_agent: null, metadata: { action: 'set_pro_yearly', amount: 1200000, payment_method: 'p2p' }, created_at: '2025-12-30T11:00:00Z' },
    { id: 'log-adm-3', event_type: 'admin.dentist.email_verified', entity_type: 'user', entity_id: '1', actor_role: 'admin', actor: { id: 'admin-1', name: 'Admin', email: 'admin@identa.uz', role: 'admin' }, ip_address: '127.0.0.1', user_agent: null, metadata: null, created_at: '2025-12-02T11:00:00Z' },
    { id: 'log-adm-4', event_type: 'admin.dentist.created', entity_type: 'user', entity_id: '1', actor_role: 'admin', actor: { id: 'admin-1', name: 'Admin', email: 'admin@identa.uz', role: 'admin' }, ip_address: '127.0.0.1', user_agent: null, metadata: { email: 'yunusdjanov@gmail.com' }, created_at: '2025-12-01T10:00:00Z' },
    // Admin actions on dentist 4 (Nilufar, new)
    { id: 'log-adm-5', event_type: 'admin.dentist.created', entity_type: 'user', entity_id: '4', actor_role: 'admin', actor: { id: 'admin-1', name: 'Admin', email: 'admin@identa.uz', role: 'admin' }, ip_address: '127.0.0.1', user_agent: null, metadata: { email: 'nilufar@oradent.uz' }, created_at: '2026-05-25T09:00:00Z' },
    // Admin actions on dentist 3 (Bekzod, blocked)
    { id: 'log-adm-6', event_type: 'admin.dentist.status_updated', entity_type: 'user', entity_id: '3', actor_role: 'admin', actor: { id: 'admin-1', name: 'Admin', email: 'admin@identa.uz', role: 'admin' }, ip_address: '127.0.0.1', user_agent: null, metadata: { old_status: 'active', new_status: 'blocked', reason: 'Long inactivity' }, created_at: '2026-04-10T15:00:00Z' },
];

// Billing plan list is sourced from `lib/mock/admin-store` (single source of truth).
// Use `getAdminStore().plans` directly in any route that needs the canonical list.

export const BILLING_SUBSCRIPTION = {
    is_configured: true,
    plan: 'pro',
    plan_name: 'Pro',
    billing_period: 'monthly',
    status: 'active',
    access_mode: 'full',
    starts_at: '2026-05-01T00:00:00Z',
    ends_at: '2026-06-01T00:00:00Z',
    trial_ends_at: null,
    grace_ends_at: null,
    cancel_at_period_end: false,
    cancelled_at: null,
    days_remaining: 9,
    staff_limit: 5,
    active_staff_count: 2,
    entry_image_limit: 10,
    upload_max_mb: 8,
    stored_image_max_mb: 80,
    can_export: true,
    is_read_only: false,
    payment_method: 'p2p',
    payment_amount: 499000,
    note: null,
};

export const BILLING_PAYMENTS = [
    { id: 'bp-1', plan_code: 'pro', plan_name: 'Pro', billing_period: 'monthly', amount: 499000, currency: 'UZS', status: 'paid', provider: 'payx', provider_payment_id: 'px-001', provider_order_id: 'ord-2026-05', paid_at: '2026-05-01T10:00:00Z', created_at: '2026-05-01T09:50:00Z' },
    { id: 'bp-2', plan_code: 'pro', plan_name: 'Pro', billing_period: 'monthly', amount: 499000, currency: 'UZS', status: 'paid', provider: 'payx', provider_payment_id: 'px-002', provider_order_id: 'ord-2026-04', paid_at: '2026-04-01T10:00:00Z', created_at: '2026-04-01T09:50:00Z' },
    { id: 'bp-3', plan_code: 'pro', plan_name: 'Pro', billing_period: 'monthly', amount: 499000, currency: 'UZS', status: 'paid', provider: 'payx', provider_payment_id: 'px-003', provider_order_id: 'ord-2026-03', paid_at: '2026-03-01T10:00:00Z', created_at: '2026-03-01T09:50:00Z' },
];
