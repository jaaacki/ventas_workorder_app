import { type FormEvent, type ReactNode, useState } from 'react';
import { Archive, Edit3, History, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusPill } from '@/components/tailadmin';
import type { AuditEvent } from '@/lib/inventory-api';

export type ErpMetadata = {
  deleted?: boolean;
  deletedAt?: string | null;
  updatedAt?: string;
};

export function DeletedBadge({ record }: { record: ErpMetadata }) {
  if (!record.deleted) return null;
  return <StatusPill tone="error">Archived</StatusPill>;
}

export function IncludeDeletedButton({
  includeDeleted,
  label = 'records',
  onToggle,
}: {
  includeDeleted: boolean;
  label?: string;
  onToggle: () => void;
}) {
  return (
    <Button type="button" variant={includeDeleted ? 'default' : 'outline'} onClick={onToggle}>
      <Archive className="h-4 w-4" />
      {includeDeleted ? `Hide archived ${label}` : `Include archived ${label}`}
    </Button>
  );
}

export function ReadOnlyNotice({ label }: { label: string }) {
  return (
    <div className="mb-3 rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-400">
      You have read-only access to {label}. Create, edit, archive, and restore actions require additional permission.
    </div>
  );
}

export function RowCrudActions({
  deleted,
  canEdit,
  canArchive,
  canRestore,
  canAudit,
  busy,
  onEdit,
  onArchive,
  onRestore,
  onAudit,
  editLabel = 'Edit',
  archiveLabel = 'Archive',
  archiveTitle = 'Archive record',
  archiveDescription = 'Archive this record? It will be hidden from normal lists but can be restored later.',
}: {
  deleted?: boolean;
  canEdit: boolean;
  canArchive: boolean;
  canRestore: boolean;
  canAudit: boolean;
  busy?: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onAudit: () => void;
  editLabel?: string;
  archiveLabel?: string;
  archiveTitle?: string;
  archiveDescription?: string;
}) {
  const [confirmAction, setConfirmAction] = useState<'archive' | 'restore' | null>(null);
  if (!canEdit && !canArchive && !canRestore && !canAudit) return null;
  const confirmTitle = confirmAction === 'archive' ? archiveTitle : 'Restore record';
  const confirmDescription =
    confirmAction === 'archive'
      ? archiveDescription
      : 'Restore this archived record to normal operational lists?';
  const confirmLabel = confirmAction === 'archive' ? archiveLabel : 'Restore';
  const confirm = () => {
    if (confirmAction === 'archive') onArchive();
    if (confirmAction === 'restore') onRestore();
    setConfirmAction(null);
  };

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        {canEdit && !deleted && (
          <Button type="button" variant="ghost" size="icon-sm" title={editLabel} aria-label={editLabel} disabled={busy} onClick={onEdit}>
            <Edit3 className="h-4 w-4" />
          </Button>
        )}
        {canArchive && !deleted && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title={archiveLabel}
            aria-label={archiveLabel}
            disabled={busy}
            onClick={() => setConfirmAction('archive')}
          >
            <Archive className="h-4 w-4" />
          </Button>
        )}
        {canRestore && deleted && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="Restore"
            aria-label="Restore"
            disabled={busy}
            onClick={() => setConfirmAction('restore')}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
        {canAudit && (
          <Button type="button" variant="ghost" size="icon-sm" title="Audit" aria-label="Audit" disabled={busy} onClick={onAudit}>
            <History className="h-4 w-4" />
          </Button>
        )}
      </div>
      <Dialog open={Boolean(confirmAction)} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmTitle}</DialogTitle>
            <DialogDescription>{confirmDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button type="button" variant={confirmAction === 'archive' ? 'destructive' : 'default'} disabled={busy} onClick={confirm}>
              {confirmAction === 'archive' ? <Archive className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function JsonSnapshot({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <details className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-white/[0.03]">
      <summary className="cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-300">{label}</summary>
      <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs text-gray-600 dark:text-gray-400">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

export function CrudSheet({
  open,
  title,
  description,
  submitLabel,
  isSubmitting,
  children,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description: string;
  submitLabel: string;
  isSubmitting?: boolean;
  children: ReactNode;
  onOpenChange: (open: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <form onSubmit={onSubmit} className="flex min-h-full flex-col">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          <div className="grid gap-4 px-4 pb-4 sm:grid-cols-2">{children}</div>
          <SheetFooter>
            <Button type="submit" disabled={isSubmitting}>
              {submitLabel}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  className,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
  required?: boolean;
}) {
  return (
    <label className={className}>
      <Label className="mb-1.5">
        {label}
        {required && <span className="ml-1 text-error-500">*</span>}
      </Label>
      <Input required={required} type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

const EMPTY_SELECT_VALUE = '__empty__';

export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select value',
  allowEmpty = true,
  required,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  placeholder?: string;
  allowEmpty?: boolean;
  required?: boolean;
}) {
  return (
    <label>
      <Label className="mb-1.5">
        {label}
        {required && <span className="ml-1 text-error-500">*</span>}
      </Label>
      <Select value={value || (allowEmpty ? EMPTY_SELECT_VALUE : '')} onValueChange={(next) => onChange(next === EMPTY_SELECT_VALUE ? '' : next)}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {allowEmpty && <SelectItem value={EMPTY_SELECT_VALUE}>None</SelectItem>}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

export function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-800">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-gray-300"
      />
      <span>{label}</span>
    </label>
  );
}

export function AuditDrawer({
  open,
  title,
  events,
  isLoading,
  isError,
  errorMessage,
  onOpenChange,
}: {
  open: boolean;
  title: string;
  events?: AuditEvent<unknown>[];
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>Recorded create, update, archive, restore, and related lifecycle events.</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-4">
          {isLoading ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">Loading audit events...</div>
          ) : isError ? (
            <div className="text-sm text-error-600 dark:text-error-300">{errorMessage || 'Unable to load audit events.'}</div>
          ) : !events?.length ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">No audit events recorded.</div>
          ) : (
            events.map((event) => (
              <div key={event.id} className="rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-800">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-gray-800 dark:text-white/90">{event.action.replace(/_/g, ' ')}</span>
                  <span className="text-xs text-gray-500">{new Date(event.createdAt).toLocaleString()}</span>
                </div>
                <div className="mt-1 text-xs text-gray-500">{event.actorEmail || event.actorId || 'System'}</div>
                <div className="mt-3 space-y-2">
                  <JsonSnapshot label="Before" value={event.before} />
                  <JsonSnapshot label="After" value={event.after} />
                  <JsonSnapshot label="Metadata" value={event.metadata} />
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
