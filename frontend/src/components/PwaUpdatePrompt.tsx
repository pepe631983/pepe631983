import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';

type UpdateSW = (reloadPage?: boolean) => Promise<void>;

export function PwaUpdatePrompt() {
  const { t } = useTranslation();
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updateSW, setUpdateSW] = useState<UpdateSW | null>(null);

  useEffect(() => {
    void import('virtual:pwa-register')
      .then(({ registerSW }) => {
        const update = registerSW({
          immediate: true,
          onNeedRefresh() {
            setNeedRefresh(true);
          },
        });
        setUpdateSW(() => update);
      })
      .catch(() => undefined);
  }, []);

  if (!needRefresh) return null;

  const posActive = sessionStorage.getItem('tci-pos-session-active') === '1';

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-lg rounded-xl border border-brand-navy bg-white p-4 shadow-lg md:left-auto">
      <p className="text-sm text-slate-700">{t('pwa.updateAvailable')}</p>
      {posActive ? (
        <p className="mt-1 text-xs text-amber-800">{t('pwa.updateDeferredPos')}</p>
      ) : (
        <Button
          className="mt-2"
          onClick={() => {
            void updateSW?.(true);
          }}
        >
          {t('pwa.updateNow')}
        </Button>
      )}
    </div>
  );
}
