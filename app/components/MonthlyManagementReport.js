'use client';
import {useState} from 'react';
import {buildMonthlyExecutiveSummary,monthlyExecutiveReportHtml,previousJapanMonth,reportMonthRange} from './monthly-management-report.mjs';

/**
 * Owner-only, on-demand month-end PDF (browser print-to-PDF).
 * Nothing is sent to a third party and no data is mutated by this action.
 */
export default function MonthlyManagementReport({client,team}){
 const [month,setMonth]=useState(()=>previousJapanMonth());
 const [note,setNote]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 if(team?.role!=='owner')return null;

 const openReport=async()=>{
  if(busy||!team?.id)return;
  // Open synchronously, before the first await, to avoid blocked popups.
  const preview=window.open('','_blank');
  if(!preview){setError('ポップアップがブロックされました。ブラウザでこのサイトのポップアップを許可してください。');return}
  preview.opener=null;
  preview.document.title='月次サマリーを集計中';
  preview.document.body.textContent='前月の収支・給与・経費を確認中です…';
  setBusy(true);setError('');
  try{
   const {start,end,year,monthNumber}=reportMonthRange(month);
   const eqTeam=table=>client.from(table);
   const all=await Promise.all([
    eqTeam('events').select('id,team_id,title,event_date,event_genre').eq('team_id',team.id).gte('event_date',start).lt('event_date',end),
    eqTeam('expenses').select('team_id,event_id,expense_date,category,amount').eq('team_id',team.id).gte('expense_date',start).lt('expense_date',end),
    eqTeam('payroll_confirmations').select('team_id,staff_id,payroll_month,confirmed_amount,confirmed_minutes,work_days,confirmation_method,exception_reason').eq('team_id',team.id).eq('payroll_month',start),
    eqTeam('venue_staff').select('id,team_id,name,active').eq('team_id',team.id),
    eqTeam('monthly_budgets').select('*').eq('team_id',team.id).eq('year',year).eq('month',monthNumber).maybeSingle(),
    eqTeam('shift_schedules').select('team_id,staff_id,shift_date,status,payment_override,role_name').eq('team_id',team.id).gte('shift_date',start).lt('shift_date',end),
    eqTeam('event_attendance').select('id,team_id,staff_id,event_id,work_date').eq('team_id',team.id).gte('work_date',start).lt('work_date',end),
    eqTeam('staff_compensation_history').select('team_id,staff_id,effective_from,monthly_salary').eq('team_id',team.id).lte('effective_from',start),
    eqTeam('staff_external_pay_settings').select('team_id,staff_id,default_mode').eq('team_id',team.id)
   ]);
   for(let i=0;i<all.length;i++)if(all[i].error)throw Error(['イベント','経費','確定給与','スタッフ','予算','シフト','勤怠','給与履歴','外注設定'][i]+'の読み込みに失敗しました: '+all[i].error.message);
   const [events,expenses,confirmed,staff,budget,schedules,attendance,compensation,external]=all;
   const ids=(events.data||[]).map(row=>row.id);
   const fetchEventRows=async(table,columns)=>ids.length?client.from(table).select(columns).eq('team_id',team.id).in('event_id',ids):{data:[],error:null};
   const [settlements,artistFinance,eventAttendance]=await Promise.all([
    fetchEventRows('settlements','*'),
    fetchEventRows('event_artist_finance','team_id,event_id,ticket_sales,electronic_ticket_sales,streaming_sales,equipment_fee,video_fee,ticket_back'),
    fetchEventRows('event_attendance','id,team_id,staff_id,event_id,work_date')
   ]);
   for(const [name,result] of [['イベント収支',settlements],['アーティスト収支',artistFinance],['イベント勤怠',eventAttendance]])if(result.error)throw Error(name+'の読み込みに失敗しました: '+result.error.message);
   const attendanceMap=new Map([...(attendance.data||[]),...(eventAttendance.data||[])].map(row=>[row.id,row]));
   const data=buildMonthlyExecutiveSummary({
    month,teamId:team.id,
    staff:staff.data||[],events:events.data||[],settlements:settlements.data||[],artistFinance:artistFinance.data||[],
    expenses:expenses.data||[],confirmations:confirmed.data||[],budget:budget.data||null,
    shifts:schedules.data||[],attendance:[...attendanceMap.values()],compensation:compensation.data||[],
    externalConfigs:external.data||[]
   });
   const cashflowResponse=await client.from('cashflow_monthly').select('*')
    .eq('team_id',team.id).eq('month',month+'-01');
   if(cashflowResponse.error)throw Error('資金繰りデータを取得できませんでした：'+cashflowResponse.error.message);
   const cashflowActual=(cashflowResponse.data||[]).find(row=>row.scenario==='actual')||null;
   const cashflowPlan=(cashflowResponse.data||[]).find(row=>row.scenario==='plan')||null;
   const studioDailyResponse=await client.from('studio_daily_sales').select('sales_date,amount')
    .eq('team_id',team.id).gte('sales_date',start).lt('sales_date',end);
   if(studioDailyResponse.error)throw Error('スタジオ日次売上を取得できませんでした：'+studioDailyResponse.error.message);
   const studioDailySales=studioDailyResponse.data||[];
   if(preview.closed)throw Error('出力画面が閉じられました。もう一度開いてください。');
   preview.document.open();
   preview.document.write(monthlyExecutiveReportHtml({data,teamName:team.name||'ThunderSnakeATSUGI',note,cashflowActual,cashflowPlan,studioDailySales}));
   preview.document.close();
   const print=preview.document.getElementById('print-report');
   if(print)print.addEventListener('click',()=>preview.print());
  }catch(e){
   if(!preview.closed)preview.close();
   setError('月次サマリーを作成できませんでした：'+(e?.message||'不明なエラー'));
  }finally{setBusy(false)}
 };
 return <section className="monthly-management-report" aria-label="社長提出用月次サマリー">
  <div className="monthly-management-report-head">
   <div><h3>社長提出用 月次経営サマリー</h3>
    <p>毎月15日の提出向けに、ライブハウス売上＋STUDIO SNAKE売上の合計を先頭で大きく表示し、共通の人件費・経費・外注費と並べて確認できるPDFにまとめます。</p></div>
   <span className="monthly-management-private">オーナー専用</span>
  </div>
  <div className="monthly-management-report-fields">
   <label>対象月<input type="month" value={month} onChange={e=>setMonth(e.target.value)} /></label>
   <button type="button" className="monthly-management-prev" onClick={()=>setMonth(previousJapanMonth())}>前月を選択</button>
  </div>
  <label className="monthly-management-memo">社長への連絡事項（任意）
   <textarea rows={2} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} placeholder="例：振込予定日や確認してほしい事項を入力"/></label>
  <div className="monthly-management-actions">
   <button type="button" className="primary" onClick={openReport} disabled={busy||!month}>{busy?'集計中…':'月次サマリーPDFを作成'}</button>
   <p>プレビューで内容を確認し、「PDF保存・印刷」を押してください。メール送信は自動では行いません。</p>
  </div>
  {error&&<p role="alert" className="monthly-management-error">{error}</p>}
  <p className="monthly-management-disclaimer">スタジオ売上は日次台帳を優先して集計します（日次未入力の月は旧方式の資金繰り実績を参照）。資金繰りの入金額と二重加算せず差額を照合します。未入力時の売上合計は未算出です。給与の支払依頼額は確定済みの給与データのみ。未確定者、未登録のイベント収支、イベント経費と経費台帳の重複候補を明示します。シフト予測の外注費・人件費は実績に加算しません。</p>
 </section>;
}
