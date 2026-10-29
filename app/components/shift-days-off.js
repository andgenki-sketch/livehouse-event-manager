export function monthlyDaysOff(staff,schedules,teamId,date,editingRows=null){
 const month=date.slice(0,7),daysInMonth=new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate();
 return staff.map(person=>{const working=new Set(schedules.filter(s=>s.team_id===teamId&&s.staff_id===person.id&&s.status!=='draft'&&String(s.shift_date).startsWith(month)&&(editingRows===null||s.shift_date!==date)).map(s=>s.shift_date));for(const row of editingRows||[])if(row.staff_id===person.id&&row.enabled)working.add(date);const restDates=Array.from({length:daysInMonth},(_,i)=>month+'-'+String(i+1).padStart(2,'0')).filter(day=>!working.has(day));return {staff:person,workDays:working.size,restDays:restDates.length,restDates,daysInMonth}});
}
