/**
 * Select only previously unconfirmed, payable, fully reviewed salary records.
 * The list is based on the same calculated rows as the individual confirmation.
 * Any staff needing a human review is excluded instead of auto-confirmed.
 */
export function payrollConfirmationEligibility(row){
 if(row?.confirmed)return {status:'confirmed',label:'確定済み'};
 if(row?.isExternalOnly)return {status:'external',label:'外注扱い（給与対象外）'};
 if((row?.mixedDays||[]).length)return {status:'blocked',label:'給与・外注の混在'};
 if((row?.unclocked||[]).length)return {status:'blocked',label:'未打刻シフトあり'};
 if((row?.incomplete||[]).length)return {status:'blocked',label:'打刻不完全'};
 const total=Number(row?.total);
 if(!Number.isSafeInteger(total)||total<0)return {status:'blocked',label:'給与額の確認が必要'};
 if(Number(row?.usedMinutes||0)>0&&Number(row?.monthly||0)<=0&&Number(row?.hourly||0)<=0)
  return {status:'blocked',label:'時給が未設定'};
 if(total===0)return {status:'no_pay',label:'支給額0円（対象外）'};
 if(!row?.s?.id)return {status:'blocked',label:'スタッフ情報がありません'};
 return {status:'eligible',label:'一括確定可能'};
}
export function payrollBulkReview(rows=[]){
 const results=rows.map(row=>({row,...payrollConfirmationEligibility(row)}));
 return {
  results,
  eligible:results.filter(item=>item.status==='eligible'),
  confirmed:results.filter(item=>item.status==='confirmed'),
  blocked:results.filter(item=>item.status==='blocked'),
  excluded:results.filter(item=>item.status==='external'||item.status==='no_pay')
 };
}
export function payrollSelectedTotal(eligible=[],excludedIds=[]){
 const excluded=new Set(excludedIds);
 const selected=eligible.filter(item=>!excluded.has(item.row.s.id));
 return {selected,count:selected.length,total:selected.reduce((sum,item)=>sum+item.row.total,0)};
}
