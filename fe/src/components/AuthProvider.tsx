import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { me } from '../lib/auth-api';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { token, setUser, clearAuth, setLoading, isLoading } = useAuthStore();

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    me()
      .then((user) => {
        setUser(user);
      })
      .catch(() => {
        clearAuth();
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token, setUser, clearAuth, setLoading]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
