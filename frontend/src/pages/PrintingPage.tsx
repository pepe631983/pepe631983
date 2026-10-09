import { useMemo, useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  PERMISSIONS,
  PRINT_ADAPTERS,
  buildPrintTestDocument,
  updatePrintProfileSchema,
  type PrintAdapterId,
  type PrintFunction,
  type PrintProfile,
  type PrintProfileKey,
  PRINT_PROFILE_KEYS,
} from '@repuestos/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PermissionGate } from '@/components/PermissionGate';
import { PwaInstallHint } from '@/components/PwaInstallHint';
import { PrintQueueRecoveryBanner } from '@/components/PrintQueueRecoveryBanner';
import { useCompanyBrand } from '@/hooks/useCompanyBrand';
import { detectPlatformLabel, getDeviceFingerprint } from '@/lib/deviceFingerprint';
import { supabase } from '@/lib/supabase';
import { listElectronPrinters } from '@/print/adapters/electronAdapter';
import { buildPreviewHtml } from '@/print/printOrchestrator';
import { enqueueAndProcessPrint, profileKeyForFunction } from '@/print/printQueueService';

type DbProfile = {
  id: string;
  profile_key: PrintProfileKey;
  paper_format: 'letter' | 'a4';
  use_thermal: boolean;
  thermal_width: '58mm' | '80mm' | null;
  margin_top_mm: number;
  margin_right_mm: number;
  margin_bottom_mm: number;
  margin_left_mm: number;
  default_copies: number;
  content_options: Record<string, unknown>;
};

function mapProfile(row: DbProfile): PrintProfile {
  return {
    profileKey: row.profile_key,
    paperFormat: row.paper_format,
    useThermal: row.use_thermal,
    thermalWidth: row.thermal_width,
    marginTopMm: Number(row.margin_top_mm),
    marginRightMm: Number(row.margin_right_mm),
    marginBottomMm: Number(row.margin_bottom_mm),
    marginLeftMm: Number(row.margin_left_mm),
    defaultCopies: row.default_copies,
    contentOptions: row.content_options as PrintProfile['contentOptions'],
  };
}

export function PrintingPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const brandQuery = useCompanyBrand();
  const [selectedKey, setSelectedKey] = useState<PrintProfileKey>('sales_invoice');
  const [previewCopy, setPreviewCopy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [printFunction, setPrintFunction] = useState<PrintFunction>('ticket');
  const [adapterId, setAdapterId] = useState<PrintAdapterId>('web_system');
  const [printerName, setPrinterName] = useState('');
  const [electronPrinters, setElectronPrinters] = useState<Array<{ name: string; isDefault: boolean }>>([]);
  const [matrixDisclaimer, setMatrixDisclaimer] = useState('');
  const [matrixEntries, setMatrixEntries] = useState<Array<{ platform: string; deployment: string; printPath: string; status: string }>>([]);

  useEffect(() => {
    void fetch('/compatibility-matrix.json')
      .then((r) => r.json())
      .then((j) => {
        setMatrixDisclaimer(String(j.disclaimer ?? ''));
        setMatrixEntries(Array.isArray(j.entries) ? j.entries.slice(0, 4) : []);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setSelectedKey(profileKeyForFunction(printFunction) as PrintProfileKey);
  }, [printFunction]);

  const profilesQuery = useQuery({
    queryKey: ['print-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('print_profiles').select('*').order('profile_key');
      if (error) throw error;
      return data as DbProfile[];
    },
  });

  const jobsQuery = useQuery({
    queryKey: ['print-jobs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('print_jobs')
        .select('id, profile_key, channel, status, is_reprint, is_marked_copy, error_message, created_at')
        .order('created_at', { ascending: false })
        .limit(15);
      if (error) throw error;
      return data;
    },
  });

  const selectedKeyFromFunction = profileKeyForFunction(printFunction) as PrintProfileKey;
  const selectedRow =
    profilesQuery.data?.find((p) => p.profile_key === selectedKeyFromFunction) ??
    profilesQuery.data?.find((p) => p.profile_key === selectedKey);
  const selectedProfile = selectedRow ? mapProfile(selectedRow) : null;

  useQuery({
    queryKey: ['electron-printers'],
    queryFn: async () => {
      const list = await listElectronPrinters();
      setElectronPrinters(list);
      const def = list.find((p) => p.isDefault);
      if (def && !printerName) setPrinterName(def.name);
      return list;
    },
  });

  const locale = i18n.language === 'en' ? 'en' : 'es';
  const previewHtml = useMemo(() => {
    if (!selectedProfile || !brandQuery.data) return '';
    return buildPreviewHtml(
      {
        profile: selectedProfile,
        brand: brandQuery.data,
        document: buildPrintTestDocument(locale),
      },
      { isMarkedCopy: previewCopy },
    );
  }, [selectedProfile, brandQuery.data, locale, previewCopy]);

  const saveProfile = useMutation({
    mutationFn: async (draft: DbProfile) => {
      const parsed = updatePrintProfileSchema.parse({
        profileKey: draft.profile_key,
        paperFormat: draft.paper_format,
        useThermal: draft.use_thermal,
        thermalWidth: draft.thermal_width,
        marginTopMm: Number(draft.margin_top_mm),
        marginRightMm: Number(draft.margin_right_mm),
        marginBottomMm: Number(draft.margin_bottom_mm),
        marginLeftMm: Number(draft.margin_left_mm),
        defaultCopies: draft.default_copies,
        contentOptions: draft.content_options,
      });
      const { error } = await supabase
        .from('print_profiles')
        .update({
          paper_format: parsed.paperFormat,
          use_thermal: parsed.useThermal,
          thermal_width: parsed.thermalWidth,
          margin_top_mm: parsed.marginTopMm,
          margin_right_mm: parsed.marginRightMm,
          margin_bottom_mm: parsed.marginBottomMm,
          margin_left_mm: parsed.marginLeftMm,
          default_copies: parsed.defaultCopies,
          content_options: parsed.contentOptions,
        })
        .eq('id', draft.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['print-profiles'] }),
  });

  const saveBinding = useMutation({
    mutationFn: async () => {
      const { data: company, error: companyError } = await supabase.from('companies').select('id').single();
      if (companyError || !company) throw companyError ?? new Error('Sin empresa');
      const fingerprint = getDeviceFingerprint();
      const { error } = await supabase.from('print_device_bindings').upsert(
        {
          company_id: company.id,
          device_fingerprint: fingerprint,
          device_label: `${detectPlatformLabel()} — ${fingerprint.slice(0, 8)}`,
          print_function: printFunction,
          adapter: adapterId,
          printer_name: printerName || null,
          paper_hint: selectedProfile?.useThermal
            ? selectedProfile.thermalWidth
            : selectedProfile?.paperFormat ?? null,
        },
        { onConflict: 'company_id,device_fingerprint,print_function' },
      );
      if (error) throw error;
    },
  });

  async function runPrint(opts?: { reprint?: boolean; forceAdapter?: PrintAdapterId }) {
    if (!selectedProfile || !brandQuery.data) return;
    setStatusMsg(null);
    setBusy(true);
    const chosen = opts?.forceAdapter ?? adapterId;
    try {
      await saveBinding.mutateAsync();
      const result = await enqueueAndProcessPrint({
        profile: selectedProfile,
        brand: brandQuery.data,
        document: buildPrintTestDocument(locale),
        adapterId: chosen,
        printFunction,
        printerName: printerName || null,
        paperHint: selectedProfile.useThermal
          ? selectedProfile.thermalWidth
          : selectedProfile.paperFormat,
        isReprint: opts?.reprint,
        isMarkedCopy: opts?.reprint ?? previewCopy,
        sourceDocumentType: 'print_test',
      });
      const key =
        result.status === 'completed'
          ? 'printing.statusCompleted'
          : result.status === 'sent_to_spooler'
            ? 'printing.statusSpooler'
            : result.status === 'uncertain'
              ? 'printing.statusUnknown'
              : result.status === 'failed'
                ? 'printing.statusFailed'
                : 'printing.statusSpooler';
      setStatusMsg(t(key));
      await qc.invalidateQueries({ queryKey: ['print-jobs'] });
      await qc.invalidateQueries({ queryKey: ['print-recoverable'] });
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : t('printing.statusFailed'));
    } finally {
      setBusy(false);
    }
  }

  if (profilesQuery.isLoading) return <p>{t('printing.loading')}</p>;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PrintQueueRecoveryBanner />
      <header>
        <h1 className="text-2xl font-semibold text-brand-navy">{t('printing.title')}</h1>
        <p className="text-sm text-slate-600">{t('printing.subtitle')}</p>
      </header>

      <PwaInstallHint />

      <section className="rounded-xl border border-border bg-white p-4 text-sm">
        <h2 className="font-medium text-brand-navy">{t('printing.deviceSetupTitle')}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            {t('printing.function')}
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={printFunction}
              onChange={(e) => setPrintFunction(e.target.value as PrintFunction)}
            >
              <option value="ticket">{t('printing.functionTicket')}</option>
              <option value="invoice">{t('printing.functionInvoice')}</option>
              <option value="report">{t('printing.functionReport')}</option>
            </select>
          </label>
          <label className="text-sm">
            {t('printing.adapter')}
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={adapterId}
              onChange={(e) => setAdapterId(e.target.value as PrintAdapterId)}
            >
              {Object.values(PRINT_ADAPTERS).map((a) => (
                <option key={a.id} value={a.id}>
                  {i18n.language === 'en' ? a.labelEn : a.labelEs}
                </option>
              ))}
            </select>
          </label>
        </div>
        {adapterId === 'electron_direct' ? (
          <label className="mt-3 block text-sm">
            {t('printing.printerName')}
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={printerName}
              onChange={(e) => setPrinterName(e.target.value)}
            >
              {electronPrinters.length === 0 ? (
                <option value="">{t('printing.noPrintersDetected')}</option>
              ) : (
                electronPrinters.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                    {p.isDefault ? ' (default)' : ''}
                  </option>
                ))
              )}
            </select>
            <p className="mt-1 text-xs text-slate-500">{t('printing.instructions.electron')}</p>
          </label>
        ) : null}
        {adapterId === 'rawbt_android' ? (
          <p className="mt-2 text-xs text-amber-800">{t('printing.instructions.rawbt')}</p>
        ) : null}
        {adapterId === 'web_system' || adapterId === 'airprint_via_system' ? (
          <p className="mt-2 text-xs text-slate-500">{t('printing.instructions.webSystem')}</p>
        ) : null}
      </section>

      <section className="rounded-xl border border-border bg-white p-4 text-sm text-slate-700">
        <h2 className="font-medium text-brand-navy">{t('printing.platformTitle')}</h2>
        <p className="mt-1 text-xs">{matrixDisclaimer}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {matrixEntries.map((e) => (
            <li key={`${e.platform}-${e.deployment}`}>
              {e.platform}: {e.printPath} ({e.status})
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4 rounded-xl border border-border bg-white p-4">
          <h2 className="font-medium text-brand-navy">{t('printing.profiles')}</h2>
          <label className="block text-sm">
            <span className="font-medium">{t('printing.documentType')}</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value as PrintProfileKey)}
            >
              {PRINT_PROFILE_KEYS.map((key) => (
                <option key={key} value={key}>
                  {t(`printing.profile.${key}`)}
                </option>
              ))}
            </select>
          </label>

          {selectedRow ? (
            <PermissionGate permission={PERMISSIONS.printConfigure}>
              <div className="space-y-3 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedRow.use_thermal}
                    onChange={(e) =>
                      saveProfile.mutate({
                        ...selectedRow,
                        use_thermal: e.target.checked,
                        thermal_width: e.target.checked ? selectedRow.thermal_width ?? '80mm' : null,
                      })
                    }
                  />
                  {t('printing.useThermal')}
                </label>
                {selectedRow.use_thermal ? (
                  <select
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                    value={selectedRow.thermal_width ?? '80mm'}
                    onChange={(e) =>
                      saveProfile.mutate({
                        ...selectedRow,
                        thermal_width: e.target.value as '58mm' | '80mm',
                      })
                    }
                  >
                    <option value="58mm">58 mm</option>
                    <option value="80mm">80 mm</option>
                  </select>
                ) : (
                  <select
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                    value={selectedRow.paper_format}
                    onChange={(e) =>
                      saveProfile.mutate({
                        ...selectedRow,
                        paper_format: e.target.value as 'letter' | 'a4',
                      })
                    }
                  >
                    <option value="letter">{t('printing.paperLetter')}</option>
                    <option value="a4">{t('printing.paperA4')}</option>
                  </select>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    label={t('printing.marginTop')}
                    type="number"
                    value={String(selectedRow.margin_top_mm)}
                    onChange={(e) =>
                      saveProfile.mutate({ ...selectedRow, margin_top_mm: Number(e.target.value) })
                    }
                  />
                  <Input
                    label={t('printing.marginLeft')}
                    type="number"
                    value={String(selectedRow.margin_left_mm)}
                    onChange={(e) =>
                      saveProfile.mutate({ ...selectedRow, margin_left_mm: Number(e.target.value) })
                    }
                  />
                </div>
                <Input
                  label={t('printing.copies')}
                  type="number"
                  min={1}
                  max={10}
                  value={String(selectedRow.default_copies)}
                  onChange={(e) =>
                    saveProfile.mutate({ ...selectedRow, default_copies: Number(e.target.value) })
                  }
                />
                <Input
                  label={t('printing.footerText')}
                  value={String((selectedRow.content_options as { footerText?: string }).footerText ?? '')}
                  onChange={(e) =>
                    saveProfile.mutate({
                      ...selectedRow,
                      content_options: { ...selectedRow.content_options, footerText: e.target.value },
                    })
                  }
                />
              </div>
            </PermissionGate>
          ) : null}

          <PermissionGate permission={PERMISSIONS.printExecute}>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button loading={busy} onClick={() => void runPrint()}>
                {t('printing.testPrint')}
              </Button>
              <Button variant="secondary" loading={busy} onClick={() => void runPrint({ forceAdapter: 'web_pdf' })}>
                {t('printing.downloadPdf')}
              </Button>
              <Button variant="secondary" loading={busy} onClick={() => void runPrint({ reprint: true })}>
                {t('printing.reprintCopy')}
              </Button>
            </div>
          </PermissionGate>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={previewCopy} onChange={(e) => setPreviewCopy(e.target.checked)} />
            {t('printing.previewCopyWatermark')}
          </label>
          {statusMsg ? <p className="text-sm text-slate-600">{statusMsg}</p> : null}
          <p className="text-xs text-slate-500">{t('printing.saleDecoupled')}</p>
        </section>

        <section className="rounded-xl border border-border bg-white p-4">
          <h2 className="font-medium text-brand-navy">{t('printing.preview')}</h2>
          <iframe title="print-preview" className="mt-2 h-[520px] w-full rounded border border-slate-200 bg-white" srcDoc={previewHtml} />
        </section>
      </div>

      <section className="rounded-xl border border-border bg-white p-4">
        <h2 className="font-medium text-brand-navy">{t('printing.jobLog')}</h2>
        <div className="mt-2 overflow-x-auto text-sm">
          <table className="min-w-full text-left">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2 pr-4">{t('printing.colWhen')}</th>
                <th className="py-2 pr-4">{t('printing.colProfile')}</th>
                <th className="py-2 pr-4">{t('printing.colChannel')}</th>
                <th className="py-2 pr-4">{t('printing.colStatus')}</th>
                <th className="py-2">{t('printing.colCopy')}</th>
              </tr>
            </thead>
            <tbody>
              {jobsQuery.data?.map((job) => (
                <tr key={job.id} className="border-t border-slate-100">
                  <td className="py-2 pr-4">{new Date(job.created_at).toLocaleString()}</td>
                  <td className="py-2 pr-4">{t(`printing.profile.${job.profile_key as PrintProfileKey}`)}</td>
                  <td className="py-2 pr-4">{job.channel}</td>
                  <td className="py-2 pr-4">
                    {t(`printing.jobStatus.${job.status}`)}
                    {job.error_message ? ` — ${job.error_message}` : ''}
                  </td>
                  <td className="py-2">{job.is_marked_copy ? t('printing.yes') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
