import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { fetchRecoverableJobs, recoverPrintQueueOnStartup } from '@/print/printQueueService';

export function PrintQueueRecoveryBanner() {
  const { t } = useTranslation();

  const jobsQuery = useQuery({
    queryKey: ['print-recoverable'],
    queryFn: async () => {
      await recoverPrintQueueOnStartup();
      return fetchRecoverableJobs();
    },
    staleTime: 30_000,
  });

  if (!jobsQuery.data?.length) return null;

  return (
    <div className="mb-4 rounded-xl border border-brand-accent/40 bg-red-50 p-4 text-sm text-brand-navy">
      <p className="font-medium">{t('printing.recoveryTitle')}</p>
      <p className="mt-1">{t('printing.recoveryBody')}</p>
      <ul className="mt-2 space-y-1">
        {jobsQuery.data.slice(0, 5).map((job) => (
          <li key={job.id}>
            #{job.client_request_id.slice(0, 8)} — {job.status}
            {job.error_message ? ` (${job.error_message})` : ''}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs">{t('printing.recoveryNoAutoRetry')}</p>
      <Button variant="secondary" className="mt-2" onClick={() => void jobsQuery.refetch()}>
        {t('printing.recoveryRefresh')}
      </Button>
    </div>
  );
}
