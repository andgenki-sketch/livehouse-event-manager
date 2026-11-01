import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),out=path.resolve('public/timetable-reader');
fs.mkdirSync(out,{recursive:true});
const pdf=path.dirname(require.resolve('pdfjs-dist/package.json'));
fs.copyFileSync(path.join(pdf,'legacy/build/pdf.worker.min.mjs'),path.join(out,'pdf.worker.min.mjs'));
for(const dir of ['cmaps','standard_fonts','wasm'])fs.cpSync(path.join(pdf,dir),path.join(out,dir),{recursive:true});
fs.copyFileSync(require.resolve('tesseract.js/dist/worker.min.js'),path.join(out,'ocr.worker.min.js'));
const core=path.dirname(require.resolve('tesseract.js-core/package.json'));
fs.mkdirSync(path.join(out,'core'),{recursive:true});
for(const name of fs.readdirSync(core))if(/\.wasm(\.js)?$/.test(name))fs.copyFileSync(path.join(core,name),path.join(out,'core',name));
for(const lang of ['jpn','eng']){
 const root=path.dirname(require.resolve('@tesseract.js-data/'+lang+'/package.json'));
 fs.copyFileSync(path.join(root,'4.0.0_best_int',lang+'.traineddata.gz'),path.join(out,lang+'.traineddata.gz'));
}
console.log('Prepared local PDF and Japanese OCR assets');
