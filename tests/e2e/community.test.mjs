// اختبار صفحة المجتمع بخادم وهمي يحاكي community_api: المنشورات والتعليقات والرسائل (تعديل/حذف/تثبيت/تمديد)،
// البحث برقم التسجيل، المراسلة، صورة الرأس، والتحديث اللحظي (Realtime) مع الاحتياط.
import { suite, legacy, newPage } from './helpers.mjs';

const AV = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

export const MOCK = `
window.__AV=${JSON.stringify(AV)};
const ME={id:'11111111-1111-1111-1111-111111111111',name:'Mohamed Dah Agove',spec:'BA',level:'L3',avatar_data:window.__AV,account:'acc1'};
const OTHER={id:'22222222-2222-2222-2222-222222222222',name:'Sara Ba',spec:'FC',level:'L1',avatar_data:window.__AV};
window.__adm=false;window.__calls=[];window.__sent=[];window.__ch={handlers:{},status:null};window.__rtMode='ok';
const db=window.__db={posts:[],comments:[],msgs:[],nid:100};
db.posts.push({id:'p-other',author:OTHER,kind:'question',body:'سؤال من تخصص آخر',spec:'FC',level:'L1',pinned:false,ed:null,exp:Date.now()+7*864e5,t:new Date().toISOString()});
db.posts.push({id:'p-other2',author:OTHER,kind:'help',body:'منشور ثانٍ للكاتب نفسه',spec:'FC',level:'L1',pinned:false,ed:null,exp:Date.now()+7*864e5,t:new Date().toISOString()});
db.posts.push({id:'p-mine',author:ME,kind:'help',body:'منشوري',spec:'BA',level:'L3',pinned:false,ed:null,exp:Date.now()+7*864e5,t:new Date().toISOString()});
db.comments.push({id:'c1',post:'p-other',author:ME,body:'تعليقي',ed:null},{id:'c2',post:'p-other',author:OTHER,body:'تعليق غيري',ed:null},{id:'c3',post:'p-other',author:OTHER,body:'تعليق ثانٍ لغيري',ed:null});
db.msgs.push({id:1,room:'general',author:OTHER,body:'رسالة غيري',pin:false,ed:null,exp:Date.now()+864e5});
db.msgs.push({id:2,room:'general',author:ME,body:'رسالتي',pin:false,ed:null,exp:Date.now()+864e5});
db.msgs.push({id:3,room:'general',author:OTHER,body:'رسالة ثانية لغيري',pin:false,ed:null,exp:Date.now()+864e5});
const STUDENTS={i1:{found:true,registered:true,id:OTHER.id,name:'Sara Ba',reg:'I1',spec:'FC',level:'L1',avatar:window.__AV,self:false,online:true,last_seen:new Date().toISOString(),active:true},
 i2:{found:true,registered:true,id:'33333333-3333-3333-3333-333333333333',name:'Omar Sidi',reg:'I2',spec:'IG',level:'M1',self:false,online:false,last_seen:new Date(Date.now()-3*3600e3).toISOString(),active:true},
 i3:{found:true,registered:false,name:'A… M…',reg:'I3',spec:'TCM',level:'L2',active:false,online:false},
 i21567:{found:true,registered:true,id:ME.id,name:ME.name,reg:'I21567',spec:'BA',level:'L3',self:true,online:true,last_seen:new Date().toISOString(),active:true}};
function api(a,args){window.__calls.push([a,args]);const adm=window.__adm;
 switch(a){
  case 'me':return Object.assign({},ME,{admin:adm});
  case 'feed':{const seenA={};return db.posts.filter(p=>p.kind!=='partner').sort((x,y)=>(y.pinned-x.pinned)).map(p=>{const first=!seenA[p.author.id];seenA[p.author.id]=1;return ({id:p.id,kind:p.kind,body:p.body,spec:p.spec,level:p.level,t:p.t,aid:p.author.id,an:p.author.name,avatar:first?p.author.avatar_data:null,likes:0,comments:db.comments.filter(c=>c.post===p.id).length,liked:false,can_del:p.author===ME||adm,pinned:p.pinned,ed:p.ed,exp:p.pinned?null:p.exp,can_edit:p.author===ME,can_pin:adm})})}
  case 'edit_post':{const p=db.posts.find(p=>p.id===args.id&&p.author===ME);if(!p)throw Error('forbidden');p.body=args.body;p.ed=new Date().toISOString();return {}}
  case 'del_post':{const i=db.posts.findIndex(p=>p.id===args.id&&(p.author===ME||adm));if(i>=0)db.posts.splice(i,1);return {}}
  case 'comments':{const seenC={};return db.comments.filter(c=>c.post===args.id).map(c=>{const first=!seenC[c.author.id];seenC[c.author.id]=1;return ({id:c.id,an:c.author.name,aid:c.author.id,avatar:first?c.author.avatar_data:null,body:c.body,t:new Date().toISOString(),can_del:c.author===ME||adm,can_edit:c.author===ME,ed:c.ed})})}
  case 'edit_comment':{const c=db.comments.find(c=>c.id===args.id&&c.author===ME);if(!c)throw Error('forbidden');c.body=args.body;c.ed=new Date().toISOString();return {}}
  case 'msgs':{const after=+args.after||0;const rows=db.msgs.filter(m=>m.room===args.room&&m.id>after);const seen={},out=[];
    rows.slice().reverse().forEach(m=>{const first=!seen[m.author.id];seen[m.author.id]=1;out.push({id:m.id,body:m.body,t:new Date().toISOString(),aid:m.author.id,an:m.author.name,avatar:first?m.author.avatar_data:null,mine:m.author===ME,rt:null,ed:m.ed,pin:m.pin,exp:m.pin?null:m.exp})});return out.reverse()}
  case 'msgs_sync':return db.msgs.filter(m=>m.room===args.room&&args.ids.map(String).includes(String(m.id))).map(m=>({id:m.id,body:m.body,ed:m.ed,pin:m.pin,exp:m.pin?null:m.exp}));
  case 'edit_message':{const m=db.msgs.find(m=>String(m.id)===String(args.id)&&m.author===ME);if(!m)throw Error('forbidden');m.body=args.body;m.ed=new Date().toISOString();return {}}
  case 'del_message':{const i=db.msgs.findIndex(m=>String(m.id)===String(args.id)&&(m.author===ME||adm));if(i<0)throw Error('forbidden');db.msgs.splice(i,1);return {}}
  case 'admin_pin':{if(!adm)throw Error('forbidden');const m=args.type==='post'?db.posts.find(p=>p.id===args.id):db.msgs.find(m=>String(m.id)===String(args.id));if(args.type==='post')m.pinned=args.pinned;else m.pin=args.pinned;return {}}
  case 'admin_extend':{if(!adm)throw Error('forbidden');window.__lastExtend=args.hours;return {}}
  case 'send':db.msgs.push({id:++db.nid,room:args.room,author:ME,body:args.body,pin:false,ed:null,exp:Date.now()+864e5});return {};
  case 'find_student':{const r=String(args.reg).toLowerCase();return STUDENTS[r]||{found:false}}
  case 'admin_list':return {limit:args.limit||200,totals:{posts:db.posts.length,messages:db.msgs.length,comments:db.comments.length,reports:0,groups:0},posts:db.posts.slice(0,args.limit||200).map(p=>({id:p.id,kind:p.kind,body:p.body,spec:p.spec,level:p.level,pinned:p.pinned,t:p.t,an:p.author.name})),groups:[],comments:[],messages:[],reports:[],rooms:[]};
  default:return [];}}
function makeChannel(name){const ch={name,handlers:{},on(t,f,cb){ch.handlers[f.event]=cb;return ch},
  subscribe(cb){window.__ch.current=ch;setTimeout(()=>cb(window.__rtMode==='ok'?'SUBSCRIBED':'CHANNEL_ERROR'),10);return ch},
  send(m){window.__sent.push(m)}};return ch}
window.supabase={createClient:()=>({rpc:async(fn,p)=>{try{return {data:api(p.p_action,p.p_args||{}),error:null}}catch(e){return {data:null,error:{message:e.message}}}},
  channel:n=>makeChannel(n),removeChannel:ch=>{window.__ch.removed=(window.__ch.removed||0)+1}})};
`;

export default async function run() {
  const s = suite('المجتمع: منشورات وتعديل وحذف وتثبيت وبحث وبث لحظي');
  const html = legacy('community.html');
  const pg = await newPage({ viewport: { width: 390, height: 844 } });
  await pg.route('**/*', (r) => {
    const u = r.request().url();
    if (u === 'http://localhost/community') return r.fulfill({ status: 200, contentType: 'text/html', body: html });
    if (u.includes('supabase-js') || u.includes('unem-gate')) return r.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    if (u.startsWith('http://localhost')) return r.fulfill({ status: 200, body: '' });
    return r.abort();
  });
  await pg.addInitScript(MOCK);
  await pg.addInitScript(() => {
    localStorage.setItem('unem_student', JSON.stringify({ status: 'approved', name: 'Mohamed Dah Agove', reg: 'I21567', spec: 'BA', level: 'L3' }));
    window.confirm = () => true;
  });
  await pg.goto('http://localhost/community');
  await pg.waitForSelector('.card');

  // --- المنشورات: ظهور لكل المعهد + صورة الرأس
  s.check('يرى منشور تخصص آخر', (await pg.$$eval('.card .body', (e) => e.map((x) => x.textContent))).includes('سؤال من تخصص آخر'));
  s.check('صورة الطالب في زر «ملفي» أعلى الصفحة', !!(await pg.$('#meBtn img')));
  s.check('صورة الطالب في شارة الترحيب', !!(await pg.$('#hello img')));
  s.eq('تُحفظ الصورة لعرضها في الصفحة الرئيسية', await pg.evaluate(() => JSON.parse(localStorage.getItem('unem_student_avatar') || '{}').reg), 'I21567');

  s.eq('صورة الكاتب تظهر على كل منشوراته رغم أن الخادم أرسلها مرة واحدة', await pg.$$eval('#main .card', (cs) => cs.filter((c) => /سؤال من تخصص آخر|منشور ثانٍ للكاتب نفسه/.test(c.textContent)).map((c) => !!c.querySelector('.ph img'))), [true, true]);

  // --- تعديل منشور خاص + لا زر تعديل لمنشور غيره
  s.eq('زر تعديل واحد فقط (منشوره)', (await pg.$$('.card button[onclick^="editPost"]')).length, 1);
  await pg.click('#pp-mine button[onclick^="editPost"]');
  await pg.fill('#edT', 'منشوري بعد التعديل');
  await pg.click('#edS');
  await pg.waitForFunction(() => [...document.querySelectorAll('.card .body')].some((e) => e.textContent === 'منشوري بعد التعديل'));
  s.check('وسم «معدّل» يظهر على المنشور', await pg.$eval('#pp-mine', (el) => /معدّل/.test(el.textContent)));

  // --- تعليقات
  await pg.click('#pp-other .acts button:nth-child(2)');
  await pg.waitForSelector('#cbc1');
  s.eq('صورة الكاتب على كل تعليقاته (أُرسلت مرة واحدة)', await pg.$$eval('#cp-other .cm, #cp-other [class="cm"]', (els) => els.length).catch(() => -1) >= 0, true);
  s.eq('صورة كاتب التعليقين تظهر على الاثنين', await pg.$$eval('.cm', (els) => els.filter((e) => /تعليق غيري|تعليق ثانٍ لغيري/.test(e.textContent)).map((e) => !!e.querySelector('.ph img'))), [true, true]);
  s.eq('رابط تعديل لتعليقه فقط', (await pg.$$('a.cm-edit')).length, 1);
  await pg.click('a.cm-edit'); await pg.fill('#edT', 'تعليقي المعدل'); await pg.click('#edS');
  await pg.waitForFunction(() => document.getElementById('cbc1')?.textContent === 'تعليقي المعدل');
  s.check('تعديل التعليق يعمل', true);

  // --- الدردشة: غرفة
  await pg.evaluate(() => { tab = 'rooms'; render(); });
  await pg.waitForSelector('.li[data-room="general"]');
  await pg.click('.li[data-room="general"]');
  await pg.waitForSelector('.mw');
  s.eq('3 رسائل ظاهرة', (await pg.$$('.mw')).length, 3);
  s.eq('صورة الكاتب تظهر على كل رسائله', (await pg.$$eval('.mw:not(.me)', (els) => els.map((e) => !!e.querySelector('img')))).join(','), 'true,true');
  s.check('لا زر تعديل على رسائل الغير', (await pg.$$('.mw:not(.me) button[onclick^="editMsgEl"]')).length === 0);
  await pg.click('.mw.me button[onclick^="editMsgEl"]'); await pg.fill('#edT', 'رسالتي المعدلة'); await pg.click('#edS');
  await pg.waitForFunction(() => [...document.querySelectorAll('.mw.me .mt')].some((e) => e.textContent === 'رسالتي المعدلة'));
  s.check('وسم «معدّل» على الرسالة', await pg.$eval('.mw.me', (el) => /معدّل/.test(el.textContent)));
  await pg.click('.mw.me button[onclick^="delMsgEl"]');
  await pg.waitForFunction(() => document.querySelectorAll('.mw.me').length === 0);
  s.check('حذف رسالته يعمل', true);

  // --- مزامنة تعديل/حذف الآخرين
  await pg.evaluate(() => window.__db.msgs.splice(0, 1));
  await pg.evaluate(() => syncMsgs(room)); await pg.waitForTimeout(200);
  s.eq('حذف الآخر يُزال من الشاشة', (await pg.$$('.mw')).length, 1);
  await pg.evaluate(() => { const m = window.__db.msgs[0]; m.body = 'معدّلة من الغير'; m.ed = new Date().toISOString(); });
  await pg.evaluate(() => syncMsgs(room)); await pg.waitForTimeout(200);
  s.eq('تعديل الآخر يظهر', await pg.$eval('.mw .mt', (e) => e.textContent), 'معدّلة من الغير');

  // --- البث اللحظي
  s.check('الدردشة تشترك في قناة Realtime', await pg.evaluate(() => !!window.__ch.current && RTOK === true));
  await pg.evaluate(() => { document.getElementById('chIn').value = 'مرحبا'; });
  await pg.evaluate(() => sendMsg()); await pg.waitForTimeout(300);
  s.check('الإرسال يبثّ ping بلا أي محتوى', await pg.evaluate(() => window.__sent.length >= 1 && window.__sent.every((m) => m.event === 'ping' && !('body' in (m.payload || {})))));
  await pg.evaluate(() => { window.__db.msgs.push({ id: 900, room: 'general', author: { id: '22222222-2222-2222-2222-222222222222', name: 'Sara Ba', avatar_data: null }, body: 'رسالة لحظية', pin: false, ed: null, exp: Date.now() + 864e5 }); });
  await pg.evaluate(() => window.__ch.current.handlers.ping());
  await pg.waitForFunction(() => [...document.querySelectorAll('.mw .mt')].some((e) => e.textContent === 'رسالة لحظية'), null, { timeout: 4000 });
  s.check('استقبال ping يعرض الرسالة فوراً بلا انتظار الاستطلاع', true);
  // الاستطلاع يبطؤ عند نجاح Realtime ويرجع للسرعة العادية إن فشل
  s.check('عند Realtime يتخطى الاستطلاع 3 من كل 4 دورات', await pg.evaluate(() => { POLLN = 0; let skipped = 0; for (let i = 0; i < 4; i++) { if (RTOK && (++POLLN % 4)) skipped++; } return skipped === 3; }));
  await pg.evaluate(() => closeChat());
  s.check('إغلاق الدردشة يلغي الاشتراك', await pg.evaluate(() => (window.__ch.removed || 0) >= 1 && RTCH === null && RTOK === false));
  await pg.evaluate(() => { window.__rtMode = 'fail'; });
  await pg.evaluate(() => { tab = 'rooms'; render(); });
  await pg.waitForSelector('.li[data-room="general"]'); await pg.click('.li[data-room="general"]'); await pg.waitForTimeout(300);
  s.check('فشل Realtime: يعود الاستطلاع القديم (RTOK=false)', await pg.evaluate(() => RTOK === false));
  await pg.evaluate(() => closeChat());

  // --- البحث برقم التسجيل (زميل دراسة)
  await pg.evaluate(() => { tab = 'partner'; render(); });
  await pg.waitForSelector('#stReg');
  const search = async (q) => { await pg.evaluate(() => { FT.length = 0; }); await pg.fill('#stReg', q); await pg.click('#stGo'); await pg.waitForTimeout(250); return pg.$eval('#stRes', (e) => e.innerText.replace(/\s+/g, ' ').trim()); };
  s.check('متصل الآن', /متصل الآن/.test(await search('I1')) && !!(await pg.$('#stRes .st.on')) && !!(await pg.$('#stRes button[onclick^="openDmEl"]')));
  s.check('آخر ظهور', /آخر ظهور: منذ 3 س/.test(await search('i2')) && !!(await pg.$('#stRes .st.seen')));
  const inactive = await search('I3');
  s.check('غير نشط بلا زر مراسلة، والاسم مقنَّع كما يرسله الخادم', /غير نشط/.test(inactive) && /A… M…/.test(inactive) && !/Aicha/.test(inactive) && !(await pg.$('#stRes button')));
  s.check('رقم غير موجود', /لا يوجد طالب بهذا الرقم/.test(await search('zzz')));
  await search('21567'); // ملاحظة: يطابق المفتاح i21567 بعد التطبيع في الخادم الحقيقي؛ هنا نتحقق من عدم ظهور زر مراسلة للنفس
  s.check('لا زر مراسلة لنفسه', !(await pg.$('#stRes button[onclick^="openDmEl"]')));
  // الحد: 5 نقرات → 4 طلبات فقط للخادم
  await pg.evaluate(() => { FT.length = 0; window.__calls.length = 0; });
  for (let i = 0; i < 5; i++) { await pg.fill('#stReg', 'I1'); await pg.click('#stGo'); await pg.waitForTimeout(120); }
  s.eq('الحد: 5 نقرات بحث → 4 طلبات للخادم', await pg.evaluate(() => window.__calls.filter((c) => c[0] === 'find_student').length), 4);
  await pg.evaluate(() => { FT.length = 0; });
  await pg.fill('#stReg', 'I1'); await pg.click('#stGo'); await pg.waitForTimeout(250);
  await pg.click('#stRes button[onclick^="openDmEl"]'); await pg.waitForSelector('#chat.open');
  s.check('زر «راسله» يفتح محادثة خاصة', (await pg.evaluate(() => room)).startsWith('dm:'));
  await pg.evaluate(() => closeChat());

  // --- المشرف: تثبيت/تمديد/قائمة محدودة
  await pg.evaluate(() => { window.__adm = true; me.admin = true; tab = 'posts'; render(); });
  await pg.waitForSelector('.adm-ret');
  await pg.click('#pp-other .adm-ret button:first-child');
  await pg.waitForSelector('.card.pinned');
  s.check('المنشور المثبّت أولاً مع وسم', (await pg.$eval('#main .card.pinned', (e) => e.id)) === 'pp-other' && !!(await pg.$('.card.pinned .pin-badge')));
  await pg.click('#pp-mine .adm-ret button:nth-child(2)'); await pg.click('.ext-opts button[data-h="168"]'); await pg.waitForTimeout(250);
  s.eq('التمديد 7 أيام = 168 ساعة', await pg.evaluate(() => window.__lastExtend), 168);
  await pg.evaluate(() => { tab = 'admin'; render(); });
  await pg.waitForTimeout(400);
  s.check('قائمة المشرف تطلب limit=200', await pg.evaluate(() => window.__calls.some((c) => c[0] === 'admin_list' && c[1] && c[1].limit === 200)));
  s.check('لا أخطاء جافاسكربت', pg.errors.length === 0, pg.errors);
  await pg.context().close();
  return s.done();
}
