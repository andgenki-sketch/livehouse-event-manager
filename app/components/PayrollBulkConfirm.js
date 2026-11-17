'use client';
import {Fragment,useMemo,useState} from 'react';
import {payrollBulkReview,payrollSelectedTotal,manualPayrollValues,monthlySalaryExceptionValues} from './payroll-bulk-confirm.mjs';

const yen=value=>'¥'+Number(value||0).toLocaleString('ja-JP');
const blank={amount:'',hours:'',days:'',reason:'',acknowledged:false,include:false};

/**
 * Owner-only bulk confirmation.
 * Regular payroll remains automatic for clean records.
 * Incomplete timecards require a deliberately entered, verified manual
 * amount, paid hours, days and audit explanation; never auto-use an estimate.
 */
export default function PayrollBulkConfirm({client,team,month,rows=[],reload}){
 const [excludedIds,setExcludedIds]=useState([]);
 const [manual,setManual]=useState({});
 const [salaryApprovals,setSalaryApprovals]=useState({});
 const [saving,setSaving]=useState(false);
 const [feedback,setFeedback]=useState('');
 const [error,setError]=useState('');
 const review=useMemo(()=>payrollBulkReview(rows),[rows]);
 const regular=payrollSelectedTotal(review.eligible,excludedIds);
 const verifiedExceptions=review.manualCandidates
  .map(item=>({...item,entry:manual[item.row.s.id]||blank,validation:manualPayrollValues(manual[item.row.s.id])}))
  .filter(item=>item.entry.include&&item.validation.ok);
 const confirmedSalaries=review.salaryCandidates
  .map(item=>({...item,validation:monthlySalaryExceptionValues(item.row,!!salaryApprovals[item.row.s.id])}))
  .filter(item=>item.validation.ok);
 const count=regular.count+verifiedExceptions.length+confirmedSalaries.length;
 const total=regular.total+verifiedExceptions.reduce((sum,item)=>sum+item.validation.amount,0)+confirmedSalaries.reduce((sum,item)=>sum+item.validation.amount,0);
 const excludedCount=review.blocked.length+review.excluded.length-verifiedExceptions.length-confirmedSalaries.length;
 if(team?.role!=='owner')return null;

 const toggle=(staffId,checked)=>{
  setExcludedIds(previous=>checked?previous.filter(id=>id!==staffId):[...new Set([...previous,staffId])]);
  setFeedback('');
 };
 const changeManual=(id,patch)=>{
  setManual(prev=>({...prev,[id]:{...blank,...prev[id],...patch,include:false}}));
  setFeedback('');
 };
 const toggleSalary=(id,checked)=>{
  setSalaryApprovals(prev=>({...prev,[id]:checked}));
  setFeedback('');
 };
 const includeManual=(id,checked)=>{
  setManual(prev=>({...prev,[id]:{...blank,...prev[id],include:checked}}));
  setFeedback('');
 };
 const confirmSelected=async()=>{
  if(saving||count===0||team?.role!=='owner'||!team?.id)return;
  // Revalidate every selected exception immediately before presenting confirmation.
  const reviewed=verifiedExceptions.map(item=>({
   item,details:manualPayrollValues(manual[item.row.s.id])
  }));
  if(reviewed.some(item=>!item.details.ok))return setError('例外確定の入力内容を再確認してください。');
  const salaries=confirmedSalaries.map(item=>({item,details:monthlySalaryExceptionValues(item.row,!!salaryApprovals[item.row.s.id])}));
  if(salaries.some(item=>!item.details.ok))return setError('月給例外確定の確認状態を再確認してください。');
  const ok=window.confirm(`${month}の給与を確定しますか？\n\n通常の一括確定：${regular.count}名\n月給の簡単例外確定：${salaries.length}名\n時給などの手動例外確定：${reviewed.length}名\n合計：${count}名・${yen(total)}\n\n月給の簡単例外確定は、金額をオーナーが確認し勤務時間・日数は未検証（0記録）として保存します。時給の例外確定には入力した実働・日数を使用します。\n既存の確定済み給与は上書きしません。`);
  if(!ok)return;
  setSaving(true);setError('');setFeedback('');
  try{
   const {data:{user},error:identityError}=await client.auth.getUser();
   if(identityError||!user?.id)throw Error('オーナーのログインを確認できませんでした');
   const fresh=await client.from('payroll_confirmations').select('staff_id').eq('team_id',team.id).eq('payroll_month',month+'-01');
   if(fresh.error)throw fresh.error;
   const confirmed=new Set((fresh.data||[]).map(row=>row.staff_id));
   const common={team_id:team.id,payroll_month:month+'-01',confirmed_by:user.id};
   const normalRows=regular.selected.filter(item=>!confirmed.has(item.row.s.id)).map(item=>({
    ...common,staff_id:item.row.s.id,
    confirmed_amount:item.row.total,confirmed_minutes:item.row.usedMinutes,work_days:item.row.workDays
   }));
   const manualRows=reviewed.filter(({item})=>!confirmed.has(item.row.s.id)).map(({item,details})=>({
    ...common,staff_id:item.row.s.id,
    confirmed_amount:details.amount,confirmed_minutes:details.minutes,work_days:details.days,
    confirmation_method:'manual_exception',exception_reason:details.reason
   }));
   const salaryRows=salaries.filter(({item})=>!confirmed.has(item.row.s.id)).map(({item,details})=>({
    ...common,staff_id:item.row.s.id,
    confirmed_amount:details.amount,confirmed_minutes:0,work_days:0,
    confirmation_method:'salary_exception',exception_reason:details.reason
   }));
   const toInsert=[...normalRows,...manualRows,...salaryRows];
   if(!toInsert.length){
    setFeedback('選択したスタッフは既に確定済みです。');
    await reload();return;
   }
   // All-or-nothing INSERT, never upsert: a concurrent confirmation causes
   // the batch to fail rather than overwriting the other owner's record.
   const {data,error:saveError}=await client.from('payroll_confirmations').insert(toInsert).select('staff_id');
   if(saveError)throw saveError;
   await reload();
   const ignored=count-toInsert.length;
   setManual({});setSalaryApprovals({});
   setFeedback(`${(data||toInsert).length}名の給与を確定しました（月給の簡単例外確定 ${salaryRows.length}名、時給などの手動例外確定 ${manualRows.length}名）。${ignored?' 既に確定済みの'+ignored+'名は変更していません。':''} 月次サマリーPDFへ反映できます。`);
  }catch(e){setError('給与確定に失敗しました：'+(e?.message||'不明なエラー')+'。確定状況を再読込して確認してください。');}
  finally{setSaving(false)}
 };

 return <section className="payroll-bulk" aria-label="給与の一括確定">
  <div className="payroll-bulk-heading">
   <div><h3>給与の一括確定</h3><p>正常な打刻はまとめて確定。打刻不完全の月給スタッフは金額確認のチェックだけで例外確定できます。</p></div>
   <span className="payroll-bulk-period">{month.slice(0,4)}年{Number(month.slice(5))}月分</span>
  </div>
  <div className="payroll-bulk-stats">
   <div><small>確定する人数</small><strong>{count}名</strong></div>
   <div><small>確定する給与合計</small><strong>{yen(total)}</strong></div>
   <div><small>既に確定済み</small><strong>{review.confirmed.length}名</strong></div>
   <div><small>未確認・対象外</small><strong>{excludedCount}名</strong></div>
  </div>
  <details className="payroll-bulk-details" open>
   <summary>スタッフ別の確定内容を確認する（打刻不完全の例外確定を含む）</summary>
   <div className="payroll-bulk-table-wrap"><table className="payroll-bulk-table">
    <thead><tr><th>選択</th><th>スタッフ</th><th>状態</th><th className="num">給与額</th></tr></thead>
    <tbody>{review.results.map(({row,status,label,canManualConfirm,canQuickSalary})=>{
     const id=row.s?.id,entry=manual[id]||blank,validation=manualPayrollValues(entry),salaryApproved=!!salaryApprovals[id];
     return <Fragment key={id||row.s?.name}>
      <tr className={'payroll-bulk-'+status}>
       <td><input type="checkbox" aria-label={row.s?.name+(canQuickSalary?'の月給金額を確認して給与確定':'を給与確定')} checked={status==='eligible'?!excludedIds.includes(id):canQuickSalary?salaryApproved:canManualConfirm&&entry.include&&validation.ok} disabled={saving||(status!=='eligible'&&!canManualConfirm&&!canQuickSalary)||(canManualConfirm&&!canQuickSalary&&!validation.ok)} onChange={e=>status==='eligible'?toggle(id,e.target.checked):canQuickSalary?toggleSalary(id,e.target.checked):includeManual(id,e.target.checked)}/></td>
       <td>{row.s?.name||'スタッフ未設定'}</td>
       <td>{canQuickSalary?(salaryApproved?'月給金額を確認済み・確定対象':'月給：金額を確認してチェック'):canManualConfirm?(entry.include&&validation.ok?'手動確認済み・例外確定対象':label+'（例外確定可）'):status==='eligible'&&excludedIds.includes(id)?'今回の確定から除外':['manual_exception','salary_exception'].includes(row.confirmed?.confirmation_method)?'例外確定済み':label}</td>
       <td className="num">{canQuickSalary?yen(row.total):canManualConfirm?(entry.include&&validation.ok?yen(validation.amount):'試算 '+yen(row.total)):yen(row.confirmed?.confirmed_amount??row.total)}</td>
      </tr>
      {canQuickSalary&&<tr className="payroll-bulk-salary-row"><td colSpan={4}>
       <div className="payroll-bulk-salary-review">
        <strong>月給の簡単例外確定</strong>
        <span>月給 {yen(row.monthly)} ＋ 交通費 {yen(row.transportTotal||0)} ＋ 調整額 {yen(row.adj?.adjustment_amount||0)} ＝ <b>支給額 {yen(row.total)}</b></span>
        <small>打刻不完全：未打刻 {row.unclocked.length}件／不完全な打刻 {row.incomplete.length}件。支給額と交通費・調整額を確認し、上のチェックを入れてください。勤務時間と日数は未検証として記録し、元の勤怠データは変更しません。</small>
       </div>
      </td></tr>}
      {canManualConfirm&&!canQuickSalary&&<tr className="payroll-bulk-manual-row"><td colSpan={4}>
       <div className="payroll-bulk-manual-form">
        <div className="payroll-bulk-manual-title"><strong>打刻不完全の例外確定</strong><small>本人・責任者の申告、勤怠メモ等を照合してから入力してください。上の試算額は確定額ではありません。</small></div>
        <div className="payroll-bulk-manual-inputs">
         <label>確認済み支給額（円）<input type="number" min="1" step="1" inputMode="numeric" placeholder="例：29545" value={entry.amount} disabled={saving} onChange={e=>changeManual(id,{amount:e.target.value})}/></label>
         <label>確認済み勤務時間（時間）<input type="number" min="0" max="744" step="0.01" inputMode="decimal" placeholder="例：23.5" value={entry.hours} disabled={saving} onChange={e=>changeManual(id,{hours:e.target.value})}/></label>
         <label>確認済み勤務日数（日）<input type="number" min="1" max="31" step="1" inputMode="numeric" placeholder="例：4" value={entry.days} disabled={saving} onChange={e=>changeManual(id,{days:e.target.value})}/></label>
        </div>
        <label className="payroll-bulk-manual-reason">確認内容・根拠（5文字以上）
         <textarea rows={2} maxLength={500} placeholder="例：10/3の退勤打刻漏れ。本人と勤務記録を照合し、退勤20:00として給与額を確認。" value={entry.reason} disabled={saving} onChange={e=>changeManual(id,{reason:e.target.value})}/></label>
        <label className="payroll-bulk-manual-ack"><input type="checkbox" checked={entry.acknowledged} disabled={saving} onChange={e=>changeManual(id,{acknowledged:e.target.checked})}/>実際の勤務内容・時間・支給額を確認しました</label>
        <p className={validation.ok?'payroll-bulk-manual-valid':'payroll-bulk-manual-hint'}>{validation.ok?'入力完了。上のチェックを入れると例外確定の対象になります。':validation.reason}</p>
       </div>
      </td></tr>}
     </Fragment>
    })}</tbody>
   </table></div>
  </details>
  <div className="payroll-bulk-actions">
   <button className="primary" type="button" disabled={saving||count===0} onClick={confirmSelected}>{saving?'確定処理中…':`${count}名をまとめて給与確定`}</button>
   <p>通常確定 {regular.count}名、月給簡単確定 {confirmedSalaries.length}名、時給などの手動確定 {verifiedExceptions.length}名。月給の例外確定では勤務時間・日数を未検証扱いとし、給与額の確認記録を残します。</p>
  </div>
  {review.blocked.filter(item=>!item.canManualConfirm&&!item.canQuickSalary).length>0&&<div className="payroll-bulk-warning"><strong>例外確定できないスタッフ：{review.blocked.filter(item=>!item.canManualConfirm&&!item.canQuickSalary).length}名</strong><p>{review.blocked.filter(item=>!item.canManualConfirm&&!item.canQuickSalary).map(item=>item.row.s?.name+'（'+item.label+'）').join('、')}</p></div>}
  {review.salaryCandidates.length>0&&<div className="payroll-bulk-salary-notice"><strong>月給スタッフの打刻不完全：{review.salaryCandidates.length}名</strong><p>月給・交通費・調整額の合計を見て、問題がなければチェックするだけです。打刻の修正とは別の給与確定として記録します。</p></div>}
  {review.manualCandidates.length>0&&<div className="payroll-bulk-warning"><strong>打刻不完全の確認が必要：{review.manualCandidates.length}名</strong><p>通常の一括確定からは除外しています。確認済みの勤務時間・金額・理由を入力したスタッフだけ例外確定できます。</p></div>}
  {feedback&&<p className="payroll-bulk-success" role="status">{feedback}</p>}
  {error&&<p className="payroll-bulk-error" role="alert">{error}</p>}
 </section>;
}
