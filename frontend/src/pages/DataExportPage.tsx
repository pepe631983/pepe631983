import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { PERMISSIONS } from '@repuestos/shared';
import { Button } from '@/components/ui/Button';
import { PermissionGate } from '@/components/PermissionGate';
import { supabase } from '@/lib/supabase';

type ExportBundle = {
  schema_version: string;
  exported_at: string;
  control_totals: Record<string, number>;
  json_snapshot: unknown;
  csv: { products?: string; customers?: string };
  attachments_note?: string;
};

export function DataExportPage() {
  const [msg, setMsg] = useState<string | null>(null);

  const exportBundle = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('export_company_bundle');
      if (error) throw error;
      return data as ExportBundle;
    },
    onSuccess: (bundle) => {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const jsonBlob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const jsonUrl = URL.createObjectURL(jsonBlob);
      const a = document.createElement('a');
      a.href = jsonUrl;
      a.download = `tci-export-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(jsonUrl);

      if (bundle.csv?.products) {
        const csvP = new Blob(['id,internal_code,name,sale_price\n' + bundle.csv.products], { type: 'text/csv' });
        const u = URL.createObjectURL(csvP);
        const link = document.createElement('a');
        link.href = u;
        link.download = `productos-${stamp}.csv`;
        link.click();
        URL.revokeObjectURL(u);
      }
      if (bundle.csv?.customers) {
        const csvC = new Blob(['id,name,email,phone\n' + bundle.csv.customers], { type: 'text/csv' });
        const u = URL.createObjectURL(csvC);
        const link = document.createElement('a');
        link.href = u;
        link.download = `clientes-${stamp}.csv`;
        link.click();
        URL.revokeObjectURL(u);
      }
      setMsg(
        `Exportación lista. Totales de control: ${Object.entries(bundle.control_totals)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ')}. No incluye credenciales ni tablas de auth.`,
      );
    },
    onError: (e: Error) => setMsg(e.message),
  });

  return (
    <PermissionGate permission={PERMISSIONS.dataExport}>
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold text-brand-navy">Exportación de datos</h1>
        <p className="text-sm text-slate-600">
          Descarga JSON con relaciones y totales de control, más CSV de productos y clientes. Requiere permiso{' '}
          <code className="text-xs">data.export</code>. Sin secretos ni usuarios de autenticación.
        </p>
        <Button loading={exportBundle.isPending} onClick={() => exportBundle.mutate()}>
          Generar exportación (JSON + CSV)
        </Button>
        {msg ? <p className="rounded-lg border bg-slate-50 p-3 text-sm">{msg}</p> : null}
      </div>
    </PermissionGate>
  );
}
