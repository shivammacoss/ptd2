import { create } from 'zustand';
import api from '@/lib/api/client';

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  status: string;
  kyc_status: string;
  two_factor_enabled: boolean;
  theme: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, totpCode?: string) => Promise<void>;
  register: (data: { email: string; password: string; first_name: string; last_name: string; phone?: string; referral_code?: string }) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: typeof window !== 'undefined' ? localStorage.getItem('token') : null,
  isAuthenticated: typeof window !== 'undefined' ? !!localStorage.getItem('token') : false,
  isLoading: false,

  login: async (email, password, totpCode) => {
    set({ isLoading: true });
    try {
      const res = await api.post<{ access_token: string; user_id: string; role: string }>('/auth/login', {
        email, password, totp_code: totpCode,
      });
      api.setToken(res.access_token);
      set({ token: res.access_token, isAuthenticated: true });
      const user = await api.get<User>('/auth/me');
      set({ user, isLoading: false });
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },

  register: async (data) => {
    set({ isLoading: true });
    try {
      const res = await api.post<{ access_token: string }>('/auth/register', data);
      api.setToken(res.access_token);
      set({ token: res.access_token, isAuthenticated: true });
      const user = await api.get<User>('/auth/me');
      set({ user, isLoading: false });
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },

  logout: () => {
    api.clearToken();
    set({ user: null, token: null, isAuthenticated: false });
  },

  loadUser: async () => {
    try {
      const user = await api.get<User>('/auth/me');
      set({ user, isAuthenticated: true });
    } catch {
      set({ user: null, isAuthenticated: false });
    }
  },
}));
