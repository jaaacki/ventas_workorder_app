import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { login } from '@/lib/auth-api';
import { useAuthStore } from '@/store/authStore';
import { AlertCircle, ArrowLeft, ClipboardList, Loader2 } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuth } = useAuthStore();
  const [error, setError] = useState(searchParams.get('error') || '');
  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: LoginForm) => {
    setError('');
    try {
      const { token, user } = await login(values.email, values.password);
      setAuth(token, user);
      navigate('/dashboard', { replace: true });
    } catch {
      setError('Invalid email or password');
    }
  };

  return (
    <div className="relative min-h-screen bg-white p-6 dark:bg-gray-900 sm:p-0">
      <div className="relative flex min-h-screen flex-col lg:flex-row">
        <div className="flex w-full flex-1 flex-col lg:w-1/2">
          <div className="w-full max-w-md pt-4 sm:mx-auto sm:pt-10">
            <a href="/dashboard" className="inline-flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
              <ArrowLeft className="h-5 w-5" />
              Back to dashboard
            </a>
          </div>
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
            <Card className="border-0 bg-transparent p-0 shadow-none dark:bg-transparent">
              <CardHeader className="px-0 text-left">
                <CardTitle className="text-3xl">Sign In</CardTitle>
                <CardDescription>Enter your credentials to access the dashboard.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5 px-0">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Button variant="secondary" asChild className="h-12 w-full">
                <a href={`${API_BASE}/api/auth/oauth/google/authorize`} className="inline-flex items-center justify-center gap-3">
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Google
                </a>
              </Button>
              <Button variant="secondary" asChild className="h-12 w-full">
                <a href={`${API_BASE}/api/auth/oauth/microsoft/authorize`} className="inline-flex items-center justify-center gap-3">
                  <svg className="h-5 w-5" viewBox="0 0 21 21">
                    <path fill="#f25022" d="M1 1h9v9H1z" />
                    <path fill="#00a4ef" d="M1 11h9v9H1z" />
                    <path fill="#7fba00" d="M11 1h9v9h-9z" />
                    <path fill="#ffb900" d="M11 11h9v9h-9z" />
                  </svg>
                  Microsoft
                </a>
              </Button>
            </div>

            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-200 dark:border-gray-800" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-5 py-2 text-gray-400 dark:bg-gray-900">Or</span>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@company.com" {...form.register('email')} />
                {form.formState.errors.email && (
                  <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                </div>
                <Input id="password" type="password" placeholder="••••••••" {...form.register('password')} />
                {form.formState.errors.password && (
                  <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign In
              </Button>
            </form>
              </CardContent>
            </Card>
          </div>
        </div>
        <div className="hidden flex-1 items-center justify-center bg-brand-950 px-10 text-white lg:flex">
          <div className="max-w-md text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/15">
              <ClipboardList className="h-10 w-10" />
            </div>
            <div className="mt-8 flex items-center justify-center gap-3 text-2xl font-semibold">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-base font-bold">V</div>
              Ventas WorkOrder
            </div>
            <p className="mt-4 text-base text-white/70">
              Work order management for medical device operations, staff access, and workflow phase tracking.
            </p>
            <div className="mt-10 grid grid-cols-3 gap-3">
              <div className="h-24 rounded-2xl bg-white/10" />
              <div className="h-24 rounded-2xl bg-brand-500/70" />
              <div className="h-24 rounded-2xl bg-white/10" />
              <div className="h-24 rounded-2xl bg-brand-500/70" />
              <div className="h-24 rounded-2xl bg-white/10" />
              <div className="h-24 rounded-2xl bg-brand-500/70" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
