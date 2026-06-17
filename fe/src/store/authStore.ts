import { create } from 'zustand';
import type { User } from '../lib/auth-api';

interface AuthState {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setAuth: (token: string, user: User) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  setUser: (user: User) => void;
}

const storedToken = localStorage.getItem('wo_token');

export const useAuthStore = create<AuthState>((set) => ({
  token: storedToken,
  user: null,
  isLoading: true,
  isAuthenticated: !!storedToken,
  setAuth: (token, user) => {
    localStorage.setItem('wo_token', token);
    set({ token, user, isAuthenticated: true, isLoading: false });
  },
  clearAuth: () => {
    localStorage.removeItem('wo_token');
    set({ token: null, user: null, isAuthenticated: false, isLoading: false });
  },
  setLoading: (isLoading) => set({ isLoading }),
  setUser: (user) => set({ user }),
}));
