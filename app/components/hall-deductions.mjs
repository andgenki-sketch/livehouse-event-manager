/**
 * Hall-rental billing deductions (discounts/refunds) are reductions in revenue,
 * NOT operating expenses, outside staffing costs, or payments to suppliers.
 */
export function normalizeHallDeductions(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 8).map(row => {
    const label = String(row?.label ?? '').trim().slice(0, 100);
    const raw = Number(String(row?.amount ?? 0).replace(/[¥￥,，\s]/g, ''));
    const amount = Number.isSafeInteger(raw) && raw >= 0 ? raw : 0;
    return { label, amount };
  }).filter(row => row.label || row.amount > 0);
}

export function hallDeductionTotal(rows) {
  return normalizeHallDeductions(rows).reduce((total, row) => total + row.amount, 0);
}
