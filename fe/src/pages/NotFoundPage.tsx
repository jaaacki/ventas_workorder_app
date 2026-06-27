import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, SearchX } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6 dark:bg-gray-900">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-50 text-brand-500 dark:bg-brand-500/15">
          <SearchX className="h-10 w-10" />
        </div>
        <h1 className="mt-8 text-7xl font-bold text-gray-800 dark:text-white/90">404</h1>
        <p className="mt-3 text-lg text-gray-500 dark:text-gray-400">This page does not exist.</p>
        <Button asChild className="mt-6">
          <Link to="/dashboard" className="inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}
