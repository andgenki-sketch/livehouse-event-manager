import {confirmedPayrollRows,sortPayrollRows} from './payroll-report.mjs';
import {hallDeductionTotal} from './hall-deductions.mjs';
import {shiftPaymentMode} from './shift-labor-forecast.mjs';

const moneyValue=value=>{
 const amount=Number(value||0);
 if(!Number.isFinite(amount))throw Error('集計対象の金額が不正です');
 return amount;
};
const sum=(rows,field)=>rows.reduce((n,row)=>n+moneyValue(row?.[field]),0);
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const yen=value=>'¥'+Math.round(Number(value)||0).toLocaleString('ja-JP');

export function reportMonthRange(month){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('対象月はYYYY-MMで指定してください');
 const [year,m]=month.split('-').map(Number),next=m===12?`${year+1}-01`:`${year}-${String(m+1).padStart(2,'0')}`;
 return {start:month+'-01',end:next+'-01',year,monthNumber:m};
}
export function previousJapanMonth(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit'}).formatToParts(now);
 const year=Number(parts.find(p=>p.type==='year').value),month=Number(parts.find(p=>p.type==='month').value);
 return month===1?`${year-1}-12`:`${year}-${String(month-1).padStart(2,'0')}`;
}

function eventRevenue(settlement,isHall,artists=[]){
 if(!settlement)return 0;
 const artistTicket=artists.length?artists.reduce((n,a)=>n+sum([a],'ticket_sales')+sum([a],'electronic_ticket_sales')+
   sum([a],'streaming_sales')+sum([a],'equipment_fee')+sum([a],'video_fee')-sum([a],'ticket_back'),0):
   moneyValue(settlement.ticket_sales);
 const fields=['streaming_ticket_sales','drink_sales','hall_rental_sales','equipment_sales','recording_sales',
  'pa_lighting_labor_sales','optional_equipment_sales','hall_video_sales','drink_guarantee_sales',
  'studio_sales','food_sales','bar_sales','reception_drink_sales','other_income',
  'custom_sales_1_amount','custom_sales_2_amount','custom_sales_3_amount','custom_sales_4_amount'];
 const fixedSales=fields.reduce((n,key)=>n+moneyValue(settlement[key]),0);
 const shot=moneyValue(settlement.shot_500_count)*500;
 const afterparty=moneyValue(settlement.afterparty_3000_count)*3000+
  moneyValue(settlement.afterparty_2500_count)*2500+moneyValue(settlement.afterparty_1500_count)*1500;
 return artistTicket+fixedSales+shot+afterparty-(isHall?hallDeductionTotal(settlement.hall_deductions):0);
}
const eventCostFields=['venue_cost','production_cost','purchase_cost','advertising_cost','other_cost'];

export function buildMonthlyExecutiveSummary({month,teamId,staff=[],events=[],settlements=[],artistFinance=[],
 expenses=[],confirmations=[],budget=null,shifts=[],attendance=[],compensation=[],externalConfigs=[]}){
 const {start,end}=reportMonthRange(month);
 const inMonth=value=>String(value||'')>=start&&String(value||'')<end;
 const staffInTeam=staff.filter(s=>s.team_id===teamId);
 const eventRows=events.filter(e=>e.team_id===teamId&&inMonth(e.event_date));
 const eventIds=new Set(eventRows.map(e=>e.id));
 const settlementMap=new Map(settlements.filter(s=>s.team_id===teamId&&eventIds.has(s.event_id)).map(s=>[s.event_id,s]));
 const artistsByEvent=new Map();
 for(const row of artistFinance.filter(a=>a.team_id===teamId&&eventIds.has(a.event_id))){
  if(!artistsByEvent.has(row.event_id))artistsByEvent.set(row.event_id,[]);
  artistsByEvent.get(row.event_id).push(row);
 }
 const missingReports=eventRows.filter(e=>!settlementMap.has(e.id)).map(e=>({date:e.event_date,title:e.title}));
 let sales=0,eventExpense=0,eventOutside=0,manuallyEnteredLabor=0;
 for(const event of eventRows){
  const settlement=settlementMap.get(event.id);if(!settlement)continue;
  sales+=eventRevenue(settlement,event.event_genre==='ホールレンタル',artistsByEvent.get(event.id)||[]);
  eventExpense+=eventCostFields.reduce((n,k)=>n+moneyValue(settlement[k]),0);
  eventOutside+=moneyValue(settlement.outsourcing_cost);
  manuallyEnteredLabor+=moneyValue(settlement.labor_cost);
 }
 const ledger=expenses.filter(x=>x.team_id===teamId&&inMonth(x.expense_date));
 const ledgerExpense=sum(ledger.filter(x=>x.category!=='外注費'),'amount');
 const ledgerOutside=sum(ledger.filter(x=>x.category==='外注費'),'amount');
 const expenseTotal=eventExpense+ledgerExpense,outsideTotal=eventOutside+ledgerOutside;
 const payroll=confirmedPayrollRows(confirmations,staffInTeam,teamId,month);
 const confirmedIds=new Set(payroll.map(row=>row.id));
 const externalMap=new Map(externalConfigs.filter(c=>c.team_id===teamId).map(c=>[c.staff_id,c]));
 const salaryMap=new Map();
 for(const history of compensation.filter(h=>h.team_id===teamId&&String(h.effective_from)<=start)){
  const prior=salaryMap.get(history.staff_id);
  if(!prior||String(prior.effective_from)<String(history.effective_from))salaryMap.set(history.staff_id,history);
 }
 const expectedIds=new Set();
 for(const person of staffInTeam){
  if(person.active===false)continue;
  if(externalMap.get(person.id)?.default_mode==='external')continue;
  if(moneyValue(salaryMap.get(person.id)?.monthly_salary)>0)expectedIds.add(person.id);
 }
 const monthShifts=shifts.filter(row=>row.team_id===teamId&&inMonth(row.shift_date)&&row.status!=='canceled');
 for(const row of monthShifts){
  if(shiftPaymentMode(row,externalMap.get(row.staff_id))!=='external')expectedIds.add(row.staff_id);
 }
 const eventDateById=new Map(eventRows.map(e=>[e.id,e.event_date]));
 for(const row of attendance.filter(r=>r.team_id===teamId)){
  const date=row.work_date||eventDateById.get(row.event_id);
  if(!inMonth(date)||!staffInTeam.some(p=>p.id===row.staff_id))continue;
  const sameDay=monthShifts.filter(s=>s.staff_id===row.staff_id&&s.shift_date===date);
  if(sameDay.length&&sameDay.every(s=>shiftPaymentMode(s,externalMap.get(s.staff_id))==='external'))continue;
  if(!sameDay.length&&externalMap.get(row.staff_id)?.default_mode==='external')continue;
  expectedIds.add(row.staff_id);
 }
 const staffMap=new Map(staffInTeam.map(person=>[person.id,person.name]));
 const pending=[...expectedIds].filter(id=>!confirmedIds.has(id)).map(id=>staffMap.get(id)||'氏名未登録').sort((a,b)=>a.localeCompare(b,'ja'));
 const salaryTotal=payroll.reduce((n,r)=>n+r.amount,0);
 const manualPayroll=payroll.filter(r=>r.method==='manual_exception');
 const salaryExceptions=payroll.filter(r=>r.method==='salary_exception');
 const hasConfirmed=payroll.length>0;
 const salesAvailable=eventRows.length===0||missingReports.length===0;
 const expenseRecordCount=ledger.length+eventRows.filter(e=>settlementMap.has(e.id)).length;
 const referenceBalance=hasConfirmed?sales-salaryTotal-expenseTotal-outsideTotal:null;
 const monthlyBudget=budget?.team_id===teamId&&budget.year===Number(month.slice(0,4))&&budget.month===Number(month.slice(5))?budget:null;
 return {
  month,sales,salaryTotal,hasConfirmed,payroll,manualPayroll,salaryExceptions,pending,expectedCount:expectedIds.size,
  confirmedCount:payroll.length,payrollComplete:hasConfirmed&&pending.length===0,
  expenseTotal,outsideTotal,ledgerExpense,eventExpense,ledgerOutside,eventOutside,
  eventsCount:eventRows.length,reportedEventsCount:eventRows.length-missingReports.length,
  missingReports,salesAvailable,ledgerCount:ledger.length,expenseRecordCount,referenceBalance,
  manuallyEnteredLabor,monthlyBudget,
  warnings:[
   ...(salaryExceptions.length?[`月給金額のみ簡単例外確定 ${salaryExceptions.length}名。勤務時間・日数は未確認として記録されています`]:[]),
   ...(manualPayroll.length?[`打刻不完全などを手動確認して例外確定 ${manualPayroll.length}名。確認理由は給与確定履歴に記録されています`]:[]),
   ...(missingReports.length?[`収支未登録イベント ${missingReports.length}件：売上が過少の可能性があります`]:[]),
   ...(pending.length?[`給与未確定 ${pending.length}名（確定給与の支払依頼額には含めていません）`]:[]),
   ...(!hasConfirmed?['確定給与がありません。支払依頼額は未確定です']:[]),
   ...(manuallyEnteredLabor?['イベント収支報告に人件費入力があります。確定給与との重複に注意してください']:[]),
   ...(eventExpense&&ledgerExpense?['イベント収支と経費台帳の双方に金額があり、同一費用の二重登録を確認してください']:[]),
   ...(eventOutside&&ledgerOutside?['イベント収支と外注費台帳の双方に金額があり、同じ支払いの二重登録を確認してください']:[])
  ]
 };
}

export function monthlyExecutiveReportHtml({data,teamName='ThunderSnakeATSUGI',issuedAt=new Date(),note=''}) {
 if(!data||!data.month)throw Error('報告書の集計がありません');
 const esc=escapeHtml,month=data.month,y=month.slice(0,4),m=Number(month.slice(5));
 const created=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(issuedAt);
 const status=data.payrollComplete&&data.salesAvailable?'提出前確認':'要確認';
 const salaryDisplay=data.hasConfirmed?yen(data.salaryTotal):'未確定';
 const balanceDisplay=data.referenceBalance===null?'未算出':yen(data.referenceBalance);
 const val=(n)=>yen(n);
 const cell=(label,amount)=>`<div class="metric"><small>${esc(label)}</small><strong>${esc(amount)}</strong></div>`;
 const variance=(actual,target,isCost=false)=>isCost?target-actual:actual-target;
 const budget=data.monthlyBudget;
 const budgetRow=(title,actual,target,isCost)=>`<tr><td>${esc(title)}</td><td class="num">${esc(val(actual))}</td><td class="num">${target===null?'未設定':esc(val(target))}</td><td class="num">${target===null?'—':esc(val(variance(actual,target,isCost)))}</td></tr>`;
 const budgetTable=budget?`<table><thead><tr><th>項目</th><th class="num">登録額</th><th class="num">予算</th><th class="num">差額（有利方向を＋）</th></tr></thead><tbody>
  ${budgetRow('売上',data.sales,Number(budget.revenue_budget||0),false)}
  ${budgetRow('確定給与（未確定者除く）',data.salaryTotal,Number(budget.labor_budget||0),true)}
  ${budgetRow('経費（イベント入力＋台帳）',data.expenseTotal,Number(budget.cost_budget||0),true)}
  ${budgetRow('外注費（別枠）',data.outsideTotal,null,true)}
 </tbody></table>`:'<p class="note">この月の予算は未設定のため、予算比較は表示できません。</p>';
 const payrollRows=sortPayrollRows(data.payroll).map(row=>`<tr><td>${esc(row.name)}</td><td class="num">${esc(val(row.amount))}</td></tr>`).join('');
 return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
 <title>${esc(month)}_月次経営サマリー兼給与支払依頼書</title><style>
 @page{size:A4 portrait;margin:14mm 13mm}
 *{box-sizing:border-box}body{font-family:"Noto Sans JP","Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif;color:#172235;font-size:10pt;line-height:1.5;margin:0}
 main{max-width:870px;margin:24px auto;padding:0 18px}.header{border-bottom:2px solid #243c55;padding-bottom:13px;margin-bottom:14px}
 .kicker{font-size:9pt;letter-spacing:.06em;color:#5b7185;font-weight:700}h1{font-size:19pt;letter-spacing:.02em;margin:5px 0 7px}
 h2{font-size:12pt;margin:17px 0 8px;border-left:4px solid #243c55;padding-left:9px}
 .meta{display:flex;justify-content:space-between;gap:12px;font-size:9pt;color:#4d5d71}
 .status{display:inline-block;border:1px solid #e5ac5e;color:#916115;background:#fff7e9;padding:4px 10px;border-radius:30px;font-size:9pt;font-weight:700}
 .metrics{display:grid;grid-template-columns:repeat(2,1fr);gap:9px}
 .metric{border:1px solid #dbe4ec;border-radius:7px;padding:12px;background:#f7f9fc}
 .metric small{display:block;color:#64748b;font-size:9pt}.metric strong{display:block;font-size:17pt;margin-top:5px;font-variant-numeric:tabular-nums}
 .split{display:grid;grid-template-columns:1fr 1fr;gap:11px}.panel{padding:11px;border:1px solid #dae3ed;border-radius:7px}
 .panel strong{font-size:13pt}.panel p{margin:5px 0 0;font-size:9pt;color:#526175}
 table{border-collapse:collapse;width:100%;font-size:9pt}thead{background:#263b54;color:#fff}th,td{padding:7px 8px;text-align:left;border-bottom:1px solid #dce4ee}
 th.num,td.num{text-align:right;white-space:nowrap}tbody tr:nth-child(even){background:#f8fafc}
 .note{font-size:8.5pt;color:#4f6072;margin:9px 0;line-height:1.7}.warning{background:#fff9eb;border:1px solid #f0d8a1;border-radius:6px;padding:10px 13px;margin-top:11px}
 .warning p{margin:4px 0;font-size:9pt}.disclaimer{font-size:8pt;color:#5f7183;border-top:1px solid #dce4ee;padding-top:8px;margin-top:13px}
 .controls{background:#e9f0f8;border:1px solid #c6d7eb;border-radius:8px;padding:11px;margin-bottom:16px}
 .controls button{border:0;background:#213e61;color:#fff;padding:10px 16px;border-radius:5px;font:inherit;cursor:pointer}
 .controls small{display:block;margin-top:6px}.page-two{page-break-before:always;break-before:page;margin-top:28px}
 .amount-due{background:#eff4f8;border-radius:7px;padding:14px 18px;display:flex;align-items:center;justify-content:space-between}
 .amount-due strong{font-size:21pt}.confidential{font-size:8pt;color:#778493;text-align:right;margin-top:20px}
 .memo{white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #dce4ee;background:#f9fafc;border-radius:6px;padding:9px;margin-top:8px}
 .payroll-note{background:#fff8e8;padding:8px 12px;font-size:9pt;margin-top:10px}.badge{font-size:9pt;color:#9a6308;font-weight:700}
 tr{break-inside:avoid}
 @media print{main{max-width:none;margin:0;padding:0}.controls{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.page-two{margin-top:0}}
 </style></head><body><main>
 <div class="controls"><button id="print-report" type="button">PDF保存・印刷</button><small>印刷先で「PDFに保存」を選択してください。送付は自動では行われません。</small></div>
 <div class="header"><div class="kicker">${esc(teamName)} / MONTHLY MANAGEMENT REPORT</div><h1>月次経営サマリー</h1><div class="meta"><span>${esc(y)}年${m}月分（前月実績）</span><span>作成日：${esc(created)}　<span class="status">${esc(status)}</span></span></div></div>
 <h2>経営・支払サマリー</h2>
 <div class="metrics">${cell('売上（登録済みイベント収支）',val(data.sales))}${cell('確定給与（給与支払依頼候補）',salaryDisplay)}${cell('経費（人件費・外注費を除く）',val(data.expenseTotal))}${cell('外注費（給与とは別）',val(data.outsideTotal))}</div>
 <div class="split" style="margin-top:10px"><div class="panel"><div>参考差引額</div><strong>${esc(balanceDisplay)}</strong><p>売上 − 確定給与 − 登録済み経費 − 登録済み外注費。未登録・重複を未調整。</p></div>
 <div class="panel"><div>確定給与の状況</div><strong>${data.confirmedCount}名確定 / ${data.expectedCount}名対象</strong><p>${data.pending.length?'未確定 '+data.pending.length+'名':'対象者の未確定は検出されていません'} ／ 収支登録 ${data.reportedEventsCount}/${data.eventsCount}件</p></div></div>
 <h2>経費・外注費の内訳</h2>
 <table><thead><tr><th>登録元</th><th class="num">経費</th><th class="num">外注費</th></tr></thead><tbody>
 <tr><td>経費台帳</td><td class="num">${esc(val(data.ledgerExpense))}</td><td class="num">${esc(val(data.ledgerOutside))}</td></tr>
 <tr><td>イベント収支報告の経費入力</td><td class="num">${esc(val(data.eventExpense))}</td><td class="num">${esc(val(data.eventOutside))}</td></tr>
 <tr><td><b>登録額合計（重複照合前）</b></td><td class="num"><b>${esc(val(data.expenseTotal))}</b></td><td class="num"><b>${esc(val(data.outsideTotal))}</b></td></tr>
 </tbody></table>
 <h2>月次予算との比較</h2>${budgetTable}
 ${data.warnings.length?`<div class="warning"><strong>要確認</strong>${data.warnings.map(w=>`<p>・${esc(w)}</p>`).join('')}</div>`:''}
 <p class="disclaimer">対象は登録済みのイベント収支・経費台帳・確定給与です。経費台帳とイベント収支の重複、未入力の共通経費、出演者支払、税・社会保険、借入返済、現預金の動き等は未照合です。「参考差引額」は利益または資金繰り残高ではありません。外注費のシフト予測は計上していません。</p>
 <div class="page-two"><div class="header"><div class="kicker">${esc(teamName)} / PAYROLL REQUEST</div><h1>給与支払依頼・内訳</h1><div class="meta"><span>${esc(y)}年${m}月分</span><span>作成日：${esc(created)}　<span class="status">${esc(status)}</span></span></div></div>
 <div class="amount-due"><div><b>確定済み給与の合計</b><br><small>給与確定データに基づく支払依頼候補額</small></div><strong>${esc(salaryDisplay)}</strong></div>
 <p class="payroll-note">確定額は交通費・調整額を含む場合があります。所得税・社会保険等の控除後振込額とは限りません。${data.pending.length?' 未確定者がいるため、この金額のみを最終支払総額として送付しないでください。':''}</p>
 <h2>スタッフ別 給与確定一覧</h2>
 <table><thead><tr><th>氏名</th><th class="num">確定支給額</th></tr></thead><tbody>${payrollRows||'<tr><td colspan="2">確定済み給与はありません</td></tr>'}</tbody></table>
 ${data.pending.length?`<div class="warning"><b>未確定のスタッフ</b><p>${data.pending.map(esc).join('、')}</p></div>`:''}
 ${note.trim()?`<h2>社長への連絡・確認事項</h2><div class="memo">${esc(note)}</div>`:''}
 <div class="confidential">社内機密 / 給与・経営情報 / 閲覧・作成はオーナー権限のみ</div>
 </div></main></body></html>`;
}
