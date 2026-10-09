import { NavLink, Outlet } from 'react-router-dom';
import { PERMISSIONS } from '@repuestos/shared';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { BrandMark } from '@/components/BrandMark';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { PermissionGate } from '@/components/PermissionGate';
import { Button } from '@/components/ui/Button';
import { useCompanyBrand } from '@/hooks/useCompanyBrand';
import { cn } from '@/lib/cn';

export function Layout() {
  const { t } = useTranslation();
  const { profile, signOut } = useAuth();
  const brand = useCompanyBrand();

  const navItems = [
    { to: '/', label: t('nav.home'), end: true },
    { to: '/configuracion', label: t('nav.settings'), permission: PERMISSIONS.companySettingsView },
    { to: '/usuarios', label: t('nav.users'), permission: PERMISSIONS.usersManage },
    { to: '/contabilidad/plan', label: t('nav.chart'), permission: PERMISSIONS.accountingJournalView },
  ];

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <aside className="flex w-full flex-col border-b border-brand-navy bg-brand-navy text-white md:min-h-full md:w-64 md:border-b-0 md:border-r">
        <div className="border-b border-white/10 p-4">
          <BrandMark
            commercialName={brand.data?.commercialName}
            logoUrl={brand.data?.logoUrl}
            size="sm"
            theme="onDark"
          />
          <p className="mt-3 text-xs text-white/70">{profile?.full_name}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {navItems.map((item) => {
            const link = (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-3 py-2 text-sm font-medium text-white/85 hover:bg-white/10',
                    isActive && 'border-l-4 border-brand-accent bg-white/10 pl-2 text-white',
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
        <div className="space-y-3 border-t border-white/10 p-4">
          <LanguageSwitcher variant="dark" />
          <Button variant="secondary" className="w-full" onClick={() => void signOut()}>
            {t('nav.signOut')}
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
