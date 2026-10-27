
/* UNEM ISCAE — إدارة تسجيلات الطلاب (لائحة Excel + موافقة/رفض الحسابات) — للمشرف الرئيسي. Developer: MDA */
(function(){'use strict';
var SPECS=[['BA','BA'],['FC','FC'],['TCM','TCM'],['GRH','GRH'],['SAE','SAE'],['IG','IG'],['MASTER_FC','Master FC'],['MASTER_IG','Master IG']];
var SL={};SPECS.forEach(function(s){SL[s[0]]=s[1]});
var st={parsed:null,status:'',q:'',timer:null};
function h(s){return typeof escapeHtml==='function'?escapeHtml(s):String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function lvls(spec){return /^MASTER_/.test(spec)?['M1','M2']:['L1','L2','L3']}
function specOpts(sel){return SPECS.map(function(s){return '<option value="'+s[0]+'"'+(s[0]===sel?' selected':'')+'>'+h(s[1])+'</option>'}).join('')}
function lvlOptsImport(spec,sel){return lvlOpts(spec,sel)+'<option value="S"'+(sel==='S'?' selected':'')+'>🎓 Sortants (خريجون)</option>'}
function lvlOpts(spec,sel){var l=lvls(spec);return l.map(function(x){return '<option'+(x===sel?' selected':'')+'>'+x+'</option>'}).join('')}
function rpc(a,args){if(!supabaseClient)return Promise.reject(new Error('offline'));return supabaseClient.rpc('student_admin',{p_action:a,p_args:args||{}}).then(function(r){if(r.error)throw r.error;return r.data})}
function sessionRpc(a,args){if(!supabaseClient)return Promise.reject(new Error('offline'));return supabaseClient.rpc('student_session_admin',{p_action:a,p_args:args||{}}).then(function(r){if(r.error)throw r.error;return r.data})}
function deviceRpc(a,args){if(!supabaseClient)return Promise.reject(new Error('offline'));return supabaseClient.rpc('student_device_admin',{p_action:a,p_args:args||{}}).then(function(r){if(r.error)throw r.error;return r.data})}
function errMsg(e){var m=String((e&&e.message)||e);if(/student_admin|student_session_admin|schema cache|PGRST202/.test(m))return 'يلزم تنفيذ ترحيلات الطلاب بالترتيب، بما فيها db/20261016090000_supervisor_delegation_and_student_admin.sql في Supabase.';if(/forbidden/.test(m))return 'ليست لديك الصلاحية الممنوحة لهذه العملية.';return m}
function $(id){return document.getElementById(id)}
function fmt(d){try{return new Date(d).toLocaleString('ar',{dateStyle:'short',timeStyle:'short'})}catch(e){return ''}}
function canManageStudentRecords(){return typeof hasPermission==='function'&&hasPermission('manage_students')}
function canManagePlatformSettings(){return typeof hasPermission==='function'&&hasPermission('manage_platform_settings')}

window.renderStudentsAdmin=async function(){
  var c=$('admin-dashboard-page-content');if(!c)return;
  st.parsed=null;
  var canManage=canManageStudentRecords();
  c.innerHTML=(canManage?'<div class="admin-page-box" id="st-import"><h3>📥 رفع لائحة الطلاب (Excel أو PDF)</h3>'+
  '<p>اختر التخصص والمستوى ثم ارفع ملف Excel أو PDF يحتوي على عمودين: <b>اسم الطالب</b> و<b>رقم التسجيل</b>. يمكنك رفع عدة ملفات PDF دفعة واحدة (مثل لوائح المجموعات الرسمية)، ويُحدَّد التخصص والمستوى تلقائياً إن ذُكرا في رأس الملف. السنة الدراسية تبدأ تلقائياً في 1 سبتمبر: يرتقي كل الطلاب مستوى واحداً مع كل سنة جديدة حتى يصبحوا خريجين في غرفة دفعتهم (UNEM ISCAE Sortants Promo N). لائحة السنة الجديدة هي المرجع: من تسجّله في مستوى أدنى (لم ينجح) يبقى فيه، ومن يتكرر في مستويين يظهر في غرفتيهما. لتسجيل الخريجين اختر «Sortants» ثم رقم الدفعة. الطالب الموجود في اللائحة يدخل مباشرة، وغير الموجود يظهر كحساب جديد للمراجعة.</p>'+
  '<div class="wa-admin-row" style="grid-template-columns:1fr"><div style="display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">'+
  '<select id="st-spec" onchange="stSpecChange()">'+specOpts('BA')+'</select><select id="st-level" onchange="stLevelChange()">'+lvlOptsImport('BA','L1')+'</select><input id="st-promo" type="number" min="1" max="99" placeholder="رقم الدفعة Promo" style="display:none">'+
  '<input id="st-file" type="file" multiple accept=".xlsx,.xls,.csv,.pdf,application/pdf" onchange="stFile(this)"></div><div id="st-prev" style="margin-top:10px"></div></div></div>':'')+
  '<div class="admin-page-box" style="margin-top:14px"><h3>📊 اللوائح وحالة التسجيل</h3><div id="st-stats">⏳ جاري التحميل...</div></div>'+
  (canManagePlatformSettings()?'<div class="admin-page-box" style="margin-top:14px"><h3>⚙️ إنشاء حسابات الطلاب</h3><label style="display:flex;align-items:center;gap:10px;font-weight:800"><input id="st-registration-toggle" type="checkbox" onchange="stToggleRegistration(this)"> السماح للطلاب بإنشاء حساب جديد عند عدم العثور على حساب</label><p style="color:#64748b;margin:8px 0 0">عند الإيقاف لن يظهر نموذج إنشاء الحساب، وستظهر للطالب رسالة التواصل مع المشرف.</p></div>':'')+
  '<div class="admin-page-box" style="margin-top:14px"><h3>🟢 نشاط الطلاب وسجل الدخول والخروج</h3><div id="st-session-stats">⏳ جاري التحميل...</div></div>'+
  '<div class="admin-page-box" style="margin-top:14px"><h3>🚨 بلاغات انتحال حسابات الطلاب</h3><p style="color:#64748b;margin:4px 0 12px">راجع البلاغ قبل الحظر. عند الحظر تُنهى جلسات الجهاز وتُمنع بصمته من بوابة الطلاب والمجتمع. لا يستطيع الموقع العادي قراءة IMEI الحقيقي من الهاتف.</p><div id="st-device-reports">⏳ جاري التحميل...</div><hr style="margin:16px 0;border:0;border-top:1px solid #cbd5e1"><h4>الأجهزة المحظورة</h4><div id="st-device-bans">⏳ جاري التحميل...</div></div>'+
  '<div class="admin-page-box" style="margin-top:14px"><h3>🆕 أحدث تسجيلات الطلاب</h3><p style="color:#64748b;margin:4px 0 12px">تُعرض الحسابات الأحدث أولاً، بما فيها الطلبات بانتظار الموافقة والحسابات المعتمدة. يمكن تصفية القائمة حسب الحالة أو البحث بالاسم ورقم التسجيل.</p>'+
  '<div id="st-tabs" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px"></div>'+
  '<div class="wa-admin-row" style="grid-template-columns:1fr auto"><input id="st-q" placeholder="بحث بالاسم أو رقم التسجيل" onkeydown="if(event.key===\'Enter\')stSearch()"><button class="wa-save" onclick="stSearch()">بحث</button></div>'+
  '<div id="st-list">⏳ جاري التحميل...</div></div>';
  loadStats();loadList();loadSessions();loadDeviceReports();loadDeviceBans();loadRegistrationSetting();
};
window.stSpecChange=function(){var s=$('st-spec').value;$('st-level').innerHTML=lvlOptsImport(s,'');stLevelChange()};
window.stLevelChange=function(){var l=$('st-level'),p=$('st-promo');if(!l||!p)return;var on=l.value==='S';p.style.display=on?'':'none';if(on&&!p.value)p.value=st.curPromo||17};
window.stRowSpec=function(id){var s=$('sp-'+id).value,l=$('lv-'+id);var cur=l.value;l.innerHTML=lvlOpts(s,cur)};

/* ---------- قراءة ملف Excel ---------- */
function loadXlsx(){
  if(window.XLSX)return Promise.resolve();
  return new Promise(function(res,rej){var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';s.onload=res;s.onerror=function(){rej(new Error('تعذّر تحميل مكتبة Excel. تحقق من الإنترنت.'))};document.head.appendChild(s)});
}
var NAME_RE=/(^|\s)(nom|name|pr[ée]nom|[ée]tudiant|etudiant|student|الاسم|اسم|طالب)/i,REG_STRONG=/(inscri|matric|\breg|apog|massar|code|تسجيل)/i,REG_WEAK=/(رقم|n°|num[ée]ro|\bn\s?°)/i,LETTER=/[A-Za-z\u00C0-\u024F\u0600-\u06FF]/;
function detect(rows){
  var nc=-1,rc=-1,hr=-1;
  for(var i=0;i<Math.min(rows.length,8)&&hr<0;i++){
    var r=rows[i],strong=-1,weak=-1,name=-1;
    for(var j=0;j<r.length;j++){var v=String(r[j]||'').trim();if(!v)continue;
      if(REG_STRONG.test(v)){if(strong<0)strong=j}
      else if(NAME_RE.test(v)){if(name<0)name=j}
      else if(REG_WEAK.test(v)){weak=j}}
    var reg=strong>=0?strong:weak;
    if(name>=0&&reg>=0&&name!==reg){nc=name;rc=reg;hr=i}
  }
  if(hr<0){ // بدون عناوين: استنتاج من محتوى الأعمدة
    var sample=rows.slice(0,40),cols=0;sample.forEach(function(r){cols=Math.max(cols,r.length)});
    var best={n:-1,ns:-1,r:-1,rs:-1};
    for(var c=0;c<cols;c++){
      var words=0,dig=0,tot=0;
      sample.forEach(function(r){var v=String(r[c]||'').trim();if(!v)return;tot++;if(/\s/.test(v)&&LETTER.test(v))words++;if(!/\s/.test(v)&&/\d/.test(v)&&v.length>1)dig++});
      if(!tot)continue;
      if(words/tot>best.ns){best.ns=words/tot;best.n=c}
      if(dig/tot>best.rs||(dig/tot===best.rs&&c!==best.n&&best.r===best.n)){best.rs=dig/tot;best.r=c}
    }
    if(best.n>=0&&best.r>=0&&best.n!==best.r){nc=best.n;rc=best.r}else{nc=0;rc=1}
  }
  return{nc:nc,rc:rc,hr:hr};
}
/* ---------- قراءة ملفات PDF (لوائح الطلاب الرسمية: «رقم الطالب + الاسم») ---------- */
var pdfReadyRoster=null;
function loadPdfJsRoster(){
  if(window.pdfjsLib)return Promise.resolve();
  if(pdfReadyRoster)return pdfReadyRoster;
  pdfReadyRoster=new Promise(function(res,rej){
    var sc=document.createElement('script');
    sc.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    sc.onload=function(){try{window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';res()}catch(e){rej(e)}};
    sc.onerror=function(){pdfReadyRoster=null;rej(new Error('تعذّر تحميل مكتبة قراءة PDF. تحقق من الإنترنت.'))};
    document.head.appendChild(sc);
  });
  return pdfReadyRoster;
}
function parseRosterPages(pages){
  var REG=/^([A-Za-z]{0,4}\d{3,}[A-Za-z0-9\-\/]*)\s+(\S.*)$/,
      SKIP=/(iscae|institut|scolarit|liste des|ann[ée]e acad|groupe|num[ée]ro|nom et pr|^page\b|\bpage\s*\d+|الاسم|رقم)/i,
      LET=/[A-Za-zÀ-ɏ؀-ۿ]/;
  var rows=[],header=[],prev=null,seen={};
  pages.forEach(function(items){
    var lines=[];
    items.filter(function(i){return i&&String(i.str||'').trim()}).sort(function(a,b){return b.y-a.y||a.x-b.x}).forEach(function(it){
      var ln=lines[lines.length-1];
      if(ln&&Math.abs(ln.y-it.y)<=3){ln.items.push(it)}else lines.push({y:it.y,items:[it]});
    });
    prev=null;
    lines.forEach(function(ln){
      ln.items.sort(function(a,b){return a.x-b.x});
      var text=ln.items.map(function(i){return String(i.str).trim()}).join(' ').replace(/\s+/g,' ').trim();
      if(!text)return;
      var m=REG.exec(text);
      if(m&&LET.test(m[2])&&!/^(page|num[ée]ro)\b/i.test(text)){
        var reg=m[1].trim(),name=m[2].trim();
        prev={n:name,r:reg,x:ln.items.length>1?ln.items[1].x:ln.items[0].x};
        if(!seen[reg.toUpperCase()]){seen[reg.toUpperCase()]=1;rows.push(prev)}else prev=null;
        return;
      }
      if(rows.length===0||SKIP.test(text)){header.push(text);prev=null;return}
      /* اسم طويل التفّ على سطر ثانٍ: يبدأ عند موضع عمود الاسم نفسه */
      if(prev&&Math.abs(ln.items[0].x-prev.x)<=8&&text.length<60&&LET.test(text)&&!/\d{3,}/.test(text)){prev.n=(prev.n+' '+text).replace(/\s+/g,' ').trim();return}
      prev=null;
    });
  });
  return{rows:rows.map(function(r){return{n:r.n,r:r.r}}),header:header.join(' | ')};
}
function detectRosterScope(header){
  var out={spec:'',level:''};
  var m=/\b(L|M)\s?([1-3])\d*\s?([A-Za-z]{2,4})\b/.exec(header);
  var lv=/[—–-]\s*(L[1-3]|M[12])\s+/i.exec(header);
  if(lv)out.level=lv[1].toUpperCase();else if(m)out.level=(m[1]+m[2]).toUpperCase();
  var code=m?m[3].toUpperCase():'',spec=({BA:1,FC:1,TCM:1,GRH:1,SAE:1,IG:1})[code]?code:'';
  if(!spec){var t=header.toLowerCase();
    if(/informatique de gestion/.test(t))spec='IG';else if(/banque|assurance/.test(t))spec='BA';else if(/finance et comptab|finance comptab/.test(t))spec='FC';else if(/techniques? commerc|commercialisation|marketing/.test(t))spec='TCM';else if(/ressources humaines/.test(t))spec='GRH';else if(/actuariat|statistique/.test(t))spec='SAE'}
  if(spec&&/^M/.test(out.level)&&(spec==='FC'||spec==='IG'))spec='MASTER_'+spec;
  out.spec=spec;return out;
}
async function readPdfRoster(f){
  await loadPdfJsRoster();
  var buf=await f.arrayBuffer(),doc=await window.pdfjsLib.getDocument({data:buf}).promise,pages=[];
  for(var i=1;i<=doc.numPages;i++){
    var pg=await doc.getPage(i),tc=await pg.getTextContent();
    pages.push(tc.items.map(function(it){return{str:it.str,x:it.transform[4],y:it.transform[5]}}));
  }
  var r=parseRosterPages(pages);
  if(!r.rows.length)throw new Error('لم أجد في «'+f.name+'» أي صف (رقم تسجيل + اسم). إن كان الملف صورة ممسوحة فيلزم ملف PDF نصي أو Excel.');
  return r;
}
async function readExcelRoster(f){
  await loadXlsx();
  var buf=await f.arrayBuffer();
  var wb=XLSX.read(buf,{type:'array'});
  var ws=wb.Sheets[wb.SheetNames[0]];
  var rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:''});
  rows=rows.filter(function(r){return r.some(function(v){return String(v).trim()})});
  if(!rows.length)throw new Error('الملف «'+f.name+'» فارغ.');
  var d=detect(rows),out=[];
  for(var i=d.hr+1;i<rows.length;i++){
    var n=String(rows[i][d.nc]==null?'':rows[i][d.nc]).replace(/\s+/g,' ').trim(),r=String(rows[i][d.rc]==null?'':rows[i][d.rc]).trim().replace(/\.0+$/,'');
    if(n&&r)out.push({n:n,r:r});
  }
  if(!out.length)throw new Error('لم أجد صفوفاً صالحة (اسم + رقم تسجيل) في «'+f.name+'». تأكد أن العمود الأول للاسم والثاني لرقم التسجيل.');
  return{rows:out,header:''};
}
window.stFile=async function(inp){
  var files=Array.prototype.slice.call(inp.files||[]),box=$('st-prev');if(!files.length)return;
  box.innerHTML='⏳ جاري قراءة '+(files.length>1?files.length+' ملفات':'الملف')+'...';
  try{
    var all=[],seen={},names=[],perFile=[],scopes=[],dup=0;
    for(var k=0;k<files.length;k++){
      var f=files[k],isPdf=/\.pdf$/i.test(f.name)||f.type==='application/pdf';
      var r=isPdf?await readPdfRoster(f):await readExcelRoster(f);
      var added=0;
      r.rows.forEach(function(x){var key=String(x.r).toUpperCase();if(seen[key]){dup++;return}seen[key]=1;all.push(x);added++});
      names.push(f.name);perFile.push(f.name+' ('+added+')');
      if(isPdf){var sc=detectRosterScope(r.header);if(sc.spec&&sc.level)scopes.push(sc.spec+'|'+sc.level)}
    }
    if(!all.length)throw new Error('لم أجد صفوفاً صالحة.');
    var uniq=scopes.filter(function(v,i,a){return a.indexOf(v)===i}),note='';
    if(uniq.length===1){
      var parts=uniq[0].split('|'),sp=$('st-spec'),lv=$('st-level');
      if(sp&&lv&&SL[parts[0]]){sp.value=parts[0];lv.innerHTML=lvlOptsImport(parts[0],parts[1]);lv.value=parts[1];stLevelChange();note='✅ تم تحديد التخصص والمستوى تلقائياً من رأس الملف: <b>'+h(SL[parts[0]])+' · '+h(parts[1])+'</b> — تأكد منهما قبل الحفظ.'}
    }else if(uniq.length>1){note='⚠️ الملفات تخص أكثر من تخصص/مستوى ('+h(uniq.join('، '))+'). ارفع كل تخصص ومستوى على حدة حتى لا تُحفظ في النطاق الخاطئ.'}
    else{note='ℹ️ لم يُحدَّد التخصص/المستوى تلقائياً؛ اختَرهما من القائمتين أعلاه قبل الحفظ.'}
    st.parsed={rows:all,file:names.length>1?names.length+' ملفات':names[0],detail:perFile,dup:dup,note:note};
    previewParsed();
  }catch(e){st.parsed=null;box.innerHTML='<div class="status-msg error">❌ '+h(errMsg(e))+'</div>'}
};
function previewParsed(){
  var p=st.parsed,box=$('st-prev');if(!p)return;
  box.innerHTML='<div style="font-weight:800;margin-bottom:6px">📄 '+h(p.file)+' — '+p.rows.length+' طالب</div>'+
  (p.detail&&p.detail.length>1?'<div style="font-size:.78rem;color:#64748b;margin-bottom:6px">'+p.detail.map(h).join(' · ')+(p.dup?' · مكرّر تم تجاهله: '+p.dup:'')+'</div>':'')+
  (p.note?'<div style="font-size:.85rem;margin-bottom:8px;padding:8px 10px;border-radius:10px;background:#f0fdf4;border:1px solid #bbf7d0">'+p.note+'</div>':'')+
  '<div style="overflow:auto;max-height:190px;border:1px solid #e2e8f0;border-radius:10px"><table style="width:100%;border-collapse:collapse;font-size:.85rem"><tr style="background:#f1f5f9"><th style="padding:6px">الاسم</th><th style="padding:6px">رقم التسجيل</th></tr>'+
  p.rows.slice(0,6).map(function(r){return '<tr><td style="padding:6px;border-top:1px solid #e2e8f0">'+h(r.n)+'</td><td style="padding:6px;border-top:1px solid #e2e8f0;direction:ltr">'+h(r.r)+'</td></tr>'}).join('')+'</table></div>'+
  '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="wa-save" id="st-save" onclick="stSave()">✅ حفظ اللائحة ('+p.rows.length+')</button><button class="wa-save" style="background:#64748b" onclick="stSwap()">⇄ تبديل العمودين</button></div>'+
  '<div id="st-res" style="margin-top:10px"></div>';
}
window.stSwap=function(){if(!st.parsed)return;st.parsed.rows=st.parsed.rows.map(function(r){return{n:r.r,r:r.n}});previewParsed()};
window.stSave=async function(){
  var p=st.parsed;if(!p)return;
  var spec=$('st-spec').value,level=$('st-level').value,btn=$('st-save'),res=$('st-res'),promo=level==='S'?parseInt($('st-promo').value,10):null;
  if(level==='S'&&!(promo>0)){alert('أدخل رقم الدفعة (Promo) للخريجين.');return}
  var where=level==='S'?'Sortants · Promo '+promo:level;
  if(!confirm('حفظ '+p.rows.length+' طالب في '+SL[spec]+' · '+where+' ؟'))return;
  btn.disabled=true;var tot={added:0,upgraded:0,updated:0,skipped_higher:0,extra_levels:0,invalid:0,auto_approved:0};
  try{
    for(var i=0;i<p.rows.length;i+=400){
      res.innerHTML='⏳ جاري الحفظ... '+Math.min(i+400,p.rows.length)+' / '+p.rows.length;
      var d=await rpc('import',{spec:spec,level:level,promo:promo,rows:p.rows.slice(i,i+400)});
      Object.keys(tot).forEach(function(k){tot[k]+=(d&&d[k])||0});
    }
    res.innerHTML='<div class="status-msg success" style="display:block">✅ تم الحفظ — جديد: <b>'+tot.added+'</b> · ترقية لمستوى أعلى: <b>'+tot.upgraded+'</b> · محدّث: <b>'+tot.updated+'</b> · متجاهَل (موجود في مستوى أعلى): <b>'+tot.skipped_higher+'</b> · مستوى ثانٍ مُفعَّل: <b>'+tot.extra_levels+'</b> · غير صالح: <b>'+tot.invalid+'</b>'+(tot.auto_approved?' · حسابات اعتُمدت تلقائياً: <b>'+tot.auto_approved+'</b>':'')+'</div>';
    st.parsed=null;$('st-file').value='';loadStats();loadList();
  }catch(e){res.innerHTML='<div class="status-msg error" style="display:block">❌ '+h(errMsg(e))+'</div>';btn.disabled=false}
};

/* ---------- الإحصائيات ---------- */
async function loadStats(){
  var el=$('st-stats');if(!el)return;
  try{
    var d=await rpc('stats'),acc=d.accounts||{};st.curPromo=d.current_promo;
    var canManage=canManageStudentRecords();
    var rows=(d.roster||[]).map(function(x){return '<tr><td style="padding:7px;border-top:1px solid #e2e8f0">'+h(SL[x.spec]||x.spec)+'</td><td style="padding:7px;border-top:1px solid #e2e8f0">'+(x.promo?'🎓 Sortants · Promo '+h(x.promo):h(x.level))+'</td><td style="padding:7px;border-top:1px solid #e2e8f0"><b>'+x.n+'</b></td><td style="padding:7px;border-top:1px solid #e2e8f0">'+(canManage?'<button class="wa-save" style="background:#dc2626;padding:5px 10px;font-size:.78rem" onclick="stClear(\''+x.spec+'\',\''+(x.promo?'S':x.level)+'\','+(x.promo||'null')+')">حذف اللائحة</button>':'')+'</td></tr>'}).join('');
    el.innerHTML='<div style="margin-bottom:8px;color:#475569">السنة الدراسية الحالية: <b>'+h(d.academic_year)+'–'+h(d.academic_year+1)+'</b> · الدفعة الحالية للخريجين: <b>Promo '+h(d.current_promo)+'</b></div><div style="margin-bottom:8px;font-weight:700">حسابات: بانتظار الموافقة <b>'+(acc.pending||0)+'</b> · معتمدة <b>'+(acc.approved||0)+'</b> · مرفوضة <b>'+(acc.rejected||0)+'</b></div>'+
      (rows?'<table style="width:100%;border-collapse:collapse;font-size:.88rem"><tr style="background:#f1f5f9"><th style="padding:7px;text-align:start">التخصص</th><th style="padding:7px;text-align:start">المستوى</th><th style="padding:7px;text-align:start">عدد الطلاب</th><th></th></tr>'+rows+'</table>':'<div style="color:#64748b">لا توجد لوائح محفوظة بعد.</div>');
    renderTabs(acc);
  }catch(e){el.innerHTML='<div class="status-msg error" style="display:block">❌ '+h(errMsg(e))+'</div>'}
}
window.stClear=async function(spec,level,promo){
  if(!confirm('حذف لائحة '+(SL[spec]||spec)+' · '+(level==='S'?'Sortants Promo '+promo:level)+' بالكامل؟ (حسابات الطلاب المعتمدة لا تُحذف)'))return;
  try{await rpc('roster_clear',{spec:spec,level:level,promo:promo});loadStats()}catch(e){alert('❌ '+errMsg(e))}
};


async function loadSessions(){
  var el=$('st-session-stats');if(!el)return;
  try{var d=await sessionRpc('list'),rows=d.sessions||[];
    var canManage=canManageStudentRecords();
    el.innerHTML='<div style="font-weight:800;margin-bottom:10px">الطلاب النشطون خلال آخر 5 دقائق: <b style="color:#15803d">'+(d.active_students||0)+'</b> · جلسات مسجلة: <b>'+rows.length+'</b></div>'+
      (rows.length?'<div style="overflow:auto;max-height:430px"><table style="width:100%;border-collapse:collapse;font-size:.8rem"><thead><tr style="background:#f1f5f9"><th style="padding:7px;text-align:start">الطالب</th><th style="padding:7px;text-align:start">رقم التسجيل</th><th style="padding:7px;text-align:start">التخصص · المستوى</th><th style="padding:7px;text-align:start">الجهاز</th><th style="padding:7px;text-align:start">وقت الدخول</th><th style="padding:7px;text-align:start">وقت الخروج</th><th style="padding:7px;text-align:start">آخر نشاط</th><th></th></tr></thead><tbody>'+rows.map(function(x){var active=!x.logout_at&&Date.now()-new Date(x.last_seen).getTime()<300000;return '<tr><td style="padding:7px;border-top:1px solid #e2e8f0">'+h(x.full_name)+'</td><td dir="ltr" style="padding:7px;border-top:1px solid #e2e8f0">'+h(x.reg_no)+'</td><td style="padding:7px;border-top:1px solid #e2e8f0">'+h(SL[x.spec]||x.spec||'')+' · '+h(x.level||'')+'</td><td style="padding:7px;border-top:1px solid #e2e8f0">'+(x.device_type==='phone'?'هاتف':'كمبيوتر')+'</td><td style="padding:7px;border-top:1px solid #e2e8f0">'+h(fmt(x.login_at))+'</td><td style="padding:7px;border-top:1px solid #e2e8f0">'+(active?'<b style="color:#15803d">نشط الآن</b>':h(fmt(x.logout_at||x.last_seen)))+'</td><td style="padding:7px;border-top:1px solid #e2e8f0">'+h(fmt(x.last_seen))+'</td><td style="padding:7px;border-top:1px solid #e2e8f0">'+(canManage&&!x.logout_at?'<button class="wa-save" style="background:#dc2626;padding:5px 8px;font-size:.75rem" onclick="stEndSession(\''+h(x.session_id)+'\')">إنهاء الجلسة</button>':'')+'</td></tr>'}).join('')+'</tbody></table></div>':'<div style="color:#64748b">لا توجد جلسات مسجلة بعد.</div>');
  }catch(e){el.innerHTML='<div class="status-msg error" style="display:block">❌ '+h(errMsg(e))+'</div>'}
}
window.stEndSession=async function(id){if(!confirm('إنهاء جلسة هذا الطالب على هذا الجهاز؟'))return;try{await sessionRpc('revoke',{session_id:id});loadSessions()}catch(e){alert('❌ '+errMsg(e))}};
async function loadDeviceReports(){
  var el=$('st-device-reports');if(!el)return;
  try{var rows=await deviceRpc('list_reports');
    if(!rows||!rows.length){el.innerHTML='<div style="color:#64748b">لا توجد بلاغات معلّقة.</div>';return}
    var canManage=canManageStudentRecords();
    el.innerHTML=rows.map(function(x){return '<div class="wa-admin-row" style="grid-template-columns:1fr;margin-bottom:8px"><div><b>'+h(x.full_name)+'</b> · <span dir="ltr">'+h(x.reg_no)+'</span><div style="font-size:.83rem;margin-top:5px;white-space:pre-wrap">'+h(x.message)+'</div><div style="font-size:.74rem;color:#64748b;margin-top:5px">'+(x.device_type==='phone'?'هاتف':'كمبيوتر')+' · البلاغ: '+h(fmt(x.created_at))+' · بصمة الجهاز: <code>'+h(x.target_device_fingerprint||'')+'</code> · '+(x.target_active?'الجهاز نشط':'الجهاز غير نشط')+'</div>'+(x.has_image?'<div style="margin-top:7px"><button class="wa-save" style="background:#0369a1;padding:6px 11px;font-size:.78rem" onclick="stShowReportImage(\''+h(x.id)+'\')">🖼️ عرض إفادة التسجيل المرفقة</button></div>':'<div style="font-size:.74rem;color:#94a3b8;margin-top:6px">بدون صورة إثبات</div>')+'</div>'+(canManage?'<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><button class="wa-save" style="background:#b91c1c" onclick="stBanDevice(\''+h(x.id)+'\')">🚫 حظر الجهاز نهائياً</button><button class="wa-save" style="background:#64748b" onclick="stRejectDeviceReport(\''+h(x.id)+'\')">رفض البلاغ</button></div>':'')+'</div>'}).join('');
  }catch(e){el.innerHTML='<div class="status-msg error" style="display:block">❌ '+h(errMsg(e))+'</div>'}
}
window.stBanDevice=async function(id){if(!confirm('حظر هذا الجهاز نهائياً؟ ستُنهى جلساته ولن يستطيع التسجيل أو دخول المجتمع من هذا الجهاز.'))return;try{await deviceRpc('ban_report',{id:id,reason:'انتحال هوية طالب'});loadDeviceReports();loadSessions()}catch(e){alert('❌ '+errMsg(e))}};
window.stShowReportImage=async function(id){try{var d=await deviceRpc('report_image',{id:id});if(!d||!d.image){alert('لا توجد صورة لهذا البلاغ.');return}var o=document.createElement('div');o.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(2,6,23,.88);display:flex;align-items:center;justify-content:center;padding:14px;cursor:zoom-out';o.onclick=function(){o.remove()};var im=document.createElement('img');im.src=d.image;im.alt='إفادة التسجيل';im.style.cssText='max-width:100%;max-height:100%;border-radius:12px;background:#fff';o.appendChild(im);document.body.appendChild(o)}catch(e){alert('❌ '+errMsg(e))}};
window.stRejectDeviceReport=async function(id){if(!confirm('رفض هذا البلاغ دون حظر الجهاز؟'))return;try{await deviceRpc('reject_report',{id:id});loadDeviceReports()}catch(e){alert('❌ '+errMsg(e))}};
async function loadRegistrationSetting(){
  var el=$('st-registration-toggle');if(!el||!canManagePlatformSettings())return;
  try{var d=await deviceRpc('registration_status');el.checked=!!(d&&d.enabled)}catch(e){el.checked=true;console.warn(e)}
}
window.stToggleRegistration=async function(el){
  if(!el||!canManagePlatformSettings())return;
  var want=!!el.checked;
  try{var d=await deviceRpc('set_registration_enabled',{enabled:want});el.checked=!!(d&&d.enabled)}
  catch(e){el.checked=!want;alert('❌ '+errMsg(e))}
};
async function loadDeviceBans(){
  var el=$('st-device-bans');if(!el)return;
  try{var rows=await deviceRpc('list_bans');
    if(!rows||!rows.length){el.innerHTML='<div style="color:#64748b">لا توجد أجهزة محظورة.</div>';return}
    var canManage=canManageStudentRecords();
    el.innerHTML=rows.map(function(x){return '<div class="wa-admin-row" style="grid-template-columns:1fr;margin-bottom:8px"><div><b>'+h(x.full_name||'—')+'</b> · <span dir="ltr">'+h(x.reg_no||'')+'</span><div style="font-size:.76rem;color:#64748b;margin-top:4px">بصمة غير قابلة للعكس: <code>'+h(x.device_fingerprint||'')+'</code> · '+h(fmt(x.banned_at))+' · '+(x.active?'حظر فعّال':'أُلغي الحظر')+'</div><div style="font-size:.82rem;margin-top:4px">'+h(x.reason||'')+'</div></div>'+(canManage&&x.active&&x.report_id?'<button class="wa-save" style="background:#15803d" onclick="stUnbanDevice(\''+h(x.report_id)+'\')">✅ إلغاء الحظر</button>':'')+'</div>'}).join('');
  }catch(e){el.innerHTML='<div class="status-msg error" style="display:block">❌ '+h(errMsg(e))+'</div>'}
}
window.stUnbanDevice=async function(id){if(!confirm('إلغاء حظر هذا الجهاز؟ سيستطيع التسجيل من جديد من نفس المتصفح فقط.'))return;try{await deviceRpc('unban_report',{id:id});loadDeviceBans();loadDeviceReports()}catch(e){alert('❌ '+errMsg(e))}};

/* ---------- الحسابات ---------- */
function renderTabs(acc){
  var el=$('st-tabs');if(!el)return;acc=acc||{};
  var T=[['','🆕 أحدث التسجيلات',null],['pending','⏳ بانتظار الموافقة',acc.pending],['approved','✅ معتمدة',acc.approved],['rejected','⛔ مرفوضة',acc.rejected]];
  el.innerHTML=T.map(function(t){var on=st.status===t[0];return '<button class="wa-save" style="'+(on?'':'background:#e2e8f0;color:#0f172a')+'" onclick="stTab(\''+t[0]+'\')">'+t[1]+(t[2]!=null?' ('+(t[2]||0)+')':'')+'</button>'}).join('');
}
window.stTab=function(s){st.status=s;renderTabs();loadList()};
window.stSearch=function(){st.q=($('st-q').value||'').trim();loadList()};
async function loadList(){
  var el=$('st-list');if(!el)return;el.innerHTML='⏳ جاري التحميل...';
  try{
    var rows=await rpc('list',{status:st.status,q:st.q});
    if(!rows||!rows.length){el.innerHTML='<div style="color:#64748b;padding:10px">لا توجد حسابات في هذه القائمة.</div>';return}
    var canManage=canManageStudentRecords();
    el.innerHTML=rows.map(function(a){
      var sp=a.spec&&SL[a.spec]?a.spec:'BA',lv=a.level||lvls(sp)[0];
      var badge=a.status==='pending'?'<span style="background:#fef3c7;color:#92400e;border-radius:8px;padding:2px 8px;font-size:.72rem;font-weight:800">بانتظار الموافقة</span>':a.status==='approved'?'<span style="background:#dcfce7;color:#166534;border-radius:8px;padding:2px 8px;font-size:.72rem;font-weight:800">معتمد'+(a.source==='roster'?' · من اللائحة':'')+'</span>':'<span style="background:#fee2e2;color:#991b1b;border-radius:8px;padding:2px 8px;font-size:.72rem;font-weight:800">مرفوض</span>';
      var actions=canManage?
        (a.status!=='approved'?'<select id="sp-'+a.id+'" style="width:auto" onchange="stRowSpec(\''+a.id+'\')">'+specOpts(sp)+'</select><select id="lv-'+a.id+'" style="width:auto">'+lvlOpts(sp,lv)+'</select><button class="wa-save" onclick="stDecide(\''+a.id+'\',true)">✅ موافقة</button>':'')+
        (a.status!=='rejected'?'<button class="wa-save" style="background:#ea580c" onclick="stDecide(\''+a.id+'\',false)">⛔ رفض</button>':'')+
        '<button class="wa-save" style="background:#64748b" onclick="stDelete(\''+a.id+'\')">🗑 حذف</button>'
        :'<span style="font-size:.78rem;color:#64748b;font-weight:700">عرض فقط</span>';
      return '<div class="wa-admin-row" style="grid-template-columns:1fr"><div><b>'+h(a.full_name)+'</b> '+badge+'<div style="font-size:.82rem;color:#64748b;margin-top:3px;direction:ltr;text-align:start">'+h(a.reg_no)+'</div>'+
        (a.note?'<div style="font-size:.78rem;color:#b45309;margin-top:3px">⚠️ '+h(a.note)+'</div>':'')+
        '<div style="font-size:.74rem;color:#94a3b8;margin-top:3px">'+h(fmt(a.created_at))+(a.status==='approved'?' · '+h(SL[a.spec]||'')+' · '+h(a.level||''):'')+'</div></div>'+
        '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">'+actions+'</div></div>';
    }).join('');
  }catch(e){el.innerHTML='<div class="status-msg error" style="display:block">❌ '+h(errMsg(e))+'</div>'}
}
window.stDecide=async function(id,ok){
  var args={id:id,approve:ok};
  if(ok){args.spec=$('sp-'+id).value;args.level=$('lv-'+id).value}
  else if(!confirm('رفض هذا الحساب؟ لن يتمكن الطالب من الدخول بهذا الحساب.'))return;
  try{await rpc('decide',args);loadStats();loadList()}catch(e){alert('❌ '+errMsg(e))}
};
window.stDelete=async function(id){
  if(!confirm('حذف هذا الحساب نهائياً؟ يستطيع الطالب التسجيل من جديد.'))return;
  try{await rpc('delete',{id:id});loadStats();loadList()}catch(e){alert('❌ '+errMsg(e))}
};

/* ---------- شارة الطلبات المعلّقة على بطاقة اللوحة ---------- */
function badge(){
  try{
    if(typeof hasPermission!=='function'||!hasPermission('view_student_registrations')||!supabaseClient)return;
    rpc('stats').then(function(d){var n=(d.accounts||{}).pending||0,el=$('st-card-sub');if(el)el.textContent=n?('⏳ '+n+' حساب جديد · الطلاب النشطون يظهرون داخل الإحصاءات'):'لوائح الطلاب · إحصاءات نشاط ودخول الطلاب'}).catch(function(){});
  }catch(e){}
}
var _u=window.updateAdminDashboardCards;
if(typeof _u==='function'&&!_u.__stWrapped){var w=function(){var r=_u.apply(this,arguments);badge();return r};w.__stWrapped=true;window.updateAdminDashboardCards=w}
})();
