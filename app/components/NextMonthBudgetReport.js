'use client';
import {useState} from 'react';
import {buildNextMonthBudgetSummary,nextJapanMonth,nextMonthBudgetReportHtml} from './next-month-budget-report.mjs';
import {reportMonthRange} from './monthly-management-report.mjs';

/** Read-only executive plan export; budgets are edited in the existing finance UI. */
export default function NextMonthBudgetReport({client,team}){
 const [month,setMonth]=useState(()=>nextJapanMonth());
 const [ownerNote,setOwnerNote]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 if(team?.role!=='owner')return null;
 const open=async()=>{
  if(busy||!team?.id)return;
  const preview=window.open('','_blank');
  if(!preview){setError('ポップアップがブロックされています。このサイトのポップアップを許可してください。');return}
  preview.opener=null;
  preview.document.title='翌月予算を集計中';
  preview.document.body.textContent='予算・イベント予定を確認しています…';
  setBusy(true);setError('');
  try{
   const {start,end,year,monthNumber}=reportMonthRange(month);
   const [budget,events,staff,compensation,externalConfigs]=await Promise.all([
    client.from('monthly_budgets').select('team_id,year,month,revenue_budget,labor_budget,hourly_labor_budget,cost_budget,outsourcing_budget,note').eq('team_id',team.id).eq('year',year).eq('month',monthNumber).maybeSingle(),
    client.from('events').select('id,team_id,event_date,title,status,event_genre,revenue_budget').eq('team_id',team.id).gte('event_date',start).lt('event_date',end),
    client.from('venue_staff').select('id,team_id,active,name,hourly_wage').eq('team_id',team.id),
    client.from('staff_compensation_history').select('team_id,staff_id,effective_from,monthly_salary,hourly_wage,transportation_fee').eq('team_id',team.id).lte('effective_from',start),
    client.from('staff_external_pay_settings').select('team_id,staff_id,default_mode').eq('team_id',team.id)
   ]);
   for(const [name,result] of [['月次予算',budget],['イベント予定',events],['スタッフ',staff],['給与設定',compensation],['外注設定',externalConfigs]]){
    if(result.error)throw Error(name+'の取得に失敗しました：'+result.error.message);
   }
   const data=buildNextMonthBudgetSummary({month,teamId:team.id,budget:budget.data,
    events:events.data||[],staff:staff.data||[],compensation:compensation.data||[],externalConfigs:externalConfigs.data||[]});
   if(preview.closed)throw Error('プレビュー画面が閉じられました');
   preview.document.open();
   preview.document.write(nextMonthBudgetReportHtml({data,teamName:team.name||'ThunderSnakeATSUGI',ownerNote}));
   preview.document.close();
   preview.document.getElementById('print-budget')?.addEventListener('click',()=>preview.print());
  }catch(e){
   if(!preview.closed)preview.close();
   setError('翌月予算サマリーを作成できませんでした：'+(e?.message||'不明なエラー'));
  }finally{setBusy(false)}
 };
 return <section className="monthly-management-report" aria-label="社長提出用 翌月予算サマリー">
  <div className="monthly-management-report-head"><div>
   <h3>社長提出用 月次予算計画サマリー</h3>
   <p>売上目標・社員月給・時給人件費・経費・外注費予算とイベント予定をまとめ、翌月計画としてPDF保存できます。</p>
  </div><span className="monthly-management-private">オーナー専用</span></div>
  <div className="monthly-management-report-fields">
   <label>予算対象月<input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label>
   <button type="button" className="monthly-management-prev" onClick={()=>setMonth(nextJapanMonth())}>翌月を選択</button>
  </div>
  <label className="monthly-management-memo">社長への連絡事項・重点施策（任意）
   <textarea rows={2} maxLength={2000} value={ownerNote} onChange={e=>setOwnerNote(e.target.value)} placeholder="例：来月の集客施策、協賛営業、外注調整など"/></label>
  <div className="monthly-management-actions">
   <button className="primary" type="button" disabled={busy||!month} onClick={open}>{busy?'集計中…':'翌月予算サマリーPDFを作成'}</button>
   <p>金額の登録・編集は「収支登録 → 月次予算設定・編集」で行ってください。未登録の項目は「未設定」と表示されます。</p>
  </div>
  {error&&<p className="monthly-management-error" role="alert">{error}</p>}
  <p className="monthly-management-disclaimer">予算と予定はあくまで計画値です。給与実績や売上実績とは混ぜず、外注費の未設定、イベント個別売上予算の未入力を明示します。メールは自動送信しません。</p>
 </section>;
}
