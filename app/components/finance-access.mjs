/** Owner and production staff may inspect finance; payroll controls remain owner-only. */
export const financeRoleCanView = role=>role==='owner'||role==='member';
export const financeRoleIsOwner = role=>role==='owner';
export const financeMenuItems = role=>[
 ['overview','経営ダッシュボード'],
 ['budget','予算・予実管理'],
 ...(financeRoleIsOwner(role)?[['payroll','給与計算・確定']]:[]),
 ['cashflow','資金繰り管理'],
 ['expenses','経費・外注費'],
 ['reports','報告書管理']
];
export const visibleFinanceTab = (role,tab)=>
 tab==='payroll'&&!financeRoleIsOwner(role)?'overview':tab;
