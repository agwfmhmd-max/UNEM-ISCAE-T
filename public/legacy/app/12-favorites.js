
/* =====================================================================
   المفضلة — تخزين محلي على جهاز الطالب (localStorage) تحت المفتاح unem_favorites_v1
   يُستخدم نفس المفتاح في صفحة /emplois حتى تظهر الجداول المحفوظة هنا أيضاً.
   لا يلمس أي وظيفة أخرى في المنصة.
   ===================================================================== */
(function () {
  'use strict';
  var KEY = 'unem_favorites_v1';
  var FIELDS = ['id','name','original_name','type','source','path','subject','subject_code','specialization','level','semester','file_type','fileType','github_url','github_path','cloudinary_url','cloudinary_public_id','cloudinary_resource_type','mime_type','publicId','resourceType','download_url'];
  var filter = 'all';
  var toastTimer = null;

  function T(key, fallback) {
    try { var d = i18n[currentLang]; if (d && d[key]) return d[key]; } catch (_) {}
    return fallback;
  }
  function load() {
    try {
      var a = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(a) ? a.filter(function (i) { return i && i.key && (i.kind === 'file' || i.kind === 'schedule'); }) : [];
    } catch (_) { return []; }
  }
  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); return true; }
    catch (_) { toast(T('fav_storage_error', 'تعذر الحفظ على هذا الجهاز.')); return false; }
  }
  function has(key) { return load().some(function (i) { return i.key === key; }); }
  function branchOf(f) {
    if (f && f.branch) return f.branch;
    try { if (typeof currentBranch !== 'undefined' && currentBranch) return currentBranch; } catch (_) {}
    return 'main';
  }
  function fileKey(f) {
    var src = String(f.source || 'github');
    var id = f.id || f.path || f.github_path || f.cloudinary_public_id || f.publicId || f.name || '';
    return 'f:' + src + ':' + (src === 'github' ? branchOf(f) + ':' : '') + id;
  }
  function snapshot(f) {
    var o = {};
    FIELDS.forEach(function (k) { if (f[k] !== undefined && f[k] !== null && typeof f[k] !== 'function') o[k] = f[k]; });
    o.type = o.type || 'file';
    o.source = o.source || 'github';
    if (o.source === 'github') o.branch = branchOf(f);
    return o;
  }
  function toggleFile(f) {
    var key = fileKey(f), list = load(), idx = -1, i;
    for (i = 0; i < list.length; i++) if (list[i].key === key) { idx = i; break; }
    if (idx >= 0) { list.splice(idx, 1); if (!save(list)) return has(key); notify(); return false; }
    list.unshift({ key: key, kind: 'file', savedAt: Date.now(), file: snapshot(f) });
    if (!save(list)) return false;
    notify(); return true;
  }
  function remove(key) {
    var list = load().filter(function (i) { return i.key !== key; });
    save(list); notify();
  }
  function notify() { updateBadge(); try { window.dispatchEvent(new CustomEvent('unem:favorites-changed')); } catch (_) {} }

  function updateBadge() {
    var n = load().length, b = document.getElementById('fav-count-badge');
    if (!b) return;
    b.textContent = n > 99 ? '99+' : String(n);
    b.classList.toggle('is-zero', n === 0);
  }

  function toast(msg) {
    var el = document.getElementById('unem-fav-toast');
    if (!el) { el = document.createElement('div'); el.id = 'unem-fav-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg;
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  /* زر القلب الذي يُضاف بجانب زر التنزيل في قوائم الملخصات/الأرشيف/البحث */
  function fileButton(file) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'action-btn fav-btn';
    function paint() {
      var on = has(fileKey(file));
      var title = on ? T('fav_remove_title', 'إزالة من المفضلة') : T('fav_add_title', 'إضافة إلى المفضلة');
      b.classList.toggle('is-fav', on);
      b.innerHTML = '<i class="' + (on ? 'fas' : 'far') + ' fa-heart"></i>';
      b.title = title; b.setAttribute('aria-label', title); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    b.onclick = function (e) {
      e.stopPropagation();
      var wasOn = has(fileKey(file));
      var now = toggleFile(file);
      paint();
      if (now !== wasOn) {
        b.classList.remove('fav-pop'); void b.offsetWidth; b.classList.add('fav-pop');
        toast(now ? T('fav_added', 'تمت الإضافة إلى المفضلة') : T('fav_removed', 'تمت الإزالة من المفضلة'));
      }
    };
    paint();
    return b;
  }

  /* ---------------- صفحة المفضلة ---------------- */
  function cleanName(name) {
    return String(name || '').replace(/\[.*?\]/g, '').replace(/^\d+-/, '').replace(/_/g, ' ').replace(/\.(pdf|docx?|pptx?|xlsx?)$/i, '');
  }
  function mkBtn(icon, title, handler, extraClass) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'action-btn' + (extraClass ? ' ' + extraClass : '');
    b.title = title; b.setAttribute('aria-label', title);
    b.innerHTML = '<i class="' + icon + '"></i>';
    b.onclick = function (e) { e.stopPropagation(); handler(b); };
    return b;
  }
  function removeBtn(item, li) {
    return mkBtn('fas fa-heart', T('fav_remove_title', 'إزالة من المفضلة'), function () {
      li.classList.add('fav-removing');
      setTimeout(function () { remove(item.key); render(); }, 180);
    }, 'fav-btn is-fav');
  }
  function fileItem(item) {
    var f = item.file || {}, li = document.createElement('li');
    var info = (window.UNEMUpload && window.UNEMUpload.infoFor && window.UNEMUpload.infoFor(f.name)) || { icon: 'fa-file-pdf' };
    var infoDiv = document.createElement('div'); infoDiv.className = 'file-info';
    var ic = document.createElement('i'); ic.className = 'fas ' + info.icon;
    var txt = document.createElement('div'); txt.className = 'fav-text';
    var nm = document.createElement('span'); nm.textContent = cleanName(f.name);
    txt.appendChild(nm);
    if (f.subject) { var sub = document.createElement('small'); sub.className = 'fav-sub'; sub.textContent = f.subject; txt.appendChild(sub); }
    infoDiv.appendChild(ic); infoDiv.appendChild(txt);
    li.onclick = function () { if (typeof openSmartViewer === 'function') openSmartViewer(f); };
    var actions = document.createElement('div'); actions.className = 'actions-group';
    actions.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end;';
    actions.appendChild(mkBtn('fas fa-arrow-down', 'تنزيل الملف', function () { if (typeof triggerDownload === 'function') triggerDownload(f); }));
    actions.appendChild(removeBtn(item, li));
    li.appendChild(infoDiv); li.appendChild(actions);
    return li;
  }
  function scheduleItem(item) {
    var s = item.schedule || {}, li = document.createElement('li');
    var infoDiv = document.createElement('div'); infoDiv.className = 'file-info';
    var ic = document.createElement('i'); ic.className = 'fas fa-calendar-alt';
    var txt = document.createElement('div'); txt.className = 'fav-text';
    var nm = document.createElement('span'); nm.textContent = s.title || 'جدول دراسي';
    var kind = document.createElement('em'); kind.className = 'fav-kind'; kind.style.fontStyle = 'normal'; kind.textContent = T('fav_kind_schedule', 'جدول');
    nm.appendChild(kind); txt.appendChild(nm);
    var meta = [s.specialization, s.level, s.group_name, s.academic_year].filter(Boolean).join(' · ');
    if (meta) { var sub = document.createElement('small'); sub.className = 'fav-sub'; sub.textContent = meta; txt.appendChild(sub); }
    infoDiv.appendChild(ic); infoDiv.appendChild(txt);
    function go() { openScheduleViewer(s); }
    li.onclick = go;
    var actions = document.createElement('div'); actions.className = 'actions-group';
    actions.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end;';
    actions.appendChild(mkBtn('fas fa-eye', T('fav_open', 'فتح'), go));
    actions.appendChild(removeBtn(item, li));
    li.appendChild(infoDiv); li.appendChild(actions);
    return li;
  }
  /* ---------------- عارض الجدول داخل الصفحة الرئيسية (بدون أي تنقل) ---------------- */
  var DAY_ORDER = { 'السبت': 0, 'الأحد': 1, 'الاحد': 1, 'الاثنين': 2, 'الإثنين': 2, 'الثلاثاء': 3, 'الأربعاء': 4, 'الاربعاء': 4, 'الخميس': 5, 'الجمعة': 6,
    'samedi': 0, 'dimanche': 1, 'lundi': 2, 'mardi': 3, 'mercredi': 4, 'jeudi': 5, 'vendredi': 6 };
  function sp(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function dayIdx(d) { var k = sp(d).toLowerCase(); return k in DAY_ORDER ? DAY_ORDER[k] : 99; }
  function timeKey(x) { var m = String(x || '').match(/(\d{1,2})\s*[:hH]\s*(\d{2})?/); return m ? (+m[1]) * 60 + (+(m[2] || 0)) : 9999; }
  function hueOf(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
  function gridHTML(rows) {
    var clean = (rows || []).map(function (r) { return { day: sp(r.day), time: sp(r.time), subject: sp(r.subject), room: sp(r.room), teacher: sp(r.teacher) }; });
    var days = clean.map(function (r) { return r.day; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return dayIdx(a) - dayIdx(b); });
    var times = clean.map(function (r) { return r.time; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return timeKey(a) - timeKey(b) || a.localeCompare(b); });
    var head = '<tr><th class="c0">' + esc(T('fav_sched_day_time', 'اليوم / الوقت')) + '</th>' + times.map(function (x) { return '<th dir="ltr">' + esc(x || '—') + '</th>'; }).join('') + '</tr>';
    var body = days.map(function (d) {
      return '<tr><th class="dy">' + esc(d || '—') + '</th>' + times.map(function (x) {
        return '<td>' + clean.filter(function (r) { return r.day === d && r.time === x; }).map(function (r) {
          var h = hueOf(r.subject || 'x');
          return '<div class="ent" style="background:hsl(' + h + ',70%,94%);border-inline-start-color:hsl(' + h + ',55%,42%)"><b>' + esc(r.subject || '—') + '</b>' +
            (r.room ? '<span>📍 ' + esc(r.room) + '</span>' : '') + (r.teacher ? '<span>👤 ' + esc(r.teacher) + '</span>' : '') + '</div>';
        }).join('') + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return '<table class="fso-tt"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
  }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u || '')) ? String(u) : ''; }
  var overlay = null, lastFocus = null;
  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'fav-schedule-overlay';
    overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML =
      '<div class="fso-head">' +
        '<button type="button" class="fso-close" id="fso-close"><i class="fas fa-times"></i><span id="fso-close-t"></span></button>' +
        '<div class="fso-titles"><b id="fso-title"></b><small id="fso-meta"></small></div>' +
        '<div class="fso-tools"><a id="fso-ext" class="fso-btn" target="_blank" rel="noopener"><i class="fas fa-up-right-from-square"></i><span></span></a><a id="fso-page" class="fso-btn" href="/emplois"><i class="fas fa-calendar-alt"></i><span></span></a></div>' +
      '</div>' +
      '<div class="fso-body" id="fso-body"></div>';
    document.body.appendChild(overlay);
    overlay.querySelector('#fso-close').onclick = closeScheduleViewer;
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && overlay.classList.contains('open')) closeScheduleViewer(); });
    return overlay;
  }
  function closeScheduleViewer() {
    if (!overlay) return;
    overlay.classList.remove('open');
    var fr = overlay.querySelector('iframe'); if (fr) fr.src = 'about:blank';
    overlay.querySelector('#fso-body').innerHTML = '';
    document.documentElement.classList.remove('fso-lock');
    try { if (lastFocus && lastFocus.focus) lastFocus.focus(); } catch (_) {}
  }
  function fsoMessage(html, icon) {
    return '<div class="fso-msg"><i class="fas ' + (icon || 'fa-circle-info') + '"></i><p>' + html + '</p></div>';
  }
  async function fetchSchedule(id) {
    try {
      if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        var r = await supabaseClient.from('study_schedules').select('*').eq('id', id).maybeSingle();
        if (r && !r.error) return (r.data && r.data.is_active !== false) ? { data: r.data } : { gone: true };
      }
    } catch (_) {}
    return { offline: true };
  }
  async function openScheduleViewer(snap) {
    var ov = ensureOverlay();
    lastFocus = document.activeElement;
    var body = ov.querySelector('#fso-body');
    ov.querySelector('#fso-close-t').textContent = T('btn_close', 'إغلاق');
    ov.querySelector('#fso-page span').textContent = T('fav_sched_page', 'صفحة الجداول');
    ov.querySelector('#fso-page').href = '/emplois?open=' + encodeURIComponent(snap.id);
    ov.querySelector('#fso-title').textContent = snap.title || T('fav_sched_default_title', 'الجدول الدراسي');
    ov.querySelector('#fso-meta').textContent = [snap.specialization, snap.level, snap.group_name, snap.academic_year].filter(Boolean).join(' · ');
    var ext = ov.querySelector('#fso-ext'); ext.style.display = 'none';
    body.innerHTML = fsoMessage(esc(T('fav_sched_loading', 'جاري تحميل الجدول...')), 'fa-spinner fa-spin');
    ov.classList.add('open');
    document.documentElement.classList.add('fso-lock');
    var res = await fetchSchedule(snap.id);
    if (!ov.classList.contains('open')) return;
    var x = res.data || (res.offline ? snap : null);
    if (!x) { body.innerHTML = fsoMessage(esc(T('fav_sched_gone', 'هذا الجدول لم يعد متاحاً.')), 'fa-circle-exclamation'); return; }
    ov.querySelector('#fso-title').textContent = x.title || snap.title || T('fav_sched_default_title', 'الجدول الدراسي');
    ov.querySelector('#fso-meta').textContent = [x.specialization, x.level, x.group_name, x.academic_year].filter(Boolean).join(' · ');
    var url = safeUrl(x.file_url);
    if (x.rows && x.rows.length) {
      body.innerHTML = '<div class="fso-grid">' + gridHTML(x.rows) + '</div>';
    } else if (url) {
      body.innerHTML = '<iframe class="fso-frame" title="schedule" referrerpolicy="no-referrer" allowfullscreen></iframe>';
      body.querySelector('iframe').src = url;
      ext.href = url; ext.querySelector('span').textContent = T('fav_sched_new_tab', 'فتح في نافذة جديدة'); ext.style.display = '';
    } else if (x.rows) {
      body.innerHTML = fsoMessage(esc(T('fav_sched_no_rows', 'لا توجد حصص مدخلة لهذا الجدول.')), 'fa-calendar-xmark');
    } else {
      body.innerHTML = fsoMessage(esc(T('fav_sched_none', 'لا يوجد جدول متاح للعرض.')), 'fa-calendar-xmark');
    }
  }

  function render() {
    var list = document.getElementById('favorites-list');
    if (!list) return;
    var all = load();
    updateBadge();
    var counts = { all: all.length, file: 0, schedule: 0 };
    all.forEach(function (i) { counts[i.kind]++; });
    document.querySelectorAll('#favorites-container [data-fav-n]').forEach(function (el) {
      var c = counts[el.getAttribute('data-fav-n')] || 0; el.textContent = c ? '(' + c + ')' : '';
    });
    document.querySelectorAll('#favorites-container .fav-tab').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-fav-filter') === filter);
    });
    var items = all.filter(function (i) { return filter === 'all' || i.kind === filter; });
    list.innerHTML = '';
    items.forEach(function (i) { list.appendChild(i.kind === 'schedule' ? scheduleItem(i) : fileItem(i)); });
    var empty = document.getElementById('favorites-empty');
    if (empty) empty.classList.toggle('hidden', items.length > 0);
    var clr = document.getElementById('fav-clear-btn');
    if (clr) clr.classList.toggle('hidden', all.length === 0);
  }
  function isOpen() {
    var c = document.getElementById('favorites-container');
    return !!c && !c.classList.contains('hidden');
  }
  window.openFavorites = function () {
    try { var p = logSupabaseAnalytics('دخول قسم', 'المفضلة'); if (p && p.catch) p.catch(function () {}); } catch (_) {}
    hideAll();
    document.getElementById('favorites-container').classList.remove('hidden');
    render();
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (_) {}
  };

  document.addEventListener('click', function (e) {
    var tab = e.target.closest && e.target.closest('#favorites-container .fav-tab');
    if (tab) { filter = tab.getAttribute('data-fav-filter') || 'all'; render(); return; }
    var clr = e.target.closest && e.target.closest('#fav-clear-btn');
    if (clr) { if (confirm(T('fav_confirm_clear', 'هل تريد حذف جميع العناصر من المفضلة؟'))) { save([]); notify(); render(); } }
  });
  window.addEventListener('storage', function (e) { if (e.key === KEY) { updateBadge(); if (isOpen()) render(); } });
  var langBtn = document.getElementById('lang-toggle');
  if (langBtn) langBtn.addEventListener('click', function () { setTimeout(function () { if (isOpen()) render(); if (overlay) { var c = overlay.querySelector('#fso-close-t'); if (c) c.textContent = T('btn_close', 'إغلاق'); var p = overlay.querySelector('#fso-page span'); if (p) p.textContent = T('fav_sched_page', 'صفحة الجداول'); } }, 0); });

  window.UNEMFav = { KEY: KEY, load: load, has: has, remove: remove, fileButton: fileButton, fileKey: fileKey, render: render, updateBadge: updateBadge };
  updateBadge();
})();
