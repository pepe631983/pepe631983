import { APP_NAME } from '@repuestos/shared';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';

type Props = {
  commercialName?: string | null;
  logoUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  theme?: 'onDark' | 'onLight';
  showTagline?: boolean;
};

export function BrandMark({
  commercialName,
  logoUrl,
  size = 'md',
  theme = 'onDark',
  showTagline = false,
}: Props) {
  const { t } = useTranslation();
  const displayName = commercialName?.trim() || t('app.name') || APP_NAME;
  const titleClass = cn(
    'font-bold tracking-tight',
    size === 'lg' && 'text-2xl',
    size === 'md' && 'text-lg',
    size === 'sm' && 'text-base',
    theme === 'onDark' ? 'text-white' : 'text-brand-navy',
  );

  return (
    <div className="flex items-center gap-3">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={displayName}
          className={cn('object-contain', size === 'lg' ? 'h-14 w-14' : 'h-10 w-10')}
        />
      ) : (
        <div
          className={cn(
            'flex items-center justify-center rounded-lg font-bold',
            size === 'lg' ? 'h-14 w-14 text-lg' : 'h-10 w-10 text-sm',
            theme === 'onDark' ? 'bg-brand-accent text-white' : 'bg-brand-navy text-white',
          )}
          aria-hidden
        >
          TCI
        </div>
      )}
      <div>
        <p className={titleClass}>{displayName}</p>
        {showTagline ? (
          <p className={cn('text-xs', theme === 'onDark' ? 'text-white/75' : 'text-slate-600')}>
            {t('app.tagline')}
          </p>
        ) : null}
      </div>
    </div>
  );
}
