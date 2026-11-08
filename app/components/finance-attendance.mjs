// Resolve missing timecard rates using owner-visible pay history, without changing records.
export function financeAttendanceRates(attendance,events,history=[]){
 const dates=new Map(events.map(event=>[event.id,event.event_date]));
 return attendance.map(row=>{
  if(Number(row.hourly_wage||0)>0)return row;
  const date=row.event_id?dates.get(row.event_id):row.work_date;
  if(!date||!row.team_id)return row;
  const month=date.slice(0,7)+'-01';
  const pay=history.filter(item=>item.team_id===row.team_id&&item.staff_id===row.staff_id&&item.effective_from<=month).sort((a,b)=>b.effective_from.localeCompare(a.effective_from))[0];
  if(!pay)return row;
  return {...row,hourly_wage:Number(pay.monthly_salary||0)>0?0:Number(pay.hourly_wage||0),transportation_fee:Number(row.transportation_fee||0)||Number(pay.transportation_fee||0)};
 });
}
