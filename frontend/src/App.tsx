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
import { ReconciliationPage } from '@/pages/ReconciliationPage';
import { SuppliersPage } from '@/pages/SuppliersPage';
import { GoodsReceiptPage } from '@/pages/GoodsReceiptPage';
import { SupplierInvoicePage } from '@/pages/SupplierInvoicePage';
import { CustomersPage } from '@/pages/CustomersPage';
import { CustomerPaymentsPage } from '@/pages/CustomerPaymentsPage';
import { CashPage } from '@/pages/CashPage';
import { SalesReturnsPage } from '@/pages/SalesReturnsPage';
import { TaxRatesPage } from '@/pages/TaxRatesPage';
import { AccountingPeriodsPage } from '@/pages/AccountingPeriodsPage';
import { QuotesPage } from '@/pages/QuotesPage';
import { PublicQuotePage } from '@/pages/PublicQuotePage';
import { InventoryConsultPage } from '@/pages/InventoryConsultPage';
import { CustomerDetailPage } from '@/pages/CustomerDetailPage';
import { JoinCompanyPage } from '@/pages/JoinCompanyPage';
import { DataExportPage } from '@/pages/DataExportPage';

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
            <Route path="/c/:token" element={<PublicQuotePage />} />
            <Route path="/unirse/:token" element={<JoinCompanyPage />} />
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
              <Route path="contabilidad/conciliacion" element={<ReconciliationPage />} />
              <Route path="impresion" element={<PrintingPage />} />
              <Route path="pos" element={<PosPage />} />
              <Route path="inventario/alta" element={<InventoryPage />} />
              <Route path="compras/proveedores" element={<SuppliersPage />} />
              <Route path="compras/recepciones" element={<GoodsReceiptPage />} />
              <Route path="compras/facturas-proveedor" element={<SupplierInvoicePage />} />
              <Route path="ventas/cotizaciones" element={<QuotesPage />} />
              <Route path="ventas/clientes" element={<CustomersPage />} />
              <Route path="ventas/clientes/:customerId" element={<CustomerDetailPage />} />
              <Route path="configuracion/exportacion" element={<DataExportPage />} />
              <Route path="inventario/consulta" element={<InventoryConsultPage />} />
              <Route path="ventas/cobros" element={<CustomerPaymentsPage />} />
              <Route path="ventas/devoluciones" element={<SalesReturnsPage />} />
              <Route path="tesoreria/caja" element={<CashPage />} />
              <Route path="configuracion/impuestos" element={<TaxRatesPage />} />
              <Route path="contabilidad/periodos" element={<AccountingPeriodsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
