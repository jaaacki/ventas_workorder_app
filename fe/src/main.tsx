import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import App from './App';
import { WorkflowProvider } from './store/workflowContext';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    // staleTime keeps in-session navigation (Board → detail → back) from refetching the
    // heavy work-order list on every mount; gcTime keeps it cached a little longer.
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000, gcTime: 5 * 60_000 },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <WorkflowProvider>
          <BrowserRouter>
            <App />
            <Toaster position="top-right" />
          </BrowserRouter>
        </WorkflowProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>
);
