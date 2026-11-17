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
/** Incomplete/missing punches require explicit owner evidence, not estimates. */
export function canManualConfirmPayroll(row){
 if(!row?.s?.id||row.confirmed||row.isExternalOnly||(row.mixedDays||[]).length)return false;
 return (row.unclocked||[]).length>0||(row.incomplete||[]).length>0;
}
/**
 * Owner must provide verified payable amount, actual time, worked days, and
 * an audit note. Never seed any of these from an incomplete timecard.
 */
export function manualPayrollValues(entry){
 const reason=String(entry?.reason||'').trim();
 const amountText=String(entry?.amount??'').trim();
 const hoursText=String(entry?.hours??'').trim();
 const daysText=String(entry?.days??'').trim();
 if(!entry?.acknowledged)return {ok:false,reason:'勤務内容の確認チェックが必要'};
 if(!/^\d+$/.test(amountText)||Number(amountText)<=0||!Number.isSafeInteger(Number(amountText)))return {ok:false,reason:'確認済み支給額（1円以上）を入力'};
 if(!/^(?:\d+)(?:\.\d{1,2})?$/.test(hoursText)||Number(hoursText)<0||Number(hoursText)>744)return {ok:false,reason:'確認済み勤務時間（時間）を入力'};
 if(!/^\d+$/.test(daysText)||Number(daysText)<1||Number(daysText)>31)return {ok:false,reason:'確認済み勤務日数を入力'};
 if(reason.length<5||reason.length>500)return {ok:false,reason:'確認内容・根拠を5〜500文字で入力'};
 return {ok:true,amount:Number(amountText),minutes:Math.round(Number(hoursText)*60),days:Number(daysText),reason};
}
export function payrollBulkReview(rows=[]){
 const results=rows.map(row=>({row,...payrollConfirmationEligibility(row),canManualConfirm:canManualConfirmPayroll(row)}));
 return {
  results,
  eligible:results.filter(item=>item.status==='eligible'),
  confirmed:results.filter(item=>item.status==='confirmed'),
  blocked:results.filter(item=>item.status==='blocked'),
  manualCandidates:results.filter(item=>item.status==='blocked'&&item.canManualConfirm),
  excluded:results.filter(item=>item.status==='external'||item.status==='no_pay')
 };
}
export function payrollSelectedTotal(eligible=[],excludedIds=[]){
 const excluded=new Set(excludedIds);
 const selected=eligible.filter(item=>!excluded.has(item.row.s.id));
 return {selected,count:selected.length,total:selected.reduce((sum,item)=>sum+item.row.total,0)};
}
