import {parseTimetablePages} from './timetable-import.mjs';
const MAX_SIZE=10*1024*1024;
export function checkTimetableFile(file){if(!file||file.size>MAX_SIZE)throw new Error('10MB以下のPDF・JPEG・PNG・WebPを選択してください。');const pdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name),image=['image/jpeg','image/png','image/webp'].includes(file.type);if(!pdf&&!image)throw new Error('PDF・JPEG・PNG・WebPに対応しています。');return pdf?'pdf':'image'}
function cancelled(signal){if(signal?.aborted)throw new DOMException('読み取りを中止しました。','AbortError')}
async function loadImage(file,signal){cancelled(signal);const url=URL.createObjectURL(file);try{const image=new Image();image.src=url;await image.decode();cancelled(signal);if(image.naturalWidth*image.naturalHeight>50000000)throw new Error('画像が大きすぎます。50メガピクセル以下にしてください。');const scale=Math.min(1,2400/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas}finally{URL.revokeObjectURL(url)}}
export async function readTimetableFile(file,{signal,onProgress=()=>{}}={}){
 const type=checkTimetableFile(file),pages=[];let worker,task;
 const stop=()=>{worker?.terminate().catch(()=>{});task?.destroy().catch(()=>{})};signal?.addEventListener('abort',stop,{once:true});
 const recognize=async canvas=>{cancelled(signal);onProgress('画像の文字を読み取り中… 初回は読み取りデータを準備します。');if(!worker){const {createWorker}=await import('tesseract.js');worker=await createWorker(['jpn','eng'],1,{workerPath:'/timetable-reader/ocr.worker.min.js',corePath:'/timetable-reader/core',langPath:'/timetable-reader',logger:m=>{if(m.status==='recognizing text')onProgress('画像の文字を読み取り中… '+Math.round(m.progress*100)+'%')}});cancelled(signal);await worker.setParameters({tessedit_pageseg_mode:'11',preserve_interword_spaces:'1'})}const {data}=await worker.recognize(canvas,{}, {text:true,tsv:true});cancelled(signal);const items=String(data.tsv||'').split('\n').slice(1).map(line=>{const c=line.split('\t');return {level:Number(c[0]),x:Number(c[6]),y:Number(c[7])+Number(c[9])*.7,w:Number(c[8]),h:Number(c[9]),text:c.slice(11).join('\t')}}).filter(i=>i.level===5&&i.text?.trim());return {width:canvas.width,height:canvas.height,items,ocr:true}};
 try{
  if(type==='image')pages.push(await recognize(await loadImage(file,signal)));
  else{
   onProgress('PDFを読み取り中…');const pdf=await import('pdfjs-dist/legacy/build/pdf.mjs');pdf.GlobalWorkerOptions.workerSrc='/timetable-reader/pdf.worker.min.mjs';cancelled(signal);
   task=pdf.getDocument({data:new Uint8Array(await file.arrayBuffer()),cMapUrl:'/timetable-reader/cmaps/',cMapPacked:true,standardFontDataUrl:'/timetable-reader/standard_fonts/',wasmUrl:'/timetable-reader/wasm/'});const doc=await task.promise;if(doc.numPages>5)throw new Error('一度に読み込めるPDFは5ページまでです。');
   for(let i=1;i<=doc.numPages;i++){cancelled(signal);onProgress('PDF '+i+'/'+doc.numPages+'ページを読み取り中…');const page=await doc.getPage(i),viewport=page.getViewport({scale:1}),text=await page.getTextContent(),items=text.items.filter(x=>x.str?.trim()).map(x=>{const t=pdf.Util.transform(viewport.transform,x.transform);return {text:x.str,x:t[4],y:t[5],w:x.width,h:Math.abs(x.height)}}),candidate=parseTimetablePages([{width:viewport.width,height:viewport.height,items}]);
    if(candidate.rows.some(r=>r.start_time)){pages.push({width:viewport.width,height:viewport.height,items});continue}
    const scaled=page.getViewport({scale:Math.min(3,2400/viewport.width)}),canvas=document.createElement('canvas');canvas.width=Math.ceil(scaled.width);canvas.height=Math.ceil(scaled.height);await page.render({canvas,canvasContext:canvas.getContext('2d'),viewport:scaled}).promise;pages.push(await recognize(canvas));page.cleanup();
   }
  }
  cancelled(signal);onProgress('読み取った内容を整理中…');const result=parseTimetablePages(pages);if(pages.some(p=>p.ocr))result.warnings.unshift('画像から読み取っています。出演者名・時刻・備考を元資料と照合してください。');return result;
 }finally{signal?.removeEventListener('abort',stop);await worker?.terminate().catch(()=>{});await task?.destroy().catch(()=>{})}
}
