#!/usr/bin/env node
/**
 * Prueba login UI staging sin imprimir contraseña.
 * Requiere: frontend/.env.local y secretos STAGING_UI_TEST_EMAIL / STAGING_UI_TEST_PASSWORD
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, 'frontend/.env.local');

function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

if (!fs.existsSync(envPath)) {
  fail('Falta frontend/.env.local — ejecute npm run env:frontend-staging');
}

const envText = fs.readFileSync(envPath, 'utf8');
const url = envText.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();
const key = envText.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();
if (!url || !key) fail('VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY ausentes en .env.local');

const email = process.env.STAGING_UI_TEST_EMAIL?.trim();
const password = process.env.STAGING_UI_TEST_PASSWORD;
if (!email || !password) {
  fail(
    'Configure secretos STAGING_UI_TEST_EMAIL y STAGING_UI_TEST_PASSWORD en el entorno Cloud Agent (no commitear).',
    2,
  );
}

const sb = createClient(url, key);
const { data, error } = await sb.auth.signInWithPassword({ email, password });

if (error) {
  console.error('login_failed:', error.status ?? 'n/a', error.message);
  process.exit(1);
}

console.log('login_ok:', data.user?.email);
console.log('user_id:', data.user?.id);
console.log('auth-probe-ui-login: PASSED');
