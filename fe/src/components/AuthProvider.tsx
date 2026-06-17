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
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
