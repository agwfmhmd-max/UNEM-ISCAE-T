/* إدارة الجداول الدراسية: الوحدة مشتركة في /unem-schedules-admin.js (نفسها في صفحة الجداول) */
(function(){
'use strict';
var loading=null;
function load(){
  if(window.UNEMSchedAdmin)return Promise.resolve();
  if(loading)return loading;
  loading=new Promise(function(res,rej){var s=document.createElement('script');s.src='/unem-schedules-admin.js?v=31';s.onload=res;s.onerror=function(){loading=null;rej(new Error('load'));};document.head.appendChild(s);});
  return loading;
}
window.openSchedulesAdmin=function(){
  if(typeof isAdmin!=='function'||!isAdmin())return alert('❌ إدارة الجداول الدراسية للمشرف الرئيسي فقط.');
  try{currentAdminDashPage='schedules';}catch(e){}
  var home=document.getElementById('admin-dashboard-home'),page=document.getElementById('admin-dashboard-page'),c=document.getElementById('admin-dashboard-page-content');
  if(!home||!page||!c)return;
  home.style.display='none';page.style.display='block';
  c.innerHTML='<div style="padding:18px;text-align:center;font-weight:800">⏳ ...</div>';
  load().then(function(){
    window.UNEMSchedAdmin.mount(c,{sb:(typeof supabaseClient!=='undefined'?supabaseClient:null),api:(typeof unemApi==='function'?unemApi:null)});
  }).catch(function(){c.innerHTML='<div style="padding:18px;text-align:center;font-weight:800;color:#b91c1c">❌ تعذر تحميل وحدة إدارة الجداول. تحقق من الاتصال ثم أعد المحاولة.</div>';});
};
})();
