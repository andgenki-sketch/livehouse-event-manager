'use client';
import {useState} from 'react';
import {confirmedPayrollRows,payrollReportHtml} from './payroll-report.mjs';
export default function PayrollReport({client,team,month}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 if(team?.role!=='owner')return null;
 const open=async()=>{
  if(busy)return;
  const preview=window.open('','_blank');
  if(!preview){setError('ポップアップを許可してから、もう一度押してください。');return}
  preview.opener=null;preview.document.title='確定給与を確認中';preview.document.body.textContent='確定給与を読み込んでいます…';
  setBusy(true);setError('');
  try{
   const [confirmed,people]=await Promise.all([
    client.from('payroll_confirmations').select('staff_id,team_id,payroll_month,confirmed_amount,confirmed_minutes,work_days').eq('team_id',team.id).eq('payroll_month',month+'-01'),
    client.from('venue_staff').select('id,team_id,name').eq('team_id',team.id)
   ]);
   if(confirmed.error)throw confirmed.error;if(people.error)throw people.error;
   const rows=confirmedPayrollRows(confirmed.data||[],people.data||[],team.id,month);
   if(!rows.length)throw Error('この月には確定済みの給与がありません。給与を確定してから出力してください。');
   if(preview.closed)throw Error('出力画面が閉じられました。もう一度押してください。');
   preview.document.open();preview.document.write(payrollReportHtml({rows,month,teamName:team.name}));preview.document.close();
   preview.document.getElementById('print-report').addEventListener('click',()=>preview.print());
  }catch(e){preview.close();setError('出力できませんでした：'+e.message)}finally{setBusy(false)}
 };
 return <div><button type="button" disabled={busy} onClick={open}>{busy?'確認中…':'確定給与のPDF保存'}</button>{error&&<p role="alert">{error}</p>}</div>;
}
