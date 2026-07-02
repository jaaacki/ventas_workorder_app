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
