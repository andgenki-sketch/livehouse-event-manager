import test from 'node:test';
import assert from 'node:assert/strict';
import {sortPayrollRows,comparePayrollStaff,confirmedPayrollRows,payrollReportHtml} from '../app/components/payroll-report.mjs';
import {monthlyExecutiveReportHtml} from '../app/components/monthly-management-report.mjs';

const names=[
 '山岡真司','大岩あさひ','清水 桜','堀井真碧海','おかむらまい',
 '安藤頼元','尾崎','釘﨑崇至','井上颯大','小高　洋',
 '福田悠太','長谷川 出輝','室伏栞里','松山華菜'
];
const firstFour=['尾崎','堀井真碧海','井上颯大','大岩あさひ'];
const orderedRest=['安藤頼元','おかむらまい','小高　洋','釘﨑崇至','清水 桜',
 '長谷川 出輝','福田悠太','松山華菜','室伏栞里','山岡真司'];
const sample=name=>({id:name,name,amount:10000,days:5,minutes:1200,method:name==='尾崎'?'salary_exception':'normal'});
test('fixed first four precede kana sorted staff regardless of original order',()=>{
 const sorted=sortPayrollRows(names.map(sample)).map(x=>x.name);
 assert.deepEqual(sorted,[...firstFour,...orderedRest]);
});
test('sort uses person names, never their current confirmation type or amount',()=>{
 const original=names.map(sample);
 original[0].amount=1000000;
 original[0].method='salary_exception';
 const after=sortPayrollRows(original);
 assert.equal(after[0].name,'尾崎');
 assert.equal(after.at(-1).name,'山岡真司');
 assert.deepEqual(names,[...names]); // no mutation of source names
});
test('same surname and alternate kanji spellings use stable name and id ordering',()=>{
 const sorted=sortPayrollRows([{name:'釘崎久美',id:'b'},{name:'釘﨑崇至',id:'a'},{name:'釘崎久美',id:'a'}]);
 assert.equal(sorted.length,3);
 assert.equal(sorted[0].name,'釘崎久美');
 assert.equal(sorted[0].id,'a');
 assert.equal(comparePayrollStaff({name:'尾崎'},{name:'大岩あさひ'})<0,true);
});
test('confirmed payroll comes back in the requested order with original amounts',()=>{
 const staff=names.map((name,i)=>({id:String(i),team_id:'t',name}));
 const confirmation=staff.map((p,i)=>({team_id:'t',staff_id:p.id,payroll_month:'2026-10-01',
  confirmed_amount:20000+i,confirmed_minutes:300,work_days:1,
  confirmation_method:i===0?'salary_exception':'normal'}));
 const rows=confirmedPayrollRows(confirmation,staff,'t','2026-10');
 assert.deepEqual(rows.map(x=>x.name),[...firstFour,...orderedRest]);
 assert.equal(rows.find(x=>x.name==='山岡真司').amount,20000);
});
test('salary PDF prints only names and confirmed amounts without hours, days, indexes or exception label',()=>{
 const rows=names.map(sample);
 const html=payrollReportHtml({rows,month:'2026-10',teamName:'ThunderSnakeATSUGI'});
 assert.match(html,/<th>氏名<\/th><th class="num">確定支給額<\/th>/);
 assert.doesNotMatch(html,/<th[^>]*>勤務日数<\/th>/);
 assert.doesNotMatch(html,/<th[^>]*>勤務時間<\/th>/);
 assert.doesNotMatch(html,/月給簡単確定|実働手動確認/);
 assert.doesNotMatch(html,/<th[^>]*>No\.<\/th>/);
 const order=[...firstFour,...orderedRest].map(name=>html.indexOf('<td class="name">'+name+'</td>'));
 assert.ok(order.every(i=>i>=0));
 assert.deepEqual(order,[...order].sort((a,b)=>a-b));
 assert.match(html,/>¥140,000</);
});
test('payroll PDF safely escapes employee names',()=>{
 const html=payrollReportHtml({rows:[sample('<img src=x onerror=alert(1)>')],month:'2026-10',teamName:'TSA'});
 assert.doesNotMatch(html,/<img src=x/);
 assert.match(html,/&lt;img src=x/);
});
test('executive summary salary page also displays only names and amounts',()=>{
 const payroll=sortPayrollRows(names.map(sample));
 const data={month:'2026-10',sales:0,salaryTotal:payroll.reduce((n,r)=>n+r.amount,0),
 hasConfirmed:true,payroll,pending:[],expectedCount:payroll.length,confirmedCount:payroll.length,
 payrollComplete:true,expenseTotal:0,outsideTotal:0,ledgerExpense:0,eventExpense:0,
 ledgerOutside:0,eventOutside:0,eventsCount:0,reportedEventsCount:0,
 warnings:[],referenceBalance:0,monthlyBudget:null,manualPayroll:[],salaryExceptions:[]};
 const html=monthlyExecutiveReportHtml({data,teamName:'TSA'});
 assert.match(html,/<h2>スタッフ別 給与確定一覧<\/h2>/);
 assert.match(html,/<th>氏名<\/th><th class="num">確定支給額<\/th>/);
 assert.doesNotMatch(html,/<th[^>]*>勤務日数<\/th>|<th[^>]*>勤務時間<\/th>/);
 assert.doesNotMatch(html,/月給簡単確定|実働手動確認/);
 const p=html.slice(html.indexOf('<h2>スタッフ別 給与確定一覧'));
 const order=[...firstFour,...orderedRest].map(name=>p.indexOf('<td>'+name+'</td>'));
 assert.ok(order.every(i=>i>=0));
 assert.deepEqual(order,[...order].sort((a,b)=>a-b));
});
