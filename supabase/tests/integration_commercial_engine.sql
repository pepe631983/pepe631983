-- Wrapper legacy → suite integration_test (ROLLBACK, sin reset).
\set ON_ERROR_STOP on
BEGIN;
SELECT integration_test.run_suite() AS suite_result \gx
ROLLBACK;
