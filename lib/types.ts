// UI-shaped form model for the dentist's own profile/settings screen.
// (API payloads use the snake_case `Api*` types in `lib/api/types.ts`; this
// camelCase shape is what the settings form binds to.)
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
