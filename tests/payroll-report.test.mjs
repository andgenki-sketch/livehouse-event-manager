import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedPayrollRows,payrollReportHtml} from '../app/components/payroll-report.mjs';
test('exports only this team and month, including inactive staff, in name order',()=>{
 const staff=[{id:'a',team_id:'team',name:'あさひ',active:false},{id:'b',team_id:'team',name:'いのうえ'}];
 const row={team_id:'team',payroll_month:'2026-10-01',confirmed_amount:12345,confirmed_minutes:390,work_days:2};
 const rows=confirmedPayrollRows([{...row,staff_id:'b'},{...row,staff_id:'a'},{...row,team_id:'other',staff_id:'a'},{...row,payroll_month:'2026-11-01',staff_id:'a'}],staff,'team','2026-10');
 assert.deepEqual(rows.map(r=>r.name),['あさひ','いのうえ']);assert.equal(rows[0].amount,12345);
});
test('report uses confirmed amounts, precise time, and escapes staff and team text',()=>{
 const html=payrollReportHtml({month:'2026-10',teamName:'<script>bad</script>',rows:[{name:'<img onerror=bad>',amount:12345,minutes:391,days:2},{name:'いのうえ',amount:20000,minutes:60,days:1}],issuedAt:new Date('2026-11-01T00:00:00Z')});
 assert.ok(html.includes('¥32,345'));assert.ok(html.includes('6時間31分'));assert.ok(html.includes('&lt;img onerror=bad&gt;'));assert.ok(!html.includes('<script>bad'));assert.ok(html.includes('確定済み 2名'));
});
test('missing staff metadata prevents a misleading report',()=>{
 assert.throws(()=>confirmedPayrollRows([{team_id:'team',staff_id:'missing',payroll_month:'2026-10-01'}],[],'team','2026-10'));
});
