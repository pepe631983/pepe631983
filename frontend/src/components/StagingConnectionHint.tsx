import { useTranslation } from 'react-i18next';
import { isSupabaseConfigured } from '@/lib/supabase';

/** Muestra el host de Supabase (público) — nunca credenciales PostgreSQL ni service role. */
export function StagingConnectionHint() {
  const { t } = useTranslation();
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!isSupabaseConfigured() || !url) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        {t('staging.missingEnv')}
      </p>
    );
  }
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    /* keep raw */
  }
  return (
    <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
      {t('staging.connectedHost')}: <span className="font-mono">{host}</span>
    </p>
  );
}
