export const PATIENTS_LIST_STATE_STORAGE_KEY = 'identa.patients.list-state.v1';

export type PatientListInactiveFilter = 'none' | '6m' | '1y';

export interface PatientListState {
    searchQuery: string;
    inactiveFilter: PatientListInactiveFilter;
    showArchivedOnly: boolean;
    selectedCategoryId: string;
    currentPage: number;
    focusPatientId: string | null;
}

const DEFAULT_PATIENT_LIST_STATE: PatientListState = {
    searchQuery: '',
    inactiveFilter: 'none',
    showArchivedOnly: false,
    selectedCategoryId: 'all',
    currentPage: 1,
    focusPatientId: null,
};

/**
 * Restores the patient list view state for browser-local back-navigation.
 */
export function readPatientListState(): PatientListState {
    if (typeof window === 'undefined') {
        return DEFAULT_PATIENT_LIST_STATE;
    }

    try {
        const stored = window.sessionStorage.getItem(PATIENTS_LIST_STATE_STORAGE_KEY);
        if (!stored) {
            return DEFAULT_PATIENT_LIST_STATE;
        }

        const parsed = JSON.parse(stored) as Partial<PatientListState>;

        return {
            searchQuery: typeof parsed.searchQuery === 'string' ? parsed.searchQuery : '',
            inactiveFilter: normalizeInactiveFilter(parsed.inactiveFilter),
            showArchivedOnly: parsed.showArchivedOnly === true,
            selectedCategoryId: typeof parsed.selectedCategoryId === 'string' && parsed.selectedCategoryId !== ''
                ? parsed.selectedCategoryId
                : 'all',
            currentPage: normalizePage(parsed.currentPage),
            focusPatientId: typeof parsed.focusPatientId === 'string' && parsed.focusPatientId !== ''
                ? parsed.focusPatientId
                : null,
        };
    } catch {
        return DEFAULT_PATIENT_LIST_STATE;
    }
}

/**
 * Persists the patient list view state for the current browser tab.
 */
export function writePatientListState(state: PatientListState): void {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.sessionStorage.setItem(PATIENTS_LIST_STATE_STORAGE_KEY, JSON.stringify({
            ...state,
            currentPage: normalizePage(state.currentPage),
            inactiveFilter: normalizeInactiveFilter(state.inactiveFilter),
        }));
    } catch {
        // A disabled storage backend should not break patient navigation.
    }
}

/**
 * Marks a patient as the next focused row when the user returns to the list.
 */
export function rememberPatientListFocus(patientId: string, overrides: Partial<PatientListState> = {}): void {
    if (patientId === '') {
        return;
    }

    writePatientListState({
        ...readPatientListState(),
        ...overrides,
        focusPatientId: patientId,
    });
}

function normalizeInactiveFilter(value: unknown): PatientListInactiveFilter {
    return value === '6m' || value === '1y' ? value : 'none';
}

function normalizePage(value: unknown): number {
    return Number.isInteger(value) && Number(value) > 0 ? Number(value) : 1;
}
