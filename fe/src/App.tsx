import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './components/AuthProvider';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { ProtectedRoute } from './components/ProtectedRoute';
import DashboardLayout from './components/layout/DashboardLayout';
import LoginPage from './pages/LoginPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import DashboardHome from './pages/DashboardHome';
import UsersRolesPage from './pages/UsersRolesPage';
import WorkflowsPage from './pages/WorkflowsPage';
import MasterDataPage from './pages/MasterDataPage';
import WorkOrdersPage from './pages/WorkOrdersPage';
import WorkOrderDetailPage from './pages/WorkOrderDetailPage';
import MyQueuePage from './pages/MyQueuePage';
import QaQueuePage from './pages/QaQueuePage';
import QuarantinePage from './pages/QuarantinePage';
import ProcurementPage from './pages/ProcurementPage';
import CollectionUnitDetailPage from './pages/CollectionUnitDetailPage';
import HetDetailPage from './pages/HetDetailPage';
import InventoryPage from './pages/InventoryPage';
import InventoryLotDetailPage from './pages/InventoryLotDetailPage';
import LotsPage from './pages/LotsPage';
import LotBatchRecordPage from './pages/LotBatchRecordPage';
import TraceabilityPage from './pages/TraceabilityPage';
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
                  <UsersRolesPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route path="/dashboard/roles" element={<Navigate to="/dashboard/users" replace />} />
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
            path="/dashboard/master-data"
            element={
              <ProtectedRoute roles={['owner', 'admin']}>
                <DashboardLayout>
                  <MasterDataPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/work-orders/:id"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <WorkOrderDetailPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/work-orders"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <WorkOrdersPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/my-queue"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <MyQueuePage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/qa"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <QaQueuePage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/quarantine"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <QuarantinePage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/procurement/collection-units/:id"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <CollectionUnitDetailPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/hets/:id"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <HetDetailPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/procurement"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <ProcurementPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/inventory/lots/:id"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <InventoryLotDetailPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/inventory"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <InventoryPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/lots/:lotNumber"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <LotBatchRecordPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/lots"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <LotsPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/traceability"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <TraceabilityPage />
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
