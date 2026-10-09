import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthShell } from '@/components/AuthShell';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session, profile, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && session && profile) return <Navigate to="/" replace />;
  if (!loading && session && !profile) return <Navigate to="/registro-empresa" replace />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isSupabaseConfigured()) {
      setError(t('auth.supabaseMissing'));
      return;
    }
    setSubmitting(true);
    const { error: signError } = await supabase.auth.signUp({ email, password });
    setSubmitting(false);
    if (signError) {
      setError(signError.message);
      return;
    }
    navigate('/registro-empresa');
  }

  return (
    <AuthShell>
      <div className="w-full max-w-md rounded-2xl border border-border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-brand-navy">{t('auth.registerTitle')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('auth.registerHint')}</p>
        <form className="mt-6 space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <Input label={t('auth.email')} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label={t('auth.passwordHint')} type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" className="w-full" loading={submitting}>
            {t('auth.submitRegister')}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm">
          <Link className="text-brand-accent hover:underline" to="/login">
            {t('auth.haveAccount')}
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
