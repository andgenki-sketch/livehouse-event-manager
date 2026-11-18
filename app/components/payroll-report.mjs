const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const number=value=>{const n=Number(value);if(!Number.isFinite(n))throw Error('確定給与の数値を確認してください');return n};
/**
 * Order for the owner's payment request. Four designated employees always lead;
 * other current roster surnames use phonetic readings and all other names fall
 * back to Japanese collation. No compensation/status data participates in order.
 */
const FIRST_FOUR=['尾崎','堀井','井上','大岩'];
const KNOWN_SURNAMES=[
 ['おかむら','おかむら'],['安藤','あんどう'],['小高','おだか'],
 ['釘﨑','くぎさき'],['釘崎','くぎさき'],['清水','しみず'],
 ['テストユーザー','てすとゆーざー'],['長谷川','はせがわ'],
 ['福田','ふくだ'],['松山','まつやま'],['室伏','むろふし'],
 ['山岡','やまおか']
];
const normalizedName=name=>String(name||'').normalize('NFKC').replace(/[\s\u3000]/g,'');
const priority=name=>FIRST_FOUR.findIndex(surname=>normalizedName(name).startsWith(surname));
const nameReading=name=>{
 const value=normalizedName(name);
 const found=KNOWN_SURNAMES.find(([surname])=>value.startsWith(surname));
 return found?found[1]+value.slice(found[0].length):value;
};
export function comparePayrollStaff(a,b){
 const left=String(a?.name??''),right=String(b?.name??'');
 const pa=priority(left),pb=priority(right);
 if(pa!==pb)return pa<0&&pb>=0?1:pb<0&&pa>=0?-1:pa-pb;
 const ka=nameReading(left),kb=nameReading(right);
 return ka.localeCompare(kb,'ja')||left.localeCompare(right,'ja')||String(a?.id||'').localeCompare(String(b?.id||''));
}
export function sortPayrollRows(rows=[]){return [...rows].sort(comparePayrollStaff);}

export function confirmedPayrollRows(confirmations,staff,teamId,month){
 if(!/^\d{4}-\d{2}$/.test(month))throw Error('対象月を確認してください');
 const names=new Map(staff.filter(s=>s.team_id===teamId).map(s=>[s.id,s.name]));
 const rows=confirmations.filter(c=>c.team_id===teamId&&c.payroll_month===month+'-01').map(c=>{
  const name=names.get(c.staff_id);if(!name)throw Error('スタッフ情報を取得できませんでした');
  return {id:c.staff_id,name,amount:number(c.confirmed_amount),minutes:number(c.confirmed_minutes),days:number(c.work_days),method:['manual_exception','salary_exception'].includes(c.confirmation_method)?c.confirmation_method:'normal',exceptionReason:['manual_exception','salary_exception'].includes(c.confirmation_method)?String(c.exception_reason||''):''};
 });
 return sortPayrollRows(rows);
}
export function payrollReportHtml({rows,month,teamName,issuedAt=new Date()}){
 const esc=escapeHtml,yen=n=>'¥'+n.toLocaleString('ja-JP');
 const sorted=sortPayrollRows(rows);
 const total=sorted.reduce((sum,r)=>sum+r.amount,0);
 return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(month)}_確定給与一覧</title><style>
 @page{size:A4 portrait;margin:16mm 14mm}*{box-sizing:border-box}body{margin:0;color:#182333;font-family:"Noto Sans JP","Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif;font-size:11pt;line-height:1.6;background:#fff}main{max-width:900px;margin:32px auto;padding:0 24px}h1{font-size:23pt;margin:5px 0 4px;letter-spacing:.04em}.eyebrow{font-size:10pt;color:#53677c}.meta{display:flex;justify-content:space-between;border-bottom:2px solid #243e56;padding-bottom:16px;margin-bottom:20px}.summary{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;background:#edf3f7;margin:18px 0 24px}.summary strong{font-size:24pt}.summary small{display:block;color:#53677c}table{border-collapse:collapse;width:100%;font-size:10.5pt}thead{display:table-header-group;background:#243e56;color:white}th,td{padding:10px 12px;border-bottom:1px solid #d9e1e8;text-align:left}th{font-weight:500}td.num,th.num{text-align:right;white-space:nowrap}tbody tr{break-inside:avoid}tbody tr:nth-child(even){background:#f6f8fa}.name{overflow-wrap:anywhere;max-width:220px}.note{font-size:9pt;color:#53677c;margin-top:20px}.controls{background:#edf3f7;padding:15px;margin-bottom:25px;font-size:10pt}.controls button{padding:10px 20px;background:#243e56;color:white;border:0;border-radius:5px;cursor:pointer;font:inherit}.controls p{margin:8px 0 0}.confidential{font-size:9pt;color:#53677c;margin-top:25px}@media print{main{margin:0;padding:0;max-width:none}.controls{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
 </style></head><body><main><div class="controls"><button type="button" id="print-report">PDF保存・印刷</button><p>印刷先で「PDFに保存」を選んでください。最初の4名は指定順、そのほかは五十音順です。</p></div><div class="eyebrow">${esc(teamName)} / 給与支給資料</div><h1>確定給与一覧</h1><div class="meta"><span>対象：${esc(month.slice(0,4))}年${Number(month.slice(5))}月分</span><span>作成日：${esc(new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(issuedAt))}</span></div><div class="summary"><div>支給合計<small>確定済み ${sorted.length}名</small></div><strong>${esc(yen(total))}</strong></div><table><thead><tr><th>氏名</th><th class="num">確定支給額</th></tr></thead><tbody>${sorted.map(r=>`<tr><td class="name">${esc(r.name)}</td><td class="num">${esc(yen(r.amount))}</td></tr>`).join('')}</tbody></table><p class="note">確定済みの給与のみ掲載しています。表示金額は交通費・調整額を含む確定時の合計であり、税・社会保険などの控除後振込額ではありません。</p><div class="confidential">取扱注意 / 給与情報</div></main></body></html>`;
}
