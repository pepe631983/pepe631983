import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export function LoginPage() {
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
      setError('Configure Supabase en el archivo .env.local (vea README.md).');
      return;
    }
    setSubmitting(true);
    const { error: signError } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (signError) {
      setError(signError.message);
      return;
    }
    navigate('/');
  }

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Iniciar sesión</h1>
        <p className="mt-1 text-sm text-slate-600">Sistema de repuestos e inventario contable</p>
        <form className="mt-6 space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <Input label="Correo electrónico" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Contraseña" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" className="w-full" loading={submitting}>
            Entrar
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-600">
          ¿Primera vez?{' '}
          <Link className="font-medium text-brand-700 hover:underline" to="/registro">
            Crear cuenta
          </Link>
        </p>
      </div>
    </div>
  );
}
