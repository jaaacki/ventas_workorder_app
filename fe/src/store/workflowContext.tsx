import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
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

  const [storedId, setStoredId] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));

  // Derive the effective active id during render (no effect): the stored choice when it
  // still exists, otherwise the first available workflow.
  const activeWorkflowId = useMemo(() => {
    if (storedId && workflows.some((w) => w.id === storedId)) return storedId;
    return workflows[0]?.id ?? null;
  }, [storedId, workflows]);

  const setActiveWorkflowId = (id: string) => {
    setStoredId(id);
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
