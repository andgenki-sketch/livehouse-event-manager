import {reportMonthRange} from './monthly-management-report.mjs';
import {cashflowReportSection} from './cashflow-model.mjs';
import {fixedMonthlySalaryTotal,resolveMonthlyLaborBudget} from './shift-labor-forecast.mjs';

const yen=value=>'¥'+Math.round(Number(value)||0).toLocaleString('ja-JP');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const validAmount=value=>{
 const n=Number(value);
 if(!Number.isSafeInteger(n)||n<0)throw Error('予算額は0以上の整数である必要があります');
 return n;
};
const display=value=>value===null?'未設定':yen(value);

/** The report submitted mid-month is for the following calendar month in Japan. */
export function nextJapanMonth(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit'}).formatToParts(now);
 let year=Number(parts.find(p=>p.type==='year').value),month=Number(parts.find(p=>p.type==='month').value);
 month++;if(month===13){year++;month=1;}
 return year+'-'+String(month).padStart(2,'0');
}

export function buildNextMonthBudgetSummary({month,teamId,budget=null,events=[],staff=[],compensation=[],externalConfigs=[]}){
 const range=reportMonthRange(month);
 const budgetMatches=budget&&budget.team_id===teamId&&Number(budget.year)===range.year&&Number(budget.month)===range.monthNumber;
 const record=budgetMatches?budget:null;
 const revenue=record?validAmount(record.revenue_budget):null;
 const cost=record?validAmount(record.cost_budget):null;
 const contractor=record&&record.outsourcing_budget!==null&&record.outsourcing_budget!==undefined?validAmount(record.outsourcing_budget):null;
 const fixed=record?fixedMonthlySalaryTotal({month,staff:staff.filter(s=>s.team_id===teamId),
    compensation:compensation.filter(c=>c.team_id===teamId),
    externalConfigs:externalConfigs.filter(c=>c.team_id===teamId)}):null;
 const laborPlan=record?resolveMonthlyLaborBudget(record,fixed):{mode:'unset',hourly:null,fixed:null,total:null};
 const hourly=record&&laborPlan.mode==='variable'?validAmount(laborPlan.hourly):null;
 const salary=record&&laborPlan.mode==='variable'?validAmount(laborPlan.fixed):null;
 const labor=record?validAmount(laborPlan.total):null;
 const projectedBalance=[revenue,labor,cost,contractor].every(x=>x!==null)?revenue-labor-cost-contractor:null;
 const plannedEvents=events.filter(e=>e.team_id===teamId&&String(e.event_date||'')>=range.start&&String(e.event_date||'')<range.end)
  .sort((a,b)=>String(a.event_date).localeCompare(String(b.event_date))||String(a.title||'').localeCompare(String(b.title||''),'ja'));
 const assigned=plannedEvents.filter(e=>validAmount(e.revenue_budget||0)>0);
 const eventTargets=assigned.reduce((n,e)=>n+validAmount(e.revenue_budget),0);
 const unassigned=plannedEvents.length-assigned.length;
 const goalsComplete=record!==null&&revenue!==null&&labor!==null&&cost!==null&&contractor!==null;
 const comments=String(record?.note||'').trim();
 const warnings=[
  ...(!record?['対象月の月次予算は未登録です。先に「収支登録 → 月次予算設定・編集」で保存してください。']:[]),
  ...(record&&contractor===null?['外注費予算が未設定のため、予算上の差引額は算出できません。']:[]),
  ...(record&&laborPlan.mode==='legacy'?['人件費は旧方式の合計予算です。月給・時給の内訳は分離されていません。']:[]),
  ...(unassigned>0?[`予定イベントのうち${unassigned}件は個別の売上予算が未設定です（0円は未入力扱い）。`]:[]),
  ...(!plannedEvents.length?['対象月のイベント予定は登録されていません。']:[])
 ];
 return {month,budgetExists:!!record,revenue,labor,salary,hourly,cost,contractor,projectedBalance,
  laborMode:laborPlan.mode,plannedEvents,plannedCount:plannedEvents.length,
  eventBudgetCount:assigned.length,eventUnassignedCount:unassigned,eventTargets,comments,
  goalsComplete,warnings};
}

export function nextMonthBudgetReportHtml({data,teamName='ThunderSnakeATSUGI',issuedAt=new Date(),ownerNote='',cashflowActual=null,cashflowPlan=null}) {
 if(!data?.month)throw Error('予算計画データを確認してください');
 const month=data.month,year=month.slice(0,4),n=Number(month.slice(5));
 const issued=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(issuedAt);
 const hasBudget=data.budgetExists;
 const budgetRow=(label,value)=>`<tr><td>${esc(label)}</td><td class="num">${esc(display(value))}</td></tr>`;
 const candidateList=data.plannedEvents.slice(0,8).map(e=>`<tr><td>${esc(String(e.event_date||'').slice(5).replace('-','/'))}</td><td>${esc(e.title||'名称未入力')}</td><td class="num">${Number(e.revenue_budget||0)>0?esc(yen(e.revenue_budget)):'未設定'}</td></tr>`).join('');
 const missingTargets=data.plannedEvents.length>8?`<p class="muted">ほか ${data.plannedEvents.length-8}件はアプリ内のイベント一覧で確認してください。</p>`:'';
 const totalCard=(label,value)=>`<div class="metric"><small>${esc(label)}</small><strong>${esc(display(value))}</strong></div>`;
 const planStatus=data.goalsComplete?'予算入力済み（内容確認）':'要設定・要確認';
 return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(month)}_月次予算計画サマリー</title><style>
 @page{size:A4 portrait;margin:12mm 13mm}
 *{box-sizing:border-box}body{font-family:"Noto Sans JP","Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif;color:#172c40;font-size:9.5pt;line-height:1.55;margin:0;background:#fff}
 main{max-width:850px;margin:20px auto;padding:0 16px}.header{border-bottom:2px solid #294358;padding-bottom:12px}.eyebrow{font-size:9pt;color:#607589;font-weight:700;letter-spacing:.08em}
 h1{font-size:19pt;margin:3px 0 4px}h2{font-size:11.5pt;margin:15px 0 6px;border-left:4px solid #294358;padding-left:8px}
 .meta{display:flex;justify-content:space-between;gap:8px;color:#556b80;font-size:9pt}.metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}
 .metric{border:1px solid #dce4eb;padding:10px 12px;border-radius:7px;background:#f7fafc}.metric small{display:block;color:#65798c;font-size:9pt}.metric strong{display:block;font-size:17pt;margin-top:5px}
 .balance{display:flex;justify-content:space-between;align-items:center;gap:10px;background:#eaf1f7;padding:12px 16px;margin-top:10px;border-radius:7px}
 .balance strong{font-size:19pt}.balance small{color:#65798c}.warning{border:1px solid #ead2a6;background:#fff9e9;border-radius:7px;padding:9px 11px;margin-top:10px}
 .warning p{font-size:8.5pt;margin:3px 0}.muted,.note{font-size:8.5pt;color:#65798c;line-height:1.6;margin:6px 0}
 table{border-collapse:collapse;width:100%;font-size:9pt}th,td{padding:6px 9px;border-bottom:1px solid #dae3ec;text-align:left}
 th{background:#294358;color:white}td.num,th.num{text-align:right;white-space:nowrap}tbody tr:nth-child(even){background:#f8fafc}
 .summary-line{display:flex;gap:15px;flex-wrap:wrap;padding:9px 12px;border:1px solid #dce4eb;border-radius:6px}
 .summary-line strong{font-size:11pt}.comment{border:1px solid #e0e6ed;padding:9px 12px;white-space:pre-wrap;overflow-wrap:anywhere;background:#fafbfd;border-radius:6px;font-size:9pt}
 .fineprint{font-size:7.8pt;color:#5f7184;margin-top:12px;border-top:1px solid #dce4eb;padding-top:8px}
 .controls{padding:10px 12px;background:#eaf1f7;border-radius:6px;margin-bottom:14px}.controls button{background:#294358;color:white;border:0;border-radius:5px;padding:10px 16px;cursor:pointer;font:inherit}.controls small{display:block;font-size:8.5pt;margin-top:4px}
 @media print{main{max-width:none;margin:0;padding:0}.controls{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
 </style></head><body><main>
 <div class="controls"><button type="button" id="print-budget">PDF保存・印刷</button><small>金額と未設定事項を確認後、印刷先で「PDFに保存」を選択。送付は自動ではありません。</small></div>
 <header class="header"><div class="eyebrow">${esc(teamName)} / MONTHLY BUDGET PLAN</div>
 <h1>月次予算計画サマリー</h1><div class="meta"><span>${esc(year)}年${n}月 計画</span><span>作成日：${esc(issued)}　${esc(planStatus)}</span></div></header>
 <div class="metrics">${totalCard('売上目標',data.revenue)}${totalCard('総人件費予算',data.labor)}${totalCard('経費予算（人件費・外注費除く）',data.cost)}${totalCard('外注費予算（独立管理）',data.contractor)}</div>
 <div class="balance"><div><b>予算上の差引額</b><div><small>売上 − 総人件費 − 経費 − 外注費</small></div></div><strong>${data.projectedBalance===null?'未算出':esc(yen(data.projectedBalance))}</strong></div>
 ${cashflowReportSection({actual:cashflowActual,plan:cashflowPlan,mode:'plan'})}
 <h2>人件費予算の内訳</h2>
 <table><thead><tr><th>区分</th><th class="num">予算</th></tr></thead><tbody>
 ${budgetRow('社員月給（固定分）',data.salary)}${budgetRow('時給スタッフ（変動分）',data.hourly)}${budgetRow('総人件費（合計）',data.labor)}
 </tbody></table>
 <h2>イベント予定と売上予算の設定状況</h2>
 <div class="summary-line"><span>予定イベント <strong>${data.plannedCount}件</strong></span><span>個別売上予算入力済み <strong>${data.eventBudgetCount}件</strong></span><span>登録済み個別予算の合計 <strong>${esc(yen(data.eventTargets))}</strong></span></div>
 ${data.revenue!==null?`<p class="note">月間売上目標 ${esc(yen(data.revenue))} に対し、イベント個別予算の登録額 ${esc(yen(data.eventTargets))}。未入力イベントがあるため、この差は確定した不足額ではありません。</p>`:''}
 ${data.plannedEvents.length?`<table><thead><tr><th>日付</th><th>イベント（先頭8件）</th><th class="num">個別売上予算</th></tr></thead><tbody>${candidateList}</tbody></table>${missingTargets}`:''}
 ${data.comments||String(ownerNote||'').trim()?`<h2>重点施策・社長への共有事項</h2><div class="comment">${data.comments?'【月次予算メモ】\n'+esc(data.comments):''}${data.comments&&ownerNote?'\n\n':''}${ownerNote?'【提出時の連絡】\n'+esc(ownerNote):''}</div>`:''}
 ${data.warnings.length?`<div class="warning"><b>提出前の確認事項</b>${data.warnings.map(x=>`<p>・${esc(x)}</p>`).join('')}</div>`:''}
 <div class="fineprint">この資料の損益予算は確定売上・契約金額・利益・現預金残高ではありません。資金繰り計画は別途入力した入出金予測です。スタッフ月給は対象月に有効な給与設定を参照します。イベント個別予算は入力済みのみ合算（0円は未設定扱い）。未登録の費用や税・社会保険、支払時期等は未反映の場合があります。機密情報につき社内でのみ取り扱ってください。</div>
 </main></body></html>`;
}
