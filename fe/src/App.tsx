import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './components/AuthProvider';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { ProtectedRoute } from './components/ProtectedRoute';
import DashboardLayout from './components/layout/DashboardLayout';
import LoginPage from './pages/LoginPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import DashboardHome from './pages/DashboardHome';
import UsersPage from './pages/UsersPage';
import RolesPage from './pages/RolesPage';
import WorkflowsPage from './pages/WorkflowsPage';
import WorkOrdersPage from './pages/WorkOrdersPage';
import ProcurementPage from './pages/ProcurementPage';
import NotFoundPage from './pages/NotFoundPage';

function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <DashboardHome />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/users"
            element={
              <ProtectedRoute roles={['owner', 'admin']}>
                <DashboardLayout>
                  <UsersPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/roles"
            element={
              <ProtectedRoute roles={['owner']}>
                <DashboardLayout>
                  <RolesPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/workflows"
            element={
              <ProtectedRoute roles={['owner', 'admin']}>
                <DashboardLayout>
                  <WorkflowsPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/work-orders"
            element={
              <ProtectedRoute roles={['owner', 'admin', 'user']}>
                <DashboardLayout>
                  <WorkOrdersPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/procurement"
            element={
              <ProtectedRoute roles={['owner', 'admin', 'user']}>
                <DashboardLayout>
                  <ProcurementPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </AppErrorBoundary>
  );
}

export default App;
