import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { me } from '@/lib/auth-api';
import { useAuthStore } from '@/store/authStore';

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setAuth, clearAuth } = useAuthStore();

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      clearAuth();
      navigate('/login', { replace: true });
      return;
    }
    localStorage.setItem('wo_token', token);
    me()
      .then((user) => {
        setAuth(token, user);
        navigate('/dashboard', { replace: true });
      })
      .catch(() => {
        clearAuth();
        navigate('/login', { replace: true });
      });
  }, [searchParams, setAuth, clearAuth, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
