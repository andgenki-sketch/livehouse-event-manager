/**
 * Ledger expenses are classified by their posted category, not by event_id.
 * Keep older category values readable without rewriting historical entries.
 * Unsupported categories remain in 'other' to avoid inventing a purchase or
 * consumables classification.
 */
export function expenseType(category){
 const value=String(category??'').trim();
 if(value==='外注費')return 'outsourcing';
 if(value==='仕入'||value==='仕入れ')return 'purchase';
 if(value==='消耗品'||value==='消耗品費')return 'consumables';
 return 'other';
}

export function expenseCategoryLabel(category){
 const type=expenseType(category);
 if(type==='purchase')return '仕入れ';
 if(type==='consumables')return '消耗品';
 return String(category??'').trim()||'未分類';
}

/** Sum registered ledger rows exactly once; event_id is intentionally ignored. */
export function expenseTypeSummary(rows=[]){
 const totals={purchase:0,consumables:0,other:0,outsourcing:0,total:0,count:rows.length};
 for(const row of rows){
  const value=Number(row?.amount??0);
  if(!Number.isFinite(value))throw Error('経費台帳に不正な金額が含まれています');
  const type=expenseType(row?.category);
  totals[type]+=value;
  if(type!=='outsourcing')totals.total+=value;
 }
 return totals;
}
