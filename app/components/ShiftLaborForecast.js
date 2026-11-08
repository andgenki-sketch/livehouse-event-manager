'use client';
import {useEffect,useMemo,useState} from 'react';
import {estimateMonthlyShiftLabor,DEFAULT_SHIFT_PAID_HOURS,shiftLaborRuleKey,resolveMonthlyLaborBudget} from './shift-labor-forecast.mjs';
import {TECHNICAL_POSITIONS,OPERATIONS_POSITIONS} from './StaffManagement';

const PERIODS=[
 ['day','昼の部'],
 ['night','夜の部'],
 ['all','全日'],
 ['studioEarly','スタジオ早番'],
 ['studioLate','スタジオ遅番']
];
const yen=n=>'¥'+Math.round(Number(n)||0).toLocaleString('ja-JP');
const baselinePositions=[...TECHNICAL_POSITIONS,...OPERATIONS_POSITIONS,'スタジオ早番','スタジオ遅番'];
const periodsFor=position=>position==='スタジオ早番'?['studioEarly']:position==='スタジオ遅番'?['studioLate']:['day','night','all'];

export default function ShiftLaborForecast({client,team,month,staff=[],schedules=[],compensation=[],externalConfigs=[],budgets=[],payrollLoadError=''}) {
 const [savedRules,setSavedRules]=useState([]);
 const [edited,setEdited]=useState({});
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [loadError,setLoadError]=useState('');
 const [saveMessage,setSaveMessage]=useState('');

 useEffect(()=>{
  let active=true;
  setSavedRules([]);setEdited({});setSaveMessage('');setLoadError('');
  if(!client||team?.role!=='owner'||!team?.id){setLoading(false);return()=>{active=false}};
  setLoading(true);
  client.from('shift_labor_hour_rules').select('position_name,shift_kind,paid_hours').eq('team_id',team.id)
   .then(({data,error})=>{
     if(!active)return;
     if(error){setLoadError('予測時間設定を取得できませんでした：'+error.message);return;}
     setSavedRules(data||[]);
   }).catch(error=>{if(active)setLoadError('予測時間設定の読み込みに失敗しました：'+error.message)})
   .finally(()=>{if(active)setLoading(false)});
  return ()=>{active=false};
 },[client,team?.id,team?.role]);

 const savedByKey=useMemo(()=>new Map(savedRules.map(r=>[shiftLaborRuleKey(r.position_name,r.shift_kind),Number(r.paid_hours)])),[savedRules]);
 const activeRules=useMemo(()=>{
  const merged=new Map(savedRules.map(r=>[shiftLaborRuleKey(r.position_name,r.shift_kind),r]));
  for(const [key,hours] of Object.entries(edited)){
    const [position_name,shift_kind]=JSON.parse(key);
    merged.set(key,{position_name,shift_kind,paid_hours:hours});
  }
  return [...merged.values()];
 },[savedRules,edited]);
 const result=useMemo(()=>estimateMonthlyShiftLabor({month,staff,schedules,compensation,rules:activeRules,externalConfigs}),[month,staff,schedules,compensation,externalConfigs,activeRules]);
 const positions=useMemo(()=>[...new Set([
  ...baselinePositions,
  ...savedRules.map(r=>r.position_name),
  ...schedules.filter(r=>String(r.shift_date||'').startsWith(month)).map(r=>String(r.role_name||'').trim())
 ])].filter(Boolean),[savedRules,schedules,month]);
 const hasChanges=Object.keys(edited).length>0;
 const changeHours=(role,kind,value)=>{
  if(value==='')return;
  const num=Number(value);
  if(!Number.isFinite(num)||num<0||num>24)return;
  const key=shiftLaborRuleKey(role,kind);
  setEdited(old=>({...old,[key]:num}));
  setSaveMessage('');
 };
 const save=async()=>{
  if(saving||!hasChanges||team?.role!=='owner'||!team?.id)return;
  setSaving(true);setSaveMessage('');
  const rows=Object.entries(edited).map(([key,hours])=>{
    const [position_name,shift_kind]=JSON.parse(key);
    return {team_id:team.id,position_name,shift_kind,paid_hours:hours,updated_at:new Date().toISOString()};
  });
  try{
   const {error}=await client.from('shift_labor_hour_rules').upsert(rows,{onConflict:'team_id,position_name,shift_kind'});
   if(error)throw error;
   const read=await client.from('shift_labor_hour_rules').select('position_name,shift_kind,paid_hours').eq('team_id',team.id);
   if(read.error)throw read.error;
   setSavedRules(read.data||[]);
   setEdited({});
   setSaveMessage('勤務時間の設定を保存しました。');
  }catch(e){setSaveMessage('保存または再読み込みに失敗しました：'+e.message)}
  finally{setSaving(false)}
 };

 const [year,mon]=month.split('-').map(Number);
 const budgetRow=budgets.find(x=>x.year===year&&x.month===mon);
 const laborPlan=resolveMonthlyLaborBudget(budgetRow,result.salary);
 const hasBudget=!!budgetRow,isVariable=laborPlan.mode==='variable',
 budget=Number(isVariable?laborPlan.hourly:(laborPlan.total||0)),
 used=Number(isVariable?result.hourly:result.total);
 const ratio=hasBudget&&budget>0?used/budget*100:null;
 const remaining=budget-used;
 const missingPay=!!result.missingRates.length||!!payrollLoadError;
 const status=!hasBudget?'unset':used>budget?'over':budget>0&&used>=budget*.8?'warning':'normal';
 const title=status==='over'?'予算超過見込み':status==='warning'?'予算に接近中':status==='unset'?'予算未設定':'予算内の見込み';
 const missingKinds=result.unconfiguredPairs?.length||0;
 return <section className={'shift-labor-forecast shift-forecast-'+status} aria-label="月間シフト人件費の概算">
  <div className="shift-forecast-heading"><div><h3>{year}年{mon}月 シフト人件費の予測</h3><p>ポジション・勤務区分ごとの設定で自動計算（オーナー専用）</p></div><span className="shift-forecast-status">{missingPay?'給与情報の確認が必要':title}</span></div>
  {payrollLoadError?<p role="alert">{payrollLoadError} 給与設定を読み直してから予測を確認してください。</p>:<>
   <div className="shift-forecast-metrics">
    <div><small>{isVariable?'時給人件費の予測':'予測人件費'}</small><strong>{yen(used)}</strong></div>
    <div><small>{isVariable?'時給人件費の予算':'人件費予算（旧方式）'}</small><strong>{hasBudget?yen(budget):'未設定'}</strong></div>
    <div><small>{hasBudget?(remaining<0?'予算超過見込み':'予算残額'):'確定シフト'}</small><strong>{hasBudget?yen(Math.abs(remaining)):result.shiftDays+'人日'}</strong></div>
   </div>
   {isVariable&&<div className="shift-forecast-total-budget">
    <div><span>時給人件費予算</span><b>{yen(laborPlan.hourly)}</b></div>
    <div><span>社員月給（自動加算）</span><b>＋ {yen(result.salary)}</b></div>
    <div className="total"><span>総人件費予算</span><strong>{yen(laborPlan.total)}</strong></div>
   </div>}
   {hasBudget&&<div className="shift-forecast-budget">
    <div className="shift-forecast-track" role="progressbar" aria-label="人件費予算に対する予測消化率" aria-valuemin={0} aria-valuemax={100} aria-valuenow={ratio===null?0:Math.min(100,Math.round(ratio))}><span style={{width:ratio===null?(used?'100%':'0%'):Math.min(100,Math.max(0,ratio))+'%'}}/></div>
    <p>{ratio===null?'予算0円':Math.round(ratio)+'%'}{budget===0&&result.total>0?' ／ 予算超過':status==='over'?' ／ 予算を超える見込み':''}</p>
   </div>}
   <div className="shift-forecast-breakdown">
    <div><span>月給社員（固定）</span><b>{yen(result.salary)}</b></div>
    <div><span>時給スタッフ（シフト見込み）</span><b>{yen(result.hourly)}</b></div><div><span>外注費（シフト日額見込み・別枠）</span><b>{yen(result.outsourcing)}</b></div>
    <div><span>交通費（時給予算の比較から除外）</span><b>{yen(result.transport)}</b></div>
    <div><span>給与支払見込み（月給＋時給＋交通費）</span><b>{yen(result.total)}</b></div><div><span>給与＋外注費の支払見込み</span><b>{yen(result.combinedTotal)}</b></div>
    <div><span>登録済みシフト</span><b>{result.workers}名・{result.shiftDays}人日</b></div>
   </div>
   {result.missingExternalRates?.length>0&&<p className="shift-forecast-alert" role="alert">{result.missingExternalRates.length}件の外注シフトに日額設定がありません。外注費見込みは過少です。</p>}
   {result.mixedDays?.length>0&&<p className="shift-forecast-default-note">{result.mixedDays.length}日で同じスタッフに「給与扱い」と「外注扱い」が混在しています。実際の支払区分を確認してください。</p>}
   {result.missingRates.length>0&&<p className="shift-forecast-alert" role="alert">給与設定がないシフト担当者が{result.missingRates.length}名います。給与設定の登録が必要です（予測額は過少になります）。</p>}
   {loadError&&<p className="shift-forecast-alert" role="alert">{loadError}（現在は仮の勤務時間で算出しています）</p>}
   {loading&&<p className="hint">ポジション別の勤務時間設定を読み込み中です。</p>}
   {!loading&&!loadError&&missingKinds>0&&<p className="shift-forecast-default-note">{missingKinds}種類の「ポジション × 勤務区分」は未設定のため、従来の仮時間で計算しています。以下で設定すると予測精度を高められます。</p>}
   {hasChanges&&<p className="shift-forecast-unsaved">未保存の設定を試算に反映しています。設定を確定するには「設定を保存」を押してください。</p>}
   <details className="shift-forecast-assumptions">
    <summary>ポジション・勤務区分別の時間設定（保存可能）</summary>
    <p>各ポジションと「昼の部・夜の部・全日」に異なる給与対象時間を設定します。スタジオ早番・遅番はそれぞれ別枠です。空欄の組み合わせは設定対象外。時刻があるシフトは実際の予定時間を優先します。</p>
    <div className="shift-forecast-rule-scroll"><table className="shift-forecast-rule-table">
      <thead><tr><th>ポジション</th>{PERIODS.map(([key,label])=><th key={key}>{label}</th>)}</tr></thead>
      <tbody>{positions.map(position=><tr key={position}><th scope="row">{position}</th>{PERIODS.map(([kind])=>{
       if(!periodsFor(position).includes(kind))return <td key={kind} className="not-used">—</td>;
       const key=shiftLaborRuleKey(position,kind),configured=savedByKey.has(key)||Object.hasOwn(edited,key);
       const val=Object.hasOwn(edited,key)?edited[key]:savedByKey.has(key)?savedByKey.get(key):DEFAULT_SHIFT_PAID_HOURS[kind];
       return <td key={kind}><label className="shift-forecast-hour-cell">
         <input aria-label={position+'・'+PERIODS.find(([k])=>k===kind)?.[1]+'の給与対象時間'} type="number" min="0" max="24" step="0.5" disabled={saving||loading||!!loadError} value={val} onChange={e=>changeHours(position,kind,e.target.value)}/>
         <small>{configured?'設定済':'仮'}</small>
        </label></td>;
      })}</tr>)}</tbody>
    </table></div>
    <div className="shift-forecast-save-row">
      <p className="hint">初期の仮時間は昼5h・夜5h・全日8h・スタジオ早/遅5hです。現場の実際の給与対象時間に合わせて設定してください。</p>
      <button className="primary" type="button" onClick={save} disabled={!hasChanges||saving||loading||!!loadError}>{saving?'保存中…':'時間設定を保存'}</button>
    </div>
    {saveMessage&&<p role="status" className="shift-forecast-feedback">{saveMessage}</p>}
   </details>
   <p className="shift-forecast-caveat">※勤務時間・給与・外注費の概算です。時給予算との比較は時給給与分のみで行い、外注日額は予算外の別枠です。外注費見込みは経費登録へ自動計上されません。請求書等の外注費実績と足し合わせないでください。交通費は別途表示します。総予測人件費には交通費を含みます。未作成シフト、時間外・深夜割増、法定福利費、給与調整等は含みません。1日の同一区分に複数ポジションがある場合は最も長い時間を採用し、昼・夜は合算します。月給社員はシフトなしでも1か月分を計上します。</p>
  </>}
 </section>;
}
