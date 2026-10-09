import { useTranslation } from 'react-i18next';
import { detectRuntime } from '@/lib/deviceFingerprint';

export function PwaInstallHint() {
  const { t } = useTranslation();
  const runtime = detectRuntime();

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <h2 className="font-semibold text-brand-navy">{t('pwa.title')}</h2>
      <p className="mt-1">{t('pwa.notNative')}</p>
      <ul className="mt-2 list-disc pl-5">
        <li>{t('pwa.limitUsb')}</li>
        <li>{t('pwa.limitBt')}</li>
        <li>{t('pwa.usePdf')}</li>
      </ul>
      <p className="mt-2 text-xs">
        {t('pwa.runtime')}: <strong>{runtime}</strong> — {t('pwa.installHint')}
      </p>
    </section>
  );
}
