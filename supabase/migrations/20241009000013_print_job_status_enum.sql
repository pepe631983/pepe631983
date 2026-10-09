-- Valores de print_job_status en migración aparte (PG no permite usar valores nuevos en la misma transacción).
ALTER TYPE public.print_job_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE public.print_job_status ADD VALUE IF NOT EXISTS 'sending';
ALTER TYPE public.print_job_status ADD VALUE IF NOT EXISTS 'uncertain';
ALTER TYPE public.print_job_status ADD VALUE IF NOT EXISTS 'confirmed_printed';
