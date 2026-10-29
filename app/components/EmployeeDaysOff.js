'use client';
import {useState,useEffect} from 'react';
import {monthlyDaysOff} from './shift-days-off';
import './day-shift-editor.css';
export default function EmployeeDaysOff({client,team,date,staff,schedules,editingRows=null}){
 const [employees,setEmployees]=useState([]),[employeeError,setEmployeeError]=useState(''),[employeeLoading,setEmployeeLoading]=useState(team.role==='owner');
 useEffect(()=>{let active=true;setEmployees([]);setEmployeeError('');if(team.role!=='owner'){setEmployeeLoading(false);return}setEmployeeLoading(true);client.from('staff_private_profiles').select('staff_id,employment_type').eq('team_id',team.id).eq('employment_type','社員').then(({data,error})=>{if(!active)return;if(error){setEmployeeError('社員区分を取得できませんでした：'+error.message);return}setEmployees((data||[]).map(p=>p.staff_id))}).catch(e=>{if(active)setEmployeeError('社員区分を取得できませんでした：'+e.message)}).finally(()=>{if(active)setEmployeeLoading(false)});return()=>{active=false}},[client,team.id,team.role]);
 const employeeStats=monthlyDaysOff(staff.filter(s=>employees.includes(s.id)),schedules,team.id,date,editingRows);

 return <>{team.role==='owner'&&<section className="employee-days-off" aria-label="社員の月間休み日数"><h4>{Number(date.slice(5,7))}月 社員の休み日数</h4><p>月の日数から出勤日数を差し引いています。同日の複数担当は1日分です。未割当の日を含み、編集中の変更も反映します。</p>{employeeLoading?<p role="status">読み込み中…</p>:employeeError?<p role="alert">{employeeError}</p>:employeeStats.length?<div className="employee-days-off-list">{employeeStats.map(stat=><details key={stat.staff.id}><summary><b>{stat.staff.name}</b><span>出勤 {stat.workDays}日</span><strong>休み・未割当 {stat.restDays}日</strong></summary><p>休み・未割当の日：{stat.restDates.length?stat.restDates.map(d=>Number(d.slice(8))+'日').join('・'):'なし'}</p></details>)}</div>:<p>対象の社員がいません。「チーム管理 → 基本情報」で雇用形態を「社員」に設定してください。</p>}</section>}</>;
}
