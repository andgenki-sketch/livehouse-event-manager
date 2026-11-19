import {eventRevenue,reportMonthRange} from './monthly-management-report.mjs';
import {calculateCashflow} from './cashflow-model.mjs';

const finiteYen=value=>{
 const n=Number(value);
 if(!Number.isSafeInteger(n))throw Error('登録済みの売上・給与金額を整数で確認できません');
 return n;
};
const yyyyMm=value=>String(value||'').slice(0,7);

/**
 * Existing settlement reports track accrued/event-level registered sales, NOT
 * proof of cash deposits. Confirmed payroll is a gross amount for a WORK month,
 * NOT proof of bank transfer in a cashflow month.
 */
export function buildCashflowLinkedReferences({teamId,events=[],settlements=[],artistFinance=[],confirmations=[]}){
 const settlementsByEvent=new Map(settlements.filter(x=>x.team_id===teamId).map(x=>[x.event_id,x]));
 const artistsByEvent=new Map();
 for(const row of artistFinance.filter(x=>x.team_id===teamId)){
  const items=artistsByEvent.get(row.event_id)||[];
  items.push(row);artistsByEvent.set(row.event_id,items);
 }
 const sales={};
 for(const event of events.filter(x=>x.team_id===teamId)){
  const month=yyyyMm(event.event_date);
  const data=sales[month]||{total:0,events:0,registered:0,missing:0,month};
  data.events++;
  const settlement=settlementsByEvent.get(event.id);
  if(settlement){
   data.total+=finiteYen(eventRevenue(settlement,event.event_genre==='ホールレンタル',artistsByEvent.get(event.id)||[]));
   data.registered++;
  }else data.missing++;
  sales[month]=data;
 }
 const payroll={};
 for(const entry of confirmations.filter(x=>x.team_id===teamId)){
  const month=yyyyMm(entry.payroll_month);
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('給与確定の対象月が不明です');
  const data=payroll[month]||{total:0,confirmed:0,month};
  const amount=finiteYen(entry.confirmed_amount);
  if(amount<0)throw Error('確定給与に負の金額が記録されています');
  data.total+=amount;data.confirmed++;
  payroll[month]=data;
 }
 return {sales,payroll};
}
export function previousCashflowMonth(month){
 const {year,monthNumber}=reportMonthRange(month);
 return monthNumber===1?String(year-1)+'-12':year+'-'+String(monthNumber-1).padStart(2,'0');
}
/** Carry only an independently reviewed previous ACTUAL balance. Never use plan. */
export function verifiedCarryover(prior,existing=null){
 if(existing?.opening_balance!==null&&existing?.opening_balance!==undefined)return null;
 if(!prior||prior.scenario!=='actual'||prior.status!=='reviewed')return null;
 if(prior.reported_closing_balance===null||prior.reported_closing_balance===undefined)return null;
 const n=finiteYen(prior.reported_closing_balance);
 return n; // including 0 and negative balances
}
export function salesAllocation({reference,receivedCash,receivedCashless}){
 if(!reference||!Number.isSafeInteger(reference.total)||reference.registered===0)throw Error('イベント売上の連携対象がありません');
 if(reference.missing)throw Error('収支未登録のイベントがあります。先にイベント収支を登録してください');
 // The receipt is not inferable from event accounting; explicitly verify both parts.
 const cash=finiteYen(receivedCash),cashless=finiteYen(receivedCashless);
 if(cash<0||cashless<0)throw Error('入金額は0円以上で入力してください');
 if(cash+cashless!==reference.total)
  throw Error('現金とキャッシュレスの合計が登録済みイベント売上と一致しません');
 return {sales_cash:cash,sales_cashless:cashless};
}
export function payrollPaymentSuggestion(ref){
 if(!ref||ref.confirmed<1)throw Error('対象月の確定給与がありません');
 if(!Number.isSafeInteger(ref.total)||ref.total<0)throw Error('確定給与の金額が正しくありません');
 return ref.total;
}
const distinctChunks=(items,size)=>Array.from({length:Math.ceil(items.length/size)},(_,i)=>items.slice(i*size,(i+1)*size));
/** Owner-only reads under existing table RLS and explicit team restrictions. */
export async function fetchCashflowLinkedReferences(client,teamId,fiscalYear){
 if(!teamId||!Number.isInteger(fiscalYear))throw Error('資金繰り連携の取得条件が不正です');
 const start=fiscalYear+'-09-01',end=(fiscalYear+1)+'-09-01';
 // Include August confirmed payroll for September payment candidates.
 const preceding=fiscalYear+'-08-01';
 const [eventsResult,payResult]=await Promise.all([
  client.from('events').select('id,team_id,title,event_date,event_genre').eq('team_id',teamId).gte('event_date',start).lt('event_date',end).order('event_date'),
  client.from('payroll_confirmations').select('team_id,staff_id,payroll_month,confirmed_amount').eq('team_id',teamId).gte('payroll_month',preceding).lt('payroll_month',end)
 ]);
 if(eventsResult.error)throw Error('イベント予定の取得に失敗しました: '+eventsResult.error.message);
 if(payResult.error)throw Error('確定給与の取得に失敗しました: '+payResult.error.message);
 const events=eventsResult.data||[],confirmations=payResult.data||[];
 if(events.length>=1000||confirmations.length>=1000)throw Error('連携データが取得上限に達しました。月別の再集計が必要です');
 const ids=events.map(row=>row.id),settlements=[],artistFinance=[];
 for(const batch of distinctChunks(ids,75)){
  const [settle,artist]=await Promise.all([
   client.from('settlements').select('*').eq('team_id',teamId).in('event_id',batch),
   client.from('event_artist_finance').select('team_id,event_id,ticket_sales,electronic_ticket_sales,streaming_sales,equipment_fee,video_fee,ticket_back').eq('team_id',teamId).in('event_id',batch)
  ]);
  if(settle.error)throw Error('イベント収支の取得に失敗しました: '+settle.error.message);
  if(artist.error)throw Error('アーティスト収支の取得に失敗しました: '+artist.error.message);
  settlements.push(...(settle.data||[]));artistFinance.push(...(artist.data||[]));
 }
 return buildCashflowLinkedReferences({teamId,events,settlements,artistFinance,confirmations});
}
