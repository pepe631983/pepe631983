# Última ejecución staging

Fecha UTC: 2026-10-09T08:38:15Z  
Host: `aws-0-us-east-1.pooler.supabase.com`  
**Resultado:** suite 9/9 PASSED (ROLLBACK), concurrencia PASSED, pruebas desactivadas al final.

## Escenario de referencia (esperado vs obtenido)

| Métrica | Esperado | Obtenido |
|---------|----------|----------|
| Inventario (uds) | 5 | 5 |
| Caja (1000) | 420 | 420 |
| CxC (1100) | 80 | 80 |
| CxP (2000) | 600 | 600 |
| Ventas netas (4000) | 500 | 500 |
| COGS (5000) | 300 | 300 |

## Log crudo

BEGIN
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 r                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  
------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 {"results": [{"test": "reference_scenario", "detail": {"cash": {"actual": 420.0000, "expected": 420}, "net_sales": {"actual": 500.0000, "expected": 500}, "inventory_units": {"actual": 5.000000, "expected": 5}, "accounts_payable": {"actual": 600.0000, "expected": 600}, "cost_of_goods_sold": {"actual": 300.0000, "expected": 300}, "accounts_receivable": {"actual": 80.0000, "expected": 80}}, "status": "passed"}, {"test": "idempotency_all_ops", "detail": {"status": "ok"}, "status": "passed"}, {"test": "permissions_and_tenant", "detail": {"tenant": "ok", "permission_check": "seller_blocked_purchase"}, "status": "passed"}, {"test": "partial_ap_and_variance", "detail": {"grni_remaining": {"actual": 0.0000, "expected": 0}, "accounts_payable": {"actual": 150.0000, "expected": 150}}, "status": "passed"}, {"test": "rollback_on_fault", "detail": {"rollback_pos": "ok", "rollback_receipt": "ok"}, "status": "passed"}, {"test": "reconciliation_by_date", "detail": {"net_sales_today": {"actual": 30.0000, "expected": 30}}, "status": "passed"}, {"test": "supplier_variance_unsold", "detail": {"avg_unit_cost": 10.5000, "variance_to_inventory": 5}, "status": "passed"}, {"test": "supplier_variance_partial_sold", "detail": {"expense_sold": 5.0000, "to_inventory": 5.0000}, "status": "passed"}, {"test": "supplier_variance_all_sold", "detail": {"expense_sold": 8}, "status": "passed"}], "tests_run": 9, "suite_status": "passed", "pending_manual": ["concurrent_last_unit_two_psql"]}
(1 row)

ROLLBACK
- suite: PASSED
=== concurrent_last_unit ===
Facturas nuevas: 1 (esperado 1)
Ventas exitosas detectadas: 1 (esperado 1)
Alguna falló por stock: 1
RESULTADO: PASSED
- concurrent: PASSED
