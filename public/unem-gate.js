/* =====================================================================
 * UNEM ISCAE — بوابة دخول الطلاب (الاسم الكامل + رقم التسجيل)
 *  - تظهر عند فتح المنصة إذا لم يكن الطالب مسجّلاً على هذا الجهاز.
 *  - التحقق في قاعدة البيانات (دالة student_gate): إن كان في لائحة المشرف يُقبل مباشرة،
 *    وإلا يُنشأ حساب جديد بانتظار موافقة المشرف؛ والمرفوض لا يُقبل بذلك الحساب.
 *  - يُحفظ الحساب على الجهاز وفي قاعدة البيانات، فلا تُطلب المعلومات مرة أخرى.
 *  - الرمز السري للجهاز هو نفسه المستخدم في المجتمع: unem_community_token
 *  Developer: MDA — Mohamed Dah Agove
 * ===================================================================== */
(function () {
  'use strict';
  if (window.__unemGate) return;
  window.__unemGate = true;

  var SB_URL = 'https://cbaswqaufawdsvadizyi.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiYXN3cWF1ZmF3ZHN2YWRpenlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4Mzg1MTQsImV4cCI6MjA5MzQxNDUxNH0.tv-u05JTkUFFkdYgR4gUyRb0TZKtDEwEwRQLRQSljHU';
  var K_TOKEN = 'unem_community_token', K_STUDENT = 'unem_student', K_STAFF = 'unem_gate_staff', K_LANG = 'unem_lang';
  var IS_APP = location.pathname === '/' || location.pathname === '/index.html';

  function ls(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    } catch (e) {}
    return null;
  }
  function uuid() {
    try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    var s = ''; for (var i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16); return s;
  }
  function token() {
    var t = ls(K_TOKEN);
    if (!t || t.length < 30) { t = uuid() + uuid(); ls(K_TOKEN, t); }
    return t;
  }
  function lang() { return ls(K_LANG) === 'fr' ? 'fr' : 'ar'; }

  var T = {
    ar: {
      title: 'تسجيل الدخول إلى المنصة', sub: 'أدخل اسمك الكامل بالفرنسية، ورقم تسجيلك، ثم اختر تخصصك ومستواك.',
      name: 'الاسم الكامل (بالفرنسية)', namePh: 'Ex. : Mohamed Ahmed Salem', reg: 'رقم التسجيل', regPh: 'رقم التسجيل الجامعي', spec:'التخصص', level:'المستوى', specPh:'اختر التخصص', levelPh:'اختر المستوى',
      go: 'دخول', checking: 'جاري التحقق...', note: 'تُحفظ بياناتك على هذا الجهاز، فلن يُطلب منك ذلك مرة أخرى.',
      staff: 'دخول المشرفين', lang: 'Français',
      pendingT: 'طلبك قيد المراجعة', pendingD: 'لم نجد اسمك في اللائحة، فتم إرسال حسابك إلى المشرف للموافقة عليه. سيتم إدخالك تلقائياً بعد الموافقة.',
      check: 'تحقق الآن', other: 'استخدام حساب آخر', waiting: 'بانتظار موافقة المشرف...',
      rejected: 'تم رفض هذا الحساب من طرف المشرف. يرجى التسجيل بحساب صالح (اسم كامل ورقم تسجيل صحيحين).',
      bad_name: 'اكتب اسمك الكامل (3 أحرف على الأقل).', bad_reg: 'اكتب رقم التسجيل بشكل صحيح.', bad_scope:'اختر التخصص والمستوى الصحيحين.', scope_mismatch:'التخصص أو المستوى لا يطابق بيانات حسابك.',
      name_mismatch: 'الاسم لا يطابق رقم التسجيل هذا. تأكد من كتابة اسمك الكامل كما هو مسجّل.',
      busy: 'عدد الطلبات كبير حالياً، حاول بعد قليل.', offline: 'تعذّر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة.',
      setup: 'نظام التسجيل قيد التفعيل. يرجى المحاولة لاحقاً.',
      hello: 'مرحباً بك في مجتمع UNEM ISCAE', helloSub: 'الاتحاد الوطني لطلبة موريتانيا — المعهد العالي للمحاسبة وإدارة المؤسسات', start: 'ابدأ', back: 'مرحباً'
    },
    fr: {
      title: 'Connexion à la plateforme', sub: 'Saisissez votre nom complet et votre numéro d’inscription pour vérifier votre compte.',
      name: 'Nom complet (en français)', namePh: 'Ex. : Mohamed Ahmed Salem', reg: 'Numéro d’inscription', regPh: 'Numéro d’inscription universitaire', spec:'Filière', level:'Niveau', specPh:'Choisissez une filière', levelPh:'Choisissez un niveau',
      go: 'Entrer', checking: 'Vérification...', note: 'Vos informations sont enregistrées sur cet appareil : elles ne seront plus demandées.',
      staff: 'Espace administrateur', lang: 'العربية',
      pendingT: 'Votre demande est en cours d’examen', pendingD: 'Votre nom ne figure pas dans la liste : votre compte a été envoyé à l’administrateur pour validation. Vous entrerez automatiquement après son approbation.',
      check: 'Vérifier maintenant', other: 'Utiliser un autre compte', waiting: 'En attente de l’approbation de l’administrateur...',
      rejected: 'Ce compte a été refusé par l’administrateur. Veuillez vous inscrire avec un compte valide (nom complet et numéro d’inscription corrects).',
      bad_name: 'Saisissez votre nom complet (3 caractères minimum).', bad_reg: 'Saisissez correctement le numéro d’inscription.', bad_scope:'Choisissez une filière et un niveau valides.', scope_mismatch:'La filière ou le niveau ne correspond pas à votre compte.',
      name_mismatch: 'Le nom ne correspond pas à ce numéro d’inscription. Vérifiez votre nom complet tel qu’il est enregistré.',
      busy: 'Trop de demandes pour le moment, réessayez dans un instant.', offline: 'Connexion au serveur impossible. Vérifiez Internet puis réessayez.',
      setup: 'Le système d’inscription est en cours d’activation. Réessayez plus tard.',
      hello: 'Bienvenue dans la communauté UNEM ISCAE', helloSub: 'Union Nationale des Étudiants de Mauritanie — ISCAE', start: 'Commencer', back: 'Bienvenue'
    }
  };
  function t(k) { return T[lang()][k] || k; }

  /* ---------- الاتصال بقاعدة البيانات (بدون مكتبات) ---------- */
  function sessionId() { var id; try { id=sessionStorage.getItem('unem_student_session_id'); if(!id){id=uuid();sessionStorage.setItem('unem_student_session_id',id)} } catch(e) { id=uuid(); } return id; }
  function rpc(action, args) {
    args=args||{}; if(['login','status','logout','end_session'].indexOf(action)>=0) args.session_id=sessionId();
    return fetch(SB_URL + '/rest/v1/rpc/student_gate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
      body: JSON.stringify({ p_token: token(), p_action: action, p_args: args || {} })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error((j && j.message) || ('http_' + r.status)); e.code = (j && j.code) || r.status; throw e; }
        return j;
      });
    });
  }
  function isSetupError(e) { return e && (e.code === 'PGRST202' || e.code === 404 || /student_gate|schema cache/i.test(String(e.message))); }

  /* ---------- حالة محلية ---------- */
  function cached() {
    try { var s = JSON.parse(ls(K_STUDENT) || 'null'); return s && s.status === 'approved' && s.name ? s : null; } catch (e) { return null; }
  }
  function staffOk() { return !!ls(K_STAFF); }

  var root = null, state = 'form', pollTimer = null, busy = false, passed = false, lastMsg = '';

  var CSS = '#unem-gate{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto;' +
    'background:radial-gradient(1200px 600px at 80% -10%,rgba(245,185,66,.18),transparent),linear-gradient(160deg,#0b3d2a,#0f5132 55%,#15803d);font-family:Tajawal,system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a}' +
    '#unem-gate *{box-sizing:border-box}' +
    '#unem-gate .g-card{width:min(430px,100%);background:#fff;border-radius:24px;padding:26px 22px;box-shadow:0 30px 70px rgba(0,0,0,.35);text-align:center;margin:auto}' +
    '#unem-gate.dk .g-card{background:#1e293b;color:#f1f5f9}' +
    '#unem-gate .g-logo{width:72px;height:72px;border-radius:18px;object-fit:cover;box-shadow:0 8px 22px rgba(15,81,50,.3)}' +
    '#unem-gate h2{margin:12px 0 4px;font-size:1.35rem;font-weight:800}' +
    '#unem-gate p.s{margin:0 0 14px;font-size:.88rem;line-height:1.7;color:#64748b}#unem-gate.dk p.s{color:#94a3b8}' +
    '#unem-gate label{display:block;text-align:start;font-size:.8rem;font-weight:700;margin:10px 0 5px}' +
    '#unem-gate input{width:100%;padding:13px 14px;border:1.5px solid #cbd5e1;border-radius:13px;font:inherit;font-size:1rem;background:#f8fafc;color:#0f172a;outline:none}' +
    '#unem-gate.dk input{background:#0f172a;color:#f1f5f9;border-color:#334155}#unem-gate input:focus{border-color:#15803d;box-shadow:0 0 0 3px rgba(21,128,61,.18)}' +
    '#unem-gate .g-btn{width:100%;margin-top:16px;padding:14px;border:0;border-radius:13px;font:inherit;font-weight:800;font-size:1.05rem;cursor:pointer;background:linear-gradient(135deg,#0f5132,#15803d);color:#fff;box-shadow:0 8px 20px rgba(15,81,50,.3)}' +
    '#unem-gate .g-btn:disabled{opacity:.6;cursor:default}' +
    '#unem-gate .g-btn.alt{background:transparent;color:inherit;border:1.5px solid #cbd5e1;box-shadow:none;margin-top:10px;font-size:.92rem;font-weight:700}' +
    '#unem-gate .g-err{margin-top:12px;padding:10px 12px;border-radius:12px;background:#fee2e2;color:#991b1b;font-size:.85rem;font-weight:700;line-height:1.6;text-align:start}' +
    '#unem-gate .g-note{margin-top:12px;font-size:.74rem;color:#64748b}' +
    '#unem-gate .g-top{display:flex;justify-content:space-between;gap:8px;margin-top:14px}' +
    '#unem-gate .g-link{background:none;border:0;color:#15803d;font:inherit;font-weight:700;font-size:.82rem;cursor:pointer;padding:6px}#unem-gate.dk .g-link{color:#f5b942}' +
    '#unem-gate .g-spin{width:44px;height:44px;border-radius:50%;border:4px solid #d1fae5;border-top-color:#15803d;margin:14px auto;animation:ugspin 1s linear infinite}' +
    '@keyframes ugspin{to{transform:rotate(360deg)}}' +
    '#unem-welcome{position:fixed;inset:0;z-index:2147483100;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(2,6,23,.62);backdrop-filter:blur(6px);font-family:Tajawal,system-ui,sans-serif}' +
    '#unem-welcome .w{background:linear-gradient(145deg,#0b3d2a,#15803d);color:#fff;border-radius:26px;padding:30px 24px;width:min(420px,100%);text-align:center;box-shadow:0 30px 70px rgba(0,0,0,.45);border:1px solid rgba(245,185,66,.5);animation:ugpop .45s cubic-bezier(.2,.9,.3,1.3)}' +
    '#unem-welcome .e{font-size:2.6rem}#unem-welcome h3{margin:8px 0 2px;font-size:1.05rem;font-weight:700;opacity:.9}#unem-welcome h2{margin:6px 0 4px;font-size:1.55rem;font-weight:800;color:#f5b942;word-break:break-word;line-height:1.5}#unem-welcome p{margin:0 0 16px;opacity:.85;font-size:.88rem}' +
    '#unem-welcome button{border:0;border-radius:12px;padding:11px 28px;font:inherit;font-weight:800;background:#f5b942;color:#3b2a00;cursor:pointer}' +
    '#unem-welcome-pill{position:fixed;top:calc(12px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:2147483100;max-width:92vw;background:rgba(11,61,42,.96);color:#fff;border:1px solid rgba(245,185,66,.55);border-radius:999px;padding:9px 18px;font:700 .88rem Tajawal,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3);animation:ugpop .4s ease-out;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '@keyframes ugpop{from{opacity:0;transform:translate(0,12px) scale(.94)}to{opacity:1;transform:none}}#unem-welcome-pill{animation-name:ugdrop}@keyframes ugdrop{from{opacity:0;top:-40px}to{opacity:1}}';

  function addCss() {
    if (document.getElementById('unem-gate-css')) return;
    var st = document.createElement('style'); st.id = 'unem-gate-css'; st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }
  function mount() {
    addCss();
    if (!root) {
      root = document.createElement('div'); root.id = 'unem-gate';
      root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
      document.documentElement.appendChild(root);
    }
    root.className = ls('unem_theme') === 'dark' ? 'dk' : '';
    root.dir = lang() === 'ar' ? 'rtl' : 'ltr'; root.lang = lang();
    return root;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function head(titleKey, subKey) {
    return '<img class="g-logo" src="/icon-192.png" alt="UNEM ISCAE" onerror="this.style.display=\'none\'">' +
      '<h2>' + esc(t(titleKey)) + '</h2>' + (subKey ? '<p class="s">' + esc(t(subKey)) + '</p>' : '');
  }
  function topBar() {
    return '<div class="g-top"><button type="button" class="g-link" id="ug-lang">' + esc(t('lang')) + '</button>' +
      (IS_APP ? '<button type="button" class="g-link" id="ug-staff">' + esc(t('staff')) + '</button>' : '<span></span>') + '</div>';
  }
  function bindTop() {
    var l = document.getElementById('ug-lang');
    if (l) l.onclick = function () {
      var nl = lang() === 'ar' ? 'fr' : 'ar'; ls(K_LANG, nl);
      try { if (typeof window.setLanguage === 'function') window.setLanguage(nl); } catch (e) {}
      render();
    };
    var s = document.getElementById('ug-staff');
    if (s) s.onclick = function () {
      var o = document.getElementById('admin-login-overlay');
      if (o) { o.classList.remove('hidden'); o.style.zIndex = '2147483600'; }
    };
  }

  function render() {
    mount();
    if (state === 'pending') return renderPending();
    var v = {};
    var n = document.getElementById('ug-name'), r = document.getElementById('ug-reg');
    if (n) v.n = n.value; if (r) v.r = r.value;
    var scopes=[['BA','BA'],['FC','FC'],['TCM','TCM'],['GRH','GRH'],['SAE','SAE'],['IG','IG'],['MASTER_FC','Master FC'],['MASTER_IG','Master IG']];
    var specValue=ls('unem_student_spec')||'BA', levelValue=ls('unem_student_level')||'L1';
    var scopeOpts=scopes.map(function(x){return '<option value="'+x[0]+'"'+(x[0]===specValue?' selected':'')+'>'+x[1]+'</option>'}).join('');
    var levelList=/^MASTER_/.test(specValue)?['M1','M2']:['L1','L2','L3'];
    root.innerHTML = '<div class="g-card">' + head('title', 'sub') +
      '<form id="ug-form" autocomplete="on" novalidate>' +
      '<label for="ug-name">' + esc(t('name')) + '</label><input id="ug-name" name="name" autocomplete="name" maxlength="80" placeholder="' + esc(t('namePh')) + '">' +
      '<label for="ug-reg">' + esc(t('reg')) + '</label><input id="ug-reg" name="reg" inputmode="text" autocomplete="off" maxlength="30" placeholder="' + esc(t('regPh')) + '" dir="ltr" style="text-align:start">' +
      '<label for="ug-spec">'+esc(t('spec'))+'</label><select id="ug-spec" style="width:100%;padding:12px;border:1.5px solid #cbd5e1;border-radius:13px;font:inherit;background:#f8fafc">'+scopeOpts+'</select>'+
      '<label for="ug-level">'+esc(t('level'))+'</label><select id="ug-level" style="width:100%;padding:12px;border:1.5px solid #cbd5e1;border-radius:13px;font:inherit;background:#f8fafc">'+levelList.map(function(x){return '<option'+(x===levelValue?' selected':'')+'>'+x+'</option'}).join('')+'</select>'+
      '<div class="g-err" id="ug-err" style="display:' + (lastMsg ? 'block' : 'none') + '">' + esc(lastMsg) + '</div>' +
      '<button class="g-btn" id="ug-go" type="submit">' + esc(t('go')) + '</button></form>' +
      '<div class="g-note">' + esc(t('note')) + '</div>' + topBar() + '</div>';
    if (v.n) document.getElementById('ug-name').value = v.n;
    if (v.r) document.getElementById('ug-reg').value = v.r;
    document.getElementById('ug-spec').onchange=function(){var s=this.value,lsv=/^MASTER_/.test(s)?['M1','M2']:['L1','L2','L3'],sel=document.getElementById('ug-level');sel.innerHTML=lsv.map(function(x){return '<option>'+x+'</option>'}).join('');ls('unem_student_spec',s);ls('unem_student_level',sel.value)};
    document.getElementById('ug-level').onchange=function(){ls('unem_student_level',this.value)};
    document.getElementById('ug-form').onsubmit = function (e) { e.preventDefault(); submit(); };
    bindTop();
  }
  function showErr(k) {
    lastMsg = k ? t(k) : '';
    var e = document.getElementById('ug-err'); if (e) { e.textContent = lastMsg; e.style.display = lastMsg ? 'block' : 'none'; }
  }

  function submit() {
    if (busy) return;
    var name = (document.getElementById('ug-name').value || '').replace(/\s+/g, ' ').trim();
    var reg = (document.getElementById('ug-reg').value || '').trim();
    var spec=document.getElementById('ug-spec').value, level=document.getElementById('ug-level').value;
    ls('unem_student_spec',spec);ls('unem_student_level',level);
    if (name.length < 3) return showErr('bad_name');
    if (reg.length < 2) return showErr('bad_reg');
    busy = true; showErr('');
    var b = document.getElementById('ug-go'); b.disabled = true; b.textContent = t('checking');
    rpc('login', { name: name, reg: reg, spec:spec, level:level }).then(function (d) {
      busy = false; handle(d);
    }).catch(function (e) {
      busy = false; render(); showErr(isSetupError(e) ? 'setup' : 'offline');
    });
  }

  function handle(d) {
    if (d && d.error) { render(); return showErr(d.error); }
    if (!d || d.status === 'none') { state = 'form'; render(); return; }
    if (d.status === 'approved') return pass(d, true);
    if (d.status === 'pending') { state = 'pending'; return render(); }
    if (d.status === 'rejected') {
      ls(K_STUDENT, null); state = 'form'; lastMsg = t('rejected'); render(); return;
    }
    state = 'form'; render();
  }

  function renderPending() {
    mount();
    root.innerHTML = '<div class="g-card">' + head('pendingT', 'pendingD') + '<div class="g-spin"></div>' +
      '<div class="g-note" style="margin-top:0">' + esc(t('waiting')) + '</div>' +
      '<button class="g-btn" id="ug-chk" type="button">' + esc(t('check')) + '</button>' +
      '<button class="g-btn alt" id="ug-other" type="button">' + esc(t('other')) + '</button>' + topBar() + '</div>';
    document.getElementById('ug-chk').onclick = poll;
    document.getElementById('ug-other').onclick = function () { api.logout(true); };
    bindTop();
    clearInterval(pollTimer); pollTimer = setInterval(poll, 8000);
  }
  function poll() {
    if (document.hidden && pollTimer) return;
    rpc('status').then(function (d) {
      if (d && d.status === 'approved') { clearInterval(pollTimer); pass(d, true); }
      else if (d && d.status === 'rejected') { clearInterval(pollTimer); handle(d); }
      else if (!d || d.status === 'none') { clearInterval(pollTimer); state = 'form'; render(); }
    }).catch(function () {});
  }

  /* ---------- نجاح الدخول ---------- */
  function pass(d, first) {
    if (passed && !first) return;
    passed = true; clearInterval(pollTimer);
    var s = { status: 'approved', name: d.name, reg: d.reg, spec: d.spec, level: d.level, ts: Date.now() };
    ls(K_STUDENT, JSON.stringify(s));
    window.UNEM_STUDENT = s;
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = null;
    try { window.dispatchEvent(new CustomEvent('unem:student', { detail: s })); } catch (e) {}
    if (first) welcome(s, true); else welcomeOncePerSession(s);
  }
  function welcome(s, big) {
    function ready() {
      var old = document.getElementById('unem-welcome'); if (old) old.remove();
      var w = document.createElement('div'); w.id = 'unem-welcome'; w.dir = lang() === 'ar' ? 'rtl' : 'ltr';
      w.innerHTML = '<div class="w"><div class="e">🎓</div><div style="font-size:.78rem;letter-spacing:.1em;font-weight:900;color:#a7f3d0">UNEM ISCAE</div><h3>' + esc(t('hello')) + '</h3><h2></h2><p>' + esc(t('helloSub')) + '</p><button type="button">' + esc(t('start')) + '</button></div>';
      w.querySelector('h2').textContent = s.name;
      var close = function () { if (w.parentNode) w.parentNode.removeChild(w); };
      w.querySelector('button').onclick = close; w.onclick = function (e) { if (e.target === w) close(); };
      addCss(); document.documentElement.appendChild(w); setTimeout(close, 6000);
      try { sessionStorage.setItem('unem_welcomed', '1'); } catch (e) {}
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
  }
  function welcomeOncePerSession(s) {
    try { if (sessionStorage.getItem('unem_welcomed')) return; sessionStorage.setItem('unem_welcomed', '1'); } catch (e) {}
    function ready() {
      addCss();
      var p = document.createElement('div'); p.id = 'unem-welcome-pill';
      p.textContent = '👋 ' + t('back') + ' ' + s.name;
      document.documentElement.appendChild(p); setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 4200);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
  }

  /* ---------- المشرفون: يتجاوزون البوابة بعد تسجيل دخولهم الحقيقي ---------- */
  function staffWatch() {
    var hooked = false, n = 0;
    var iv = setInterval(function () {
      n++;
      try {
        if (!hooked && typeof supabaseClient !== 'undefined' && supabaseClient && supabaseClient.auth && supabaseClient.auth.onAuthStateChange) {
          hooked = true;
          supabaseClient.auth.onAuthStateChange(function (ev) { if (ev === 'SIGNED_OUT') ls(K_STAFF, null); });
        }
        if (typeof canUpload === 'function' && canUpload()) {
          ls(K_STAFF, String(Date.now()));
          clearInterval(iv);
          passed = true; clearInterval(pollTimer); if (root && root.parentNode) root.parentNode.removeChild(root); root = null;
        }
      } catch (e) {}
      if (n > 40 && !root) clearInterval(iv);
    }, 400);
  }

  /* ---------- API عامة ---------- */
  var api = window.UNEM_GATE = {
    student: function () { return cached(); },
    logout: function (stay) {
      var done = function () {
        ls(K_STUDENT, null); window.UNEM_STUDENT = null; passed = false; state = 'form'; lastMsg = '';
        if (stay) { render(); } else { location.href = '/'; }
      };
      rpc('logout').then(done, done);
    }
  };

  /* ---------- البدء ---------- */
  function start() {
    var c = cached();
    if (c) {
      window.UNEM_STUDENT = c; passed = true;
      welcomeOncePerSession(c);
      // تحقق في الخلفية: قد يكون المشرف رفض الحساب أو حذفه
      rpc('status').then(function (d) {
        if (!d || d.error) return;
        if (d.status === 'approved') { c.spec = d.spec; c.level = d.level; c.name = d.name; ls(K_STUDENT, JSON.stringify(c)); window.UNEM_STUDENT = c; return; }
        passed = false; ls(K_STUDENT, null); window.UNEM_STUDENT = null;
        if (staffOk() && d.status === 'none') return;
        handle(d.status === 'none' ? { status: 'none' } : d);
        if (IS_APP) staffWatch();
      }).catch(function () { /* بدون إنترنت: نبقي الجلسة المحفوظة */ });
      return;
    }
    if (IS_APP) staffWatch();
    if (staffOk()) {
      // مشرف سجّل دخوله سابقاً: ننتظر استرجاع جلسته قبل إظهار البوابة لتفادي الوميض
      if (!IS_APP) return;
      setTimeout(function () { if (!passed && !root) begin(); }, 2500);
      return;
    }
    begin();
  }
  function begin() {
    // لا حساب محفوظ: اسأل الخادم أولاً (قد يكون الجهاز مرتبطاً بحساب)
    state = 'form'; render();
    rpc('status').then(function (d) {
      if (passed) return;
      if (d && d.status === 'approved') pass(d, false);
      else if (d && d.status === 'pending') { state = 'pending'; render(); }
      else if (d && d.status === 'rejected') { lastMsg = t('rejected'); render(); }
    }).catch(function (e) { if (isSetupError(e)) { lastMsg = t('setup'); render(); } });
  }
  var sessionEnded=false;
  window.addEventListener('pagehide',function(){
    if(sessionEnded)return;sessionEnded=true;
    try{fetch(SB_URL+'/rest/v1/rpc/student_gate',{method:'POST',keepalive:true,headers:{'Content-Type':'application/json',apikey:SB_KEY,Authorization:'Bearer '+SB_KEY},body:JSON.stringify({p_token:token(),p_action:'end_session',p_args:{session_id:sessionId()}})});}catch(e){}
    try{sessionStorage.removeItem('unem_student_session_id')}catch(e){}
  });
  document.addEventListener('visibilitychange',function(){if(!document.hidden&&passed)rpc('status').catch(function(){});});
  setInterval(function(){if(passed&&!document.hidden)rpc('status').catch(function(){})},60000);
  start();
})();
