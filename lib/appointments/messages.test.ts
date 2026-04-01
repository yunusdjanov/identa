import { describe, expect, it } from 'vitest';
import {
    APPOINTMENT_CONFLICT_MESSAGE,
    APPOINTMENT_PAST_SLOT_MESSAGE,
    normalizeAppointmentConflictMessage,
} from '@/lib/appointments/messages';

describe('appointment message normalization', () => {
    it('normalizes legacy overlap conflict copy', () => {
        expect(
            normalizeAppointmentConflictMessage('Target time range is occupied. Drop onto an empty range.')
        ).toBe(APPOINTMENT_CONFLICT_MESSAGE);
    });

    it('normalizes legacy past-slot validation copy', () => {
        expect(
            normalizeAppointmentConflictMessage('Appointment start time cannot be in the past.')
        ).toBe(APPOINTMENT_PAST_SLOT_MESSAGE);
    });
});
