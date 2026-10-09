import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export function ChartOfAccountsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['chart-of-accounts'],
    queryFn: async () => {
      const { data: rows, error: qError } = await supabase
        .from('chart_of_accounts')
        .select('code, name, account_type, is_postable, is_system')
        .order('code');
      if (qError) throw qError;
      return rows;
    },
  });

  if (isLoading) return <p>Cargando plan de cuentas…</p>;
  if (error) return <p className="text-red-600">No tiene permiso o hubo un error al cargar.</p>;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Plan de cuentas</h1>
      <p className="mt-1 text-sm text-slate-600">
        Plantilla inicial. Los asientos automáticos se activan en la Etapa 2 (motor contable).
      </p>
      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Tipo</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((row) => (
              <tr key={row.code} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono">{row.code}</td>
                <td className="px-3 py-2">{row.name}</td>
                <td className="px-3 py-2 text-slate-500">{row.account_type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
