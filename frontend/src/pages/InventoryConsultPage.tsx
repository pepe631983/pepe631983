import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PERMISSIONS } from '@repuestos/shared';
import { Input } from '@/components/ui/Input';
import { PermissionGate } from '@/components/PermissionGate';
import { usePermission } from '@/hooks/usePermissions';
import { supabase } from '@/lib/supabase';

export function InventoryConsultPage() {
  const canViewCost = usePermission(PERMISSIONS.costView);
  const [q, setQ] = useState('');
  const [submitted, setSubmitted] = useState('');

  const search = useQuery({
    queryKey: ['inventory-search', submitted],
    enabled: submitted.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_inventory_availability', {
        p_query: submitted,
        p_warehouse_id: null,
      });
      if (error) throw error;
      return data as { items: Array<Record<string, unknown>> };
    },
  });

  return (
    <PermissionGate permission={PERMISSIONS.inventoryConsult}>
      <div className="mx-auto max-w-4xl space-y-4">
        <h1 className="text-2xl font-semibold text-brand-navy">Consulta de inventario</h1>
        <p className="text-sm text-slate-600">
          Existencia física, reservada (cotizaciones enviadas/aceptadas) y disponible por almacén. Costos solo con permiso cost.view.
        </p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(q.trim());
          }}
        >
          <Input
            label="Buscar (nombre, código, OEM, vehículo)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1"
          />
          <button type="submit" className="self-end rounded-lg bg-brand-navy px-4 py-2 text-sm text-white">
            Buscar
          </button>
        </form>
        {search.error ? <p className="text-sm text-red-600">{(search.error as Error).message}</p> : null}
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">OEM</th>
                <th className="px-3 py-2">Almacén</th>
                <th className="px-3 py-2 text-right">Físico</th>
                <th className="px-3 py-2 text-right">Reservado</th>
                <th className="px-3 py-2 text-right">Disponible</th>
                {canViewCost ? <th className="px-3 py-2 text-right">Costo prom.</th> : null}
              </tr>
            </thead>
            <tbody>
              {(search.data?.items ?? []).map((row, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2">{String(row.internal_code)}</td>
                  <td className="px-3 py-2">{String(row.name)}</td>
                  <td className="px-3 py-2">{String(row.oem_reference ?? '—')}</td>
                  <td className="px-3 py-2">{String(row.warehouse_name)}</td>
                  <td className="px-3 py-2 text-right">{String(row.on_hand)}</td>
                  <td className="px-3 py-2 text-right">{String(row.reserved)}</td>
                  <td className="px-3 py-2 text-right font-medium">{String(row.available)}</td>
                  {canViewCost ? (
                    <td className="px-3 py-2 text-right">{row.avg_unit_cost != null ? String(row.avg_unit_cost) : '—'}</td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PermissionGate>
  );
}
