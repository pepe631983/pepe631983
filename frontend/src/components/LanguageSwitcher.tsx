import { useTranslation } from 'react-i18next';
import type { AppLocale } from '@repuestos/shared';
import { setAppLocale } from '@/i18n';
import { cn } from '@/lib/cn';

type Props = {
  className?: string;
  variant?: 'light' | 'dark';
};

export function LanguageSwitcher({ className, variant = 'dark' }: Props) {
  const { i18n, t } = useTranslation();
  const current = (i18n.language === 'en' ? 'en' : 'es') as AppLocale;

  return (
    <div className={cn('flex items-center gap-2 text-xs', className)}>
      <span className={variant === 'dark' ? 'text-white/70' : 'text-slate-500'}>{t('language.label')}:</span>
      {(['es', 'en'] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setAppLocale(code)}
          className={cn(
            'rounded px-2 py-1 font-medium transition',
            variant === 'dark'
              ? current === code
                ? 'bg-brand-accent text-white'
                : 'text-white/80 hover:bg-white/10'
              : current === code
                ? 'bg-brand-navy text-white'
                : 'text-slate-600 hover:bg-slate-100',
          )}
        >
          {t(`language.${code}`)}
        </button>
      ))}
    </div>
  );
}
