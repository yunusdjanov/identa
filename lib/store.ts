'use client';

import { create } from 'zustand';
import { Patient } from '@/lib/types';

interface AuthState {
    isAuthenticated: boolean;
    dentistName: string;
    login: (name: string) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    isAuthenticated: false,
    dentistName: '',
    login: (name) => set({ isAuthenticated: true, dentistName: name }),
    logout: () => set({ isAuthenticated: false, dentistName: '' }),
}));

interface AppState {
    selectedPatient: Patient | null;
    setSelectedPatient: (patient: Patient | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
    selectedPatient: null,
    setSelectedPatient: (patient) => set({ selectedPatient: patient }),
}));
