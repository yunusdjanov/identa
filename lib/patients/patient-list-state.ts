export const PATIENTS_LIST_STATE_STORAGE_KEY = 'identa.patients.list-state.v1';
export const PATIENTS_LIST_RESTORE_HREF = '/patients?restore=1';

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

const PATIENTS_LIST_RESTORE_SEARCH_PARAM = 'restore';
const PATIENTS_LIST_RESTORE_SEARCH_VALUE = '1';
const PATIENTS_LIST_RESTORE_HISTORY_STATE_KEY = 'identaPatientsListRestore';

/**
 * Restores the patient list view state only when the current navigation
 * explicitly came from patient detail back-navigation.
 */
export function readPatientListState(): PatientListState {
    if (!hasPatientListRestoreIntent()) {
        return DEFAULT_PATIENT_LIST_STATE;
    }

    return readStoredPatientListState();
}

/**
 * Clears the one-shot restore marker so normal menu navigation starts fresh.
 */
export function clearPatientListRestoreIntent(): void {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        const currentState = window.history.state;
        const nextState = currentState && typeof currentState === 'object'
            ? { ...currentState }
            : {};
        delete (nextState as Record<string, unknown>)[PATIENTS_LIST_RESTORE_HISTORY_STATE_KEY];

        const url = new URL(window.location.href);
        url.searchParams.delete(PATIENTS_LIST_RESTORE_SEARCH_PARAM);
        const nextUrl = `${url.pathname}${url.search}${url.hash}`;
        window.history.replaceState(nextState, '', nextUrl);
    } catch {
        // Browser history may be unavailable in tests or hardened contexts.
    }
}

/**
 * Marks the current history entry so browser Back can restore this exact list.
 */
export function markPatientListStateForBackNavigation(state: PatientListState): void {
    writePatientListState(state);

    if (typeof window === 'undefined') {
        return;
    }

    try {
        const currentState = window.history.state;
        const nextState = currentState && typeof currentState === 'object'
            ? { ...currentState }
            : {};
        (nextState as Record<string, unknown>)[PATIENTS_LIST_RESTORE_HISTORY_STATE_KEY] = true;
        window.history.replaceState(nextState, '', window.location.href);
    } catch {
        // Browser history may be unavailable in tests or hardened contexts.
    }
}

function hasPatientListRestoreIntent(): boolean {
    if (typeof window === 'undefined') {
        return false;
    }

    try {
        const params = new URLSearchParams(window.location.search);
        if (params.get(PATIENTS_LIST_RESTORE_SEARCH_PARAM) === PATIENTS_LIST_RESTORE_SEARCH_VALUE) {
            return true;
        }

        const historyState = window.history.state;
        return Boolean(
            historyState
            && typeof historyState === 'object'
            && (historyState as Record<string, unknown>)[PATIENTS_LIST_RESTORE_HISTORY_STATE_KEY]
        );
    } catch {
        return false;
    }
}

function readStoredPatientListState(): PatientListState {
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
        ...readStoredPatientListState(),
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
