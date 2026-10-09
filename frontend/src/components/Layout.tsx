import { NavLink, Outlet } from 'react-router-dom';
import { PERMISSIONS } from '@repuestos/shared';
import { useAuth } from '@/contexts/AuthContext';
import { PermissionGate } from '@/components/PermissionGate';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

const navItems = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/configuracion', label: 'Configuración', permission: PERMISSIONS.companySettingsView },
  { to: '/usuarios', label: 'Usuarios y roles', permission: PERMISSIONS.usersManage },
  { to: '/contabilidad/plan', label: 'Plan de cuentas', permission: PERMISSIONS.accountingJournalView },
];

export function Layout() {
  const { profile, signOut } = useAuth();

  return (
    <div className="flex min-h-full">
      <aside className="hidden w-64 flex-col border-r border-border bg-white p-4 md:flex">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wide text-slate-500">Repuestos ERP</p>
          <p className="font-semibold text-slate-900">{profile?.full_name}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const link = (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100',
                    isActive && 'bg-brand-50 text-brand-700',
                  )
                }
              >
                {item.label}
              </NavLink>
            );
            if (item.permission) {
              return (
                <PermissionGate key={item.to} permission={item.permission}>
                  {link}
                </PermissionGate>
              );
            }
            return link;
          })}
        </nav>
        <Button variant="secondary" onClick={() => void signOut()}>
          Cerrar sesión
        </Button>
      </aside>
      <main className="flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
