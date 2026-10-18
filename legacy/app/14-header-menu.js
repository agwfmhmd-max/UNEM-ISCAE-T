
/* قائمة الرأس: تُبنى عند الفتح من بطاقات الصفحة الرئيسية الموجودة فعلاً (لا تكرار للوظائف) */
(function () {
  var btn = document.getElementById('hdr-menu-btn'), menu = document.getElementById('hdr-menu');
  if (!btn || !menu) return;
  function T(k, f) { try { var d = i18n[currentLang]; if (d && d[k]) return d[k]; } catch (_) {} return f; }
  function labels() {
    btn.setAttribute('aria-label', T('hdr_menu', 'القائمة')); btn.title = T('hdr_menu', 'القائمة');
    var lb = document.getElementById('lang-toggle'); if (lb) { lb.title = T('hdr_lang_title', 'تغيير اللغة'); lb.setAttribute('aria-label', T('hdr_lang_title', 'تغيير اللغة')); }
  }
  function close() { menu.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
  function add(icon, label, fn) {
    var b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem');
    var i = document.createElement('i'); i.className = icon; var s = document.createElement('span'); s.textContent = label;
    b.appendChild(i); b.appendChild(s);
    b.onclick = function () { close(); try { fn(); } catch (_) {} };
    menu.appendChild(b);
  }
  function build() {
    menu.innerHTML = '';
    add('fas fa-house', T('btn_home', 'الرئيسية'), function () { if (typeof goBackToMainMenu === 'function') goBackToMainMenu(); });
    var fav = document.getElementById('fav-home-bar');
    if (fav && typeof openFavorites === 'function') add('fas fa-heart', T('card_favorites', 'المفضلة'), function () { openFavorites(); });
    var sep = document.createElement('div'); sep.className = 'hdr-sep'; menu.appendChild(sep);
    document.querySelectorAll('#main-menu .semesters-grid > .semester-card').forEach(function (card) {
      var cs = getComputedStyle(card);
      if (cs.display === 'none' || cs.visibility === 'hidden' || card.hidden || card.classList.contains('hidden')) return;
      var h = card.querySelector('h3'); var ic = card.querySelector('.icon-box i');
      if (!h) return;
      add(ic ? ic.className : 'fas fa-circle', h.textContent.trim(), function () { card.click(); });
    });
  }
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (menu.classList.contains('open')) { close(); return; }
    build(); menu.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
  });
  document.addEventListener('click', function (e) { if (menu.classList.contains('open') && !menu.contains(e.target)) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  var lb = document.getElementById('lang-toggle');
  if (lb) lb.addEventListener('click', function () { close(); setTimeout(labels, 0); });
  labels();
})();
