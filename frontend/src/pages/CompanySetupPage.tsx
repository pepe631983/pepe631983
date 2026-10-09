import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { createCompanySchema } from '@repuestos/shared';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { supabase } from '@/lib/supabase';

export function CompanySetupPage() {
  const navigate = useNavigate();
  const { session, profile, refreshProfile, loading } = useAuth();
  const [commercialName, setCommercialName] = useState('');
  const [fullName, setFullName] = useState('');
  const [isDemo, setIsDemo] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && !session) return <Navigate to="/login" replace />;
  if (!loading && profile) return <Navigate to="/" replace />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = createCompanySchema.safeParse({
      commercialName,
      fullName,
      isDemo,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }
    setSubmitting(true);
    const { data, error: rpcError } = await supabase.rpc('create_company_with_owner', {
      p_commercial_name: parsed.data.commercialName,
      p_full_name: parsed.data.fullName,
      p_country_code: parsed.data.countryCode,
      p_timezone: parsed.data.timezone,
      p_currency_code: parsed.data.currencyCode,
      p_is_demo: parsed.data.isDemo,
    });
    setSubmitting(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    if (!data) {
      setError('No se recibió confirmación del servidor. Verifique en configuración antes de reintentar.');
      return;
    }
    await refreshProfile();
    navigate('/');
  }

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Registrar empresa</h1>
        <p className="mt-2 text-sm text-slate-600">
          Esta operación crea sucursal, almacén, plan de cuentas base, roles y series de documentos.
          Marque &quot;modo demostración&quot; hasta completar pruebas; no use datos reales de clientes aún.
        </p>
        <form className="mt-6 space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <Input label="Nombre comercial" required value={commercialName} onChange={(e) => setCommercialName(e.target.value)} />
          <Input label="Su nombre completo" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isDemo} onChange={(e) => setIsDemo(e.target.checked)} />
            Empresa en modo demostración (recomendado al inicio)
          </label>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" className="w-full" loading={submitting}>
            Crear empresa y continuar
          </Button>
        </form>
      </div>
    </div>
  );
}
