import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { Layout } from '@/components/Layout';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { CompanySetupPage } from '@/pages/CompanySetupPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { UsersRolesPage } from '@/pages/UsersRolesPage';
import { ChartOfAccountsPage } from '@/pages/ChartOfAccountsPage';
import { PrintingPage } from '@/pages/PrintingPage';
import { PrintQueueRecoveryBanner } from '@/components/PrintQueueRecoveryBanner';
import { PwaUpdatePrompt } from '@/components/PwaUpdatePrompt';
import { PosPage } from '@/pages/PosPage';
import { InventoryPage } from '@/pages/InventoryPage';

const queryClient = new QueryClient();

function Protected({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { session, profile, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center text-slate-600">
        {t('common.loadingSession')}
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  if (!profile) return <Navigate to="/registro-empresa" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <PwaUpdatePrompt />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/registro" element={<RegisterPage />} />
            <Route path="/registro-empresa" element={<CompanySetupPage />} />
            <Route
              element={
                <Protected>
                  <Layout />
                </Protected>
              }
            >
              <Route
                index
                element={
                  <>
                    <PrintQueueRecoveryBanner />
                    <DashboardPage />
                  </>
                }
              />
              <Route path="configuracion" element={<SettingsPage />} />
              <Route path="usuarios" element={<UsersRolesPage />} />
              <Route path="contabilidad/plan" element={<ChartOfAccountsPage />} />
              <Route path="impresion" element={<PrintingPage />} />
              <Route path="pos" element={<PosPage />} />
              <Route path="inventario/alta" element={<InventoryPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
