#!/usr/bin/env node
/**
 * E2E staging vía API Supabase (misma lógica que pantallas) tras login UI.
 * Secretos: STAGING_UI_TEST_EMAIL, STAGING_UI_TEST_PASSWORD
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, 'frontend/.env.local');
const results = [];

function step(name, ok, detail = '') {
  results.push({ step: name, ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail ? `— ${detail}` : '');
}

function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

if (!fs.existsSync(envPath)) fail('Falta frontend/.env.local');
const envText = fs.readFileSync(envPath, 'utf8');
const url = envText.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();
const key = envText.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();
const email = process.env.STAGING_UI_TEST_EMAIL?.trim();
const password = process.env.STAGING_UI_TEST_PASSWORD;
if (!url || !key) fail('Variables VITE_* ausentes');
if (!email || !password) fail('Faltan STAGING_UI_TEST_EMAIL / STAGING_UI_TEST_PASSWORD', 2);

const sb = createClient(url, key);
const { data: authData, error: loginErr } = await sb.auth.signInWithPassword({ email, password });
if (loginErr) {
  step('login', false, `${loginErr.status} ${loginErr.message}`);
  console.log(JSON.stringify({ results }, null, 2));
  process.exit(1);
}
step('login', true, authData.user?.email);

let { data: profile } = await sb.from('profiles').select('company_id, full_name').maybeSingle();
if (!profile?.company_id) {
  const suffix = Date.now();
  const { error: coErr } = await sb.rpc('create_company_with_owner', {
    p_commercial_name: `UI E2E Demo ${suffix}`,
    p_full_name: 'Operador Prueba UI',
    p_country_code: 'TC',
    p_timezone: 'America/Grand_Turk',
    p_currency_code: 'USD',
    p_is_demo: true,
  });
  if (coErr) {
    step('create_company_with_owner', false, coErr.message);
    console.log(JSON.stringify({ results }, null, 2));
    process.exit(1);
  }
  step('create_company_with_owner', true);
  ({ data: profile } = await sb.from('profiles').select('company_id').maybeSingle());
} else {
  step('create_company_with_owner', true, 'ya existía');
}

const companyId = profile?.company_id;
if (!companyId) {
  step('profile_company', false, 'sin company_id');
  process.exit(1);
}
step('profile_company', true, companyId);

const { data: roles } = await sb
  .from('user_roles')
  .select('roles(code)')
  .eq('user_id', authData.user.id);
const codes = (roles ?? []).map((r) => r.roles?.code).filter(Boolean);
step('admin_permissions_owner', codes.includes('owner'), codes.join(',') || 'sin roles');

const { data: branchRow } = await sb
  .from('branches')
  .select('id')
  .eq('company_id', companyId)
  .eq('is_default', true)
  .maybeSingle();
const { data: whRow } = await sb
  .from('warehouses')
  .select('id')
  .eq('company_id', companyId)
  .eq('is_default', true)
  .maybeSingle();
const branchId = branchRow?.id;
const whId = whRow?.id;
if (!branchId || !whId) {
  step('branch_warehouse', false);
  process.exit(1);
}

const runKey = `ui-e2e-${Date.now()}`;

const { data: supplier, error: supErr } = await sb
  .from('suppliers')
  .insert({ company_id: companyId, name: `Proveedor ${runKey}` })
  .select('id')
  .single();
step('purchase_supplier', !supErr, supErr?.message);
if (supErr) {
  console.log(JSON.stringify({ results }, null, 2));
  process.exit(1);
}

const { data: product, error: prodErr } = await sb
  .from('products')
  .insert({
    company_id: companyId,
    internal_code: `P-${runKey}`,
    name: 'Repuesto UI E2E',
    sale_price: 50,
  })
  .select('id')
  .single();
step('product', !prodErr, prodErr?.message);
if (prodErr) {
  console.log(JSON.stringify({ results }, null, 2));
  process.exit(1);
}

const grLines = [{ product_id: product.id, quantity: 10, unit_cost: 60 }];
const { data: receiptId, error: grErr } = await sb.rpc('confirm_goods_receipt', {
  p_warehouse_id: whId,
  p_receipt_kind: 'purchase_pending_invoice',
  p_lines: grLines,
  p_idempotency_key: `${runKey}-gr`,
  p_supplier_id: supplier.id,
  p_reason: null,
});
step('goods_receipt', !grErr, grErr?.message);

const { error: sinvErr } = await sb.rpc('post_supplier_invoice_for_receipt', {
  p_goods_receipt_id: receiptId,
  p_supplier_invoice_number: `INV-${runKey}`,
  p_idempotency_key: `${runKey}-sinv`,
});
step('supplier_invoice', !sinvErr, sinvErr?.message);

const { data: taxRow, error: taxErr } = await sb
  .from('tax_rates')
  .insert({
    company_id: companyId,
    code: `T-${runKey}`,
    name: 'Impuesto UI E2E',
    rate_percent: 10,
    is_active: true,
    is_default_sales: false,
    legal_format_pending: true,
  })
  .select('id')
  .single();
step('tax_rate', !taxErr, taxErr?.message);

const { data: sessionId, error: openErr } = await sb.rpc('open_cash_session', {
  p_branch_id: branchId,
  p_opening_float: 100,
});
step('cash_open', !openErr, openErr?.message);

const posLines = [{ product_id: product.id, quantity: 2, unit_price: 50, discount: 0 }];
const { data: cashInv, error: posCashErr } = await sb.rpc('confirm_pos_sale', {
  p_idempotency_key: `${runKey}-cash`,
  p_warehouse_id: whId,
  p_payment_kind: 'cash',
  p_amount_paid: 110,
  p_lines: posLines,
  p_cash_session_id: sessionId,
  p_tax_rate_id: taxRow?.id ?? null,
  p_payment_method_id: null,
});
step('pos_sale_cash', !posCashErr, posCashErr?.message);

const creditLines = [{ product_id: product.id, quantity: 1, unit_price: 50, discount: 0 }];
const { data: creditInv, error: posCredErr } = await sb.rpc('confirm_pos_sale', {
  p_idempotency_key: `${runKey}-credit`,
  p_warehouse_id: whId,
  p_payment_kind: 'credit',
  p_amount_paid: null,
  p_lines: creditLines,
  p_cash_session_id: null,
  p_tax_rate_id: null,
  p_payment_method_id: null,
});
step('pos_sale_credit', !posCredErr, posCredErr?.message);

const { error: payErr } = await sb.rpc('collect_customer_payment', {
  p_sales_invoice_id: creditInv,
  p_amount: 25,
  p_idempotency_key: `${runKey}-pay`,
  p_cash_session_id: sessionId,
  p_payment_method_id: null,
});
step('customer_payment', !payErr, payErr?.message);

const { data: lineRow } = await sb
  .from('sales_invoice_lines')
  .select('id')
  .eq('sales_invoice_id', cashInv)
  .order('line_number')
  .limit(1)
  .maybeSingle();

const { error: retErr } = await sb.rpc('confirm_sales_return', {
  p_idempotency_key: `${runKey}-ret`,
  p_original_invoice_id: cashInv,
  p_lines: [{ sales_invoice_line_id: lineRow?.id, quantity: 1 }],
  p_refund_kind: 'cash',
  p_cash_session_id: sessionId,
});
step('sales_return', !retErr, retErr?.message);

const { data: moves, error: movErr } = await sb
  .from('cash_movements')
  .select('movement_kind, amount')
  .eq('cash_session_id', sessionId);
let expected = 0;
if (!movErr && moves) {
  for (const m of moves) {
    if (['sale', 'customer_payment', 'deposit', 'adjustment'].includes(m.movement_kind)) {
      expected += Number(m.amount);
    } else if (['refund', 'withdrawal'].includes(m.movement_kind)) {
      expected -= Number(m.amount);
    }
  }
}
const { data: closeJson, error: closeErr } = await sb.rpc('close_cash_session', {
  p_cash_session_id: sessionId,
  p_counted_cash: expected,
  p_notes: 'Cierre UI E2E',
});
step('cash_close', !closeErr && String(closeJson?.difference) === '0', closeErr?.message ?? `diff=${closeJson?.difference}`);

const today = new Date().toISOString().slice(0, 10);
const { data: recon, error: reconErr } = await sb.rpc('get_financial_reconciliation', {
  p_as_of: today,
});
let reconOk = !reconErr;
if (recon?.differences) {
  for (const d of recon.differences) {
    if (Number(d.delta) !== 0) {
      reconOk = false;
      break;
    }
  }
}
step('reconciliation', reconOk, reconErr?.message ?? `${recon?.differences?.length ?? 0} filas`);

const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ results, summary: failed.length ? 'FAILED' : 'PASSED' }, null, 2));
process.exit(failed.length ? 1 : 0);
