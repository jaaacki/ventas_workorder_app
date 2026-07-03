import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { me } from '@/lib/auth-api';
import { useAuthStore } from '@/store/authStore';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { setAuth, clearAuth } = useAuthStore();

  useEffect(() => {
    // OAuth set the httpOnly session cookie during the redirect; confirm it via /me.
    me()
      .then((user) => {
        setAuth(user);
        navigate('/dashboard', { replace: true });
      })
      .catch(() => {
        clearAuth();
        navigate('/login', { replace: true });
      });
  }, [setAuth, clearAuth, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    </div>
  );
}
