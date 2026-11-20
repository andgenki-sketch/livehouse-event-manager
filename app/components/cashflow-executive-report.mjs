import {calculateCashflow,CASHFLOW_KEYS,yen} from './cashflow-model.mjs';
import {CASHFLOW_SHEET_ROWS,cashflowSheetValue} from './cashflow-sheet-layout.mjs';

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=value=>value===null||value===undefined?'未入力':yen(value);
const viewValue=(v,partial=false)=>v===null||v===undefined?'未入力':yen(v)+(partial?' ※':'');
const trimmed=(s,max=240)=>{
 const value=String(s||'').trim();
 return value.length>max?value.slice(0,max)+'…（全文は資金繰り管理画面）':value;
};
const sourceOf=(actual,plan,mode)=>mode==='plan'?plan:actual;
const referenceOf=(actual,plan,mode)=>mode==='plan'?actual:plan;
const present=(row,key)=>row&&row[key]!==null&&row[key]!==undefined;
const groupPresent=(row,keys)=>!!row&&keys.some(key=>present(row,key));
const GROUP_SALES=['sales_cash','sales_cashless','studio_sales_cash','studio_sales_cashless'];
const GROUP_STUDIO=['studio_sales_cash','studio_sales_cashless'];
const GROUP_LOAN_REPAY=['long_loan_out','short_loan_out'];
const metric=(name,value,subtitle='')=>`<div class="cfe-metric"><small>${escapeHtml(name)}</small><strong>${escapeHtml(value)}</strong>${subtitle?`<p>${escapeHtml(subtitle)}</p>`:''}</div>`;
const comparisonValue=(cashflow,kind)=>{
 if(!cashflow.hasInput)return null;
 if(kind==='income')return groupPresent(cashflow.row,GROUP_SALES)?cashflow.operatingIncome:null;
 if(kind==='studio')return groupPresent(cashflow.row,GROUP_STUDIO)?GROUP_STUDIO.reduce((total,key)=>total+Number(cashflow.row[key]||0),0):null;
 if(kind==='operating')return cashflow.net===null?null:cashflow.operatingNet;
 if(kind==='repayment')return groupPresent(cashflow.row,GROUP_LOAN_REPAY)
  ?GROUP_LOAN_REPAY.reduce((total,key)=>total+Number(cashflow.row[key]||0),0):null;
 if(kind==='monthly')return cashflow.net;
 if(kind==='closing')return cashflow.reportedClosing??cashflow.closing;
 return null;
};
const model=(row)=>{
 const val=calculateCashflow(row);
 return {...val,row};
};
export function cashflowExecutiveAlerts({actual=null,plan=null,mode='actual'}={}){
 const record=sourceOf(actual,plan,mode),a=calculateCashflow(record);
 const alerts=[];
 if(!record)return [mode==='plan'?'対象月の資金繰り計画が未登録です':'対象月の資金繰り実績が未登録です'];
 if(!a.complete)alerts.push('資金繰りの未入力項目 '+(a.expected-a.recorded)+'件。計算値は暫定です');
 if(!a.reviewed)alerts.push('資金繰りの照合・確認が未完了です');
 if(a.reconciliationDelta!==null&&a.reconciliationDelta!==0)
  alerts.push('月末残高の照合差額 '+yen(a.reconciliationDelta)+' が残っています');
 const balance=a.reportedClosing??a.closing;
 if(balance!==null&&balance<0)alerts.push('月末残高の記録値がマイナス（'+yen(balance)+'）。残高の意味と資金対応を協議してください');
 return alerts;
}
export function cashflowExecutiveHighlights({actual=null,plan=null,mode='actual'}={}){
 const row=sourceOf(actual,plan,mode),other=referenceOf(actual,plan,mode);
 const a=model(row),b=model(other),isPlan=mode==='plan';
 const repay=comparisonValue(a,'repayment');
 const closing=comparisonValue(a,'closing');
 const partial=!!row&&!a.complete;
 const columns=isPlan?['計画','実績（参考）','差異（計画－実績）']:['実績','同月計画','差異（実績－計画）'];
 const comparison=[
  ['売上入金（スタジオ含む）','income'],['スタジオ売上入金','studio'],['営業資金収支','operating'],['借入金元本返済','repayment'],
  ['月間資金増減','monthly'],['月末残高','closing']
 ].map(([name,key])=>{
  const x=comparisonValue(a,key),y=comparisonValue(b,key);
  const delta=x!==null&&y!==null?x-y:null;
  return `<tr><td>${escapeHtml(name)}</td><td class="num">${escapeHtml(viewValue(x,partial))}</td><td class="num">${escapeHtml(viewValue(y,!!other&&!b.complete))}</td><td class="num">${delta===null?'—':escapeHtml(viewValue(delta,partial|| (!!other&&!b.complete)))}</td></tr>`;
 }).join('');
 const cashStatus=!row?'未登録':a.reviewed?'確認済み':a.complete?'全項目入力済み・照合待ち':'入力途中・暫定';
 return `<section class="cfe-headline">
  <h2>${isPlan?'資金繰り計画':'資金繰り実績'}の要点</h2>
  <p class="cfe-status">資金繰り：<b>${escapeHtml(cashStatus)}</b> ／ 損益計算とは別の入出金管理です。${partial?' ※ は未入力項目が残る暫定値':''}</p>
  <div class="cfe-metrics">
   ${metric(isPlan?'月間資金増減（計画）':'月間資金増減（実績）',viewValue(a.net,partial))}
   ${metric('借入金元本返済',viewValue(repay,partial))}
   ${metric(isPlan?'月末資金残高の見通し':'月末資金残高（記録値）',viewValue(closing,partial),a.reportedClosing!==null?'原本・帳簿に記載された残高':'入出金に基づく計算値')}
   ${metric('残高の照合差額',viewValue(a.reconciliationDelta,partial))}
  </div>
  <table class="cfe-comparison"><thead><tr><th>資金繰り項目</th><th class="num">${columns[0]}</th><th class="num">${columns[1]}</th><th class="num">${columns[2]}</th></tr></thead><tbody>${comparison}</tbody></table>
  </section>`;
}
export function cashflowExecutiveDiscussion({actual=null,plan=null,mode='actual'}={}){
 const record=sourceOf(actual,plan,mode),alerts=cashflowExecutiveAlerts({actual,plan,mode});
 const topic=String(record?.discussion_topic||'').trim();
 const decision=String(record?.discussion_decision||'').trim();
 const assignee=String(record?.discussion_assignee||'').trim();
 const due=record?.discussion_deadline?String(record.discussion_deadline).slice(0,10):'';
 const memo=String(record?.management_note||'').trim();
 const text=(value,empty)=>escapeHtml(trimmed(value,150)||empty);
 return `<section class="cfe-discussion">
  <h2>経営協議事項・次のアクション</h2>
  <table class="cfe-decision"><tbody>
   <tr><th>数字から確認すべき事実</th><td>${alerts.length?alerts.map(s=>`<div>・${escapeHtml(s)}</div>`).join(''):'大きな警告条件は検出されていません。登録内容と照合状況をご確認ください。'}</td></tr>
   <tr><th>協議事項</th><td>${text(topic,'未記入（協議で確認）')}</td></tr>
   <tr><th>決定事項</th><td>${text(decision,'未決定')}</td></tr>
   <tr><th>担当・期限</th><td>${text(assignee,'担当未設定')} ／ ${due?escapeHtml(due):'期限未設定'}</td></tr>
  </tbody></table>
  ${memo?`<p class="cfe-discussion-memo">補足メモ：${text(memo,'')}</p>`:''}
  <p class="cfe-caption">協議事項・決定事項・担当者・期限は「資金繰り」画面の該当月で登録できます。未入力の判断・対策は自動作成しません。</p>
 </section>`;
}
export function cashflowExecutiveDetails({actual=null,plan=null,mode='actual'}={}){
 const row=sourceOf(actual,plan,mode),other=referenceOf(actual,plan,mode);
 const a=calculateCashflow(row);
 const sameMode=mode==='plan'?'計画':'実績',otherMode=mode==='plan'?'同月実績':'同月計画';
 const body=CASHFLOW_SHEET_ROWS.filter(item=>item.type!=='reference').map(item=>{
  if(item.type==='section')return `<tr class="cfe-group"><th colspan="4">${escapeHtml(item.label)}</th></tr>`;
  const x=cashflowSheetValue(row,item.key),y=cashflowSheetValue(other,item.key);
  const delta=x!==null&&y!==null?x-y:null;
  const cls=['subtotal','total','balance','variance'].includes(item.kind)?' class="cfe-'+item.kind+'"':'';
  return `<tr${cls}><td>${escapeHtml(item.label)}</td><td class="num">${escapeHtml(label(x))}</td><td class="num">${escapeHtml(label(y))}</td><td class="num">${delta===null?'—':escapeHtml(yen(delta))}</td></tr>`;
 }).join('');
 const notes=[
  row?.source_note?'根拠資料：'+row.source_note:null,
  row?.evidence_note?'入出金の照合：'+row.evidence_note:null,
  row?.management_note?'経営協議メモ：'+row.management_note:null
 ].filter(Boolean);
 return `<section class="report-page cfe-details-page">
  <div class="cfe-appendix-header"><span>APPENDIX 01 / CASH FLOW</span><h1>資金繰り・勘定項目別明細</h1><p>${sameMode}と${otherMode}の比較（差異＝${sameMode}－${otherMode}）。金額は円。空欄は0円扱いしません。</p></div>
  <table class="cfe-detail-table"><thead><tr><th>勘定項目</th><th class="num">${sameMode}</th><th class="num">${otherMode}</th><th class="num">差異</th></tr></thead><tbody>${body}</tbody></table>
  <p class="cfe-caption">記録状況：${!row?'未登録':a.reviewed?'確認済み':a.complete?'照合待ち':'入力途中・暫定'}。
   計算上の月末残高と原本・帳簿等の月末残高は別管理。計画と実績の入出金時期が異なる場合があります。</p>
  ${notes.length?`<div class="cfe-source-notes">${notes.map(s=>`<p>${escapeHtml(trimmed(s,360))}</p>`).join('')}</div>`:''}
  </section>`;
}
export const cashflowExecutiveStyles=`
 .report-page{break-before:page;page-break-before:always}
 .cfe-headline{margin-top:11px}
 .cfe-status{font-size:8pt;color:#607487;margin:4px 0 8px}
 .cfe-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}
 .cfe-metric{border:1px solid #d9e5ee;background:#f4f8fc;border-radius:6px;padding:8px 9px;min-width:0}
 .cfe-metric small{display:block;color:#62758a;font-size:7.4pt;min-height:24px}
 .cfe-metric strong{font-size:13pt;display:block;white-space:nowrap;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
 .cfe-metric p{font-size:6.6pt;color:#62758a;margin:4px 0 0}
 .cfe-comparison{font-size:7.7pt;margin-top:8px}
 .cfe-comparison td,.cfe-comparison th{padding:4px 7px}
 .cfe-discussion{margin-top:12px}
 .cfe-decision{font-size:8pt;table-layout:fixed}
 .cfe-decision th{width:27%;color:#354f64;background:#ecf1f6;font-weight:700}
 .cfe-decision td,.cfe-decision th{padding:6px 8px;border:1px solid #dde5ec;vertical-align:top;overflow-wrap:anywhere}
 .cfe-decision td div{margin:2px 0}
 .cfe-discussion-memo{font-size:8pt;padding:6px 8px;background:#f6f8fb;overflow-wrap:anywhere}
 .cfe-caption{font-size:7.3pt;color:#5d6f82;line-height:1.45;margin:8px 0}
 .cfe-details-page{padding-top:3px}
 .cfe-appendix-header{border-bottom:2px solid #28475f;margin-bottom:8px;padding-bottom:7px}
 .cfe-appendix-header span{font-size:8pt;letter-spacing:.09em;color:#62758a}
 .cfe-appendix-header h1{font-size:15pt;margin:4px 0}
 .cfe-appendix-header p{font-size:8pt;margin:0;color:#5f7282}
 .cfe-detail-table{font-size:7.25pt;line-height:1.18;table-layout:fixed}
 .cfe-detail-table th:first-child,.cfe-detail-table td:first-child{width:38%}
 .cfe-detail-table th,.cfe-detail-table td{padding:3px 5px;border-bottom:1px solid #e0e7ee}
 .cfe-detail-table .cfe-group th{background:#dbe8f3;color:#2b4d68;font-size:7.5pt;text-align:left;padding:4px 6px}
 .cfe-detail-table tr.cfe-subtotal td,.cfe-detail-table tr.cfe-total td{background:#f1f6fa;font-weight:700}
 .cfe-detail-table tr.cfe-balance td{background:#e9eff5;font-weight:700}
 .cfe-detail-table tr.cfe-variance td{background:#f8f0e7;font-weight:700}
 .cfe-source-notes{font-size:7pt;line-height:1.35;overflow-wrap:anywhere}
 .cfe-source-notes p{margin:3px 0}
 @media print{.report-page{margin-top:0!important}}
`;
