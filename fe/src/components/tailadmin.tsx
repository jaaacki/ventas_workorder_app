import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">{title}</h1>
        {description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function AdminPanel({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]', className)}>
      {(title || description || action) && (
        <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800">
          <div>
            {title && <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">{title}</h2>}
            {description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function MetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-white/90">
        {icon}
      </div>
      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
          <div className="mt-2 text-2xl font-bold text-gray-800 dark:text-white/90">{value}</div>
        </div>
        {detail && <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{detail}</div>}
      </div>
    </div>
  );
}

export function StatusPill({
  tone = 'neutral',
  children,
}: {
  tone?: 'brand' | 'success' | 'warning' | 'error' | 'neutral';
  children: ReactNode;
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400',
    success: 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500',
    warning: 'bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-500',
    error: 'bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500',
    neutral: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  };

  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>;
}

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center dark:border-gray-800 dark:bg-white/[0.03]">
      {icon && <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white text-gray-500 shadow-theme-xs dark:bg-gray-900 dark:text-gray-400">{icon}</div>}
      <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">{description}</p>}
    </div>
  );
}
