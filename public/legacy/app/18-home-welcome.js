
/* UNEM ISCAE — ترحيب الطالب بالاسم المسجَّل في المجتمع + إجمالي زوار المنصة. Developer: MDA */
(function(){'use strict';
var T={ar:{hello:'مرحباً بك في منصة UNEM ISCAE',helloName:'مرحباً بك',kick:'مرحباً بك',welcomeSub:'يسعدنا وجودك معنا — اطّلع على الملخصات والنتائج والجداول والمجتمع.',guestSub:'سجّل في مجتمع الطلاب ليظهر اسمك هنا.',visits:'إجمالي زوار المنصة',regs:'عدد المسجّلين في المنصة'},
fr:{hello:'Bienvenue sur la plateforme UNEM ISCAE',helloName:'Bienvenue',kick:'Bienvenue',welcomeSub:'Ravis de vous revoir — résumés, résultats, emplois du temps et communauté.',guestSub:'Inscrivez-vous à la communauté pour voir votre nom ici.',visits:'Total des visiteurs de la plateforme',regs:'Étudiants inscrits sur la plateforme'}};
var visits=null,regs=null,flags={v:true,r:true},reportStatus=null,reportLoading=false;
function lang(){try{return localStorage.getItem('unem_lang')==='fr'?'fr':'ar'}catch(e){return 'ar'}}
function student(){try{var s=JSON.parse(localStorage.getItem('unem_student')||'null');return s&&s.status==='approved'&&s.name?s:null}catch(e){return null}}
function $(i){return document.getElementById(i)}
function initials(n){var w=String(n||'').trim().split(/\s+/).filter(Boolean);if(!w.length)return '?';var a=Array.from(w[0])[0]||'',b=w.length>1?(Array.from(w[w.length-1])[0]||''):'';return (a+b).toUpperCase()}
function avatarFor(st){try{var a=JSON.parse(localStorage.getItem('unem_student_avatar')||'null');if(a&&a.data&&String(a.reg).trim().toLowerCase()===String(st.reg).trim().toLowerCase()&&/^data:image\/(jpeg|png|webp);base64,/.test(a.data))return a.data}catch(e){}return null}
function loadReportStatus(){
  var st=student(),tk=null;if(!st)return;
  try{tk=localStorage.getItem('unem_community_token')}catch(e){}
  if(!tk||tk.length<30||reportLoading)return;reportLoading=true;
  var U='https://cbaswqaufawdsvadizyi.supabase.co',K=(window.SUPABASE_KEY||'');
  try{if(typeof SUPABASE_URL==='string'&&SUPABASE_URL)U=SUPABASE_URL;if(!K&&typeof SUPABASE_KEY==='string')K=SUPABASE_KEY}catch(e){}
  if(!K)K='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiYXN3cWF1ZmF3ZHN2YWRpenlpIiwiaWF0IjoxNzc3ODM4NTE0LCJleHAiOjIwOTM0MTQ1MTJ9.tv-u05JTkUFFkdYgR4gUyRb0TZKtDEwEwRQLRQSljHU';
  fetch(U+'/rest/v1/rpc/community_api',{method:'POST',headers:{'Content-Type':'application/json',apikey:K,Authorization:'Bearer '+K},body:JSON.stringify({p_token:tk,p_action:'report_status',p_args:{}})})
    .then(function(r){return r.json()}).then(function(d){reportStatus=Array.isArray(d)?d[0]||null:null;reportLoading=false;render()}).catch(function(){reportLoading=false});
}
function reportText(r,l){if(!r)return '';var a=l==='fr';if(r.status==='pending')return a?'Votre signalement est en cours d’examen.':'بلاغك قيد المراجعة من طرف المشرف.';if(r.status==='banned')return a?'Le signalement a été traité : l’autre appareil a été bloqué.':'تمت معالجة البلاغ: تم حظر الجهاز الآخر.';if(r.status==='rejected')return a?'Votre signalement a été rejeté après examen.':'تم رفض البلاغ بعد المراجعة.';if(r.status==='unbanned')return a?'Le blocage de l’appareil a été annulé.':'ألغى المشرف حظر الجهاز المرتبط بالبلاغ.';return a?'Votre signalement a été traité.':'تمت معالجة البلاغ.'}
function syncAvatar(n){
  n=n||0;var st=student();if(!st)return;var tk=null;try{tk=localStorage.getItem('unem_community_token')}catch(e){}if(!tk||tk.length<30)return;
  var U='https://cbaswqaufawdsvadizyi.supabase.co',K=(window.SUPABASE_KEY||'');
  function key(){
    if(K)return K;
    try{if(typeof SUPABASE_KEY==='string')return SUPABASE_KEY}catch(e){}
    return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiYXN3cWF1ZmF3ZHN2YWRpenlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4Mzg1MTQsImV4cCI6MjA5MzQxNDUxNH0.tv-u05JTkUFFkdYgR4gUyRb0TZKtDEwEwRQLRQSljHU';
  }
  try{if(typeof SUPABASE_URL==='string'&&SUPABASE_URL)U=SUPABASE_URL}catch(e){}
  var k=key();if(!k)return;
  fetch(U+'/rest/v1/rpc/community_api',{method:'POST',headers:{'Content-Type':'application/json',apikey:k,Authorization:'Bearer '+k},body:JSON.stringify({p_token:tk,p_action:'me',p_args:{}})})
    .then(function(r){return r.json()}).then(function(d){
      if(!d||d.need_register||d.code||d.message)return;if(d.admin&&!d.account)return;
      try{if(d.avatar_data)localStorage.setItem('unem_student_avatar',JSON.stringify({reg:st.reg,data:d.avatar_data}));else localStorage.removeItem('unem_student_avatar')}catch(e){}
      render();
    }).catch(function(){if(n<2)setTimeout(function(){syncAvatar(n+1)},4000)});
}
function fmt(n){try{return Number(n).toLocaleString(lang()==='fr'?'fr-FR':'en-US')}catch(e){return String(n)}}
function render(){
  var l=lang(),t=T[l],box=$('home-welcome');if(!box)return;
  var st=student(),line=$('hw-line'),sub=$('hw-sub'),av=$('hw-avatar'),kick=$('hw-kicker'),chips=$('hw-chips');
  if(!av.__cap)av.__cap=av.innerHTML;
  if(st){
    line.textContent='';var em=document.createElement('em');em.textContent=st.name;line.appendChild(em);
    if(kick)kick.textContent=t.kick;sub.textContent=t.welcomeSub;
    av.classList.add('is-student');av.textContent='';
    var photo=avatarFor(st);
    if(photo){av.classList.add('has-photo');var im=document.createElement('img');im.alt='';im.decoding='async';im.onerror=function(){av.classList.remove('has-photo');av.textContent=initials(st.name)};im.src=photo;av.appendChild(im)}
    else{av.classList.remove('has-photo');av.textContent=initials(st.name)}
    if(chips){chips.textContent='';
      [['fa-graduation-cap',st.spec],['fa-layer-group',st.level],['fa-id-card',st.reg]].forEach(function(c){
        if(!c[1])return;var s=document.createElement('span');s.className='hw-chip';var i=document.createElement('i');i.className='fas '+c[0];i.setAttribute('aria-hidden','true');s.appendChild(i);s.appendChild(document.createTextNode(String(c[1])));chips.appendChild(s)});}
  }
  else{
    line.textContent=t.hello;sub.textContent=t.guestSub;if(kick)kick.textContent='';if(chips)chips.textContent='';
    if(av.classList.contains('is-student')){av.classList.remove('is-student','has-photo');av.innerHTML=av.__cap}
  }
  var rb=$('hw-report-status');
  if(st&&reportStatus){if(!rb){rb=document.createElement('div');rb.id='hw-report-status';box.appendChild(rb)}rb.textContent=reportText(reportStatus,l);rb.style.cssText='margin:10px auto 0;padding:9px 12px;border-radius:12px;font-size:.8rem;font-weight:800;background:'+(document.body.classList.contains('dark-mode')?'rgba(245,185,66,.14)':'#fffbeb')+';color:'+(document.body.classList.contains('dark-mode')?'#fde68a':'#92400e')+';border:1px solid rgba(245,185,66,.45)'}else if(rb)rb.remove();
  var v=$('hw-visits'),rg=$('hw-regs'),sx=$('hw-stats');
  var showV=visits!==null&&flags.v,showR=regs!==null&&flags.r;
  if(v){v.style.display=showV?'':'none';if(showV){$('hw-visits-l').textContent=t.visits;v.title=t.visits;$('hw-visits-n').textContent=fmt(visits)}}
  if(rg){rg.style.display=showR?'':'none';if(showR){$('hw-regs-l').textContent=t.regs;rg.title=t.regs;$('hw-regs-n').textContent=fmt(regs)}}
  if(sx)sx.style.display=(showV||showR)?'':'none';
}
function countTo(key,to){
  var el=$(key==='regs'?'hw-regs-n':'hw-visits-n'),from=0,t0=null,dur=900;if(!el)return;
  function set(x){if(key==='regs')regs=x;else visits=x}
  if(window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches){set(to);render();return}
  function step(ts){if(t0===null)t0=ts;var p=Math.min(1,(ts-t0)/dur),e=1-Math.pow(1-p,3);set(Math.round(from+(to-from)*e));render();if(p<1)requestAnimationFrame(step)}
  requestAnimationFrame(step);
}
function countUp(to){countTo('visits',to)}
function applyStats(o){
  flags.v=o.fv!==false;flags.r=o.fr!==false;
  var nv=Number(o.v),nr=Number(o.r);
  if(o.v!=null&&isFinite(nv)&&nv>=0)countTo('visits',nv);
  if(o.r!=null&&isFinite(nr)&&nr>=0)countTo('regs',nr);
  render();
}
/* السلوك القديم (الزوار فقط) إن لم تُنفَّذ دالة الإحصاءات الجديدة بعد في قاعدة البيانات */
function legacyVisits(retry){
  supabaseClient.rpc('get_public_visitor_stats').then(function(r){
    if(r.error||!r.data){retry();return} /* الدالة غير مفعّلة بعد: يبقى العدّاد مخفياً */
    var d=r.data;if(typeof d==='string'){try{d=JSON.parse(d)}catch(e){}}if(Array.isArray(d))d=d[0];
    var n=Number(d&&d.total_visitors);if(!isFinite(n)||n<0)return;
    applyStats({v:n});
  }).catch(function(){retry()});
}
function loadVisits(){
  var cached=null;try{cached=JSON.parse(sessionStorage.getItem('unem_stats_cache')||'null')}catch(e){}
  if(cached&&Date.now()-cached.t<120000){applyStats(cached);return}
  var tries=0;(function go(){
    if(typeof supabaseClient==='undefined'||!supabaseClient){if(++tries<20)return setTimeout(go,500);return}
    var retry=function(){if(++tries<6)setTimeout(go,2500)};
    supabaseClient.rpc('get_public_platform_stats').then(function(r){
      if(r.error||!r.data){legacyVisits(retry);return}
      var d=r.data;if(typeof d==='string'){try{d=JSON.parse(d)}catch(e){}}if(Array.isArray(d))d=d[0];
      if(!d){legacyVisits(retry);return}
      var o={t:Date.now(),v:d.total_visitors,r:d.registered_students,fv:d.show_visitors!==false,fr:d.show_registered!==false};
      try{sessionStorage.setItem('unem_stats_cache',JSON.stringify(o))}catch(e){}
      applyStats(o);
    }).catch(function(){legacyVisits(retry)});
  })();
}
/* يستدعيها المشرف بعد تغيير المفتاحين ليظهر الأثر فوراً دون إعادة تحميل */
window.unemHomeStatsFlags=function(fv,fr){
  if(fv!=null)flags.v=!!fv;if(fr!=null)flags.r=!!fr;
  try{sessionStorage.removeItem('unem_stats_cache')}catch(e){}
  render();
  if((visits===null&&flags.v)||(regs===null&&flags.r))loadVisits();
};
function init(){
  render();loadVisits();syncAvatar();loadReportStatus();
  window.addEventListener('unem:student',function(){render();syncAvatar()});
  window.addEventListener('unem:avatar',function(){render()});
  window.addEventListener('pageshow',function(){render();syncAvatar();loadReportStatus()});
  var lastSync=Date.now();
  function softSync(){if(Date.now()-lastSync<15000)return;lastSync=Date.now();syncAvatar()}
  document.addEventListener('visibilitychange',function(){if(!document.hidden)softSync()});
  window.addEventListener('focus',softSync);
  window.addEventListener('storage',function(e){if(e.key==='unem_student'||e.key==='unem_lang'||e.key==='unem_student_avatar')render()});
  var old=window.setLanguage;
  if(typeof old==='function'&&!old.__hw){var f=function(){var r=old.apply(this,arguments);try{render()}catch(e){}return r};f.__hw=1;window.setLanguage=f}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
