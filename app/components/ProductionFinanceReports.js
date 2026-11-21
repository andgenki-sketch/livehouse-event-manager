'use client';
import {useEffect,useState} from 'react';
import {eventRevenue,monthlyRevenueOverview,reportMonthRange} from './monthly-management-report.mjs';

const currentMonth=()=>{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit'}).formatToParts(new Date());
 const part=type=>parts.find(p=>p.type===type)?.value;
 return part('year')+'-'+part('month');
};
const money=n=>n==null?'未設定':'¥'+Number(n).toLocaleString('ja-JP');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const empty={loading:true,error:'',data:null};
const chunk=(arr,n)=>Array.from({length:Math.ceil(arr.length/n)},(_,i)=>arr.slice(i*n,(i+1)*n));

/** Production-facing report contains operational totals only, never per-person payroll. */
export default function ProductionFinanceReports({client,team}){
 const [month,setMonth]=useState(currentMonth);
 const [revision,setRevision]=useState(0),[state,setState]=useState(empty);
 useEffect(()=>{
  if(!team?.id||team.role!=='member')return;
  let cancelled=false;
  const load=async()=>{
   setState(empty);
   try{
    const {start,end,year,monthNumber}=reportMonthRange(month);
    const [eventResult,studioResult,cashflowResult,expensesResult,budgetResult]=await Promise.all([
     client.from('events').select('id,event_date,title,event_genre').eq('team_id',team.id).gte('event_date',start).lt('event_date',end),
     client.from('studio_daily_sales').select('sales_date,amount').eq('team_id',team.id).gte('sales_date',start).lt('sales_date',end),
     client.from('cashflow_monthly').select('studio_sales_cash,studio_sales_cashless,status').eq('team_id',team.id).eq('month',start).eq('scenario','actual').maybeSingle(),
     client.from('expenses').select('category,amount').eq('team_id',team.id).gte('expense_date',start).lt('expense_date',end),
     client.from('monthly_budgets').select('revenue_budget,labor_budget,hourly_labor_budget,cost_budget,outsourcing_budget').eq('team_id',team.id).eq('year',year).eq('month',monthNumber).maybeSingle()
    ]);
    for(const [label,response] of [['イベント',eventResult],['スタジオ',studioResult],['資金繰り',cashflowResult],['経費',expensesResult],['予算',budgetResult]]){
     if(response.error)throw Error(label+'の取得に失敗しました：'+response.error.message);
    }
    const events=eventResult.data||[],ids=events.map(e=>e.id);
    const batches=await Promise.all(chunk(ids,100).map(async ids=>{
     const [r,a]=await Promise.all([
      client.from('settlements').select('*').eq('team_id',team.id).in('event_id',ids),
      client.from('event_artist_finance').select('event_id,ticket_sales,electronic_ticket_sales,streaming_sales,equipment_fee,video_fee,ticket_back').eq('team_id',team.id).in('event_id',ids)
     ]);
     if(r.error||a.error)throw Error('イベント収支を取得できませんでした：'+(r.error?.message||a.error?.message));
     return {settlements:r.data||[],artists:a.data||[]};
    }));
    const byEvent=new Map(batches.flatMap(b=>b.settlements).map(s=>[s.event_id,s]));
    const artists=new Map();
    for(const row of batches.flatMap(b=>b.artists)){
     if(!artists.has(row.event_id))artists.set(row.event_id,[]);
     artists.get(row.event_id).push(row);
    }
    let sales=0,studioInEvents=0,missing=0;
    for(const event of events){
     const s=byEvent.get(event.id);
     if(!s){missing++;continue}
     sales+=eventRevenue(s,event.event_genre==='ホールレンタル',artists.get(event.id)||[]);
     studioInEvents+=Number(s.studio_sales||0);
    }
    const revenue=monthlyRevenueOverview({data:{sales,eventStudioSales:studioInEvents,salesAvailable:missing===0},cashflowActual:cashflowResult.data||null,studioDailySales:studioResult.data||[]});
    const expenses=expensesResult.data||[];
    const operating=expenses.filter(x=>x.category!=='外注費').reduce((n,x)=>n+Number(x.amount||0),0);
    const outsourcing=expenses.filter(x=>x.category==='外注費').reduce((n,x)=>n+Number(x.amount||0),0);
    if(!cancelled)setState({loading:false,error:'',data:{revenue,budget:budgetResult.data||null,operating,outsourcing,events:events.length,missing}});
   }catch(e){if(!cancelled)setState({loading:false,error:e.message||'財務データを読み込めませんでした',data:null})}
  };
  load();
  return()=>{cancelled=true};
 },[client,team?.id,team?.role,month,revision]);

 if(team?.role!=='member')return null;
 const data=state.data,b=data?.budget,r=data?.revenue;
 const reportRows=[
  ['ライブハウス売上',r?.livehouse],
  ['スタジオ売上（日次または従来の入金実績）',r?.studio.total],
  ['合計売上（参考）',r?.total],
  ['売上予算',b?.revenue_budget],
  ['経費台帳・通常経費',data?.operating],
  ['経費台帳・外注費',data?.outsourcing],
  ['経費予算',b?.cost_budget],
  ['外注費予算',b?.outsourcing_budget],
  ['時給人件費予算（個人別給与なし）',b?.hourly_labor_budget]
 ];
 const print=()=>{
  if(!data)return;
  const w=window.open('','_blank');
  if(!w)return;
  w.opener=null;
  const html=`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${esc(month)} 制作向け財務サマリー</title>
   <style>body{font-family:system-ui,-apple-system,sans-serif;padding:32px;color:#1c2c40}h1{font-size:24px}table{border-collapse:collapse;width:100%;margin:22px 0}th,td{padding:12px;border-bottom:1px solid #ccd7e4;text-align:left}td:last-child{text-align:right}p{font-size:13px;line-height:1.8}button{padding:10px 18px}@media print{button{display:none}}</style></head><body>
   <h1>${esc(month)} 制作向け財務サマリー</h1><p>ThunderSnakeATSUGI / STUDIO SNAKE</p><table><tbody>
   ${reportRows.map(([k,v])=>'<tr><th>'+esc(k)+'</th><td>'+esc(money(v))+'</td></tr>').join('')}
   </tbody></table><p>イベント収支未登録：${data.missing} / ${data.events}件。月間売上は参考値であり、確定利益ではありません。スタジオ売上と入金は重複して加算しません。経費は台帳登録分のみです。</p>
   <p>給与の計算・確定、個人別給与、支払依頼書はオーナー専用のため含みません。</p><button type="button" id="print">PDF保存・印刷</button></body></html>`;
  w.document.open();w.document.write(html);w.document.close();
  w.document.getElementById('print')?.addEventListener('click',()=>w.print());
 };
 return <div className="production-finance-reports">
  <section className="card" aria-label="制作向け財務サマリー">
   <h3>制作向け財務サマリー</h3>
   <p className="hint">売上・予算・経費の月次集計を確認できます。給与計算・個人別給与明細・給与支払依頼書は含みません。</p>
   <div className="studio-sales-month">
    <label>対象月 <input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label>
    <button type="button" disabled={state.loading} onClick={()=>setRevision(x=>x+1)}>最新情報に更新</button>
   </div>
   {state.loading?<p role="status">財務データを集計中…</p>:state.error?<p role="alert">{state.error}</p>:<>
    <div className="finance-overview-sources">
     <div className="finance-overview-source"><small>ライブハウス売上</small><strong>{money(r.livehouse)}</strong></div>
     <div className="finance-overview-source"><small>スタジオ売上</small><strong>{money(r.studio.total)}</strong></div>
    </div>
    <div className="finance-overview-total"><span>月間売上合計（参考）</span><strong>{money(r.total)}</strong><small>{r.status} ／ イベント未報告 {data.missing}件</small></div>
    <table className="cashflow-sheet-table" style={{marginTop:16}}><tbody>{reportRows.slice(3).map(([label,value])=><tr key={label}><th>{label}</th><td style={{textAlign:'right'}}>{money(value)}</td></tr>)}</tbody></table>
    <p className="hint">経費は台帳登録額のみです。月給・個人別給与は表示せず、確定利益を示すものではありません。</p>
    <button type="button" className="primary" onClick={print}>制作向けサマリーをPDF保存・印刷</button>
   </>}
  </section>
 </div>;
}
