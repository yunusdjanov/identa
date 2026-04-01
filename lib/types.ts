// Mock data types
export interface Patient {
    id: string;
    patientId: string;
    fullName: string;
    phone: string;
    secondaryPhone?: string;
    address?: string;
    dateOfBirth?: string;
    gender?: 'male' | 'female';
    medicalHistory?: string;
    allergies?: string;
    currentMedications?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    notes?: string;
    lastVisitDate?: string;
    createdAt: string;
}

export interface ToothCondition {
    type: 'healthy' | 'cavity' | 'filling' | 'crown' | 'root_canal' | 'extraction' | 'implant';
    surface?: string;
    material?: string;
    severity?: string;
    date: string;
    notes?: string;
}

export interface Odontogram {
    id: string;
    patientId: string;
    toothNumber: number; // 1-32
    conditions: ToothCondition[];
    notes?: string;
}

export interface Treatment {
    id: string;
    patientId: string;
    toothNumber?: number;
    treatmentType: string;
    description?: string;
    treatmentDate: string;
    cost?: number;
    notes?: string;
    createdAt: string;
}

export interface Appointment {
    id: string;
    patientId: string;
    patientName: string;
    appointmentDate: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
    reason?: string;
    notes?: string;
    createdAt: string;
}

export interface Invoice {
    id: string;
    patientId: string;
    invoiceNumber: string;
    totalAmount: number;
    paidAmount: number;
    balance: number;
    status: 'unpaid' | 'partially_paid' | 'paid';
    invoiceDate: string;
    dueDate?: string;
    notes?: string;
    items: InvoiceItem[];
}

export interface InvoiceItem {
    id: string;
    invoiceId: string;
    treatmentId?: string;
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
}

export interface Payment {
    id: string;
    patientId: string;
    invoiceId: string;
    amount: number;
    paymentMethod: 'cash' | 'card' | 'bank_transfer';
    paymentDate: string;
    notes?: string;
    createdAt: string;
}

export interface DashboardStats {
    revenueThisMonth: number;
    outstandingDebtTotal: number;
    todayAppointments: Appointment[];
}

export interface DentistProfile {
    id: string;
    name: string;
    email: string;
    phone: string;
    practiceName: string;
    licenseNumber?: string;
    address?: string;
    workingHours: {
        start: string; // HH:mm format
        end: string;   // HH:mm format
    };
    defaultAppointmentDuration: number; // minutes
}

// Admin Types
export type AccountStatus = 'active' | 'blocked' | 'deleted';

export interface DentistAccount {
    id: string;
    name: string;
    email: string;
    practiceName: string;
    registrationDate: string; // ISO date
    status: AccountStatus;
    lastLogin?: string; // ISO date
    patientCount: number;
    appointmentCount: number;
}

export interface AdminStats {
    totalDentists: number;
    activeDentists: number;
    newRegistrations: number; // last 7 days
}


