'use client';
import {useEffect,useMemo,useState} from 'react';
import {CASHFLOW_GROUPS,CASHFLOW_FIELDS,CASHFLOW_KEYS,calculateCashflow,cashflowMonthList,cashflowYearStart,validateCashflowEntry,yen} from './cashflow-model.mjs';
const japanMonth=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit'}).format(new Date()).slice(0,7);
const shiftMonth=(month,step)=>{
 const [y,m]=month.split('-').map(Number),d=new Date(Date.UTC(y,m-1+step,1));
 return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0');
};
const blanks=(row,month,scenario)=>({
 month,scenario,opening_balance:row?.opening_balance===null||row?.opening_balance===undefined?'':String(row.opening_balance),
 reported_closing_balance:row?.reported_closing_balance===null||row?.reported_closing_balance===undefined?'':String(row.reported_closing_balance),
 ...Object.fromEntries(CASHFLOW_KEYS.map(key=>[key,row?.[key]===null||row?.[key]===undefined?'':String(row[key])])),
 source_note:row?.source_note||'',evidence_note:row?.evidence_note||'',management_note:row?.management_note||''
});
const moneyInput=text=>{
 const s=String(text??'').trim().replace(/,/g,'');
 if(s==='')return null;
 if(!/^-?\d+$/.test(s))throw Error('金額は整数（円）で入力してください');
 const n=Number(s);
 if(!Number.isSafeInteger(n))throw Error('入力できる金額の範囲を超えています');
 return n;
};

export default function CashflowManager({client,team}){
 const [month,setMonth]=useState(japanMonth);
 const [scenario,setScenario]=useState('actual');
 const [entries,setEntries]=useState([]);
 const [editing,setEditing]=useState(()=>blanks(null,japanMonth(),'actual'));
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [feedback,setFeedback]=useState('');
 const [error,setError]=useState('');
 const owner=team?.role==='owner';
 const load=async()=>{
  if(!owner||!team?.id)return;
  setLoading(true);setError('');
  const {data,error:readError}=await client.from('cashflow_monthly')
    .select('*').eq('team_id',team.id).order('month',{ascending:false}).limit(240);
  if(readError){setError('資金繰りの取得に失敗しました：'+readError.message);}
  else setEntries(data||[]);
  setLoading(false);
 };
 useEffect(()=>{if(owner&&team?.id)load();},[owner,team?.id]);
 const find=(date,kind)=>entries.find(row=>row.month===date+'-01'&&row.scenario===kind)||null;
 const current=find(month,scenario);
 const reference=find(month,scenario==='actual'?'plan':'actual');
 useEffect(()=>setEditing(blanks(current,month,scenario)),[month,scenario,current?.id,current?.updated_at]);
 const currentResult=calculateCashflow(current);
 const refResult=calculateCashflow(reference);
 const fiscalMonths=useMemo(()=>cashflowMonthList(cashflowYearStart(month)),[month]);
 if(!owner)return null;

 const save=async()=>{
  if(saving||loading)return;
  setSaving(true);setError('');setFeedback('');
  try{
   const normalized={month,scenario,opening_balance:moneyInput(editing.opening_balance),reported_closing_balance:moneyInput(editing.reported_closing_balance),
    ...Object.fromEntries(CASHFLOW_KEYS.map(k=>[k,moneyInput(editing[k])]))};
   validateCashflowEntry(normalized);
   const {data:session,error:authErr}=await client.auth.getUser();
   if(authErr||!session?.user?.id)throw Error('オーナーのログイン状態を確認できません');
   const now=new Date().toISOString();
   const payload={
    team_id:team.id,month:month+'-01',scenario,
    ...normalized,month:month+'-01',
    source_note:editing.source_note.trim(),
    evidence_note:editing.evidence_note.trim(),
    management_note:editing.management_note.trim(),
    status:'draft',reviewed_at:null,reviewed_by:null,
    updated_by:session.user.id,updated_at:now
   };
   const {error:writeError}=await client.from('cashflow_monthly')
     .upsert(payload,{onConflict:'team_id,month,scenario'});
   if(writeError)throw writeError;
   await load();
   setFeedback('資金繰りの'+(scenario==='actual'?'実績':'計画')+'を下書き保存しました。確認済みにするには、内容を照合して別途「確認済みにする」を押してください。');
  }catch(e){setError('保存に失敗しました：'+(e?.message||'不明なエラー'))}
  finally{setSaving(false)}
 };
 const review=async()=>{
  if(!current||saving||loading)return;
  try{
   const verify={...current,month,scenario};
   validateCashflowEntry(verify,{complete:true});
   if(scenario==='actual'&&current.reported_closing_balance===null)throw Error('実績を確認済みにするには、通帳・出納帳などで確認した月末残高を入力してください');
   if(scenario==='actual'&&String(current.evidence_note||'').trim().length<5)
    throw Error('実績を確認済みにする場合は、通帳・入金明細・支払記録などの照合根拠を5文字以上で記入してください');
  }catch(e){setError(e.message);return}
  const drift=currentResult.reconciliationDelta;
  if(!window.confirm(month+'の'+(scenario==='actual'?'実績':'計画')+'を確認済みにしますか？\n項目に入力した金額、残高、照合根拠を確認してください。'+(drift!==null&&drift!==0?'\n※月末残高の照合差額：'+yen(drift)+'。差額の理由を経営協議メモに残してください。':'')))return;
  setSaving(true);setError('');setFeedback('');
  try{
   const {data:auth,error:authError}=await client.auth.getUser();
   if(authError||!auth?.user?.id)throw Error('オーナー権限を確認できませんでした');
   const {error:writeError}=await client.from('cashflow_monthly').update({
    status:'reviewed',reviewed_at:new Date().toISOString(),reviewed_by:auth.user.id,
    updated_by:auth.user.id,updated_at:new Date().toISOString()
   }).eq('id',current.id).eq('team_id',team.id).eq('status','draft');
   if(writeError)throw writeError;
   await load();
   setFeedback('確認済みにしました。後から金額を編集した場合は、再び下書きに戻ります。');
  }catch(e){setError('確認処理に失敗しました：'+(e?.message||'不明なエラー'))}
  finally{setSaving(false)}
 };
 const fillZero=()=>{
  const count=CASHFLOW_KEYS.filter(k=>editing[k]==='').length;
  if(!count)return;
  if(!window.confirm('未入力の'+count+'項目を0円で入力しますか？\n通帳や帳簿を確認して本当に入出金がなかった項目にのみ使用してください。'))return;
  setEditing(prev=>({...prev,...Object.fromEntries(CASHFLOW_KEYS.filter(k=>prev[k]==='').map(k=>[k,'0']))}));
  setFeedback('空欄に0円を入力しました。内容を確認してから保存してください。');
 };
 const prev=find(shiftMonth(month,-1),scenario);
 const prevCalc=calculateCashflow(prev);
 const priorOpening=()=>{
  const priorBalance=prevCalc.reportedClosing??prevCalc.closing;
  if(!prevCalc.reviewed||priorBalance===null)return;
  if(!window.confirm('前月の確認済み月末残高 '+yen(priorBalance)+' を、今月の月初残高に入力しますか？'))return;
  setEditing(prev=>({...prev,opening_balance:String(priorBalance)}));
 };
 const selectedPreview=(()=>{try{
  return calculateCashflow({...editing,opening_balance:moneyInput(editing.opening_balance),reported_closing_balance:moneyInput(editing.reported_closing_balance),
   ...Object.fromEntries(CASHFLOW_KEYS.map(k=>[k,moneyInput(editing[k])]))});
 }catch{return null}})();
 const update=(k,val)=>{setEditing(prev=>({...prev,[k]:val}));setFeedback('')};
 const comparisonClosing=currentResult.closing!==null&&refResult.closing!==null?currentResult.closing-refResult.closing:null;
 return <div className="listpage cashflow-manager" aria-label="資金繰り管理">
  <div className="sectionhead"><div><h2>資金繰り管理</h2><p>実数で経営を協議するための月別の資金計画・実績。損益計算と資金の移動を分けて管理します。</p></div><span className="cashflow-owner">オーナー専用</span></div>
  <div className="cashflow-toolbar">
   <button type="button" onClick={()=>setMonth(shiftMonth(month,-1))}>‹ 前月</button>
   <label>対象月 <input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label>
   <button type="button" onClick={()=>setMonth(shiftMonth(month,1))}>翌月 ›</button>
   <button type="button" onClick={load} disabled={loading}>再読み込み</button>
  </div>
  <div className="cashflow-scenarios" role="group" aria-label="管理区分">
   <button type="button" className={scenario==='actual'?'on':''} onClick={()=>setScenario('actual')}>実績（実際の入出金）</button>
   <button type="button" className={scenario==='plan'?'on':''} onClick={()=>setScenario('plan')}>計画（資金繰り予測）</button>
  </div>
  {loading&&<p className="hint">資金繰りデータを読み込み中…</p>}
  {!loading&&<div className="cashflow-summary">
   <div><small>月初残高</small><strong>{yen(currentResult.opening)}</strong></div>
   <div><small>営業資金収支（暫定含む）</small><strong>{currentResult.net===null?'未入力':yen(currentResult.operatingNet)}</strong></div>
   <div><small>月間資金増減（暫定含む）</small><strong>{yen(currentResult.net)}</strong></div>
   <div className={currentResult.closing!==null&&currentResult.closing<0?'cashflow-negative':''}>
    <small>月末残高（計算値・{currentResult.reviewed?'確認済み':'暫定'}）</small><strong>{yen(currentResult.closing)}</strong>
   </div><div className={currentResult.reportedClosing!==null&&currentResult.reportedClosing<0?'cashflow-negative':''}>
    <small>月末残高（帳簿・原本等）</small><strong>{yen(currentResult.reportedClosing)}</strong>
   </div><div className={currentResult.reconciliationDelta!==null&&currentResult.reconciliationDelta!==0?'cashflow-negative':''}>
    <small>照合差額（帳簿 − 計算）</small><strong>{yen(currentResult.reconciliationDelta)}</strong>
   </div>
  </div>}
  <div className="cashflow-review">
   <b>{currentResult.reviewed?'確認済み':currentResult.hasInput?'下書き・要照合':'未登録'}</b>
   <span>金額入力 {currentResult.recorded}/{currentResult.expected}項目</span>
   <span>比較対象：{scenario==='actual'?'計画':'実績'}の月末残高 {yen(refResult.closing)}</span>
   {comparisonClosing!==null&&<span>月末残高の差異 {yen(comparisonClosing)}</span>}
  </div>
  <p className="cashflow-caution">「未入力」と「0円」は別です。計算上の月末残高と、通帳・帳簿または原本に記載された月末残高は分けて保存し、差額があっても隠しません。マイナス残高もそのまま保存します。</p>
  <div className="cashflow-section-title"><h3>{scenario==='actual'?'当月実績を入力':'当月資金計画を入力'}</h3><div>
   <button type="button" onClick={priorOpening} disabled={!prevCalc.reviewed||prevCalc.closing===null}>前月の確認済み残高を引継ぐ</button>
   <button type="button" onClick={fillZero}>未入力を0円で埋める</button>
  </div></div>
  <div className="cashflow-start">
   <label>月初 現金・預金残高（円、マイナス可）<input type="number" step="1" value={editing.opening_balance} onChange={e=>update('opening_balance',e.target.value)} placeholder="未入力"/></label>
   <label>月末残高（通帳・帳簿または原本の記載値、円・マイナス可）<input type="number" step="1" value={editing.reported_closing_balance} onChange={e=>update('reported_closing_balance',e.target.value)} placeholder="未入力"/></label>
   {prevCalc.closing!==null&&<p>前月{scenario==='actual'?'実績':'計画'}の月末試算：{yen(prevCalc.closing)}　{prevCalc.reviewed?'（確認済み）':'（未確認）'}</p>}
  </div>
  <div className="cashflow-groups">
  {CASHFLOW_GROUPS.map(group=><section className="cashflow-group" key={group.title}>
   <h4>{group.title}</h4><div className="cashflow-field-grid">{group.fields.map(([key,label])=><label key={key}><span>{label}</span>
    <input type="number" min="0" step="1" value={editing[key]} onChange={e=>update(key,e.target.value)} placeholder="未入力"/><small>円</small>
   </label>)}</div>
  </section>)}
  </div>
  <div className="cashflow-note-fields">
   <label>数字の根拠・参照資料<input value={editing.source_note} maxLength={1000} onChange={e=>update('source_note',e.target.value)} placeholder="例：銀行口座明細、現金出納帳、原本資金繰り表"/></label>
   <label>入出金の照合根拠（実績確認時は必須）<textarea rows={2} maxLength={2000} value={editing.evidence_note} onChange={e=>update('evidence_note',e.target.value)} placeholder="例：11月分の銀行入出金、現金出納帳、給与振込記録を照合"/></label>
   <label>経営協議メモ・次回までの判断事項<textarea rows={3} maxLength={4000} value={editing.management_note} onChange={e=>update('management_note',e.target.value)} placeholder="例：返済計画、資金不足への対応、具体的な改善案、担当者と確認期限"/></label>
  </div>
  {selectedPreview&&<div className="cashflow-preview"><b>入力中の試算</b><span>営業入金：{yen(selectedPreview.operatingIncome)}</span><span>営業支出：{yen(selectedPreview.operatingOut)}</span><span>借入金等の調達・その他収入：{yen(selectedPreview.financialIncome)}</span><span>借入返済・利息等：{yen(selectedPreview.financialOut)}</span><strong>月末計算値：{yen(selectedPreview.closing)} ／ 記載値：{yen(selectedPreview.reportedClosing)} ／ 照合差：{yen(selectedPreview.reconciliationDelta)} {selectedPreview.complete?'（全項目入力）':'（未入力項目あり・暫定）'}</strong></div>}
  <div className="cashflow-actions">
   <button type="button" className="primary" disabled={saving||loading} onClick={save}>{saving?'保存中…':'下書きを保存'}</button>
   <button type="button" disabled={saving||loading||!current||currentResult.reviewed||!currentResult.complete} onClick={review}>確認済みにする</button>
   <span>保存すると確認状態は下書きに戻ります。提出前に通帳・帳簿と照合してください。</span>
  </div>
  {feedback&&<p role="status" className="cashflow-success">{feedback}</p>}
  {error&&<p role="alert" className="cashflow-error">{error}</p>}
  <section className="cashflow-year"><h3>{cashflowYearStart(month)}年9月〜{cashflowYearStart(month)+1}年8月 資金繰り比較</h3>
   <p className="hint">月末残高は入力済みの額に基づく試算です。未入力や未確認の月は、会議で要確認として扱います。</p>
   <div className="cashflow-year-scroll"><table><thead><tr><th>月</th><th>計画・月末</th><th>実績・月末</th><th>差異（実績－計画）</th><th>実績の確認状況</th></tr></thead><tbody>
    {fiscalMonths.map(m=>{
     const pr=calculateCashflow(find(m,'plan')),ar=calculateCashflow(find(m,'actual'));
     const delta=pr.closing!==null&&ar.closing!==null?ar.closing-pr.closing:null;
     return <tr key={m}><td><button type="button" onClick={()=>setMonth(m)}>{m}</button></td>
      <td className={pr.closing!==null&&pr.closing<0?'negative':''}>{yen(pr.closing)}{pr.closing!==null&&!pr.reviewed?' *':''}</td>
      <td className={ar.closing!==null&&ar.closing<0?'negative':''}>{yen(ar.closing)}{ar.closing!==null&&!ar.reviewed?' *':''}</td>
      <td>{yen(delta)}</td>
      <td>{ar.reviewed?'確認済み':ar.hasInput?'未確認':'未入力'}</td></tr>;
    })}
   </tbody></table></div>
   <p className="hint">* は未確認・暫定値。経営サマリーPDFには同じ月の実績・計画・差異を掲載します。</p>
  </section>
 </div>;
}
