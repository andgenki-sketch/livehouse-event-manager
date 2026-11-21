'use client';
import {useEffect,useState} from 'react';

const yen=value=>value==null?'未設定':'¥'+Math.round(Number(value)).toLocaleString('ja-JP');
/** Receives ONLY the team-wide totals from a role-checked, aggregated RPC. */
export default function ProductionMonthlyLaborProgress({client,team,year,month}){
 const [state,setState]=useState({loading:true,error:'',result:null});
 const monthDate=year+'-'+String(month).padStart(2,'0')+'-01';
 useEffect(()=>{
  if(team?.role!=='member'||!team?.id)return;
  let cancelled=false;
  setState({loading:true,error:'',result:null});
  const load=async()=>{
   const {data,error}=await client.rpc('finance_monthly_labor_progress',{
    p_team_id:team.id,p_month:monthDate
   });
   if(cancelled)return;
   if(error)setState({loading:false,error:'人件費の進捗を取得できませんでした。'+error.message,result:null});
   else setState({loading:false,error:'',result:data});
  };
  load();
  return()=>{cancelled=true};
 },[client,team?.id,team?.role,monthDate]);
 if(team?.role!=='member')return null;
 const r=state.result;
 const remaining=r?.remaining;
 const over=remaining!==null&&remaining!==undefined&&remaining<0;
 const percentage=r?.percent;
 const hasPercentage=percentage!==null&&percentage!==undefined&&Number.isFinite(Number(percentage));
 const indicator=hasPercentage?Math.max(0,Math.min(100,Number(percentage))):0;
 const color=over?'over':hasPercentage&&Number(percentage)>=80?'warning':'normal';
 return <article className={'budget-pulse-card status-'+color+' production-labor-progress'} aria-label="店舗全体の月間人件費予算進捗">
  <div className="budget-pulse-top"><h4>人件費（店舗全体・概算）</h4>
   <span className="budget-pulse-status">{state.loading?'集計中':state.error?'取得エラー':r?.budget==null?'予算未設定':over?'予算超過':hasPercentage&&percentage>=80?'注意：予算残り20%以下':'予算内'}</span>
  </div>
  {state.loading?<p role="status">月間人件費を集計中…</p>:
   state.error?<p role="alert">{state.error}</p>:
   <div>
    <div className="budget-pulse-numbers">
     <div className="budget-pulse-metric"><small>月間人件費予算</small><strong>{yen(r?.budget)}</strong></div>
     <div className="budget-pulse-metric current"><small>現在の人件費使用額</small><strong>{yen(r?.spent)}</strong></div>
    </div>
    <div className="budget-pulse-progress">
     <div className="budget-pulse-track" role="progressbar" aria-label="月間人件費の予算消化率" aria-valuemin={0} aria-valuemax={100} aria-valuenow={hasPercentage?indicator:undefined}>
      <span style={{width:indicator+'%'}}/>
     </div>
     <div className="budget-pulse-progress-label">
      <b>{hasPercentage?Number(percentage).toLocaleString('ja-JP')+'%':'—'}</b>
      <span>{r?.budget==null?'月間人件費予算が未設定です':over?'予算超過 '+yen(-remaining):'予算残額 '+yen(remaining)}</span>
     </div>
    </div>
   </div>}
  <p className="budget-pulse-detail">店舗全体の集計のみ表示。月給の固定分と打刻完了済みの時給分（登録済み交通費を含む）の概算です。スタッフ別の給与・時給・勤務明細は表示しません。未打刻・未登録勤務・法定福利費・外注費などは含まれません。</p>
  {r?.open_timecards>0&&<p className="hint" role="status">未完了の打刻 {r.open_timecards}件は未集計です。</p>}
 </article>;
}
