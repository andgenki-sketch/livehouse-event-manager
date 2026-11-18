import {CASHFLOW_KEYS,calculateCashflow} from './cashflow-model.mjs';

/**
 * Original spreadsheet sequence: carry-in, operations, finance,
 * monthly cash movement, carry-out. Extra reconciliation rows remain visible.
 * Values stay in exact yen; formatting is a display concern.
 */
export const CASHFLOW_SHEET_ROWS=[
 {type:'amount',key:'opening_balance',label:'前月繰越現金・預金',total:false,kind:'balance'},
 {type:'section',label:'営業収支｜売上高'},
 {type:'amount',key:'sales_cash',label:'売上高（現金）'},
 {type:'amount',key:'sales_cashless',label:'売上高（キャッシュレス）'},
 {type:'calc',key:'sales_total',label:'売上高合計',kind:'subtotal'},
 {type:'section',label:'営業収支｜原価'},
 {type:'amount',key:'purchase_cost',label:'仕入高'},
 {type:'calc',key:'cost_total',label:'原価合計',kind:'subtotal'},
 {type:'calc',key:'gross_profit',label:'売上総利益',kind:'subtotal'},
 {type:'section',label:'営業収支｜経費'},
 {type:'amount',key:'director_salary',label:'役員報酬'},
 {type:'amount',key:'employee_salary',label:'従業員給与'},
 {type:'amount',key:'transportation',label:'交通費'},
 {type:'amount',key:'entertainment',label:'交際費'},
 {type:'amount',key:'advertising',label:'広告宣伝費'},
 {type:'amount',key:'communications',label:'通信費'},
 {type:'amount',key:'rent',label:'家賃'},
 {type:'amount',key:'utilities',label:'光熱費'},
 {type:'amount',key:'other_operating',label:'その他経費'},
 {type:'amount',key:'taxes',label:'税金'},
 {type:'amount',key:'statutory_benefits',label:'法定福利費'},
 {type:'amount',key:'outsourcing',label:'外注費'},
 {type:'calc',key:'expenses_total',label:'経費合計（仕入除く）',kind:'subtotal'},
 {type:'calc',key:'operating_profit',label:'営業利益（入出金ベース）',kind:'total'},
 {type:'section',label:'財務収支｜収入'},
 {type:'amount',key:'long_loan_in',label:'長期借入金調達'},
 {type:'amount',key:'short_loan_in',label:'短期借入金調達'},
 {type:'amount',key:'other_finance_in',label:'その他財務収入'},
 {type:'calc',key:'finance_income_total',label:'財務収入合計',kind:'subtotal'},
 {type:'section',label:'財務収支｜支出'},
 {type:'amount',key:'long_loan_out',label:'長期借入金返済'},
 {type:'amount',key:'short_loan_out',label:'短期借入金返済'},
 {type:'amount',key:'loan_interest',label:'借入金利息'},
 {type:'amount',key:'other_finance_out',label:'その他財務支出'},
 {type:'calc',key:'finance_out_total',label:'財務支出合計',kind:'subtotal'},
 {type:'calc',key:'finance_balance',label:'財務収支差引過不足',kind:'subtotal'},
 {type:'calc',key:'monthly_total',label:'月別収支合計',kind:'total'},
 {type:'calc',key:'closing_balance',label:'翌月繰越現金・預金（計算）',total:false,kind:'balance'},
 {type:'amount',key:'reported_closing_balance',label:'翌月繰越現金・預金（原本・帳簿）',total:false,kind:'balance'},
 {type:'calc',key:'reconciliation_delta',label:'月末残高の照合差額',total:false,kind:'variance'}
];
const OPERATING_NON_PURCHASE_KEYS=['director_salary','employee_salary','transportation','entertainment',
 'advertising','communications','rent','utilities','other_operating','taxes','statutory_benefits','outsourcing'];
const hasOne=(row,keys)=>keys.some(key=>row?.[key]!==null&&row?.[key]!==undefined&&row?.[key]!=='');
const number=(row,key)=>row?.[key]===null||row?.[key]===undefined?0:Number(row[key]);
export function cashflowSheetValue(row,key){
 if(!row)return null;
 if([...CASHFLOW_KEYS,'opening_balance','reported_closing_balance'].includes(key)){
  return row[key]===null||row[key]===undefined?null:Number(row[key]);
 }
 const calc=calculateCashflow(row);
 const hasSales=hasOne(row,['sales_cash','sales_cashless']);
 switch(key){
  case 'sales_total':return hasSales?calc.operatingIncome:null;
  case 'cost_total':return row.purchase_cost===null||row.purchase_cost===undefined?null:Number(row.purchase_cost);
  case 'gross_profit':return hasSales?calc.operatingIncome-number(row,'purchase_cost'):null;
  case 'expenses_total':return hasOne(row,OPERATING_NON_PURCHASE_KEYS)
   ?OPERATING_NON_PURCHASE_KEYS.reduce((n,k)=>n+number(row,k),0):null;
  case 'operating_profit':return calc.net===null?null:calc.operatingNet;
  case 'finance_income_total':return hasOne(row,['long_loan_in','short_loan_in','other_finance_in'])?calc.financialIncome:null;
  case 'finance_out_total':return hasOne(row,['long_loan_out','short_loan_out','loan_interest','other_finance_out'])?calc.financialOut:null;
  case 'finance_balance':return calc.net===null?null:calc.financeNet;
  case 'monthly_total':return calc.net;
  case 'closing_balance':return calc.closing;
  case 'reconciliation_delta':return calc.reconciliationDelta;
  default:throw Error('不明な資金繰り項目です: '+key);
 }
}
export function cashflowSheetAnnualValue(entries,key,months){
 if(['opening_balance','reported_closing_balance','closing_balance','reconciliation_delta'].includes(key))return {value:null,available:0,partial:false};
 const values=months.map(month=>cashflowSheetValue(entries[month]||null,key)).filter(v=>v!==null);
 if(!values.length)return {value:null,available:0,partial:false};
 return {value:values.reduce((sum,v)=>sum+v,0),available:values.length,partial:values.length<months.length};
}
const unitFactor=unit=>unit==='man'?10000:unit==='yen'?1:null;
export function cashflowCellToYen(value,unit,{signed=false}={}){
 const s=String(value??'').trim().replaceAll(',','');
 if(s==='')return null;
 const decimals=unit==='man'?4:0;
 const pattern=decimals?new RegExp('^'+(signed?'-?':'')+'\\d+(?:\\.\\d{1,4})?$'):new RegExp('^'+(signed?'-?':'')+'\\d+$');
 if(!pattern.test(s))throw Error(unit==='man'?'万円入力は小数4桁までです（1円単位）':'円入力は整数のみです');
 const factor=unitFactor(unit);
 if(!factor)throw Error('単位を確認してください');
 const amount=Math.round(Number(s)*factor);
 if(!Number.isSafeInteger(amount)||(!signed&&amount<0))throw Error('金額の範囲を確認してください');
 return amount;
}
export function cashflowYenToInput(value,unit){
 if(value===null||value===undefined||value==='')return '';
 const n=Number(value),factor=unitFactor(unit);
 if(!Number.isSafeInteger(n)||!factor)throw Error('値の変換に失敗しました');
 if(factor===1)return String(n);
 return (n/10000).toFixed(4).replace(/\\.?0+$/,'');
}
export function cashflowYenToDisplay(value,unit){
 if(value===null||value===undefined)return '—';
 const n=Number(value),factor=unitFactor(unit);
 if(!Number.isSafeInteger(n)||!factor)return '—';
 return (n/factor).toLocaleString('ja-JP',{minimumFractionDigits:0,maximumFractionDigits:unit==='man'?4:0});
}
