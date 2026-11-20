/**
 * Studio receipts come from owner-entered cashflow fields, not settlement revenue.
 * The registered event sales, budget goals and studio deposits use different
 * accounting bases and MUST NOT be blindly added together.
 */
export function studioSalesSummary(row){
 const cash=row?.studio_sales_cash;
 const cashless=row?.studio_sales_cashless;
 const knownCash=cash!==null&&cash!==undefined&&cash!=='';
 const knownCashless=cashless!==null&&cashless!==undefined&&cashless!=='';
 const valid=value=>{
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<0)throw Error('スタジオ売上入金額の形式が不正です');
  return n;
 };
 const cashAmount=knownCash?valid(cash):null;
 const cashlessAmount=knownCashless?valid(cashless):null;
 return {
  cash:cashAmount,cashless:cashlessAmount,
  total:knownCash||knownCashless?(cashAmount??0)+(cashlessAmount??0):null,
  complete:knownCash&&knownCashless,
  reviewed:row?.status==='reviewed'&&knownCash&&knownCashless,
  status:!(knownCash||knownCashless)?'未入力':knownCash&&knownCashless?'内訳入力済み':'一部未入力'
 };
}
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const yen=value=>value===null||value===undefined?'未入力':'¥'+Number(value).toLocaleString('ja-JP');
export function studioSalesReportLine(row,{mode='actual'}={}){
 const a=studioSalesSummary(row),planned=mode==='plan';
 const heading=planned?'スタジオ売上入金計画':'スタジオ売上入金実績';
 const money=a.total===null?'未入力':yen(a.total)+(a.complete?'':' ※暫定');
 const note=planned?
  '資金繰りの入金予定額。月次売上目標にスタジオ分を含めている場合は再加算しません。':
  '資金繰りに記録した実際の入金額。イベント収支の登録売上とは集計基準が異なり、二重計上しません。';
 return `<section class="studio-sales-summary" style="display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid #cbdbea;border-radius:7px;background:#eef5fc;padding:8px 12px;margin-top:9px">
  <div style="min-width:0"><b style="font-size:9.5pt;color:#244565">STUDIO SNAKE / ${esc(heading)}</b>
   <div style="font-size:8pt;color:#50687c">現金：${esc(yen(a.cash))}　キャッシュレス：${esc(yen(a.cashless))}</div>
   <div style="font-size:7.5pt;color:#60758a">${esc(note)}${!a.reviewed&&a.total!==null?'（資金繰り未確認）':''}</div>
  </div>
  <strong style="font-size:15pt;color:#1e4166;white-space:nowrap;font-variant-numeric:tabular-nums">${esc(money)}</strong>
 </section>`;
}
