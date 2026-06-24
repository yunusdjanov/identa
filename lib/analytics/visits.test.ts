import { describe, expect, it } from 'vitest';
import { countUniqueVisits } from '@/lib/analytics/visits';
import type { ApiAppointment, ApiTreatment } from '@/lib/api/types';

function appointment(overrides: Partial<ApiAppointment>): ApiAppointment {
    return {
        id: 'apt-1',
        patient_id: 'patient-1',
        patient_name: 'Patient One',
        appointment_date: '2026-06-15',
        start_time: '09:00',
        end_time: '09:30',
        status: 'completed',
        notes: null,
        ...overrides,
    };
}

function treatment(overrides: Partial<ApiTreatment>): ApiTreatment {
    return {
        id: 'treatment-1',
        patient_id: 'patient-1',
        patient_name: 'Patient One',
        patient_phone: '+998901234567',
        patient_secondary_phone: null,
        tooth_number: null,
        teeth: [],
        treatment_type: 'Consultation',
        description: null,
        comment: null,
        treatment_date: '2026-06-15',
        cost: null,
        debt_amount: 0,
        paid_amount: 0,
        balance: 0,
        notes: null,
        image_count: 0,
        images: [],
        created_at: null,
        updated_at: null,
        ...overrides,
    };
}

describe('countUniqueVisits', () => {
    const start = new Date(2026, 5, 1);
    const end = new Date(2026, 5, 30, 23, 59, 59);

    it('deduplicates a completed appointment and history entry for the same patient day', () => {
        const total = countUniqueVisits(
            [appointment({ id: 'apt-patient-1' })],
            [treatment({ id: 'treatment-patient-1' })],
            start,
            end
        );

        expect(total).toBe(1);
    });

    it('counts separate patients, separate days, and completed guest appointments', () => {
        const total = countUniqueVisits(
            [
                appointment({ id: 'apt-patient-1' }),
                appointment({ id: 'apt-scheduled', patient_id: 'patient-3', status: 'scheduled' }),
                appointment({
                    id: 'apt-guest',
                    patient_id: null,
                    patient_name: 'Walk-in',
                    guest_name: 'Walk-in',
                    guest_phone: '+998901111111',
                    is_guest: true,
                }),
            ],
            [
                treatment({ id: 'treatment-patient-1' }),
                treatment({ id: 'treatment-patient-2', patient_id: 'patient-2' }),
                treatment({ id: 'treatment-next-day', treatment_date: '2026-06-16' }),
            ],
            start,
            end
        );

        expect(total).toBe(4);
    });
});
