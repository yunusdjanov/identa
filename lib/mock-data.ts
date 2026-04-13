import { Patient, Odontogram, Treatment, Appointment, Invoice, Payment, DashboardStats, DentistProfile } from './types';

// Mock Patients
export const mockPatients: Patient[] = [
    {
        id: '1',
        patientId: 'P-001',
        fullName: 'Alisher Karimov',
        phone: '+998901234567',
        address: 'Tashkent, Yunusabad',
        dateOfBirth: '1985-03-15',
        gender: 'male',
        medicalHistory: 'No significant medical history',
        allergies: 'Penicillin',
        currentMedications: 'None',
        lastVisitDate: '2026-02-10',
        createdAt: '2025-06-01',
    },
    {
        id: '2',
        patientId: 'P-002',
        fullName: 'Nodira Alimova',
        phone: '+998907654321',
        address: 'Tashkent, Chilanzar',
        dateOfBirth: '1992-07-22',
        gender: 'female',
        medicalHistory: 'Diabetes Type 2',
        allergies: 'None',
        currentMedications: 'Metformin',
        lastVisitDate: '2026-02-08',
        createdAt: '2025-08-15',
    },
    {
        id: '3',
        patientId: 'P-003',
        fullName: 'Jasur Tursunov',
        phone: '+998909876543',
        address: 'Tashkent, Sergeli',
        dateOfBirth: '1978-11-05',
        gender: 'male',
        lastVisitDate: '2025-07-20',
        createdAt: '2025-05-10',
    },
];

// Mock Odontograms
export const mockOdontograms: Odontogram[] = [
    {
        id: '1',
        patientId: '1',
        toothNumber: 18,
        conditions: [
            { type: 'cavity', date: '2026-02-10', notes: 'Large occlusal cavity' },
        ],
    },
    {
        id: '2',
        patientId: '1',
        toothNumber: 14,
        conditions: [
            { type: 'filling', material: 'composite', date: '2025-12-15', notes: 'Occlusal filling completed' },
        ],
    },
    {
        id: '3',
        patientId: '2',
        toothNumber: 6,
        conditions: [
            { type: 'crown', material: 'porcelain', date: '2026-01-20', notes: 'Crown placed' },
        ],
    },
];

// Mock Treatments
export const mockTreatments: Treatment[] = [
    {
        id: '1',
        patientId: '1',
        toothNumber: 18,
        treatmentType: 'Examination',
        description: 'Initial examination, cavity detected on tooth #18',
        treatmentDate: '2026-02-10',
        cost: 50000,
        createdAt: '2026-02-10',
    },
    {
        id: '2',
        patientId: '1',
        toothNumber: 14,
        treatmentType: 'Filling',
        description: 'Composite filling - occlusal surface',
        treatmentDate: '2025-12-15',
        cost: 150000,
        createdAt: '2025-12-15',
    },
    {
        id: '3',
        patientId: '2',
        toothNumber: 6,
        treatmentType: 'Crown',
        description: 'Porcelain crown placement',
        treatmentDate: '2026-01-20',
        cost: 500000,
        createdAt: '2026-01-20',
    },
];

// Mock Appointments
export const mockAppointments: Appointment[] = [
    {
        id: '1',
        patientId: '1',
        patientName: 'Alisher Karimov',
        appointmentDate: '2026-02-14',
        startTime: '10:00',
        endTime: '10:30',
        durationMinutes: 30,
        status: 'scheduled',
        reason: 'Cavity filling - Tooth #18',
        createdAt: '2026-02-10',
    },
    {
        id: '2',
        patientId: '2',
        patientName: 'Nodira Alimova',
        appointmentDate: '2026-02-14',
        startTime: '14:00',
        endTime: '14:30',
        durationMinutes: 30,
        status: 'scheduled',
        reason: 'Regular checkup',
        createdAt: '2026-02-08',
    },
    {
        id: '3',
        patientId: '1',
        patientName: 'Alisher Karimov',
        appointmentDate: '2026-02-10',
        startTime: '09:00',
        endTime: '09:30',
        durationMinutes: 30,
        status: 'completed',
        reason: 'Initial examination',
        createdAt: '2026-02-08',
    },
];

// Mock Invoices
export const mockInvoices: Invoice[] = [
    {
        id: '1',
        patientId: '1',
        invoiceNumber: 'INV-001',
        totalAmount: 150000,
        paidAmount: 150000,
        balance: 0,
        status: 'paid',
        invoiceDate: '2025-12-15',
        items: [
            {
                id: '1',
                invoiceId: '1',
                treatmentId: '2',
                description: 'Composite filling - Tooth #14',
                quantity: 1,
                unitPrice: 150000,
                totalPrice: 150000,
            },
        ],
    },
    {
        id: '2',
        patientId: '2',
        invoiceNumber: 'INV-002',
        totalAmount: 500000,
        paidAmount: 300000,
        balance: 200000,
        status: 'partially_paid',
        invoiceDate: '2026-01-20',
        items: [
            {
                id: '2',
                invoiceId: '2',
                treatmentId: '3',
                description: 'Porcelain crown - Tooth #6',
                quantity: 1,
                unitPrice: 500000,
                totalPrice: 500000,
            },
        ],
    },
    {
        id: '3',
        patientId: '3',
        invoiceNumber: 'INV-003',
        totalAmount: 180000,
        paidAmount: 0,
        balance: 180000,
        status: 'unpaid',
        invoiceDate: '2025-07-20',
        items: [
            {
                id: '3',
                invoiceId: '3',
                description: 'Dental cleaning',
                quantity: 1,
                unitPrice: 180000,
                totalPrice: 180000,
            },
        ],
    },
];

// Mock Payments
export const mockPayments: Payment[] = [
    {
        id: '1',
        patientId: '1',
        invoiceId: '1',
        amount: 150000,
        paymentMethod: 'cash',
        paymentDate: '2025-12-15',
        createdAt: '2025-12-15',
    },
    {
        id: '2',
        patientId: '2',
        invoiceId: '2',
        amount: 300000,
        paymentMethod: 'bank_transfer',
        paymentDate: '2026-01-20',
        createdAt: '2026-01-20',
    },
];

// Mock Dashboard Stats
export const mockDashboardStats: DashboardStats = {
    revenueThisMonth: 650000,
    outstandingDebtTotal: 380000,
    todayAppointments: mockAppointments.filter(
        (apt) => apt.appointmentDate === '2026-02-14' && apt.status === 'scheduled'
    ),
};

export const mockDentistProfile: DentistProfile = {
    id: 'dentist-1',
    name: 'Aziz Karimov',
    email: 'aziz.karimov@identa.uz',
    phone: '+998 90 123 4567',
    practiceName: 'Karimov Dental Clinic',
    licenseNumber: 'UZ-DENT-2024-1234',
    address: 'Tashkent, Yunusabad District, Amir Temur Street 45',
    workingHours: {
        start: '07:00',
        end: '22:00',
    },
    defaultAppointmentDuration: 30,
};

// Helper functions for mock data
export const getPatientById = (id: string): Patient | undefined => {
    return mockPatients.find((p) => p.id === id);
};

export const getPatientOdontogram = (patientId: string): Odontogram[] => {
    return mockOdontograms.filter((o) => o.patientId === patientId);
};

export const getPatientTreatments = (patientId: string): Treatment[] => {
    return mockTreatments.filter((t) => t.patientId === patientId);
};

export const getPatientAppointments = (patientId: string): Appointment[] => {
    return mockAppointments.filter((a) => a.patientId === patientId);
};

export const getPatientInvoices = (patientId: string): Invoice[] => {
    return mockInvoices.filter((i) => i.patientId === patientId);
};

export const getOutstandingInvoices = (): Invoice[] => {
    return mockInvoices.filter((i) => i.status !== 'paid');
};

export const getInactivePatients = (): Patient[] => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    return mockPatients.filter((p) => {
        if (!p.lastVisitDate) return true;
        return new Date(p.lastVisitDate) < sixMonthsAgo;
    });
};

// Admin Mock Data
export const mockDentistAccounts: import('./types').DentistAccount[] = [
    {
        id: 'dentist-1',
        name: 'Aziz Karimov',
        email: 'aziz.karimov@identa.uz',
        practiceName: 'Karimov Dental Clinic',
        registrationDate: '2026-01-15',
        status: 'active',
        lastLogin: '2026-02-14',
        patientCount: 45,
        appointmentCount: 120,
    },
    {
        id: 'dentist-2',
        name: 'Dilnoza Rahimova',
        email: 'dilnoza.r@identa.uz',
        practiceName: 'Smile Dental',
        registrationDate: '2026-02-01',
        status: 'active',
        lastLogin: '2026-02-13',
        patientCount: 28,
        appointmentCount: 65,
    },
    {
        id: 'dentist-3',
        name: 'Jamshid Tursunov',
        email: 'jamshid.t@identa.uz',
        practiceName: 'Tursunov Dental Care',
        registrationDate: '2026-02-10',
        status: 'active',
        lastLogin: '2026-02-14',
        patientCount: 12,
        appointmentCount: 30,
    },
    {
        id: 'dentist-4',
        name: 'Malika Yusupova',
        email: 'malika.y@identa.uz',
        practiceName: 'Yusupova Dental Studio',
        registrationDate: '2025-12-20',
        status: 'blocked',
        lastLogin: '2026-01-25',
        patientCount: 67,
        appointmentCount: 180,
    },
    {
        id: 'dentist-5',
        name: 'Rustam Alimov',
        email: 'rustam.a@identa.uz',
        practiceName: 'Alimov Dental',
        registrationDate: '2026-02-12',
        status: 'active',
        lastLogin: '2026-02-14',
        patientCount: 8,
        appointmentCount: 15,
    },
];

export const mockAdminStats: import('./types').AdminStats = {
    totalDentists: 5,
    activeDentists: 4,
    newRegistrations: 2, // last 7 days
};

