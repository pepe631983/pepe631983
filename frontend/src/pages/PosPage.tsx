import { useTranslation } from 'react-i18next';
import { PERMISSIONS } from '@repuestos/shared';
import { PosTerminal } from '@/components/PosTerminal';
import { PermissionGate } from '@/components/PermissionGate';

export function PosPage() {
  const { t } = useTranslation();
  sessionStorage.setItem('tci-pos-session-active', '1');

  return (
    <PermissionGate permission={PERMISSIONS.salesPos}>
      <div className="mx-auto max-w-5xl space-y-4">
        <h1 className="text-2xl font-semibold text-brand-navy">{t('pos.title')}</h1>
        <PosTerminal showHeader={false} />
      </div>
    </PermissionGate>
  );
}
