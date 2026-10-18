
/* محلل الجداول الدراسية: يحوّل عناصر نص PDF (مع الإحداثيات) إلى جداول منظمة */
(function(root){
  var DAYS=['LUNDI','MARDI','MERCREDI','JEUDI','VENDREDI','SAMEDI','DIMANCHE'];
  function norm(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’`]/g,"'").replace(/\s+/g,' ').trim();}
  var SPEC_MAP=[
    [/banques? et assurances?/,'BA'],
    [/developpement informatique/,'DI'],
    [/reseaux? informatiques? et telecommunications?/,'RIT'],
    [/informatique de gestion/,'IG'],
    [/finance et comptabilite/,'FC'],
    [/gestion des ressources humaines/,'GRH'],
    [/statistiques? appliquees? a l'economie/,'SAE'],
    [/techniques? commerciales? et marketing/,'TCM']
  ];
  function specFromName(name){var n=norm(name);for(var i=0;i<SPEC_MAP.length;i++){if(SPEC_MAP[i][0].test(n))return SPEC_MAP[i][1];}return '';}
  function parseHeader(text){
    var m=String(text).match(/Profil\s*:\s*(.+?)\s*:?\s*$/);
    var raw=(m?m[1]:String(text).replace(/^.*Profil\s*:/,'')).replace(/\s*:\s*$/,'').trim();
    var level='',rest=raw;
    var lm=raw.match(/^(\d)\s*(?:ère|ere|ème|eme|e|re|er)?\s*ann[ée]e\s+(.*)$/i);
    if(lm){level='L'+lm[1];rest=lm[2];}
    else{var mm=raw.match(/^(?:master\s*|M)(\d)\s*(?:ann[ée]e)?\s*(.*)$/i);if(mm){level='M'+mm[1];rest=mm[2];}}
    var group='';
    var gm=rest.match(/[\s-]+(G\s?\d+)\s*$/i);
    if(gm){group=gm[1].replace(/\s/g,'').toUpperCase();rest=rest.slice(0,gm.index);}
    else{var fm=rest.match(/[\s-]+(FP|FC|FA)\s*$/);if(fm&&/-\s*FP$|\sFP$/.test(rest)){group='FP';rest=rest.slice(0,fm.index);}}
    rest=rest.trim();
    return {raw:raw,level:level,profile:rest,group:group,spec:specFromName(rest)};
  }
  function splitCell(text){
    var t=text.replace(/\s+/g,' ').replace(/\s+,/g,' ,').trim();
    var parts=t.split(/\s*,\s*/).map(function(x){return x.trim();});
    // إزالة الفواصل المتكررة الفارغة (مثل: "II , , 16")
    var clean=[];parts.forEach(function(p,i){if(p===''&&i>0)return;clean.push(p);});
    var subject=clean[0]||'',room='',teacher='';
    if(clean.length>=3){room=clean[1];teacher=clean.slice(2).join(', ');}
    else if(clean.length===2){room=clean[1];}
    return {subject:subject,room:room,teacher:teacher,raw:t,ok:clean.length>=3};
  }
  /* items: [{str,x,y,w}] — y يزيد نحو الأعلى (إحداثيات PDF) */
  function parsePage(items,pageNum){
    var its=items.filter(function(i){return i.str&&i.str.trim();});
    var headerItem=its.filter(function(i){return /Profil\s*:/.test(i.str);})[0];
    if(!headerItem)return null;
    var hdr=parseHeader(headerItem.str);
    var yearItem=its.filter(function(i){return /^\s*\d{4}\s*\/\s*\d{4}\s*$/.test(i.str);})[0];
    var year=yearItem?yearItem.str.replace(/\s/g,'').replace('/','-'):'';
    var semItem=its.filter(function(i){return /Semestres?\s+(Impairs?|Pairs?)/i.test(i.str);})[0];
    var semester=semItem?(/impair/i.test(semItem.str)?'impair':'pair'):'';
    // رؤوس الأيام
    var dayCols=[];
    DAYS.forEach(function(d){var it=its.filter(function(i){return i.str.trim().toUpperCase()===d;})[0];if(it)dayCols.push({day:d,cx:it.x+it.w/2,y:it.y});});
    if(!dayCols.length)return null;
    var headerY=dayCols[0].y;
    // تسميات الأوقات
    var times=its.filter(function(i){return /^\d{1,2}h\s*-\s*\d{1,2}h$/.test(i.str.trim())&&i.y<headerY;}).sort(function(a,b){return b.y-a.y;});
    if(!times.length)return null;
    var rowH=times.length>1?(times[0].y-times[1].y):60;
    var minY=times[times.length-1].y-rowH+6;
    var cells={};
    its.forEach(function(i){
      if(i.y>=headerY-2)return;               // ما فوق رؤوس الأيام
      if(i.y<minY)return;                     // تذييل الصفحة
      if(/^\d{1,2}h\s*-\s*\d{1,2}h$/.test(i.str.trim()))return;
      var cx=i.x+i.w/2,best=0,bd=1e9;
      dayCols.forEach(function(c,k){var d=Math.abs(c.cx-cx);if(d<bd){bd=d;best=k;}});
      if(i.x+i.w<dayCols[0].cx-60)return;     // عمود التوقيت
      var r=0;for(var k=0;k<times.length;k++){if(times[k].y+3>=i.y){r=k;}else break;}
      var key=r+'|'+best;(cells[key]=cells[key]||[]).push(i);
    });
    var rows=[],warnings=[];
    Object.keys(cells).forEach(function(key){
      var p=key.split('|'),r=+p[0],c=+p[1];
      var arr=cells[key].sort(function(a,b){return Math.abs(b.y-a.y)>3?b.y-a.y:a.x-b.x;});
      var text=arr.reduce(function(acc,a){var t=a.str.trim();return acc===''?t:(/-$/.test(acc)?acc+t:acc+' '+t);},'');
      var s=splitCell(text);
      var row={day:dayCols[c].day,time:times[r].str.replace(/\s/g,''),subject:s.subject,room:s.room,teacher:s.teacher};
      if(!s.ok)warnings.push(row.day+' '+row.time+': '+text);
      row._r=r;row._c=c;rows.push(row);
    });
    rows.sort(function(a,b){return a._c-b._c||a._r-b._r;});
    // ترتيب أيام الأسبوع
    rows.forEach(function(r){delete r._r;delete r._c;});
    return {page:pageNum,year:year,semester:semester,header:hdr,rows:rows,warnings:warnings};
  }
  root.UNEMSchedParser={parsePage:parsePage,parseHeader:parseHeader,specFromName:specFromName,splitCell:splitCell,DAYS:DAYS};
  if(typeof module!=='undefined')module.exports=root.UNEMSchedParser;
})(typeof window!=='undefined'?window:globalThis);

