-- Tipos base y extensiones
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- Dinero: nunca usar float. Precisión estándar 4 decimales; costos unitarios pueden usar más en capa de aplicación.
CREATE DOMAIN money_amount AS NUMERIC(19, 4)
  CHECK (VALUE IS NOT NULL);

CREATE DOMAIN quantity_amount AS NUMERIC(19, 6)
  CHECK (VALUE IS NOT NULL);

CREATE TYPE document_status AS ENUM ('draft', 'confirmed', 'reversed');

CREATE TYPE account_type AS ENUM (
  'asset',
  'liability',
  'equity',
  'income',
  'expense',
  'contra_asset',
  'contra_income'
);

CREATE TYPE accounting_period_status AS ENUM ('open', 'closed');

CREATE TYPE audit_severity AS ENUM ('info', 'warning', 'critical');

COMMENT ON DOMAIN money_amount IS 'Importes monetarios exactos; política de redondeo en aplicación';
