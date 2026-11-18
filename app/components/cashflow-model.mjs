/**
 * Cash-flow management uses actual cash receipts/payments, never a guessed
 * conversion of event accrual sales, settled wages or expenses.
 * Blank (null) is not equivalent to an explicitly verified 0 yen.
 */
export const CASHFLOW_GROUPS=[
 {title:'営業収入',kind:'in',fields:[['sales_cash','売上入金（現金）'],['sales_cashless','売上入金（キャッシュレス）']]},
 {title:'仕入・営業支出',kind:'out',fields:[
  ['purchase_cost','仕入高'],['director_salary','役員報酬'],['employee_salary','従業員給与'],
  ['transportation','交通費'],['entertainment','交際費'],['advertising','広告宣伝費'],
  ['communications','通信費'],['rent','家賃'],['utilities','光熱費'],
  ['other_operating','その他経費'],['taxes','税金'],['statutory_benefits','法定福利費'],
  ['outsourcing','外注費']]},
 {title:'財務収入',kind:'in',fields:[['long_loan_in','長期借入金調達'],['short_loan_in','短期借入金調達'],['other_finance_in','その他財務収入']]},
 {title:'財務支出',kind:'out',fields:[['long_loan_out','長期借入金返済'],['short_loan_out','短期借入金返済'],['loan_interest','借入金利息'],['other_finance_out','その他財務支出']]}
];
export const CASHFLOW_FIELDS=CASHFLOW_GROUPS.flatMap(group=>group.fields.map(([key,label])=>({key,label,kind:group.kind,group:group.title})));
export const CASHFLOW_KEYS=CASHFLOW_FIELDS.map(x=>x.key);
const moneyValue=value=>{
 if(value===null||value===undefined||value==='')return null;
 const n=Number(value);
 if(!Number.isSafeInteger(n))throw Error('金額は円単位の整数で入力してください');
 return n;
};
export function validateCashflowEntry(entry,{complete=false}={}){
 if(!entry||!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(entry.month||'')))throw Error('対象月の形式を確認してください');
 if(!['actual','plan'].includes(entry.scenario))throw Error('実績・計画区分を確認してください');
 const opening=moneyValue(entry.opening_balance);
 const fields={};
 for(const key of CASHFLOW_KEYS){
  const n=moneyValue(entry[key]);
  if(n!==null&&n<0)throw Error('支出・入金の金額は0円以上で入力してください：'+key);
  fields[key]=n;
 }
 if(complete&&(opening===null||CASHFLOW_KEYS.some(key=>fields[key]===null)))throw Error('確認済みにするには残高と全項目の入力（該当しない項目は0円）が必要です');
 return {opening_balance:opening,...fields};
}
const sumGroup=(row,keys)=>{
 const values=keys.map(key=>row?.[key]);
 const known=values.filter(v=>v!==null&&v!==undefined&&v!=='').map(v=>Number(v));
 return {known:known.length,total:known.reduce((a,b)=>a+b,0)};
};
export function calculateCashflow(row){
 const opening=row?.opening_balance===null||row?.opening_balance===undefined?null:Number(row.opening_balance);
 const groups=CASHFLOW_GROUPS.map(group=>{
  const values=sumGroup(row,group.fields.map(x=>x[0]));
  return {...group,...values,expected:group.fields.length,incomplete:values.known<group.fields.length};
 });
 const operatingIncome=groups[0].total;
 const operatingOut=groups[1].total;
 const financialIncome=groups[2].total;
 const financialOut=groups[3].total;
 const operatingNet=operatingIncome-operatingOut;
 const financeNet=financialIncome-financialOut;
 const net=operatingNet+financeNet;
 const recorded=CASHFLOW_KEYS.reduce((n,key)=>n+(row?.[key]!==null&&row?.[key]!==undefined&&row?.[key]!==''?1:0),0);
 const complete=opening!==null&&recorded===CASHFLOW_KEYS.length;
 const hasInput=!!row&&(opening!==null||recorded>0);
 // A partial closing balance is a visible provisional estimate, NOT a bank balance.
 const closing=opening!==null&&recorded>0?opening+net:null;
 return {
  month:row?.month||null,scenario:row?.scenario||null,opening,closing,
  operatingIncome,operatingOut,operatingNet,financialIncome,financialOut,
  financeNet,net:recorded>0?net:null,groups,recorded,expected:CASHFLOW_KEYS.length,
  complete,status:row?.status||'missing',reviewed:row?.status==='reviewed'&&complete,
  sourceNote:String(row?.source_note||''),evidenceNote:String(row?.evidence_note||''),
  managementNote:String(row?.management_note||''),hasInput
 };
}
export const yen=n=>n===null||n===undefined?'未入力':(n<0?'−':'')+'¥'+Math.abs(n).toLocaleString('ja-JP');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function cashflowMonthList(year){
 if(!Number.isInteger(year)||year<2000||year>2100)throw Error('年度の指定が不正です');
 return Array.from({length:12},(_,i)=>{
  const y=year+(i>=4?1:0),m=(i+8)%12+1;
  return y+'-'+String(m).padStart(2,'0');
 });
}
export function cashflowYearStart(month){
 const m=Number(String(month).slice(5,7));
 return Number(String(month).slice(0,4))-(m<9?1:0);
}
export function cashflowVariance(actual,plan,key){
 if(actual?.[key]===null||actual?.[key]===undefined||plan?.[key]===null||plan?.[key]===undefined)return null;
 return Number(actual[key])-Number(plan[key]);
}
export function cashflowReportSection({actual=null,plan=null,mode='actual'}={}){
 const primary=mode==='plan'?plan:actual,reference=mode==='plan'?actual:plan;
 const a=calculateCashflow(primary),b=calculateCashflow(reference);
 const title=mode==='plan'?'資金繰り計画（入出金ベース）':'資金繰り実績（入出金ベース）';
 const status=!primary?'未登録':a.reviewed?'確認済み':a.complete?'全項目入力済み・未確認':'入力途中・未確認';
 const rows=[
  ['月初現金・預金',a.opening,b.opening],
  ['営業入金',a.recorded?a.operatingIncome:null,b.recorded?b.operatingIncome:null],
  ['仕入・営業支払',a.recorded?a.operatingOut:null,b.recorded?b.operatingOut:null],
  ['営業資金収支',a.net===null?null:a.operatingNet,b.net===null?null:b.operatingNet],
  ['借入金等の調達',a.recorded?a.financialIncome:null,b.recorded?b.financialIncome:null],
  ['借入金返済・利息等',a.recorded?a.financialOut:null,b.recorded?b.financialOut:null],
  ['月間資金増減',a.net,b.net],
  ['月末現金・預金（試算）',a.closing,b.closing]
 ];
 const columns=mode==='plan'?['計画','同月実績','差異']:['実績','同月計画','差異'];
 const line=rows.map(([label,x,y])=>`<tr><td>${esc(label)}</td><td class="num">${esc(yen(x))}</td><td class="num">${esc(yen(y))}</td><td class="num">${x!==null&&y!==null?esc(yen(x-y)):'—'}</td></tr>`).join('');
 const detail=CASHFLOW_GROUPS.map(group=>{
  const values=group.fields.map(([key,label])=>{
   const v=primary?.[key]??null,r=reference?.[key]??null;
   const delta=v!==null&&r!==null?Number(v)-Number(r):null;
   return `<tr><td>${esc(label)}</td><td class="num">${esc(yen(v))}</td><td class="num">${esc(yen(r))}</td><td class="num">${delta===null?'—':esc(yen(delta))}</td></tr>`;
  }).join('');
  return `<tr style="background:#eff3f6"><td colspan="4"><b>${esc(group.title)}</b></td></tr>${values}`;
 }).join('');
 const notes=[primary?.source_note?'根拠・参照：'+primary.source_note:null,primary?.evidence_note?'入出金の確認方法：'+primary.evidence_note:null,primary?.management_note?'経営協議メモ：'+primary.management_note:null].filter(Boolean);
 return `<section class="cashflow-report" style="margin:14px 0;break-inside:avoid-page">
 <h2 style="border-left:4px solid #294358;padding-left:8px;margin:14px 0 7px">${title}</h2>
 <p style="font-size:9pt;margin:3px 0 9px">記録状況：<b>${esc(status)}</b>　入力済み ${a.recorded}/${a.expected}項目。月末残高は入力した入出金に基づく${a.complete?'計算値':'暫定試算'}です。</p>
 <table style="width:100%;border-collapse:collapse;font-size:8pt"><thead><tr><th>主要項目</th><th class="num">${columns[0]}</th><th class="num">${columns[1]}</th><th class="num">${columns[2]}</th></tr></thead><tbody>${line}</tbody></table>
 <details><summary style="font-size:8.5pt;color:#4b6177;margin:8px 0">資金繰り勘定科目の内訳（PDF印刷時も掲載）</summary>
 <table style="width:100%;border-collapse:collapse;font-size:7.5pt"><thead><tr><th>勘定項目</th><th class="num">${columns[0]}</th><th class="num">${columns[1]}</th><th class="num">${columns[2]}</th></tr></thead><tbody>${detail}</tbody></table></details>
 ${notes.length?`<p style="font-size:8pt;white-space:pre-wrap;margin-top:7px">${notes.map(x=>esc(x)).join('　 /　 ')}</p>`:''}
 <p style="font-size:8pt;color:#68798c;margin-top:6px">資金繰りは実際の入金・支払いに基づく独立管理です。イベント売上・経費・給与の計上額と合算しません。マイナス残高は補正せず表示。差異は上段－比較列、未入力は0円扱いしません。</p>
 </section>`;
}
