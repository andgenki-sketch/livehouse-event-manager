'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {studioDailySaleInput,studioDailySalesSummary,validStudioSalesDate} from './studio-daily-sales.mjs';

const japanToday=()=>{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const value=name=>parts.find(x=>x.type===name)?.value;
 return value('year')+'-'+value('month')+'-'+value('day');
};
const yen=amount=>'¥'+Number(amount).toLocaleString('ja-JP');
const monthEnd=month=>{
 const [year,m]=month.split('-').map(Number);
 return month+'-'+String(new Date(year,m,0).getDate()).padStart(2,'0');
};

/** All team staff can register cash-only daily sales, without access to owner finances. */
export default function StudioDailySales({client,team,userId}){
 const [month,setMonth]=useState(()=>japanToday().slice(0,7));
 const [date,setDate]=useState(japanToday);
 const [amount,setAmount]=useState('');
 const [rows,setRows]=useState([]);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const [revision,setRevision]=useState(0);
 const submitLock=useRef(false);
 useEffect(()=>{
  if(!team?.id)return;
  let stale=false;
  const load=async()=>{
   setLoading(true);setError('');
   const next=new Date(Number(month.slice(0,4)),Number(month.slice(5)),1);
   const end=next.getFullYear()+'-'+String(next.getMonth()+1).padStart(2,'0')+'-01';
   const {data,error:fetchError}=await client.from('studio_daily_sales')
    .select('id,team_id,sales_date,amount,created_by,created_at,updated_at')
    .eq('team_id',team.id).gte('sales_date',month+'-01').lt('sales_date',end)
    .order('sales_date',{ascending:false});
   if(stale)return;
   if(fetchError){setError('スタジオ売上を読み込めませんでした：'+fetchError.message);setRows([])}
   else setRows(data||[]);
   setLoading(false);
  };
  load();
  return()=>{stale=true};
 },[client,team?.id,month,revision]);
 const summary=useMemo(()=>studioDailySalesSummary(rows),[rows]);
 const selected=rows.find(row=>row.sales_date===date);
 const mayEdit=selected&&(team?.role==='owner'||selected.created_by===userId);
 const changeMonth=value=>{
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))return;
  setMonth(value);setDate(value===japanToday().slice(0,7)?japanToday():value+'-01');
  setAmount('');setMessage('');setError('');
 };
 const chooseDate=value=>{setDate(value);setAmount('');setMessage('')};
 const save=async event=>{
  event.preventDefault();
  if(submitLock.current||loading||saving)return;
  setError('');setMessage('');
  if(!team?.id||!userId){setError('ログイン状態を確認できませんでした。');return}
  if(!validStudioSalesDate(date)||!date.startsWith(month)){setError('対象月の日付を選択してください。');return}
  let value;
  try{value=studioDailySaleInput(amount)}catch(e){setError(e.message);return}
  if(selected&&!mayEdit){setError('この日の売上は他のスタッフが登録済みです。修正は登録したスタッフまたはオーナーに依頼してください。');return}
  submitLock.current=true;setSaving(true);
  try{
   const result=selected?
    await client.from('studio_daily_sales').update({amount:value}).eq('id',selected.id).eq('team_id',team.id).select('id').maybeSingle():
    await client.from('studio_daily_sales').insert({team_id:team.id,sales_date:date,amount:value,created_by:userId}).select('id').single();
   if(result.error)throw result.error;
   if(!result.data)throw Error('保存対象の売上を確認できませんでした。再読み込みしてください。');
   setAmount('');setMessage(date+' の売上 '+yen(value)+' を保存しました。');setRevision(n=>n+1);
  }catch(e){
   setError(e.code==='23505'?'この日の売上はすでに登録されています。最新の情報を確認してください。':'保存できませんでした：'+(e.message||'不明なエラー'));
   setRevision(n=>n+1);
  }finally{submitLock.current=false;setSaving(false)}
 };
 const remove=async row=>{
  if(team?.role!=='owner')return;
  if(!window.confirm(row.sales_date+' のスタジオ売上を削除しますか？'))return;
  setSaving(true);setError('');setMessage('');
  try{
   const {error:deleteError}=await client.from('studio_daily_sales').delete().eq('id',row.id).eq('team_id',team.id);
   if(deleteError)throw deleteError;
   setMessage('売上登録を削除しました。');setAmount('');setRevision(n=>n+1);
  }catch(e){setError('削除できませんでした：'+e.message)}
  finally{setSaving(false)}
 };
 return <div className="listpage studio-daily-sales">
  <div className="sectionhead">
   <div><h2>STUDIO SNAKE 日次売上</h2><p>現金売上の合計を1日1件入力します。部屋ごとの内訳は不要です。</p></div>
  </div>
  <div className="studio-sales-month"><label>対象月 <input type="month" value={month} onChange={e=>changeMonth(e.target.value)}/></label><button type="button" onClick={()=>changeMonth(japanToday().slice(0,7))}>今月</button><button type="button" disabled={loading} onClick={()=>setRevision(n=>n+1)}>更新</button></div>
  <div className="studio-sales-summary">
   <div><small>{month.slice(0,4)}年{Number(month.slice(5))}月の入力済み売上</small><strong>{summary.total===null?'未入力':yen(summary.total)}</strong></div>
   <span>{summary.days}日分登録</span>
  </div>
  <form className="card studio-sales-form" onSubmit={save}>
   <h3>日次売上を{selected?'修正':'登録'}</h3>
   <div className="studio-sales-fields">
    <label>売上日<input type="date" value={date} min={month+'-01'} max={monthEnd(month)} onChange={e=>chooseDate(e.target.value)} required/></label>
    <label>現金売上合計（円）<input type="number" min="0" step="1" value={amount} onChange={e=>setAmount(e.target.value)} placeholder={selected?String(selected.amount):'金額を入力'} required disabled={loading||Boolean(selected&&!mayEdit)}/></label>
   </div>
   {selected&&<p className="hint">この日は登録済み：{yen(selected.amount)}{!mayEdit?'（他のスタッフが登録。閲覧のみ）':'（金額を入力して更新できます）'}</p>}
   {loading&&<p role="status">売上データを読み込み中…</p>}
   {error&&<p role="alert" className="studio-sales-error">{error}</p>}
   {message&&<p role="status" className="studio-sales-success">{message}</p>}
   <button type="submit" className="primary" disabled={saving||loading||!!error&&error.startsWith('スタジオ売上を読み込めませんでした')||Boolean(selected&&!mayEdit)}>{saving?'保存中…':selected?'売上を更新':'売上を登録'}</button>
  </form>
  <section className="card studio-sales-list">
   <h3>登録済み売上一覧</h3>
   <p className="hint">登録済みの日付を選ぶと金額を修正できます。登録者以外の修正・削除はオーナーが行います。</p>
   {loading?<p role="status">一覧を読み込み中…</p>:rows.length?<div className="studio-sales-list-rows">{rows.map(row=><div className="studio-sales-list-row" key={row.id}>
    <span>{row.sales_date}</span><strong>{yen(row.amount)}</strong>
    <span className="studio-sales-row-actions"><button type="button" disabled={saving} onClick={()=>{setDate(row.sales_date);setAmount(String(row.amount));setMessage('')}}>{team?.role==='owner'||row.created_by===userId?'編集':'確認'}</button>{team?.role==='owner'&&<button type="button" className="danger" disabled={saving} onClick={()=>remove(row)}>削除</button>}</span>
   </div>)}</div>:<p>この月の売上はまだ登録されていません。</p>}
  </section>
  <p className="hint">入力した売上は財務管理の経営ダッシュボード・月次経営サマリーへ集計されます。資金繰り表の入金実績とは照合し、二重には加算しません。</p>
 </div>;
}
