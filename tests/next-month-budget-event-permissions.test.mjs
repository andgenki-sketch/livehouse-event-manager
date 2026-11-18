import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchMonthlyBudgetEvents,PUBLIC_BUDGET_EVENT_COLUMNS} from '../app/components/next-month-budget-events.mjs';
import {buildNextMonthBudgetSummary} from '../app/components/next-month-budget-report.mjs';
const team='team1';
const month='2026-12';
const baseEvents=[
 {id:'a',team_id:team,event_date:'2026-12-04',title:'A',status:'booking'},
 {id:'b',team_id:team,event_date:'2026-12-11',title:'B',status:'booking'}
];
function fakeClient({events=baseEvents,amounts={a:120000,b:0},eventsError=null,rpcError=null}={}){
 const calls={columns:[],rpcs:[],filters:[]};
 const client={
  from(table){
   assert.equal(table,'events');
   return {select(columns){
    calls.columns.push(columns);
    return {eq(column,value){
     calls.filters.push(['eq',column,value]);
     return {gte(column,value){
      calls.filters.push(['gte',column,value]);
      return {lt(column,value){
       calls.filters.push(['lt',column,value]);
       return Promise.resolve({data:events,error:eventsError});
      }};
     }};
    }};
   }};
  },
  async rpc(name,args){
   calls.rpcs.push({name,args});
   return {data:rpcError?null:amounts[args.p_event_id]===undefined?null:{revenue_budget:amounts[args.p_event_id]},error:rpcError};
  }
 };
 return {client,calls};
}
test('restricted events revenue_budget is never selected directly',async()=>{
 const {client,calls}=fakeClient();
 const events=await fetchMonthlyBudgetEvents(client,team,'2026-12-01','2027-01-01');
 assert.deepEqual(events.map(x=>x.revenue_budget),[120000,0]);
 assert.deepEqual(calls.columns,[PUBLIC_BUDGET_EVENT_COLUMNS]);
 assert.doesNotMatch(calls.columns[0],/revenue_budget/);
 assert.deepEqual(calls.filters,[['eq','team_id',team],['gte','event_date','2026-12-01'],['lt','event_date','2027-01-01']]);
 assert.deepEqual(calls.rpcs.map(x=>x.name),['get_event_contracts','get_event_contracts']);
 assert.deepEqual(calls.rpcs.map(x=>x.args.p_event_id),['a','b']);
});
test('authorized event revenue budget still contributes to plan counts and total',async()=>{
 const {client}=fakeClient();
 const events=await fetchMonthlyBudgetEvents(client,team,'2026-12-01','2027-01-01');
 const plan=buildNextMonthBudgetSummary({month,teamId:team,events,budget:null});
 assert.equal(plan.plannedCount,2);
 assert.equal(plan.eventBudgetCount,1);
 assert.equal(plan.eventTargets,120000);
 assert.equal(plan.eventUnassignedCount,1);
});
test('permission denied from event listing must stop export rather than silently hide events',async()=>{
 const {client}=fakeClient({eventsError:{message:'permission denied for table events'}});
 await assert.rejects(fetchMonthlyBudgetEvents(client,team,'2026-12-01','2027-01-01'),/permission denied/);
});
test('no event financial permission fails safely rather than interpreting as 0 yen',async()=>{
 const {client}=fakeClient({amounts:{a:120000}});
 await assert.rejects(fetchMonthlyBudgetEvents(client,team,'2026-12-01','2027-01-01'),/アクセス権/);
});
test('RPC errors fail safely; no broad grant required',async()=>{
 const {client}=fakeClient({rpcError:{message:'insufficient_privilege'}});
 await assert.rejects(fetchMonthlyBudgetEvents(client,team,'2026-12-01','2027-01-01'),/insufficient_privilege/);
});
test('empty event month does not generate protected RPC calls',async()=>{
 const {client,calls}=fakeClient({events:[]});
 assert.deepEqual(await fetchMonthlyBudgetEvents(client,team,'2027-01-01','2027-02-01'),[]);
 assert.equal(calls.rpcs.length,0);
});
test('cross-team payload is not silently included',async()=>{
 const {client}=fakeClient({events:[{...baseEvents[0],team_id:'other'}]});
 await assert.rejects(fetchMonthlyBudgetEvents(client,team,'2026-12-01','2027-01-01'),/所属チーム/);
});
test('invalid financial amounts from RPC are rejected before report calculation',async()=>{
 const {client}=fakeClient({amounts:{a:-400,b:0}});
 await assert.rejects(fetchMonthlyBudgetEvents(client,team,'2026-12-01','2027-01-01'),/売上予算の値/);
});
