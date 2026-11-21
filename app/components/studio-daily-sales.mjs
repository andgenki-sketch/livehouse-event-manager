/**
 * STUDIO SNAKE has one cash-only daily sales amount across its rooms.
 * No room or payment-method splits. A missing row is not the same as zero.
 */
export function studioDailySalesSummary(rows=[]){
 if(!Array.isArray(rows))throw Error('日次売上の形式が不正です');
 let total=0;
 for(const row of rows){
  const amount=Number(row?.amount);
  if(!Number.isSafeInteger(amount)||amount<0)throw Error('スタジオ売上に不正な金額が含まれています');
  total+=amount;
  if(!Number.isSafeInteger(total))throw Error('スタジオ売上合計が計算範囲を超えています');
 }
 return {total:rows.length?total:null,days:rows.length,entered:rows.length>0};
}
export function studioDailySaleInput(raw){
 const text=String(raw??'').trim();
 if(!/^\d+$/.test(text))throw Error('売上金額は0以上の整数で入力してください');
 const amount=Number(text);
 if(!Number.isSafeInteger(amount))throw Error('売上金額が大きすぎます');
 return amount;
}
export function validStudioSalesDate(date){
 if(!/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(String(date||'')))return false;
 const y=Number(date.slice(0,4)),m=Number(date.slice(5,7)),d=Number(date.slice(8,10));
 const parsed=new Date(Date.UTC(y,m-1,d));
 return parsed.getUTCFullYear()===y&&parsed.getUTCMonth()+1===m&&parsed.getUTCDate()===d;
}
