export const TIMETABLE_KINDS=[['loadin','搬入・準備'],['soundcheck','サウンドチェック'],['rehearsal','リハーサル'],['prep','開場準備'],['open','開場'],['live','本番'],['changeover','転換'],['merch','物販'],['other','その他']];
export const kindLabel=kind=>TIMETABLE_KINDS.find(([key])=>key===kind)?.[1]||'その他';
export const cleanText=value=>String(value||'').replace(/[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/g,'').normalize('NFKC').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[ \t]+/g,' ').replace(/([ぁ-ゖァ-ヺ一-龯々ー])\s+(?=[ぁ-ゖァ-ヺ一-龯々ー])/g,'$1').replace(/\s+([、。)])/g,'$1').replace(/([(])\s+/g,'$1').trim();
export const cleanArtist=value=>cleanText(String(value||'').replace(/^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]\s*/,''));
export function validTime(value){return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value||'')}
export function timeTokens(text){return [...cleanText(text).matchAll(/(?<!\d)([0-2]?\d)\s*[:：]\s*([0-5]\d)(?!\d)/g)].map(m=>String(Number(m[1])).padStart(2,'0')+':'+m[2]).filter(validTime)}
export function groupLines(items,tolerance=3){const lines=[];for(const item of [...items].filter(i=>cleanText(i.text)).sort((a,b)=>a.y-b.y||a.x-b.x)){const last=lines.at(-1);if(last&&Math.abs(last.y-item.y)<=tolerance)last.items.push(item);else lines.push({y:item.y,items:[item]})}for(const line of lines)line.items.sort((a,b)=>a.x-b.x);return lines}
export function lineText(items){let text='',last=null;for(const item of [...items].sort((a,b)=>a.x-b.x)){const s=String(item.text||'');const gap=last?item.x-(last.x+last.w):0;text+=(last&&gap>Math.max(1,item.h*.3)?' ':'')+s;last=item}return cleanText(text)}
function category(text,afterOpen){if(/転換/.test(text))return 'changeover';if(/\bRH\b|リハ|リハーサル/i.test(text))return 'rehearsal';if(/サウンドチェック|音出し/.test(text))return 'soundcheck';if(/オープン準備|開場準備|会場セッティング/.test(text))return 'prep';if(/^OPEN\b|^開場$/i.test(text))return 'open';if(/搬入|メンバー入り|集合/.test(text))return 'loadin';if(/物販/.test(text))return 'merch';if(/START|開演|本番/i.test(text)||afterOpen)return 'live';return 'other'}
function parsedRow(text,start,end,note,afterOpen){const kind=category(text,afterOpen),title=cleanArtist(text.replace(/^RH\s*/i,'').replace(/^START\s*/i,''))||kindLabel(kind);return {start_time:start||'',end_time:end||'',kind,title,artist_name:['rehearsal','live'].includes(kind)?title:'',note:cleanText(note),event_start:/\bSTART\b|開演/i.test(text),enabled:!!start}}
export function rowFingerprint(row){return [row.start_time?.slice(0,5)||'',row.end_time?.slice(0,5)||'',cleanText(row.title),cleanText(row.artist_name),row.kind||'other'].join('|')}
export function timetableSnapshot(rows){return rows.map(r=>({id:r.id,title:r.title,start_time:r.start_time,end_time:r.end_time,sort_order:r.sort_order,kind:r.kind||'other',artist_name:r.artist_name||'',note:r.note||''})).sort((a,b)=>a.id.localeCompare(b.id))}
export function timetableEventInfo(rows,performers=[]){const active=rows.filter(r=>r.enabled!==false),key=name=>cleanArtist(name).replace(/\s/g,'').toLowerCase(),live=active.filter(r=>r.kind==='live'&&!/^(START|開演|本番|終演|終了|撤収|完全撤収|完全退館|SE|BGM)$/i.test(cleanText(r.artist_name||r.title))),artists=[];for(const source of [...live.map(r=>({name:r.artist_name||r.title,performance_time:r.start_time})),...performers]){const name=cleanArtist(source.name);if(!name||artists.some(a=>key(a.name)===key(name)))continue;const info=performers.find(p=>key(p.name)===key(name))||source,memo=[['音響',info.sound],['照明',info.lighting],['映像',info.video],['入り時間',info.arrival],['備考',info.note]].filter(([,v])=>cleanText(v)).map(([label,v])=>label+'：'+cleanText(v)).join('\n');artists.push({name,performance_time:validTime(source.performance_time)?source.performance_time:'',memo})}return {open_time:active.find(r=>r.kind==='open'&&validTime(r.start_time))?.start_time||'',start_time:active.find(r=>r.kind==='live'&&validTime(r.start_time)&&(r.event_start||/^(START|開演|本番)$/i.test(cleanText(r.title))))?.start_time||live.find(r=>validTime(r.start_time))?.start_time||'',artists}}
export function validateTimetableRows(rows){const selected=rows.filter(r=>r.enabled!==false);if(!selected.length)return '登録する行を選択してください。';if(selected.length>200)return '一度に登録できるのは200行までです。';for(const [i,row] of selected.entries()){if(!validTime(row.start_time))return (i+1)+'行目の開始時刻を確認してください。';if(row.end_time&&!validTime(row.end_time))return (i+1)+'行目の終了時刻を確認してください。';if(!cleanText(row.title))return (i+1)+'行目の内容を入力してください。';if(!TIMETABLE_KINDS.some(([key])=>key===row.kind))return (i+1)+'行目の区分を確認してください。'}return ''}
export function parseTimetablePage(page){
 const width=page.width,items=page.items.filter(i=>cleanText(i.text)).map(i=>({...i,text:String(i.text||'').replace(/[⼊]/g,'入')})),heights=items.map(i=>i.h).filter(h=>h>0).sort((a,b)=>a-b),font=heights[Math.floor(heights.length/2)]||10,tol=Math.max(1.5,font*.36),lines=groupLines(items,tol),rawText=lines.map(l=>lineText(l.items)).join('\n');
 const timeLines=lines.map(l=>({...l,timeItems:l.items.filter(i=>i.x<width*.23&&timeTokens(i.text).length)})).filter(l=>l.timeItems.length).map(l=>({...l,times:l.timeItems.flatMap(i=>timeTokens(i.text))}));
 if(!timeLines.length)return {rows:[],performers:[],rawText,warnings:['開始時刻を読み取れませんでした。元資料を確認して行を追加してください。']};
 const firstY=timeLines[0].y,header=lines.find(l=>l.y<firstY&&/アーティスト名/.test(lineText(l.items))),performers=[];
 if(header){for(const line of lines.filter(l=>l.y>header.y+tol&&l.y<firstY-font)){const cols=[.12,.275,.333,.39,.448,.74,1].map(v=>v*width),fields=cols.slice(0,-1).map((v,i)=>lineText(line.items.filter(x=>x.x>=v&&x.x<cols[i+1])));if(fields[0]&&!/出演|備考|時間|Thunder/i.test(fields[0]))performers.push({name:cleanArtist(fields[0]),sound:fields[1],lighting:fields[2],video:fields[3],note:fields[4],arrival:fields[5]})}}
 const mainItems=items.filter(i=>i.x>=width*.19&&i.x<width*.82&&i.y>=firstY-tol),noteItems=items.filter(i=>i.x>=width*.82&&i.y>=firstY-tol),rows=[],used=new Set(),warnings=[];let afterOpen=false;
 for(let index=0;index<timeLines.length;index++){
  const current=timeLines[index],next=timeLines[index+1];let end='',bottom=current.y,pair=false;
  const onLine=lineText(mainItems.filter(i=>Math.abs(i.y-current.y)<=tol));
  if(current.times.length>1)end=current.times[1];
  else if(next&&next.times.length===1&&next.y-current.y<=font*1.9&&!/OPEN|開場|オープン準備|開場準備|物販|搬入|メンバー入り|集合/i.test(onLine)){
   const middle=lineText(mainItems.filter(i=>i.y>current.y+tol&&i.y<next.y-tol));
   if(middle&&!/^転換$/.test(middle)){pair=true;bottom=next.y;end=next.times[0];index++}
  }
  if(!end&&!pair)bottom=current.y+font*.65;
  const selected=mainItems.filter(i=>i.y>=current.y-tol&&i.y<=bottom+tol),text=groupLines(selected,tol).map(l=>lineText(l.items)).join(' '),notes=groupLines(noteItems.filter(i=>i.y>=current.y-tol&&i.y<=bottom+tol),tol).map(l=>lineText(l.items)).filter(t=>t!=='備考').join(' / ');
  for(const item of selected)used.add(item);
  if(!text){warnings.push(current.times[0]+'の内容が空欄です。確認してください。')}
  const row=parsedRow(text,current.times[0],end,notes,afterOpen);rows.push(row);if(row.kind==='open'||/START/i.test(text))afterOpen=true;
 }
 let skipped=0;
 for(const line of groupLines(mainItems.filter(i=>!used.has(i)),tol)){const text=lineText(line.items);if(/^転換$/.test(text)){skipped++;continue}if(/サウンドチェック/.test(text))rows.push({...parsedRow(text,'','','時刻の記載なし。必要な場合は開始時刻を入力してください。',false),enabled:false})}
 if(skipped)warnings.push('時間のない転換'+skipped+'件は、リハ枠に含まれるため独立した予定にしていません。');
 const date=rawText.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
 return {rows,performers,rawText,warnings,sourceDate:date?date[1]+'-'+date[2].padStart(2,'0')+'-'+date[3].padStart(2,'0'):''};
}
export function parseTimetablePages(pages){const results=pages.map(parseTimetablePage),performers=[];for(const p of results.flatMap(r=>r.performers))if(!performers.some(x=>x.name===p.name))performers.push(p);return {rows:results.flatMap(r=>r.rows).map((r,i)=>({...r,key:'read-'+i})),performers,rawText:results.map(r=>r.rawText).join('\n\n'),warnings:[...new Set(results.flatMap(r=>r.warnings))],sourceDate:results.find(r=>r.sourceDate)?.sourceDate||''}}
