#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, 'frontend/.env.local');
if (!fs.existsSync(envPath)) {
  console.error('Falta frontend/.env.local');
  process.exit(2);
}
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(.+)/)[1].trim();
const key = env.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const email = process.env.STAGING_UI_TEST_EMAIL;
const password = process.env.STAGING_UI_TEST_PASSWORD;
if (!email || !password) {
  console.error('Requiere STAGING_UI_TEST_EMAIL/PASSWORD');
  process.exit(2);
}

const sb = createClient(url, key);
const { error: loginErr } = await sb.auth.signInWithPassword({ email, password });
if (loginErr) {
  console.error(loginErr.message);
  process.exit(1);
}
const { data, error } = await sb.rpc('export_company_snapshot');
if (error) {
  console.error(error.message);
  process.exit(1);
}
const out = path.join(root, 'docs', `export-snapshot-${Date.now()}.json`);
fs.writeFileSync(out, JSON.stringify(data, null, 2));
console.log('export_ok:', out);
