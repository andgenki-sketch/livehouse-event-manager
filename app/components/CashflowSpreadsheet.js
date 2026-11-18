'use client';
import {useEffect,useMemo,useState} from 'react';
import {CASHFLOW_KEYS,calculateCashflow,cashflowMonthList,cashflowYearStart,validateCashflowEntry,yen} from './cashflow-model.mjs';
import {CASHFLOW_SHEET_ROWS,cashflowSheetValue,cashflowSheetAnnualValue,cashflowCellToYen,cashflowYenToInput,cashflowYenToDisplay} from './cashflow-sheet-layout.mjs';

const currentJapanMonth=()=>{
 const p=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit'}).formatToParts(new Date());
 return p.find(x=>x.type==='year').value+'-'+p.find(x=>x.type==='month').value;
};
const previousMonth=month=>{
 const [year,m]=month.split('-').map(Number);
 const d=new Date(Date.UTC(year,m-2,1));
 return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0');
};
const formFields=['opening_balance',...CASHFLOW_KEYS,'reported_closing_balance','source_note','evidence_note','management_note'];
const fromRow=(row,unit)=>({
 opening_balance:cashflowYenToInput(row?.opening_balance,unit),
 ...Object.fromEntries(CASHFLOW_KEYS.map(key=>[key,cashflowYenToInput(row?.[key],unit)])),
 reported_closing_balance:cashflowYenToInput(row?.reported_closing_balance,unit),
 source_note:row?.source_note||'',evidence_note:row?.evidence_note||'',management_note:row?.management_note||''
});
const toRow=(form,month,scenario,unit)=>({
 month,scenario,
 opening_balance:cashflowCellToYen(form.opening_balance,unit,{signed:true}),
 ...Object.fromEntries(CASHFLOW_KEYS.map(key=>[key,cashflowCellToYen(form[key],unit)])),
 reported_closing_balance:cashflowCellToYen(form.reported_closing_balance,unit,{signed:true})
});
const labelMonth=date=>date.slice(0,4)+'年'+Number(date.slice(5))+'月';
const formatCell=(value,unit,difference=false)=>{
 if(value===null||value===undefined)return '—';
 const output=cashflowYenToDisplay(value,unit);
 return difference&&value>0?'+'+output:output;
};
const keyOf=(month,scenario)=>month+'|'+scenario;

export default function CashflowSpreadsheet({client,team}){
 const [month,setMonth]=useState(currentJapanMonth);
 const [view,setView]=useState('plan');
 const [unit,setUnit]=useState('man');
 const [entries,setEntries]=useState([]);
 const [form,setForm]=useState({});
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const owner=team?.role==='owner',fiscalYear=cashflowYearStart(month);
 const months=useMemo(()=>cashflowMonthList(fiscalYear),[fiscalYear]);
 const records=useMemo(()=>new Map(entries.map(row=>[keyOf(String(row.month).slice(0,7),row.scenario),row])),[entries]);
 const record=(m,scenario)=>records.get(keyOf(m,scenario))||null;
 const active=view==='difference'?null:record(month,view);
 const formBase=useMemo(()=>fromRow(active,unit),[active?.id,active?.updated_at,month,view,unit]);
 useEffect(()=>{setForm(formBase)},[formBase]);
 const dirty=view!=='difference'&&formFields.some(key=>String(form[key]??'')!==String(formBase[key]??''));
 const parsed=useMemo(()=>{
  if(view==='difference')return {row:null,error:null};
  try{
   const input=toRow(form,month,view,unit);
   validateCashflowEntry(input);
   return {row:{...active,...input,month:month+'-01',scenario:view,status:'draft'},error:null};
  }catch(e){return {row:null,error:e?.message||'金額の入力を確認してください'}}
 },[form,month,view,unit,active]);
 const chosen=parsed.row&&dirty?parsed.row:active;
 const getRow=(m,scenario)=>m===month&&scenario===view&&view!=='difference'?chosen:record(m,scenario);
 const rowsByMonth=useMemo(()=>Object.fromEntries(months.map(m=>[m,getRow(m,view)])),[months,records,month,view,chosen]);
 const selectedPlan=record(month,'plan'),selectedActual=record(month,'actual');
 const currentTotals=calculateCashflow(chosen),planned=calculateCashflow(selectedPlan),actual=calculateCashflow(selectedActual);
 const difference=selectedActual?.reported_closing_balance!=null&&selectedPlan?.reported_closing_balance!=null
  ?Number(selectedActual.reported_closing_balance)-Number(selectedPlan.reported_closing_balance):null;

 const reload=async()=>{
  if(!owner||!team?.id)return;
  setLoading(true);setError('');
  const first=(fiscalYear-1)+'-08-01',last=(fiscalYear+1)+'-09-01';
  const response=await client.from('cashflow_monthly').select('*').eq('team_id',team.id)
   .gte('month',first).lt('month',last).order('month');
  if(response.error)setError('資金繰り表を取得できませんでした：'+response.error.message);
  else setEntries(response.data||[]);
  setLoading(false);
 };
 useEffect(()=>{if(owner&&team?.id)reload()},[owner,team?.id,fiscalYear]);

 const confirmLeave=()=>!dirty||window.confirm('選択中の月に未保存の入力があります。保存せずに移動しますか？');
 const selectMonth=target=>{
  if(target===month||!confirmLeave())return;
  setError('');setMessage('');setMonth(target);
 };
 const selectView=target=>{
  if(target===view||!confirmLeave())return;
  setError('');setMessage('');setView(target);
 };
 const selectUnit=target=>{
  if(target===unit||!confirmLeave())return;
  setError('');setMessage('');setUnit(target);
 };
 const edit=(key,value)=>{setForm(prev=>({...prev,[key]:value}));setMessage('');setError('')};
 const fillZero=()=>{
  if(view==='difference')return;
  const missing=CASHFLOW_KEYS.filter(key=>String(form[key]??'').trim()==='');
  if(!missing.length)return;
  if(!window.confirm('未入力の'+missing.length+'項目を0円にします。\n実際に入出金がなかったことを確認できる項目にのみ使用してください。'))return;
  setForm(prev=>({...prev,...Object.fromEntries(missing.map(key=>[key,'0']))}));
  setMessage('空欄に0円を入力しました。内容を確認したうえで保存してください。');
 };
 const copyPrevious=()=>{
  if(view==='difference')return;
  const prior=record(previousMonth(month),view),calc=calculateCashflow(prior);
  const balance=calc.reportedClosing??calc.closing;
  if(!calc.reviewed||balance===null)return;
  if(!window.confirm('前月の確認済み月末残高 '+yen(balance)+' を、選択月の月初残高に転記しますか？'))return;
  edit('opening_balance',cashflowYenToInput(balance,unit));
 };
 const save=async()=>{
  if(!owner||view==='difference'||saving||loading)return;
  setError('');setMessage('');
  try{
   if(!parsed.row)throw Error(parsed.error||'金額を確認してください');
   const validated=validateCashflowEntry(parsed.row);
   const hasValue=validated.opening_balance!==null||validated.reported_closing_balance!==null||
     CASHFLOW_KEYS.some(key=>validated[key]!==null);
   if(!hasValue)throw Error('金額がすべて未入力です。月初残高またはいずれかの入出金を入力してください。');
   if(active?.status==='reviewed'&&!window.confirm('確認済みの月です。編集を保存すると確認状態が下書きに戻ります。続行しますか？'))return;
   setSaving(true);
   const auth=await client.auth.getUser();
   if(auth.error||!auth.data?.user?.id)throw Error('オーナーのログイン状態を確認できませんでした');
   const payload={
    team_id:team.id,month:month+'-01',scenario:view,
    ...validated,
    source_note:String(form.source_note||'').trim(),
    evidence_note:String(form.evidence_note||'').trim(),
    management_note:String(form.management_note||'').trim(),
    status:'draft',reviewed_at:null,reviewed_by:null,
    updated_by:auth.data.user.id,updated_at:new Date().toISOString()
   };
   const response=await client.from('cashflow_monthly').upsert(payload,{onConflict:'team_id,month,scenario'});
   if(response.error)throw Error(response.error.message);
   await reload();
   setMessage(labelMonth(month)+'の'+(view==='plan'?'計画':'実績')+'を下書き保存しました。');
  }catch(e){setError('保存できませんでした：'+(e?.message||'原因不明'))}
  finally{setSaving(false)}
 };
 const review=async()=>{
  if(!owner||view==='difference'||!active||dirty||saving||loading)return;
  setError('');setMessage('');
  try{
   validateCashflowEntry({...active,month,scenario:view},{complete:true});
   if(view==='actual'&&active.reported_closing_balance===null)
    throw Error('実績を確認するには、通帳・帳簿等で照合した月末残高を入力してください。');
   if(view==='actual'&&String(active.evidence_note||'').trim().length<5)
    throw Error('実績を確認するには、照合した資料や方法を5文字以上で記録してください。');
   const c=calculateCashflow(active);
   if(c.reconciliationDelta!==null&&c.reconciliationDelta!==0&&String(active.management_note||'').trim().length<5)
    throw Error('残高に差額があります。差額の確認事項を経営協議メモに記録してください。');
   if(!window.confirm(labelMonth(month)+'の'+(view==='plan'?'計画':'実績')+'を確認済みにしますか？\nすべての金額と照合内容を確認してください。'))return;
   setSaving(true);
   const auth=await client.auth.getUser();
   if(auth.error||!auth.data?.user?.id)throw Error('オーナーの認証情報を確認できません');
   const response=await client.from('cashflow_monthly').update({
    status:'reviewed',reviewed_at:new Date().toISOString(),reviewed_by:auth.data.user.id,
    updated_at:new Date().toISOString(),updated_by:auth.data.user.id
   }).eq('id',active.id).eq('team_id',team.id).eq('status','draft').select('id').maybeSingle();
   if(response.error)throw Error(response.error.message);
   if(!response.data)throw Error('確認対象が更新されている可能性があります。再読み込みしてください。');
   await reload();
   setMessage('確認済みになりました。数字を修正した場合は再び下書きに戻ります。');
  }catch(e){setError('確認できませんでした：'+(e?.message||'原因不明'))}
  finally{setSaving(false)}
 };
 const cellFor=(m,row)=>{
  const actualRow=getRow(m,'actual'),planRow=getRow(m,'plan');
  const source=view==='difference'?null:getRow(m,view);
  const value=view==='difference'?(()=>{
   const a=cashflowSheetValue(actualRow,row.key),p=cashflowSheetValue(planRow,row.key);
   return a===null||p===null?null:a-p;
  })():cashflowSheetValue(source,row.key);
  return value;
 };
 const annual=(row)=>{
  if(row.type==='section'||row.total===false)return null;
  if(view==='difference'){
   const data=Object.fromEntries(months.map(m=>[m,(()=>{
    const a=cashflowSheetValue(record(m,'actual'),row.key),p=cashflowSheetValue(record(m,'plan'),row.key);
    return a===null||p===null?null:a-p;
   })()]));
   const existing=months.map(m=>data[m]).filter(v=>v!==null);
   return existing.length?{value:existing.reduce((a,b)=>a+b,0),partial:existing.length!==12}:null;
  }
  return cashflowSheetAnnualValue(rowsByMonth,row.key,months);
 };
 const cellInput=(row)=>row.type==='amount'&&view!=='difference';
 const editable=view!=='difference';
 const previous=calculateCashflow(record(previousMonth(month),view));
 const previousBalance=previous.reportedClosing??previous.closing;
 const reviewState=chosen?.status==='reviewed'&&!dirty;
 if(!owner)return null;
 return <div className="cashflow-sheet-page">
  <header className="cashflow-sheet-head">
   <div><h2>資金繰り表</h2><p>{fiscalYear}年9月〜{fiscalYear+1}年8月 ｜ 勘定項目を縦、月を横にした12か月一覧</p></div>
   <span>オーナー専用</span>
  </header>
  <div className="cashflow-sheet-toolbar">
   <div className="cashflow-sheet-switch" role="group" aria-label="実績または計画">
    <button type="button" className={view==='plan'?'active':''} onClick={()=>selectView('plan')}>計画</button>
    <button type="button" className={view==='actual'?'active':''} onClick={()=>selectView('actual')}>実績</button>
    <button type="button" className={view==='difference'?'active':''} onClick={()=>selectView('difference')}>差異（実績−計画）</button>
   </div>
   <div className="cashflow-sheet-years">
    <button type="button" onClick={()=>selectMonth((Number(month.slice(0,4))-1)+month.slice(4))}>‹ 前年度</button>
    <strong>{fiscalYear}年度</strong>
    <button type="button" onClick={()=>selectMonth((Number(month.slice(0,4))+1)+month.slice(4))}>翌年度 ›</button>
   </div>
   <div className="cashflow-sheet-switch" role="group" aria-label="表示単位">
    <button type="button" className={unit==='man'?'active':''} onClick={()=>selectUnit('man')}>万円</button>
    <button type="button" className={unit==='yen'?'active':''} onClick={()=>selectUnit('yen')}>円</button>
   </div>
  </div>
  <p className="cashflow-sheet-help">月の見出しを選ぶと、その月の列で直接入力できます。小計と月末残高は自動計算します。空欄の「—」と0円は別です。{view==='difference'?'差異は比較専用です。':'変更後は表の下にある「保存」を押してください。'}</p>
  {loading?<div className="cashflow-sheet-loading">資金繰り表を読み込み中…</div>:
  <div className="cashflow-sheet-scroll" role="region" tabIndex={0} aria-label="12か月の資金繰り一覧">
   <table className="cashflow-sheet-table">
    <thead><tr>
     <th className="cashflow-sheet-label-cell">勘定項目</th>
     {months.map(m=><th className={m===month?'cashflow-sheet-selected':''} key={m}>
      <button type="button" onClick={()=>selectMonth(m)} aria-label={labelMonth(m)+'を編集'}>{Number(m.slice(5))}月 <span>{m===month?'入力月':'選択'}</span></button>
     </th>)}
     <th className="cashflow-sheet-annual">合計</th>
    </tr></thead>
    <tbody>
     <tr className="cashflow-sheet-status-row"><th className="cashflow-sheet-label-cell">確認状況</th>
      {months.map(m=><td key={m} className={m===month?'cashflow-sheet-selected':''}>
       {view==='difference'?'比較':(record(m,view)?.status==='reviewed'?'確認済':record(m,view)?'下書き':'未登録')}
      </td>)}
      <td className="cashflow-sheet-annual">—</td>
     </tr>
     {CASHFLOW_SHEET_ROWS.map((row,index)=>{
      if(row.type==='section')return <tr className="cashflow-sheet-section" key={'section-'+index}><th colSpan={14}>{row.label}</th></tr>;
      const annualValue=annual(row);
      return <tr className={'cashflow-sheet-'+(row.kind||row.type)} key={row.key}>
       <th scope="row" className="cashflow-sheet-label-cell">{row.label}</th>
       {months.map(m=>{
        const editingThis=m===month&&cellInput(row);
        const value=cellFor(m,row);
        const className=[m===month?'cashflow-sheet-selected':'',value!==null&&value<0?'cashflow-sheet-negative':'',editingThis?'cashflow-sheet-editable':''].filter(Boolean).join(' ');
        return <td key={m} className={className} onClick={()=>{if(m!==month)selectMonth(m)}}>
         {editingThis?<input aria-label={labelMonth(m)+' '+row.label} type="number"
          step={unit==='man'?'0.0001':'1'} min={row.key==='opening_balance'||row.key==='reported_closing_balance'?undefined:0}
          inputMode="decimal" value={form[row.key]??''} placeholder="—"
          onChange={e=>edit(row.key,e.target.value)} disabled={saving||loading}/>
          :<span title={value===null?'未入力':yen(value)}>{formatCell(value,unit,view==='difference')}</span>}
        </td>
       })}
       <td className="cashflow-sheet-annual">
        {annualValue?.value!==null&&annualValue?.value!==undefined?
        <span title={annualValue.partial?'一部未入力の暫定合計です':'12か月分の合計'}>{formatCell(annualValue.value,unit,view==='difference')}{annualValue.partial&&<small> *</small>}</span>:'—'}
       </td>
      </tr>
     })}
    </tbody>
   </table>
  </div>}
  <p className="cashflow-sheet-footnote">合計欄の * は一部の月・項目が未入力の暫定合計です。勘定項目の並びは共有された資金繰り表に準拠しています。月初・月末残高は年間合計しません。マイナス残高もそのまま表示します。</p>
  {editable?<section className="cashflow-sheet-edit-footer">
   <div className="cashflow-sheet-edit-title"><div><h3>{labelMonth(month)}の{view==='plan'?'資金計画':'資金実績'}</h3><p>{reviewState?'確認済み':active?'下書き・要照合':'未登録'}　／　{dirty?'未保存の変更あり':'保存済み内容を表示'}</p></div>
    <div className="cashflow-sheet-edit-summary">
     <span>月間資金増減 <b>{yen(currentTotals.net)}</b></span>
     <span>計算上の月末 <b>{yen(currentTotals.closing)}</b></span>
     <span>原本・帳簿の月末 <b>{yen(currentTotals.reportedClosing)}</b></span>
     <span>照合差額 <b>{yen(currentTotals.reconciliationDelta)}</b></span>
    </div>
   </div>
   {parsed.error&&<p className="cashflow-sheet-alert" role="alert">{parsed.error}</p>}
   <div className="cashflow-sheet-actions">
    <button type="button" onClick={copyPrevious} disabled={!previous.reviewed||previousBalance===null||saving}>前月の確認済み残高を引き継ぐ</button>
    <button type="button" onClick={fillZero} disabled={saving}>未入力の項目を0円にする</button>
    <button type="button" className="primary" onClick={save} disabled={saving||loading||!!parsed.error}>{saving?'保存中…':'この月の内容を保存'}</button>
    <button type="button" onClick={review} disabled={saving||loading||!active||dirty||reviewState||!currentTotals.complete}>確認済みにする</button>
   </div>
   <details className="cashflow-sheet-notes" open>
    <summary>根拠資料・照合・社長との協議メモ</summary>
    <div className="cashflow-sheet-notes-grid">
     <label>数値の根拠・参照資料<input maxLength={1000} value={form.source_note??''} onChange={e=>edit('source_note',e.target.value)} placeholder="例：銀行入出金明細、資金繰り表の基準計画"/></label>
     <label>実績の照合根拠<textarea rows={2} maxLength={2000} value={form.evidence_note??''} onChange={e=>edit('evidence_note',e.target.value)} placeholder="例：銀行残高・現金出納帳と照合"/></label>
     <label>経営協議メモ・差異の原因<textarea rows={2} maxLength={4000} value={form.management_note??''} onChange={e=>edit('management_note',e.target.value)} placeholder="例：差異の原因、今後の改善案、確認担当者"/></label>
    </div>
   </details>
   <p className="cashflow-sheet-review-note">確認済みにするには全勘定項目に値を入力し、実績には照合根拠と月末の確認済み残高が必要です。照合差額があれば協議メモに残してください。保存すると確認状態は下書きに戻ります。</p>
  </section>:
  <section className="cashflow-sheet-edit-footer"><h3>{labelMonth(month)}の差異（実績 − 計画）</h3>
   <p>残高の差異：{yen(difference)}。実績・計画の両方に数字がある項目のみ比較します。未入力の場合は「—」で表示します。</p>
   <button type="button" onClick={()=>selectView('actual')}>実績の入力に戻る</button>
  </section>}
  {message&&<p className="cashflow-sheet-success" role="status">{message}</p>}
  {error&&<p className="cashflow-sheet-error" role="alert">{error}</p>}
 </div>;
}
