import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchWorkflows, type WorkflowSummary } from '@/lib/workflows-api';
import { useAuthStore } from '@/store/authStore';

// The product-line (workflow) context scopes board / queues / gates. Today there is one
// live workflow (AmGraft), so the switcher renders as a label; the plumbing is ready for more.

const STORAGE_KEY = 'wo_active_workflow';

interface WorkflowContextValue {
  workflows: WorkflowSummary[];
  activeWorkflowId: string | null;
  activeWorkflow: WorkflowSummary | null;
  setActiveWorkflowId: (id: string) => void;
  isLoading: boolean;
}

const WorkflowContext = createContext<WorkflowContextValue | null>(null);

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ['workflows', 'active'],
    queryFn: () => fetchWorkflows(true),
    enabled: isAuthenticated,
  });

  const [activeWorkflowId, setActiveWorkflowIdState] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY),
  );

  // Default to the first workflow once loaded, or reset if the stored id vanished.
  useEffect(() => {
    if (!workflows.length) return;
    const stillExists = activeWorkflowId && workflows.some((w) => w.id === activeWorkflowId);
    if (!stillExists) setActiveWorkflowIdState(workflows[0].id);
  }, [workflows, activeWorkflowId]);

  const setActiveWorkflowId = (id: string) => {
    setActiveWorkflowIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const value = useMemo<WorkflowContextValue>(() => {
    const activeWorkflow = workflows.find((w) => w.id === activeWorkflowId) ?? null;
    return { workflows, activeWorkflowId, activeWorkflow, setActiveWorkflowId, isLoading };
  }, [workflows, activeWorkflowId, isLoading]);

  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>;
}

export function useWorkflowContext(): WorkflowContextValue {
  const ctx = useContext(WorkflowContext);
  if (!ctx) throw new Error('useWorkflowContext must be used within a WorkflowProvider');
  return ctx;
}
