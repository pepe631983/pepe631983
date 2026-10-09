import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PERMISSIONS } from '@repuestos/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PermissionGate } from '@/components/PermissionGate';
import { supabase } from '@/lib/supabase';

export function CashPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [float, setFloat] = useState('100');
  const [counted, setCounted] = useState('');
  const [movAmount, setMovAmount] = useState('');
  const [movReason, setMovReason] = useState('');
  const [movKind, setMovKind] = useState<'deposit' | 'withdrawal'>('withdrawal');
  const [msg, setMsg] = useState<string | null>(null);

  const branchQuery = useQuery({
    queryKey: ['default-branch'],
    queryFn: async () => {
      const { data, error } = await supabase.from('branches').select('id').eq('is_default', true).maybeSingle();
      if (error) throw error;
      return data?.id as string | undefined;
    },
  });

  const sessionQuery = useQuery({
    queryKey: ['cash-session', branchQuery.data],
    enabled: Boolean(branchQuery.data),
    queryFn: async () => {
      const { data: sessionId, error } = await supabase.rpc('get_open_cash_session', {
        p_branch_id: branchQuery.data!,
      });
      if (error) throw error;
      if (!sessionId) return null;
      const { data: sess, error: sErr } = await supabase.from('cash_sessions').select('*').eq('id', sessionId).single();
      if (sErr) throw sErr;
      const { data: moves, error: mErr } = await supabase
        .from('cash_movements')
        .select('*')
        .eq('cash_session_id', sessionId)
        .order('created_at', { ascending: true });
      if (mErr) throw mErr;
      return { sess, moves: moves ?? [] };
    },
  });

  const invalidateAllCashSessionQueries = async () => {
    await qc.invalidateQueries({ queryKey: ['cash-session'] });
    await qc.invalidateQueries({ queryKey: ['cash-session-ret'] });
    await qc.invalidateQueries({ queryKey: ['cash-session-pay'] });
    await qc.invalidateQueries({ queryKey: ['pos-cash-session'] });
  };

  const openSession = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('open_cash_session', {
        p_branch_id: branchQuery.data!,
        p_opening_float: Number(float) || 0,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      setMsg(t('cash.opened'));
      await invalidateAllCashSessionQueries();
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const registerMov = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('register_cash_movement', {
        p_cash_session_id: sessionQuery.data!.sess.id,
        p_kind: movKind,
        p_amount: Number(movAmount),
        p_reason: movReason || t('cash.defaultReason'),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setMovAmount('');
      setMovReason('');
      setMsg(t('cash.movementSaved'));
      await invalidateAllCashSessionQueries();
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const closeSession = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('close_cash_session', {
        p_cash_session_id: sessionQuery.data!.sess.id,
        p_counted_cash: Number(counted),
        p_notes: null,
      });
      if (error) throw error;
      return data as { expected_cash: number; difference: number };
    },
    onSuccess: async (res) => {
      setMsg(t('cash.closed', { diff: res.difference }));
      setCounted('');
      await qc.invalidateQueries({ queryKey: ['cash-session'] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const session = sessionQuery.data?.sess;

  return (
    <PermissionGate permission={PERMISSIONS.cashSessionOpen}>
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold text-brand-navy">{t('cash.title')}</h1>
        <p className="text-sm text-slate-600">{t('cash.subtitle')}</p>
        {msg ? <p className="rounded-lg border border-border bg-slate-50 p-3 text-sm">{msg}</p> : null}

        {!session ? (
          <form
            className="space-y-3 rounded-xl border border-border bg-white p-4"
            onSubmit={(e) => {
              e.preventDefault();
              openSession.mutate();
            }}
          >
            <Input label={t('cash.openingFloat')} type="number" step="0.01" value={float} onChange={(e) => setFloat(e.target.value)} />
            <Button type="submit" loading={openSession.isPending}>
              {t('cash.open')}
            </Button>
          </form>
        ) : (
          <>
            <section className="rounded-xl border border-border bg-white p-4 text-sm">
              <p>
                {t('cash.statusOpen')} · {t('cash.expected')}: <strong>{Number(session.expected_cash)}</strong>
              </p>
              <p className="text-xs text-slate-500">
                {t('cash.openedAt')} {new Date(session.opened_at).toLocaleString()}
              </p>
            </section>

            <section className="rounded-xl border border-border bg-white p-4">
              <h2 className="font-semibold text-brand-navy">{t('cash.movements')}</h2>
              <ul className="mt-2 divide-y text-sm">
                {(sessionQuery.data?.moves ?? []).map((m) => (
                  <li key={m.id} className="flex justify-between py-2">
                    <span>
                      {m.movement_kind} {m.reason ? `· ${m.reason}` : ''}
                    </span>
                    <span className="font-mono">{Number(m.amount)}</span>
                  </li>
                ))}
              </ul>
            </section>

            <form
              className="grid gap-3 rounded-xl border border-border bg-white p-4 md:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                registerMov.mutate();
              }}
            >
              <label className="text-sm md:col-span-2">
                {t('cash.movementKind')}
                <select
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2"
                  value={movKind}
                  onChange={(e) => setMovKind(e.target.value as 'deposit' | 'withdrawal')}
                >
                  <option value="deposit">{t('cash.deposit')}</option>
                  <option value="withdrawal">{t('cash.withdrawal')}</option>
                </select>
              </label>
              <Input label={t('cash.amount')} type="number" step="0.01" value={movAmount} onChange={(e) => setMovAmount(e.target.value)} required />
              <Input label={t('cash.reason')} value={movReason} onChange={(e) => setMovReason(e.target.value)} required />
              <Button type="submit" className="md:col-span-2" loading={registerMov.isPending}>
                {t('cash.registerMovement')}
              </Button>
            </form>

            <PermissionGate permission={PERMISSIONS.cashSessionClose}>
              <form
                className="space-y-3 rounded-xl border border-border bg-white p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  closeSession.mutate();
                }}
              >
                <Input label={t('cash.countedCash')} type="number" step="0.01" value={counted} onChange={(e) => setCounted(e.target.value)} required />
                <Button type="submit" variant="secondary" loading={closeSession.isPending}>
                  {t('cash.close')}
                </Button>
              </form>
            </PermissionGate>
          </>
        )}
      </div>
    </PermissionGate>
  );
}
