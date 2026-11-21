'use client';
import {useState} from 'react';
import MonthlyManagementReport from './MonthlyManagementReport';
import NextMonthBudgetReport from './NextMonthBudgetReport';
import CashflowSpreadsheet from './CashflowSpreadsheet';
import PayrollReport from './PayrollReport';
import {previousJapanMonth} from './monthly-management-report.mjs';

/**
 * Management hub for owner-only financial planning and reporting.
 * Daily event settlement entry remains available from the operational menu.
 * Existing database tables and report calculations are reused unchanged.
 */
const tabs=[
 {id:'summary',label:'月次サマリー',subtitle:'経営報告・実績'},
 {id:'budget',label:'予算管理',subtitle:'売上・人件費・経費'},
 {id:'cashflow',label:'資金繰り',subtitle:'計画・実績・差異'},
 {id:'reports',label:'各種報告書',subtitle:'翌月予算・給与'}
];

export default function FinancialManagementHub({client,team,budgetPanel}){
 const [tab,setTab]=useState('summary');
 const [payrollMonth,setPayrollMonth]=useState(()=>previousJapanMonth());
 if(team?.role!=='owner')return null;
 return <div className="financial-management-hub listpage">
  <style>{`
  .financial-management-hub{max-width:1200px}
  .financial-hub-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:18px}
  .financial-hub-heading h2{margin:0 0 5px;font-size:clamp(22px,3.2vw,30px)}
  .financial-hub-heading p{margin:0;color:#667085;font-size:14px}
  .financial-hub-private{color:#475467;background:#f2f4f7;border-radius:20px;padding:6px 12px;font-size:12px;white-space:nowrap}
  .financial-hub-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:20px}
  .financial-hub-tab{min-width:0;min-height:86px;border:1px solid #d9e2ee;border-radius:12px;padding:13px;text-align:left;background:#fff;color:#344054;cursor:pointer}
  .financial-hub-tab strong{display:block;font-size:15px;margin-bottom:5px}
  .financial-hub-tab small{display:block;color:#667085;font-size:12px}
  .financial-hub-tab.active{border-color:#183a60;background:#edf4fc;box-shadow:inset 0 0 0 1px #183a60}
  .financial-hub-tab.active strong{color:#193b5e}
  .financial-hub-content{min-width:0}
  .financial-hub-intro{margin:0 0 14px;color:#667085;font-size:13px;line-height:1.7}
  .financial-hub-report-stack{display:grid;gap:18px}
  .financial-hub-report-stack .card{padding:18px}
  .financial-hub-payroll-picker{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}
  .financial-hub-payroll-picker input{max-width:200px}
  @media(max-width:750px){.financial-hub-tabs{grid-template-columns:repeat(2,minmax(0,1fr))}.financial-hub-tab{min-height:70px}.financial-hub-heading{flex-wrap:wrap}}
  @media(max-width:410px){.financial-hub-tab{padding:9px}.financial-hub-tab strong{font-size:13px}}
  `}</style>
  <div className="financial-hub-heading">
   <div><h2>財務管理</h2><p>売上・予算・資金繰り・報告書をまとめて確認</p></div>
   <span className="financial-hub-private">オーナー専用</span>
  </div>
  <nav className="financial-hub-tabs" aria-label="財務管理メニュー">
   {tabs.map(item=><button type="button" key={item.id} className={'financial-hub-tab'+(tab===item.id?' active':'')}
    aria-current={tab===item.id?'page':undefined} onClick={()=>setTab(item.id)}>
    <strong>{item.label}</strong><small>{item.subtitle}</small>
   </button>)}
  </nav>
  <div className="financial-hub-content">
   {tab==='summary'&&<>
    <p className="financial-hub-intro">月間のライブハウス売上・スタジオ売上・合計を先頭に表示した経営サマリーを作成できます。確定給与、経費、外注費も同じ資料で確認できます。</p>
    <MonthlyManagementReport client={client} team={team}/>
   </>}
   {tab==='budget'&&<>
    <p className="financial-hub-intro">月次の売上・人件費・経費・外注費の予算設定と、実績に対する進捗をここで管理します。既存の月次予算データを引き継いでいます。</p>
    {budgetPanel}
   </>}
   {tab==='cashflow'&&<CashflowSpreadsheet client={client} team={team}/>}
   {tab==='reports'&&<div className="financial-hub-report-stack">
    <p className="financial-hub-intro">翌月予算の提出資料と給与明細PDFを作成できます。経営サマリーPDFは「月次サマリー」から作成してください。</p>
    <NextMonthBudgetReport client={client} team={team}/>
    <section className="card" aria-label="給与明細報告書">
     <h3>給与明細PDF</h3>
     <p>確定した給与を対象月ごとにPDF出力します。給与の確定操作は「シフト → 給与計算」で行います。</p>
     <label className="financial-hub-payroll-picker">対象月
      <input type="month" value={payrollMonth} onChange={e=>setPayrollMonth(e.target.value)}/>
     </label>
     {payrollMonth&&<PayrollReport client={client} team={team} month={payrollMonth}/>}
    </section>
   </div>}
  </div>
 </div>;
}
