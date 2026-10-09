/** Códigos de permiso — deben coincidir con supabase/migrations/20241009000007_seed_permissions.sql */
export const PERMISSIONS = {
  companySettingsView: 'company.settings.view',
  companySettingsEdit: 'company.settings.edit',
  usersManage: 'users.manage',
  costView: 'cost.view',
  priceEdit: 'price.edit',
  discountApply: 'discount.apply',
  salesBelowCost: 'sales.below_cost',
  creditApprove: 'credit.approve',
  inventoryAdjust: 'inventory.adjust',
  inventoryTransfer: 'inventory.transfer',
  purchaseCreate: 'purchase.create',
  purchasePost: 'purchase.post',
  salesPos: 'sales.pos',
  salesConfirm: 'sales.confirm',
  paymentCollect: 'payment.collect',
  paymentPaySupplier: 'payment.pay_supplier',
  expenseRegister: 'expense.register',
  returnsProcess: 'returns.process',
  documentReverse: 'document.reverse',
  cashSessionOpen: 'cash.session.open',
  cashSessionClose: 'cash.session.close',
  reportsFinancial: 'reports.financial',
  reportsOperational: 'reports.operational',
  accountingPeriodClose: 'accounting.period.close',
  accountingJournalView: 'accounting.journal.view',
  printConfigure: 'print.configure',
  printExecute: 'print.execute',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSION_CODES: PermissionCode[] = Object.values(PERMISSIONS);
