import type { WorkOrderSummary } from './work-orders-api';

export function workflowLabel(workOrder: WorkOrderSummary) {
  if (workOrder.workflow) return `${workOrder.workflow.name} (${workOrder.workflow.code})`;
  return workOrder.workflowId ? `Missing workflow (${workOrder.workflowId})` : 'No workflow assigned';
}

export function statusTone(status: string): 'brand' | 'success' | 'warning' | 'error' | 'neutral' {
  if (status.startsWith('2. ')) return 'success';
  if (status.startsWith('3. ')) return 'warning';
  if (status.startsWith('4. ')) return 'brand';
  if (status.startsWith('5. ')) return 'neutral';
  if (status === 'ReadyToAdvance') return 'success';
  if (status === 'ReleasePending') return 'brand';
  if (status === 'Blocked') return 'warning';
  return 'neutral';
}

export function productLabel(workOrder: Pick<WorkOrderSummary, 'workflow'>) {
  return workOrder.workflow?.name || 'AmGraft';
}

/** Human unit count, or null when unknown (callers apply their own placeholder). */
export function unitsLabel(quantity: number | null | undefined): string | null {
  return quantity != null ? `${quantity} unit${quantity === 1 ? '' : 's'}` : null;
}

/** The next operator action for a work order, based on its lifecycle state. */
export function nextActionLabel(workOrder: WorkOrderSummary): string {
  switch (workOrder.lifecycleState) {
    case 'NotStarted':
      return `Start ${workOrder.currentPhaseLabel}`;
    case 'InProgress':
      return `Finish ${workOrder.currentPhaseLabel}`;
    case 'ReadyToAdvance':
      return `Advance from ${workOrder.currentPhaseLabel}`;
    case 'ReleasePending':
      return `Release ${productLabel(workOrder)}`;
    default:
      return workOrder.currentPhaseLabel;
  }
}
