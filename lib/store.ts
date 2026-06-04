'use client';

import { create } from 'zustand';

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
