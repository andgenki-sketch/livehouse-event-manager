'use client';
import {useMemo,useState} from 'react';
import {payrollBulkReview,payrollSelectedTotal} from './payroll-bulk-confirm.mjs';

const yen=value=>'¥'+Number(value||0).toLocaleString('ja-JP');

/**
 * Bulk confirmation is deliberately a review step, not an automatic payroll run.
 * Existing confirmations are never updated; problematic rows are not submitted.
 */
export default function PayrollBulkConfirm({client,team,month,rows=[],reload}){
 const [excludedIds,setExcludedIds]=useState([]);
 const [saving,setSaving]=useState(false);
 const [feedback,setFeedback]=useState('');
 const [error,setError]=useState('');
 const review=useMemo(()=>payrollBulkReview(rows),[rows]);
 const selection=payrollSelectedTotal(review.eligible,excludedIds);
 const excludedCount=review.blocked.length+review.excluded.length;
 if(team?.role!=='owner')return null;

 const toggle=(staffId,checked)=>{
  setExcludedIds(previous=>checked?previous.filter(id=>id!==staffId):[...new Set([...previous,staffId])]);
  setFeedback('');
 };
 const confirmSelected=async()=>{
  if(saving||!selection.count||team?.role!=='owner'||!team?.id)return;
  const ok=window.confirm(`${month}の給与について、${selection.count}名・${yen(selection.total)}を一括確定しますか？\n\n未打刻・不完全な勤怠・外注扱い・確定済みのスタッフは対象外です。\n調整額は保存済みの値を使用します。確定後は社長提出用PDFに反映されます。`);
  if(!ok)return;
  setSaving(true);setError('');setFeedback('');
  try{
   const {data:{user},error:identityError}=await client.auth.getUser();
   if(identityError||!user?.id)throw Error('オーナーのログインを確認できませんでした');
   // Recheck database confirmations before inserting: never overwrite an existing payment.
   const fresh=await client.from('payroll_confirmations').select('staff_id').eq('team_id',team.id).eq('payroll_month',month+'-01');
   if(fresh.error)throw fresh.error;
   const confirmed=new Set((fresh.data||[]).map(row=>row.staff_id));
   const toInsert=selection.selected.filter(item=>!confirmed.has(item.row.s.id)).map(item=>({
    team_id:team.id,staff_id:item.row.s.id,payroll_month:month+'-01',
    confirmed_amount:item.row.total,confirmed_minutes:item.row.usedMinutes,work_days:item.row.workDays,
    confirmed_by:user.id
   }));
   if(!toInsert.length){
    setFeedback('選択したスタッフは既に確定済みです。');
    await reload();
    return;
   }
   // A single INSERT is atomic and fails rather than replacing another confirmation.
   const {data,error:saveError}=await client.from('payroll_confirmations').insert(toInsert).select('staff_id');
   if(saveError)throw saveError;
   await reload();
   const ignored=selection.count-toInsert.length;
   setFeedback(`${(data||toInsert).length}名の給与を一括確定しました。${ignored?' 既に確定済みの'+ignored+'名は更新していません。':''} 月次サマリーPDFへ反映できます。`);
  }catch(e){setError('一括確定に失敗しました：'+(e?.message||'不明なエラー')+'。確定状況を再読込して確認してください。');}
  finally{setSaving(false)}
 };

 return <section className="payroll-bulk" aria-label="給与の一括確定">
  <div className="payroll-bulk-heading">
   <div><h3>給与の一括確定</h3><p>問題のないスタッフをまとめて確定できます。既に確定した金額は上書きしません。</p></div>
   <span className="payroll-bulk-period">{month.slice(0,4)}年{Number(month.slice(5))}月分</span>
  </div>
  <div className="payroll-bulk-stats">
   <div><small>一括確定する人数</small><strong>{selection.count}名</strong></div>
   <div><small>一括確定する給与合計</small><strong>{yen(selection.total)}</strong></div>
   <div><small>既に確定済み</small><strong>{review.confirmed.length}名</strong></div>
   <div><small>要確認・対象外</small><strong>{excludedCount}名</strong></div>
  </div>
  <details className="payroll-bulk-details" open>
   <summary>対象スタッフ・金額を確認／一部を除外する</summary>
   <div className="payroll-bulk-table-wrap"><table className="payroll-bulk-table">
    <thead><tr><th>選択</th><th>スタッフ</th><th>状態</th><th className="num">給与額</th></tr></thead>
    <tbody>{review.results.map(({row,status,label})=><tr key={row.s?.id||row.s?.name} className={'payroll-bulk-'+status}>
     <td><input type="checkbox" aria-label={row.s?.name+'を一括確定'} checked={status==='eligible'&&!excludedIds.includes(row.s.id)} disabled={status!=='eligible'||saving} onChange={e=>toggle(row.s.id,e.target.checked)}/></td>
     <td>{row.s?.name||'スタッフ未設定'}</td>
     <td>{status==='eligible'&&excludedIds.includes(row.s.id)?'今回の確定から除外':label}</td>
     <td className="num">{yen(row.confirmed?.confirmed_amount??row.total)}</td>
    </tr>)}</tbody>
   </table></div>
  </details>
  <div className="payroll-bulk-actions">
   <button className="primary" type="button" disabled={saving||selection.count===0} onClick={confirmSelected}>{saving?'確定処理中…':`${selection.count}名をまとめて給与確定`}</button>
   <p>調整額は個別カードで「保存・再計算」した値のみ反映。未打刻・勤務区分の混在などがあるスタッフは、修正後に確定してください。</p>
  </div>
  {review.blocked.length>0&&<div className="payroll-bulk-warning"><strong>確認が必要なスタッフ：{review.blocked.length}名</strong><p>{review.blocked.map(r=>r.row.s?.name+'（'+r.label+'）').join('、')}</p></div>}
  {feedback&&<p className="payroll-bulk-success" role="status">{feedback}</p>}
  {error&&<p className="payroll-bulk-error" role="alert">{error}</p>}
 </section>;
}
