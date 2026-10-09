import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

export function JoinCompanyPage() {
  const { token } = useParams<{ token: string }>();
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || !session || !token) return;
    void (async () => {
      setBusy(true);
      const { error } = await supabase.rpc('redeem_company_invitation', { p_token: token });
      setBusy(false);
      if (error) {
        setMsg(error.message);
        return;
      }
      setMsg('Invitación aceptada. Redirigiendo…');
      window.setTimeout(() => navigate('/', { replace: true }), 1200);
    })();
  }, [loading, session, token, navigate]);

  if (loading) {
    return <p className="p-8 text-center text-slate-600">Cargando sesión…</p>;
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-md space-y-4 p-8 text-center">
        <h1 className="text-xl font-semibold text-brand-navy">Unirse a la empresa</h1>
        <p className="text-sm text-slate-600">
          Inicie sesión con el correo al que le llegó la invitación. Luego volveremos a esta página para activar su acceso.
        </p>
        <Link
          to={`/login?next=${encodeURIComponent(`/unirse/${token ?? ''}`)}`}
          className="inline-flex rounded-lg bg-brand-navy px-4 py-2 text-sm text-white"
        >
          Iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-8 text-center">
      <h1 className="text-xl font-semibold text-brand-navy">Unirse a la empresa</h1>
      {busy ? <p className="text-sm text-slate-600">Validando invitación…</p> : null}
      {msg ? <p className="text-sm">{msg}</p> : null}
      {!busy && !msg ? (
        <Button onClick={() => navigate('/')}>Ir al inicio</Button>
      ) : null}
    </div>
  );
}
