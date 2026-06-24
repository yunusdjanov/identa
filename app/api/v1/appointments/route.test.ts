import { NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APPOINTMENTS, PATIENTS } from '../_mock-data';
import { POST as CREATE_PATIENT_CARD } from './[id]/patient-card/route';
import { GET, POST } from './route';

vi.mock('../_auth', () => ({
    requirePermission: vi.fn(async () => null),
    list: (data: unknown[], total?: number) => NextResponse.json({
        data,
        meta: {
            pagination: {
                page: 1,
                per_page: 50,
                total: total ?? data.length,
                total_pages: 1,
            },
        },
    }),
}));

describe('appointments mock route', () => {
    const createdIds: string[] = [];
    const createdPatientIds: string[] = [];

    afterEach(() => {
        for (const id of createdIds.splice(0)) {
            const index = APPOINTMENTS.findIndex((appointment) => appointment.id === id);
            if (index >= 0) {
                APPOINTMENTS.splice(index, 1);
            }
        }
        for (const id of createdPatientIds.splice(0)) {
            const index = PATIENTS.findIndex((patient) => patient.id === id);
            if (index >= 0) {
                PATIENTS.splice(index, 1);
            }
        }
    });

    it('persists created guest appointments for the filtered list response', async () => {
        const createResponse = await POST(new Request('http://localhost/api/v1/appointments', {
            method: 'POST',
            body: JSON.stringify({
                patient_id: null,
                guest_name: 'Sarvar Hasanov',
                guest_phone: '+998901234567',
                appointment_date: '2099-06-24',
                start_time: '09:00',
                end_time: '09:30',
                status: 'scheduled',
            }),
        }));
        const created = await createResponse.json() as { data: { id: string } };
        createdIds.push(created.data.id);

        const listResponse = await GET(new Request(
            'http://localhost/api/v1/appointments?filter[date_from]=2099-06-24&filter[date_to]=2099-06-24'
        ));
        const listed = await listResponse.json() as { data: Array<{ id: string; guest_name?: string }> };

        expect(listed.data).toEqual(expect.arrayContaining([
            expect.objectContaining({
                id: created.data.id,
                guest_name: 'Sarvar Hasanov',
            }),
        ]));
    });

    it('creates a patient card and links the guest appointment in the mock store', async () => {
        const createResponse = await POST(new Request('http://localhost/api/v1/appointments', {
            method: 'POST',
            body: JSON.stringify({
                patient_id: null,
                guest_name: 'Jamal Hasanov',
                guest_phone: '+998901111111',
                appointment_date: '2099-06-25',
                start_time: '09:00',
                end_time: '09:30',
                status: 'scheduled',
            }),
        }));
        const created = await createResponse.json() as { data: { id: string } };
        createdIds.push(created.data.id);

        const convertResponse = await CREATE_PATIENT_CARD(
            new Request(`http://localhost/api/v1/appointments/${created.data.id}/patient-card`, {
                method: 'POST',
                body: JSON.stringify({
                    full_name: 'Jamol Hasanov',
                    phone: '+998902222222',
                }),
            }),
            { params: Promise.resolve({ id: created.data.id }) }
        );
        const converted = await convertResponse.json() as {
            data: {
                appointment: { patient_id: string; guest_name: string | null; is_guest: boolean };
                patient: { id: string; full_name: string; phone: string };
            };
        };
        createdPatientIds.push(converted.data.patient.id);

        expect(converted.data.patient).toEqual(expect.objectContaining({
            full_name: 'Jamol Hasanov',
            phone: '+998902222222',
        }));
        expect(converted.data.appointment).toEqual(expect.objectContaining({
            patient_id: converted.data.patient.id,
            guest_name: null,
            is_guest: false,
        }));
        expect(APPOINTMENTS.find((appointment) => appointment.id === created.data.id)).toEqual(
            expect.objectContaining({
                patient_id: converted.data.patient.id,
                guest_name: null,
                is_guest: false,
            })
        );
    });
});
