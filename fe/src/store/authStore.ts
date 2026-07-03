import { create } from 'zustand';
import type { User } from '../lib/auth-api';

// The session token lives in an httpOnly cookie the browser can't read, so auth
// state is derived from whether /me resolves — not from a token held in JS.
interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setAuth: (user: User) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  setUser: (user: User) => void;
  hasPermission: (permission: string) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  setAuth: (user) => set({ user, isAuthenticated: true, isLoading: false }),
  clearAuth: () => set({ user: null, isAuthenticated: false, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
  setUser: (user) => set({ user, isAuthenticated: true }),
  hasPermission: (permission) => {
    const permissions = get().user?.role?.permissions ?? [];
    return permissions.includes(permission);
  },
}));
