'use client';
import {useEffect,useState} from 'react';
import {eventRevenue,monthlyRevenueOverview,reportMonthRange} from './monthly-management-report.mjs';
import ProductionMonthlyLaborProgress from './ProductionMonthlyLaborProgress';

const currentJapanMonth=()=>{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit'}).formatToParts(new Date());
 const get=type=>parts.find(part=>part.type===type).value;
 return get('year')+'-'+get('month');
};
const yen=value=>value===null||value===undefined?'未算出':'¥'+Number(value).toLocaleString('ja-JP');
const chunks=(items,size)=>Array.from({length:Math.ceil(items.length/size)},(_,index)=>items.slice(index*size,(index+1)*size));

/** Owner-only overview: use the same revenue reconciliation as the monthly management PDF. */
export default function FinanceOverview({client,team,onNavigate,onOpenEvents,onOpenStudio}){
 const [month,setMonth]=useState(currentJapanMonth);
 const [revision,setRevision]=useState(0);
 const [state,setState]=useState({loading:true,error:'',data:null});
 useEffect(()=>{
  if(!team?.id)return;
  let canceled=false;
  const load=async()=>{
   setState({loading:true,error:'',data:null});
   try{
    const {start,end}=reportMonthRange(month);
    const [eventsResult,cashflowResult,studioDailyResult]=await Promise.all([
     client.from('events').select('id,team_id,title,event_date,event_genre').eq('team_id',team.id).gte('event_date',start).lt('event_date',end),
     client.from('cashflow_monthly').select('*').eq('team_id',team.id).eq('month',start).eq('scenario','actual').maybeSingle(),
     client.from('studio_daily_sales').select('sales_date,amount').eq('team_id',team.id).gte('sales_date',start).lt('sales_date',end)
    ]);
    if(eventsResult.error)throw Error('イベントの読み込みに失敗しました：'+eventsResult.error.message);
    if(cashflowResult.error)throw Error('資金繰り実績の読み込みに失敗しました：'+cashflowResult.error.message);
    if(studioDailyResult.error)throw Error('スタジオ日次売上の読み込みに失敗しました：'+studioDailyResult.error.message);
    const events=eventsResult.data||[],ids=events.map(row=>row.id);
    const results=await Promise.all(chunks(ids,100).map(async batch=>{
     const [settlements,artists]=await Promise.all([
      client.from('settlements').select('*').eq('team_id',team.id).in('event_id',batch),
      client.from('event_artist_finance').select('team_id,event_id,ticket_sales,electronic_ticket_sales,streaming_sales,equipment_fee,video_fee,ticket_back').eq('team_id',team.id).in('event_id',batch)
     ]);
     if(settlements.error)throw Error('イベント収支の読み込みに失敗しました：'+settlements.error.message);
     if(artists.error)throw Error('出演者別売上の読み込みに失敗しました：'+artists.error.message);
     return {settlements:settlements.data||[],artists:artists.data||[]};
    }));
    const settlements=results.flatMap(x=>x.settlements),artistFinance=results.flatMap(x=>x.artists);
    const byEvent=new Map(settlements.map(row=>[row.event_id,row]));
    const byArtistEvent=new Map();
    for(const row of artistFinance){
     if(!byArtistEvent.has(row.event_id))byArtistEvent.set(row.event_id,[]);
     byArtistEvent.get(row.event_id).push(row);
    }
    let sales=0,eventStudioSales=0,missing=0;
    for(const event of events){
     const settlement=byEvent.get(event.id);
     if(!settlement){missing++;continue}
     sales+=eventRevenue(settlement,event.event_genre==='ホールレンタル',byArtistEvent.get(event.id)||[]);
     eventStudioSales+=Number(settlement.studio_sales||0);
    }
    const overview=monthlyRevenueOverview({
     data:{sales,eventStudioSales,salesAvailable:missing===0},
     cashflowActual:cashflowResult.data||null,
     studioDailySales:studioDailyResult.data||[]
    });
    if(!canceled)setState({loading:false,error:'',data:{overview,eventCount:events.length,missing}});
   }catch(error){
    if(!canceled)setState({loading:false,error:error?.message||'財務データを取得できませんでした',data:null});
   }
  };
  load();
  return()=>{canceled=true};
 },[client,team?.id,month,revision]);

 const summary=state.data?.overview;
 return <div className="finance-overview">
  <div className="finance-overview-toolbar">
   <label>対象月 <input type="month" value={month} onChange={event=>setMonth(event.target.value)}/></label>
   <button type="button" onClick={()=>setRevision(x=>x+1)} disabled={state.loading}>最新の情報に更新</button>
  </div>
  {state.loading?<p role="status">月次の売上を確認中…</p>:
   state.error?<p role="alert" className="finance-load-error">{state.error}</p>:
   <div className="finance-overview-figures">
    <div className="finance-overview-sources">
     <div className="finance-overview-source"><small>ThunderSnakeATSUGI</small><b>ライブハウス売上</b><strong>{yen(summary?.livehouse)}</strong></div>
     <div className="finance-overview-source"><small>STUDIO SNAKE</small><b>{summary?.studio.source==='daily'?'スタジオ日次売上':'スタジオ入金実績（旧方式）'}</b><strong>{summary?.studio.total===null?'未入力':yen(summary?.studio.total)}</strong></div>
    </div>
    <div className="finance-overview-total">
     <span>月間売上合計（経営確認用）</span>
     <strong>{yen(summary?.total)}</strong>
     <small>{summary?.status} ／ {state.data?.eventCount}イベント中 {state.data?.missing}件未報告</small>
    </div>
    <p className="hint">ライブハウス売上はイベント収支から算出し、イベント内のスタジオ売上を控除しています。スタジオは日次売上台帳を優先し、台帳未登録の月のみ従来の資金繰り入金実績を参照します。日次売上と資金繰りの入金は二重加算せず、照合します。売上合計は経営確認用の参考額です。{summary?.studio.source==='daily'&&summary.studio.cashflowReference!==null?'スタジオ日次売上と資金繰り入金実績の差額：'+yen(summary.studio.gap)+'。':''}未入力は0円とみなしません。</p>
   </div>}
  {team?.role==='member'&&<ProductionMonthlyLaborProgress client={client} team={team} year={Number(month.slice(0,4))} month={Number(month.slice(5))}/>}
  <div className="finance-overview-links">
   <button type="button" onClick={()=>onNavigate('budget')}><b>予算・予実管理</b><span>人件費・売上・経費・外注費の設定と比較</span></button>
   <button type="button" onClick={()=>onNavigate('cashflow')}><b>資金繰り管理</b><span>入出金計画、実績、現預金残高</span></button>
   <button type="button" onClick={()=>onNavigate('reports')}><b>報告書管理</b><span>{team?.role==='owner'?'月次経営サマリー・翌月予算・給与報告書':'制作向け月次財務サマリー（給与個人明細なし）'}</span></button>
   <button type="button" onClick={()=>onNavigate('expenses')}><b>経費・外注費</b><span>支出実績の登録・確認</span></button>
   <button type="button" onClick={onOpenEvents}><b>イベント収支登録</b><span>イベント単位の売上・収支を入力</span></button>
   <button type="button" onClick={onOpenStudio}><b>スタジオ日次売上</b><span>日付ごとの現金売上を入力・確認</span></button>
  </div>
 </div>;
}
