import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { User } from './types';

interface AuthState {
  user: User | null;
  loading: boolean;
  emailVerificationRequired: boolean;
  refresh: () => Promise<unknown>;
  logout: () => Promise<void>;
  setUser: (u: User | null) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => api.get<{ user: User | null; emailVerificationRequired: boolean }>('/auth/me'),
    staleTime: 60_000,
  });
  const value: AuthState = {
    user: data?.user ?? null,
    loading: isLoading,
    emailVerificationRequired: data?.emailVerificationRequired ?? false,
    refresh: refetch,
    setUser: (u) => qc.setQueryData(['auth', 'me'], { user: u, emailVerificationRequired: data?.emailVerificationRequired ?? false }),
    logout: async () => {
      await api.post('/auth/logout');
      qc.clear();
      qc.setQueryData(['auth', 'me'], { user: null, emailVerificationRequired: false });
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
