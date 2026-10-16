'use client';
import {useState} from 'react';
import {staffGroups} from './StaffManagement';
export function moveStaffId(ids,from,to){const next=[...ids],a=next.indexOf(from),b=next.indexOf(to);if(a<0||b<0||a===b)return next;next.splice(a,1);next.splice(b,0,from);return next;}
export default function ShiftStaffPicker({staff,team,client,reloadPositions,renderCandidate}){
 const [editing,setEditing]=useState(false),[drag,setDrag]=useState(null),[orders,setOrders]=useState({}),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const owner=team?.role==='owner';
 const groups=staffGroups(staff).map(g=>{const ids=orders[g.key];if(!ids)return g;const rank=new Map(ids.map((id,i)=>[id,i]));return {...g,staff:[...g.staff].sort((a,b)=>(rank.get(a.id)??999999)-(rank.get(b.id)??999999))}});
 const move=async(group,from,to)=>{
  if(!owner||busy||from===to)return;
  const ids=group.staff.map(s=>s.id),next=moveStaffId(ids,from,to);
  if(next.every((id,i)=>id===ids[i]))return;
  setBusy(true);setMessage('保存中…');setOrders(x=>({...x,[group.key]:next}));
  try{const {error}=await client.rpc('reorder_shift_candidates',{p_team_id:team.id,p_group:group.key,p_staff_ids:next});if(error)throw error;await reloadPositions();setMessage('並び順を保存しました')}catch(e){setOrders(x=>({...x,[group.key]:ids}));setMessage('保存できませんでした：'+e.message)}finally{setBusy(false);setDrag(null)}
 };
 return <><div className="shift-picker-heading"><h4>スタッフを選択</h4>{owner&&<button type="button" disabled={busy} onClick={()=>{setEditing(x=>!x);setMessage('');setDrag(null)}}>{editing?'並び替えを終了':'並び替え'}</button>}</div>{editing&&<p className="hint">各区分内でドラッグ、または↑↓で移動できます。変更は自動保存され、全員のシフト作成画面に反映されます。</p>}
 {groups.map(group=><section className="shift-candidate-group" key={group.key}><h5>{group.name}</h5><div className="shift-candidate-list">{group.staff.map((s,index)=>editing&&owner?<div className={'shift-order-card'+(drag?.id===s.id&&drag?.group===group.key?' dragging':'')} key={s.id} draggable={!busy} onDragStart={e=>{setDrag({id:s.id,group:group.key});e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',s.id)}} onDragEnd={()=>setDrag(null)} onDragOver={e=>{if(!busy&&drag?.group===group.key){e.preventDefault();e.dataTransfer.dropEffect='move'}}} onDrop={e=>{e.preventDefault();if(drag?.group===group.key)move(group,drag.id,s.id)}}><span aria-hidden="true">⠿</span><b>{s.name}</b><div><button type="button" aria-label={s.name+'を上に移動'} disabled={busy||index===0} onClick={()=>move(group,s.id,group.staff[index-1].id)}>↑</button><button type="button" aria-label={s.name+'を下に移動'} disabled={busy||index===group.staff.length-1} onClick={()=>move(group,s.id,group.staff[index+1].id)}>↓</button></div></div>:renderCandidate(s))}</div></section>)}{message&&<p role="status">{message}</p>}</>;
}
