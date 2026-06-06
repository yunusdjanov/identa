'use client';

import { create } from 'zustand';

interface AuthState {
    isAuthenticated: boolean;
    dentistName: string;
    /**
     * True from the moment the user clicks Logout until the hard
     * navigation lands. AppLayout reads this and switches the entire
     * authenticated tree to a full-screen "Logging out..." overlay so:
     *   - no other component can race the navigation with its own redirect,
     *   - in-flight `auth/me` refetches cannot repopulate the cache and
     *     trick the login page into bouncing back to /dashboard,
     *   - the user sees immediate, deliberate feedback (the most common
     *     real-world complaint was "I click logout and nothing happens").
     */
    isLoggingOut: boolean;
    login: (name: string) => void;
    logout: () => void;
    setLoggingOut: (loggingOut: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    isAuthenticated: false,
    dentistName: '',
    isLoggingOut: false,
    login: (name) => set({ isAuthenticated: true, dentistName: name, isLoggingOut: false }),
    logout: () => set({ isAuthenticated: false, dentistName: '' }),
    setLoggingOut: (loggingOut) => set({ isLoggingOut: loggingOut }),
}));
