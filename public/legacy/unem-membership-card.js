(function () {
  const W = 1579, H = 996;
  const C = { green: "#05431e", green2: "#056b38", gold: "#d9ac17", goldLight: "#f3ca28", ink: "#101820", paper: "#fffefd" };
  const TEMPLATE = "/legacy/unem-membership-card-template.png?v=1";
  const T = {
    ar: { title: "بطاقة انتساب", org: "الاتحاد الوطني لطلبة موريتانيا", institute: "بالمعهد العالي للمحاسبة وإدارة المؤسسات", unit: "UNEM ISCAE", sub: "للاتحاد الوطني لطلبة موريتانيا", member: "منتسب", name: "الاسم الكامل", reg: "رقم التسجيل", year: "السنة الدراسية", spec: "التخصص", level: "المستوى", phone: "رقم الهاتف", footer: "الانتماء مسؤولية .. والعمل من أجل مستقبل أفضل", specs: { BA:"البنوك والتأمينات",FC:"المالية والمحاسبة",TCM:"التقنيات التجارية والتسويق",GRH:"تسيير الموارد البشرية",SAE:"الإحصاء التطبيقي للاقتصاد",IG:"معلوماتية التسيير",DI:"تطوير المعلوماتية",RIT:"الشبكات المعلوماتية والاتصالات",MASTER_FC:"ماستر المالية والمحاسبة",MASTER_IG:"ماستر معلوماتية التسيير" }, levels:{L1:"السنة الأولى",L2:"السنة الثانية",L3:"السنة الثالثة",M1:"ماستر 1",M2:"ماستر 2"} },
    fr: { title:"CARTE D’ADHÉSION",org:"UNION NATIONALE DES ÉTUDIANTS DE MAURITANIE",institute:"Institut Supérieur de Comptabilité et d’Administration d’Entreprises",unit:"UNEM ISCAE",sub:"Union Nationale des Étudiants de Mauritanie",member:"Adhérent",name:"Nom complet",reg:"N° d’inscription",year:"Année universitaire",spec:"Filière",level:"Niveau",phone:"Téléphone",footer:"L’adhésion est une responsabilité — agir pour un meilleur avenir",specs:{BA:"Banques et Assurances",FC:"Finance et Comptabilité",TCM:"Techniques Commerciales et Marketing",GRH:"Gestion des Ressources Humaines",SAE:"Statistique Appliquée à l’Économie",IG:"Informatique de Gestion",DI:"Développement Informatique",RIT:"Réseaux et Télécoms",MASTER_FC:"Master Finance et Comptabilité",MASTER_IG:"Master Informatique de Gestion"},levels:{L1:"1re année",L2:"2e année",L3:"3e année",M1:"Master 1",M2:"Master 2"} }
  };
  function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
  function fit(ctx,value,x,y,max,size,min,color,align="right",weight=800){let s=String(value??"—"),px=size;ctx.textAlign=align;ctx.textBaseline="alphabetic";ctx.direction=/[\u0600-\u06ff]/.test(s)?"rtl":"ltr";ctx.fillStyle=color;do{ctx.font=`${weight} ${px}px Tajawal,Cairo,"Segoe UI",Arial,sans-serif`;if(ctx.measureText(s).width<=max||px<=min)break;px--}while(px>=min);if(ctx.measureText(s).width>max){while(s.length>3&&ctx.measureText(s).width>max)s=s.slice(0,-1);s+="…"}ctx.fillText(s,x,y);ctx.direction="ltr"}
  function image(src){return new Promise(resolve=>{if(!src)return resolve(null);const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>resolve(null);im.src=src})}
  function phoneIcon(ctx,cx,cy,size,color){ctx.save();ctx.translate(cx-size/2,cy-size/2);ctx.scale(size/24,size/24);ctx.strokeStyle=color;ctx.lineWidth=2.5;ctx.lineCap="round";ctx.lineJoin="round";ctx.beginPath();ctx.moveTo(6.2,3.8);ctx.lineTo(9.1,3.2);ctx.quadraticCurveTo(10.4,3,11,4.2);ctx.lineTo(12.5,7.5);ctx.quadraticCurveTo(13,8.7,12,9.4);ctx.lineTo(10.2,10.8);ctx.quadraticCurveTo(12.4,15.2,16.8,17.6);ctx.lineTo(18.2,15.8);ctx.quadraticCurveTo(19,14.8,20.2,15.4);ctx.lineTo(23,16.8);ctx.quadraticCurveTo(24,17.4,23.7,18.7);ctx.lineTo(23.1,21.2);ctx.quadraticCurveTo(22.8,22.3,21.5,22.4);ctx.quadraticCurveTo(11.2,22,4.7,14.3);ctx.quadraticCurveTo(1.2,10,2.8,5.1);ctx.quadraticCurveTo(3.4,4,6.2,3.8);ctx.stroke();ctx.restore()}
  function drawQr(ctx,token){const x=1236,y=401,size=270;ctx.fillStyle="#fff";ctx.fillRect(1228,392,294,294);try{if(!window.qrcode)throw Error("QR library unavailable");const qr=window.qrcode(0,"M");qr.addData(`${location.origin}/verify-card?c=${encodeURIComponent(token||"")}`);qr.make();const n=qr.getModuleCount(),cell=Math.floor(size/(n+8)),total=cell*(n+8),ox=x+(size-total)/2,oy=y+(size-total)/2;ctx.fillStyle="#fff";ctx.fillRect(ox,oy,total,total);ctx.fillStyle=C.green;for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(qr.isDark(r,c))ctx.fillRect(ox+(c+4)*cell,oy+(r+4)*cell,cell,cell)}catch(e){ctx.fillStyle=C.green;fit(ctx,"QR",x+size/2,y+size/2+12,170,44,30,"#fff","center",900)}}
  function drawFrenchHeader(ctx,t){ctx.fillStyle="#fff";ctx.fillRect(515,22,880,143);fit(ctx,t.org,1365,76,830,37,25,C.green,"right",900);fit(ctx,t.institute,1365,132,830,29,19,C.green,"right",800);ctx.textAlign="center";ctx.font="900 42px Tajawal,Arial,sans-serif";ctx.fillStyle=C.green;ctx.fillText(t.unit,982,207);ctx.fillStyle="#fff";ctx.fillRect(478,228,742,98);roundRect(ctx,477,225,742,94,48);ctx.fillStyle=C.green;ctx.fill();ctx.lineWidth=8;ctx.strokeStyle=C.gold;ctx.stroke();fit(ctx,t.title,848,287,675,54,32,"#fff","center",900);ctx.fillStyle="#fff";ctx.fillRect(555,334,808,64);fit(ctx,t.sub,1360,378,800,31,20,C.green,"right",800)}
  async function render(canvas,data,language){
    const lang=language==="fr"?"fr":"ar",t=T[lang];
    try{await Promise.all([document.fonts.load("900 40px Tajawal"),document.fonts.load("800 28px Tajawal")])}catch(_){}
    const [template,photo]=await Promise.all([image(TEMPLATE),image(data.photo)]);
    if(!template)throw Error("تعذر تحميل قالب بطاقة الانتساب.");
    canvas.width=W;canvas.height=H;const ctx=canvas.getContext("2d");ctx.drawImage(template,0,0,W,H);
    // Draw the real student photo inside the exact gold frame from the supplied reference.
    ctx.save();roundRect(ctx,84,306,291,337,20);ctx.clip();ctx.fillStyle="#e8ecef";ctx.fillRect(84,306,291,337);
    if(photo){const scale=Math.max(291/photo.width,337/photo.height),w=photo.width*scale,h=photo.height*scale;ctx.drawImage(photo,84+(291-w)/2,306+(337-h)/2,w,h)}else{ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(229,420,45,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(229,594,90,90,0,Math.PI,Math.PI*2);ctx.fill()}
    ctx.restore();
    // Personal name and member status keep the reference's exact badge locations and colors.
    roundRect(ctx,53,652,352,66,31);ctx.fillStyle=C.green;ctx.fill();fit(ctx,data.full_name||"—",229,697,320,31,19,"#fff","center",900);
    roundRect(ctx,95,729,273,59,30);ctx.fillStyle=C.goldLight;ctx.fill();fit(ctx,t.member,231,768,235,28,20,C.green,"center",900);
    if(lang==="fr")drawFrenchHeader(ctx,t);
    // Replace only text in the original five capsules. The reference's five icons, gold borders and proportions remain untouched.
    const years=Number(data.academic_year),yearText=Number.isFinite(years)?`${years}-${years+1}`:"—";
    const spec=`${data.spec||"—"}${t.specs[data.spec]?` — ${t.specs[data.spec]}`:""}`;
    const level=data.promo?`${lang==="fr"?"Promotion ":"الدفعة "}${data.promo}`:`${data.level||"—"}${t.levels[data.level]?` — ${t.levels[data.level]}`:""}`;
    const rows=[{label:t.name,value:data.full_name},{label:t.reg,value:data.reg_no},{label:t.year,value:yearText},{label:t.spec,value:spec},{label:t.level,value:level}];
    const positions=[{top:402,label:431,value:468},{top:492,label:520,value:557},{top:581,label:609,value:646},{top:670,label:698,value:735},{top:758,label:786,value:823}];
    rows.forEach((row,i)=>{const p=positions[i];ctx.fillStyle=C.paper;ctx.fillRect(478,p.top-1,587,79);fit(ctx,row.label,1045,p.label,500,26,18,C.green,"right",900);fit(ctx,row.value||"—",1045,p.value,500,34,19,C.ink,"right",900)});
    drawQr(ctx,data.token);
    // Repaint the reference's code badge so the example identifier never leaks into a student's card.
    roundRect(ctx,1219,700,313,62,31);ctx.fillStyle=C.green;ctx.fill();fit(ctx,data.card_code||data.code||"UNEM-ISCAE",1375,740,280,25,16,"#fff","center",900);
    // The phone is intentionally present on the membership page only; the community route passes no phone.
    if(data.phone){roundRect(ctx,1218,773,314,62,27);ctx.fillStyle=C.green;ctx.fill();phoneIcon(ctx,1248,804,25,"#fff");fit(ctx,t.phone,1498,797,225,19,16,"#fff","right",800);fit(ctx,data.phone,1498,824,225,24,17,"#fff","right",900)}
    return canvas;
  }
  window.UNEM_MEMBERSHIP_CARD={render};
})();
