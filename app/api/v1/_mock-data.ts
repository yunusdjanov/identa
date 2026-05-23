export const CATEGORIES = [
    { id: 'cat-1', name: 'VIP', color: '#8B5CF6', sort_order: 1 },
    { id: 'cat-2', name: 'Doimiy', color: '#14B8A6', sort_order: 2 },
    { id: 'cat-3', name: 'Yangi', color: '#F59E0B', sort_order: 3 },
];

export const PATIENTS = [
    { id: 'pat-1', patient_id: 'P-001', full_name: 'Alisher Karimov', phone: '+998901001001', gender: 'male', date_of_birth: '1985-03-15', created_at: '2025-01-10T08:00:00Z', last_visit_at: '2026-05-23T10:00:00Z', is_archived: false, categories: [CATEGORIES[1]] },
    { id: 'pat-2', patient_id: 'P-002', full_name: 'Malika Yusupova', phone: '+998901002002', secondary_phone: '+998909002002', gender: 'female', date_of_birth: '1992-07-22', address: "Yunusobod t., 12-mavze, 5-uy", allergies: "Penitsillinga allergiya (og'ir shakl)", current_medications: "Vitamin D3 1000 IU, Omega-3 kapsulalar", medical_history: "2019 — gipotireoz (qalqonsimon bez), Levotiroxin qabul qiladi", created_at: '2025-02-15T09:00:00Z', last_visit_at: '2026-05-23T11:30:00Z', is_archived: false, categories: [CATEGORIES[0]] },
    { id: 'pat-3', patient_id: 'P-003', full_name: 'Bobur Rahimov', phone: '+998901003003', gender: 'male', date_of_birth: '1978-11-05', created_at: '2025-03-01T10:00:00Z', last_visit_at: '2026-05-23T14:00:00Z', is_archived: false, categories: [CATEGORIES[1]] },
    { id: 'pat-4', patient_id: 'P-004', full_name: 'Nilufar Hasanova', phone: '+998901004004', gender: 'female', date_of_birth: '1995-05-30', created_at: '2025-04-20T11:00:00Z', last_visit_at: '2026-05-22T15:00:00Z', is_archived: false, categories: [CATEGORIES[0], CATEGORIES[1]] },
    { id: 'pat-5', patient_id: 'P-005', full_name: 'Jasur Toshmatov', phone: '+998901005005', gender: 'male', date_of_birth: '1988-09-12', created_at: '2025-06-01T08:00:00Z', last_visit_at: '2026-05-22T09:00:00Z', is_archived: false, categories: [CATEGORIES[2]] },
    { id: 'pat-6', patient_id: 'P-006', full_name: 'Dilnoza Ergasheva', phone: '+998901006006', gender: 'female', date_of_birth: '2000-04-18', created_at: '2026-01-15T10:00:00Z', last_visit_at: '2026-05-20T10:00:00Z', is_archived: false, categories: [CATEGORIES[2]] },
];

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
];

export const TREATMENTS = [
    { id: 'trt-1', patient_id: 'pat-1', patient_name: 'Alisher Karimov', patient_phone: '+998901001001', patient_code: 'P-001', tooth_number: 21, teeth: [21], treatment_type: "Dolg to'ldirish", description: "Kompozit material", comment: null, treatment_date: '2026-05-19', cost: 350000, debt_amount: 150000, paid_amount: 200000, balance: -150000, notes: null, image_count: 0, images: [], created_at: '2026-05-19T09:30:00Z', updated_at: '2026-05-19T10:00:00Z' },
    { id: 'trt-2', patient_id: 'pat-2', patient_name: 'Malika Yusupova', patient_phone: '+998901002002', patient_code: 'P-002', tooth_number: null, teeth: [], treatment_type: 'Tish tozalash (ultratovush)', description: null, comment: null, treatment_date: '2026-05-23', cost: 150000, debt_amount: 0, paid_amount: 150000, balance: 0, notes: null, image_count: 0, images: [], created_at: '2026-05-23T11:30:00Z', updated_at: '2026-05-23T12:30:00Z' },
    { id: 'trt-3', patient_id: 'pat-3', patient_name: 'Bobur Rahimov', patient_phone: '+998901003003', patient_code: 'P-003', tooth_number: 46, teeth: [46], treatment_type: "Tish olib tashlash", description: null, comment: null, treatment_date: '2026-04-15', cost: 200000, debt_amount: 0, paid_amount: 200000, balance: 0, notes: null, image_count: 0, images: [], created_at: '2026-04-15T10:00:00Z', updated_at: '2026-04-15T10:30:00Z' },
    { id: 'trt-4', patient_id: 'pat-4', patient_name: 'Nilufar Hasanova', patient_phone: '+998901004004', patient_code: 'P-004', tooth_number: 16, teeth: [16], treatment_type: 'Metall-keramik toj', description: null, comment: null, treatment_date: '2026-05-22', cost: 1500000, debt_amount: 1500000, paid_amount: 0, balance: -1500000, notes: 'Ikkinchi bosqich', image_count: 0, images: [], created_at: '2026-05-22T09:00:00Z', updated_at: '2026-05-22T10:30:00Z' },
    { id: 'trt-5', patient_id: 'pat-5', patient_name: 'Jasur Toshmatov', patient_phone: '+998901005005', patient_code: 'P-005', tooth_number: 36, teeth: [36], treatment_type: 'Implant (Nobel Biocare)', description: null, comment: null, treatment_date: '2026-04-01', cost: 4500000, debt_amount: 2500000, paid_amount: 2000000, balance: -2500000, notes: 'Jarayon davom etmoqda', image_count: 0, images: [], created_at: '2026-04-01T09:00:00Z', updated_at: '2026-05-01T10:00:00Z' },
    { id: 'trt-6', patient_id: 'pat-6', patient_name: 'Dilnoza Ergasheva', patient_phone: '+998901006006', patient_code: 'P-006', tooth_number: null, teeth: [], treatment_type: 'Tishlarni oqartirish (Zoom)', description: null, comment: null, treatment_date: '2026-05-20', cost: 850000, debt_amount: 0, paid_amount: 850000, balance: 0, notes: null, image_count: 0, images: [], created_at: '2026-05-20T10:00:00Z', updated_at: '2026-05-20T11:00:00Z' },
];

export const INVOICES = [
    { id: 'inv-1', patient_id: 'pat-1', patient_name: 'Alisher Karimov', patient_phone: '+998901001001', invoice_number: 'INV-2026-001', invoice_date: '2026-05-19', due_date: '2026-06-19', total_amount: 350000, paid_amount: 200000, balance: 150000, status: 'partially_paid', notes: null },
    { id: 'inv-2', patient_id: 'pat-2', patient_name: 'Malika Yusupova', patient_phone: '+998901002002', invoice_number: 'INV-2026-002', invoice_date: '2026-05-23', due_date: null, total_amount: 150000, paid_amount: 150000, balance: 0, status: 'paid', notes: null },
    { id: 'inv-3', patient_id: 'pat-3', patient_name: 'Bobur Rahimov', patient_phone: '+998901003003', invoice_number: 'INV-2026-003', invoice_date: '2026-04-15', due_date: null, total_amount: 200000, paid_amount: 200000, balance: 0, status: 'paid', notes: null },
    { id: 'inv-4', patient_id: 'pat-4', patient_name: 'Nilufar Hasanova', patient_phone: '+998901004004', invoice_number: 'INV-2026-004', invoice_date: '2026-05-22', due_date: '2026-06-22', total_amount: 1500000, paid_amount: 0, balance: 1500000, status: 'unpaid', notes: null },
    { id: 'inv-5', patient_id: 'pat-5', patient_name: 'Jasur Toshmatov', patient_phone: '+998901005005', invoice_number: 'INV-2026-005', invoice_date: '2026-04-01', due_date: '2026-06-01', total_amount: 4500000, paid_amount: 2000000, balance: 2500000, status: 'partially_paid', notes: null },
    { id: 'inv-6', patient_id: 'pat-6', patient_name: 'Dilnoza Ergasheva', patient_phone: '+998901006006', invoice_number: 'INV-2026-006', invoice_date: '2026-05-20', due_date: null, total_amount: 850000, paid_amount: 850000, balance: 0, status: 'paid', notes: null },
];

export const PAYMENTS = [
    { id: 'pay-1', invoice_id: 'inv-1', patient_id: 'pat-1', amount: 200000, payment_method: 'cash', payment_date: '2026-05-19', notes: null, created_at: '2026-05-19T10:00:00Z' },
    { id: 'pay-2', invoice_id: 'inv-2', patient_id: 'pat-2', amount: 150000, payment_method: 'card', payment_date: '2026-05-23', notes: null, created_at: '2026-05-23T12:30:00Z' },
    { id: 'pay-3', invoice_id: 'inv-3', patient_id: 'pat-3', amount: 200000, payment_method: 'cash', payment_date: '2026-04-15', notes: null, created_at: '2026-04-15T10:30:00Z' },
    { id: 'pay-4', invoice_id: 'inv-5', patient_id: 'pat-5', amount: 2000000, payment_method: 'card', payment_date: '2026-05-01', notes: 'Birinchi to\'lov', created_at: '2026-05-01T11:00:00Z' },
    { id: 'pay-5', invoice_id: 'inv-6', patient_id: 'pat-6', amount: 850000, payment_method: 'cash', payment_date: '2026-05-20', notes: null, created_at: '2026-05-20T11:00:00Z' },
];

export const ODONTOGRAM: Record<string, unknown[]> = {
    'pat-1': [
        { id: 'odo-1', patient_id: 'pat-1', tooth_number: 21, condition_type: 'filling', surface: 'mesial', material: 'composite', severity: null, condition_date: '2026-05-19', notes: null, created_at: '2026-05-19T09:30:00Z', images: [] },
        { id: 'odo-2', patient_id: 'pat-1', tooth_number: 16, condition_type: 'cavity', surface: 'occlusal', material: null, severity: 'moderate', condition_date: '2026-05-19', notes: null, created_at: '2026-05-19T09:30:00Z', images: [] },
    ],
    'pat-4': [
        { id: 'odo-3', patient_id: 'pat-4', tooth_number: 16, condition_type: 'crown', surface: null, material: 'metal_ceramic', severity: null, condition_date: '2026-05-22', notes: null, created_at: '2026-05-22T09:00:00Z', images: [] },
    ],
    'pat-5': [
        { id: 'odo-4', patient_id: 'pat-5', tooth_number: 36, condition_type: 'implant', surface: null, material: 'titanium', severity: null, condition_date: '2026-04-01', notes: null, created_at: '2026-04-01T09:00:00Z', images: [] },
        { id: 'odo-5', patient_id: 'pat-5', tooth_number: 46, condition_type: 'extraction', surface: null, material: null, severity: null, condition_date: '2025-10-15', notes: null, created_at: '2025-10-15T10:00:00Z', images: [] },
    ],
};

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
};

export const ASSISTANTS = [
    { id: 'ast-1', name: 'Zulfiya Nazarova', email: 'zulfiya@identa.uz', phone: '+998901111111', account_status: 'active', assistant_permissions: ['patients', 'appointments', 'treatments'], must_change_password: false, last_login_at: '2026-05-22T08:00:00Z', created_at: '2025-09-01T09:00:00Z' },
    { id: 'ast-2', name: 'Murod Xasanov', email: 'murod@identa.uz', phone: '+998902222222', account_status: 'active', assistant_permissions: ['appointments'], must_change_password: false, last_login_at: '2026-05-20T14:00:00Z', created_at: '2026-01-15T10:00:00Z' },
];

export const AUDIT_LOGS = [
    { id: 'log-1', event_type: 'patient.created', entity_type: 'patient', entity_id: 'pat-6', actor_role: 'dentist', actor: { id: 'dentist-1', name: 'Zohid Yunusjonov', email: 'yunusdjanov@gmail.com', role: 'dentist' }, ip_address: '127.0.0.1', user_agent: null, metadata: { patient_name: 'Dilnoza Ergasheva' }, created_at: '2026-01-15T10:00:00Z' },
    { id: 'log-2', event_type: 'appointment.created', entity_type: 'appointment', entity_id: 'apt-8', actor_role: 'assistant', actor: { id: 'ast-1', name: 'Zulfiya Nazarova', email: 'zulfiya@identa.uz', role: 'assistant' }, ip_address: '127.0.0.1', user_agent: null, metadata: { patient_name: 'Malika Yusupova' }, created_at: '2026-05-22T09:00:00Z' },
    { id: 'log-3', event_type: 'payment.created', entity_type: 'payment', entity_id: 'pay-5', actor_role: 'dentist', actor: { id: 'dentist-1', name: 'Zohid Yunusjonov', email: 'yunusdjanov@gmail.com', role: 'dentist' }, ip_address: '127.0.0.1', user_agent: null, metadata: { amount: 850000 }, created_at: '2026-05-20T11:00:00Z' },
    { id: 'log-4', event_type: 'auth.login', entity_type: null, entity_id: null, actor_role: 'dentist', actor: { id: 'dentist-1', name: 'Zohid Yunusjonov', email: 'yunusdjanov@gmail.com', role: 'dentist' }, ip_address: '127.0.0.1', user_agent: null, metadata: null, created_at: '2026-05-23T08:00:00Z' },
];

export const BILLING_PLANS = [
    { id: 'plan-1', code: 'trial', name: 'Trial', description: '14 kunlik bepul sinov', is_trial: true, is_paid: false, trial_days: 14, monthly_price: null, yearly_price: null, currency: 'UZS', staff_limit: 1, entry_image_limit: 5, upload_max_mb: 10, stored_image_max_mb: 50, can_export: false, is_active: true, sort_order: 1 },
    { id: 'plan-2', code: 'basic', name: 'Basic', description: 'Kichik klinikalar uchun', is_trial: false, is_paid: true, trial_days: null, monthly_price: 199000, yearly_price: 1990000, currency: 'UZS', staff_limit: 2, entry_image_limit: 20, upload_max_mb: 25, stored_image_max_mb: 200, can_export: false, is_active: true, sort_order: 2 },
    { id: 'plan-3', code: 'pro', name: 'Pro', description: "O'rta va katta klinikalar uchun", is_trial: false, is_paid: true, trial_days: null, monthly_price: 499000, yearly_price: 4990000, currency: 'UZS', staff_limit: 10, entry_image_limit: 100, upload_max_mb: 50, stored_image_max_mb: 500, can_export: true, is_active: true, sort_order: 3 },
];

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
    staff_limit: 10,
    active_staff_count: 2,
    entry_image_limit: 100,
    upload_max_mb: 50,
    stored_image_max_mb: 500,
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
