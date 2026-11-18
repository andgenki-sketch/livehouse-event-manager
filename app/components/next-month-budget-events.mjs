/**
 * Revenue budgets are intentionally column-restricted on public.events.
 * Read nonfinancial event fields with the existing team-member SELECT RLS
 * and read sensitive event targets using the existing owner/member-scoped
 * get_event_contracts RPC. Never grant broader events table permissions.
 */
export const PUBLIC_BUDGET_EVENT_COLUMNS='id,team_id,event_date,title,status,event_genre';

export async function fetchMonthlyBudgetEvents(client,teamId,start,end){
 if(!client||!teamId||!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end))
  throw Error('イベント取得条件を確認してください');
 const response=await client.from('events').select(PUBLIC_BUDGET_EVENT_COLUMNS)
  .eq('team_id',teamId).gte('event_date',start).lt('event_date',end);
 if(response.error)throw Error('イベント予定を取得できませんでした: '+response.error.message);
 const events=response.data||[];
 const enriched=[];
 // Avoid initiating dozens of simultaneous HTTP calls for a busy event month.
 for(let i=0;i<events.length;i+=8){
  const group=await Promise.all(events.slice(i,i+8).map(async event=>{
   if(!event?.id||event.team_id!==teamId)throw Error('イベントの所属チームを確認できませんでした');
   const {data,error}=await client.rpc('get_event_contracts',{p_event_id:event.id});
   if(error)throw Error('イベント売上予算の取得に失敗しました: '+error.message);
   // The existing protected RPC returns null when access is denied.
   if(!data||typeof data!=='object'||Array.isArray(data)||!Object.hasOwn(data,'revenue_budget'))
    throw Error('イベント売上予算へのアクセス権を確認できませんでした。オーナー権限を確認してください。');
   const raw=data.revenue_budget;
   const amount=raw===null?null:Number(raw);
   if(amount!==null&&(!Number.isSafeInteger(amount)||amount<0))
    throw Error('イベント売上予算の値を確認できませんでした');
   return {...event,revenue_budget:amount};
  }));
  enriched.push(...group);
 }
 return enriched;
}
