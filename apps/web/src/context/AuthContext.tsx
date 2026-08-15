import { useCallback, useEffect, useState } from 'react';

import { api } from '../lib/api';
import type { AuthUser } from '../types/auth';
import { AuthContext } from './auth-context';

interface LoginResponse {
  user: AuthUser;
  token: string;
}

interface RegisterResponse {
  user: AuthUser;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadCurrentUser = useCallback(async () => {
    const token = localStorage.getItem('nexchat_token');

    if (!token) {
      return null;
    }

    try {
      const data = await api<{ user: AuthUser }>('/api/auth/me', {
        authenticated: true,
      });

      return data.user;
    } catch {
      localStorage.removeItem('nexchat_token');
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    loadCurrentUser()
      .then((currentUser) => {
        if (mounted) {
          setUser(currentUser);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [loadCurrentUser]);

  const login = async (email: string, password: string): Promise<void> => {
    const data = await api<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
      }),
    });

    localStorage.setItem('nexchat_token', data.token);
    setUser(data.user);
  };

  const register = async (name: string, email: string, password: string): Promise<void> => {
    await api<RegisterResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name,
        email,
        password,
      }),
    });

    await login(email, password);
  };

  const logout = (): void => {
    localStorage.removeItem('nexchat_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
