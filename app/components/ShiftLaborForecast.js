'use client';
import {useMemo,useState} from 'react';
import {estimateMonthlyShiftLabor,DEFAULT_SHIFT_PAID_HOURS} from './shift-labor-forecast.mjs';

const hourFields=[
 ['day','昼の部'],
 ['night','夜の部'],
 ['all','全日'],
 ['studioEarly','スタジオ早番'],
 ['studioLate','スタジオ遅番']
];
const yen=n=>'¥'+Math.round(Number(n)||0).toLocaleString('ja-JP');

export default function ShiftLaborForecast({month,staff=[],schedules=[],compensation=[],budgets=[],payrollLoadError=''}) {
 const [hours,setHours]=useState({...DEFAULT_SHIFT_PAID_HOURS});
 const result=useMemo(()=>estimateMonthlyShiftLabor({month,staff,schedules,compensation,hours}),[month,staff,schedules,compensation,hours]);
 const [year,mon]=month.split('-').map(Number);
 const budgetRow=budgets.find(x=>x.year===year&&x.month===mon);
 const hasBudget=!!budgetRow,budget=Number(budgetRow?.labor_budget||0);
 const ratio=hasBudget&&budget>0?result.total/budget*100:null;
 const remaining=budget-result.total;
 const warning=!!result.missingRates.length||!!payrollLoadError;
 const status=!hasBudget?'unset':result.total>budget?'over':budget>0&&result.total>=budget*.8?'warning':'normal';
 const title=status==='over'?'予算超過見込み':status==='warning'?'予算に接近中':status==='unset'?'予算未設定':'予算内の見込み';
 return <section className={'shift-labor-forecast shift-forecast-'+status} aria-label="月間シフト人件費の概算">
   <div className="shift-forecast-heading"><div><h3>{year}年{mon}月 シフト人件費の予測</h3><p>シフト登録・変更に合わせて再計算します（オーナー専用）</p></div><span className="shift-forecast-status">{warning?'概算に不足あり':title}</span></div>
   {payrollLoadError?<p role="alert">{payrollLoadError} 給与設定を読み直してから予測を確認してください。</p>:<>
   <div className="shift-forecast-metrics">
    <div><small>予測人件費</small><strong>{yen(result.total)}</strong></div>
    <div><small>人件費予算</small><strong>{hasBudget?yen(budget):'未設定'}</strong></div>
    <div><small>{hasBudget?(remaining<0?'予算超過見込み':'予算残額'):'確定シフト'}</small><strong>{hasBudget?yen(Math.abs(remaining)):result.shiftDays+'人日'}</strong></div>
   </div>
   {hasBudget&&<div className="shift-forecast-budget">
    <div className="shift-forecast-track" role="progressbar" aria-label="人件費予算に対する予測消化率" aria-valuemin={0} aria-valuemax={100} aria-valuenow={ratio===null?0:Math.min(100,Math.round(ratio))}><span style={{width:ratio===null?(result.total?'100%':'0%'):Math.min(100,Math.max(0,ratio))+'%'}}/></div>
    <p>{ratio===null?'予算0円':Math.round(ratio)+'%'}{budget===0&&result.total>0?' ／ 予算超過':status==='over'?' ／ 予算を超える見込み':''}</p>
   </div>}
   <div className="shift-forecast-breakdown">
    <div><span>月給社員（固定）</span><b>{yen(result.salary)}</b></div>
    <div><span>時給スタッフ（シフト見込み）</span><b>{yen(result.hourly)}</b></div>
    <div><span>交通費（出勤日数による）</span><b>{yen(result.transport)}</b></div>
    <div><span>登録済みシフト</span><b>{result.workers}名・{result.shiftDays}人日</b></div>
   </div>
   {result.missingRates.length>0&&<p className="shift-forecast-alert" role="alert">時給・月給が未設定のシフト担当者が{result.missingRates.length}名います。給与設定を入力するまでは予測が過少になります。</p>}
   <details className="shift-forecast-assumptions"><summary>勤務区分ごとの想定時間を調整</summary>
     <p>時刻が登録されていないシフトは、下記の「休憩を除いた給与対象時間」を仮置きして計算します。変更はこの画面での試算にのみ反映され、保存されません。</p>
     <div className="shift-forecast-hours">{hourFields.map(([key,label])=><label key={key}><span>{label}</span><input type="number" min="0" max="24" step="0.5" value={hours[key]} onChange={e=>{const n=Number(e.target.value);setHours(prev=>({...prev,[key]:Number.isFinite(n)?Math.min(24,Math.max(0,n)):0}))}}/><span>時間</span></label>)}</div>
   </details>
   <p className="shift-forecast-caveat">※登録済みシフトの概算です。未作成のシフト、時間外・深夜割増、法定福利費、給与調整などは反映していません。1日に複数役割がある場合は重複を避けて勤務時間を推定します。月給社員はシフトがなくても1か月分を計上します。</p>
   </>}
 </section>;
}
