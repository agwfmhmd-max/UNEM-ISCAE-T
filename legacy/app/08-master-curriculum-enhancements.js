
/* UNEM ISCAE — Master IG M2 and curriculum enhancements
 * Developer: Mohamed Dah Agove
 * This isolated layer preserves the existing application logic and adds:
 * - Master IG M2 subjects from the supplied curriculum image.
 * - Main-admin master visibility scheduling.
 * - Main-admin editing of Licence/Master labels, descriptions, order and visibility.
 * - Green, bilingual subject explanations and polished archive styling.
 * - WhatsApp duplicate protection.
 */
(function () {
  'use strict';
  const MASTER_IG_M2_S3 = [
    'ERP', 'Développement Mobile', 'Framework JEE', 'Analyse de projets',
    'Sécurité informatique', 'MS Project', 'Droit des Sociétés',
    'Outils de développement', 'Big Data'
  ];
  const MASTER_IG_M2_S4 = ['Mémoire / Rapport de stage'];
  const DESC = {
    ar: {
      'Systèmes': 'دراسة بنية أنظمة التشغيل وإدارة العمليات والذاكرة والملفات والتزامن وآليات الحماية على مستوى النظام.',
      'Algo et structure de données': 'تصميم الخوارزميات وتحليل تعقيدها وتطبيق القوائم والمكدسات والطوابير والأشجار والرسوم البيانية.',
      'Réseaux avancés': 'تحليل التوجيه والبروتوكولات والخدمات وجودة الخدمة وأمن الاتصالات في الشبكات الموزعة.',
      'PROJETS Python': 'إنجاز مشاريع تطبيقية بلغة Python تشمل تنظيم الشيفرة ومعالجة البيانات والاختبار والتوثيق.',
      'Anglais': 'قراءة وكتابة وثائق وتقارير وعروض مهنية باللغة الإنجليزية في مجال تكنولوجيا المعلومات.',
      'Gestion des entreprises': 'تحليل وظائف المؤسسة وتنظيم مواردها وقراراتها ومؤشرات أدائها ضمن بيئة الأعمال.',
      'Java avancé': 'تطبيق البرمجة الكائنية والاستثناءات والتعددية والخيوط والواجهات في Java.',
      'Comptabilité et États Financiers': 'تسجيل العمليات وإعداد الميزانية وحساب النتائج وقراءة مكوّنات القوائم المالية.',
      'Architecture et Administration des SGBD': 'تصميم قواعد البيانات العلائقية وإدارة الصلاحيات والنسخ الاحتياطي وتحسين الاستعلامات.',
      'Recherche Opérationnelle': 'نمذجة مسائل القرار بالبرمجة الخطية والنقل والتخصيص وتحليل الحلول المثلى.',
      'Contrôle de Gestion': 'إعداد الموازنات وحساب التكاليف وتحليل الفروقات وبناء مؤشرات المتابعة لدعم القرار.',
      'Communication et Rédaction': 'إعداد التقارير والمذكرات والعروض المهنية وتنظيم الحجة وتطبيق قواعد التحرير والتوثيق.',
      'Génie Logiciel': 'تحليل المتطلبات وتصميم البرمجيات وإدارة دورة الحياة وضمان الجودة والاختبار والصيانة.',
      'JEE': 'بناء تطبيقات ويب مؤسسية بجافا باستعمال مكوّنات JEE وربطها بقواعد البيانات وإدارة الجلسات.',
      'ERP': 'تحليل تكامل وظائف المؤسسة في نظام ERP، من المحاسبة والمخزون إلى المشتريات والمبيعات وتدفق البيانات.',
      'Développement Mobile': 'تصميم تطبيقات الهاتف وإدارة الواجهات ودورة الحياة والتخزين والاتصال بخدمات الويب.',
      'Framework JEE': 'استعمال أطر Java المؤسسية لبناء طبقات العرض والخدمات والوصول إلى البيانات في تطبيقات الويب.',
      'Analyse de projets': 'تحديد أهداف المشروع ونطاقه ومخاطره وموارده ومؤشرات جدواه قبل التنفيذ والمتابعة.',
      'Sécurité informatique': 'تطبيق مبادئ السرية والسلامة والتوافر، وتحليل التهديدات وضبط الهوية والحماية والاستجابة للحوادث.',
      'MS Project': 'إنشاء هيكل تقسيم العمل وربط المهام بالموارد والآجال وتتبع المسار الحرج ونسب الإنجاز.',
      'Droit des Sociétés': 'دراسة تأسيس الشركات وشخصيتها المعنوية وأجهزتها ومسؤولية الشركاء وتصفية الشركة.',
      'Outils de développement': 'استعمال أنظمة التحكم في الإصدارات وأدوات البناء والاختبار والتصحيح والتكامل في دورة التطوير.',
      'Big Data': 'تخزين ومعالجة مجموعات البيانات كبيرة الحجم والمتنوعة واستعمال المعالجة الموزعة لاستخراج المؤشرات.',
      'Mémoire / Rapport de stage': 'إعداد بحث أو تقرير تدريب بمنهجية تشمل الإشكالية والأهداف والمنهج والنتائج والمناقشة.',
      'Mémoire ou Stage de Fin d’Études': 'تطبيق مكتسبات الماستر في بحث أو مشروع أو تدريب مع صياغة الإشكالية والمنهجية والنتائج والمناقشة.'
    },
    fr: {
      'Systèmes': 'Étude des systèmes d’exploitation : processus, mémoire, fichiers, synchronisation et protection.',
      'Algo et structure de données': 'Conception et complexité des algorithmes avec listes, piles, files, arbres et graphes.',
      'Réseaux avancés': 'Routage, protocoles, services, qualité de service et sécurité des communications distribuées.',
      'PROJETS Python': 'Réalisation de projets Python avec structuration du code, traitement des données, tests et documentation.',
      'Anglais': 'Lecture et rédaction de documents, rapports et présentations professionnels en anglais informatique.',
      'Gestion des entreprises': 'Fonctions de l’entreprise, organisation des ressources, décisions et indicateurs de performance.',
      'Java avancé': 'Programmation objet, exceptions, polymorphisme, threads et interfaces en Java.',
      'Comptabilité et États Financiers': 'Enregistrement des opérations, bilan, compte de résultat et lecture des états financiers.',
      'Architecture et Administration des SGBD': 'Conception relationnelle, droits, sauvegarde et optimisation des requêtes des bases de données.',
      'Recherche Opérationnelle': 'Modélisation par programmation linéaire, transport, affectation et analyse des solutions optimales.',
      'Contrôle de Gestion': 'Budgets, calcul des coûts, analyse des écarts et tableaux de bord pour la décision.',
      'Communication et Rédaction': 'Rédaction de rapports, notes et présentations professionnelles avec argumentation et référencement.',
      'Génie Logiciel': 'Besoins, conception, cycle de vie, assurance qualité, tests et maintenance des logiciels.',
      'JEE': 'Développement web d’entreprise en Java avec composants JEE, bases de données et gestion des sessions.',
      'ERP': 'Intégration des fonctions de l’entreprise dans un ERP : comptabilité, stocks, achats, ventes et flux de données.',
      'Développement Mobile': 'Conception d’applications mobiles, interfaces, cycle de vie, stockage et services web.',
      'Framework JEE': 'Utilisation des frameworks Java d’entreprise pour les couches web, services et accès aux données.',
      'Analyse de projets': 'Définition des objectifs, périmètre, risques, ressources et faisabilité avant le suivi du projet.',
      'Sécurité informatique': 'Confidentialité, intégrité, disponibilité, menaces, contrôle d’accès et réponse aux incidents.',
      'MS Project': 'Planification des tâches et ressources, dépendances, chemin critique et suivi de l’avancement.',
      'Droit des Sociétés': 'Constitution, personnalité morale, organes, responsabilité des associés et dissolution des sociétés.',
      'Outils de développement': 'Contrôle de versions, build, tests, débogage et intégration dans le cycle de développement.',
      'Big Data': 'Stockage et traitement distribué de données volumineuses et hétérogènes pour produire des indicateurs.',
      'Mémoire / Rapport de stage': 'Rédaction d’un mémoire ou rapport avec problématique, objectifs, méthode, résultats et discussion.',
      'Mémoire ou Stage de Fin d’Études': 'Mise en œuvre des acquis dans une recherche, un projet ou un stage avec méthode, résultats et discussion.'
    }
  };
  try { const M = window.MDA_DESC || {}; ['ar','fr'].forEach(l => Object.keys(M[l] || {}).forEach(k => { if (!DESC[l][k]) DESC[l][k] = M[l][k]; })); } catch (_) {}
  const MASTER_SCHEDULE_KEY = 'master_schedule';
  const MASTER_ENABLED_KEY = 'master_enabled';
  let curriculumOverrides = [];
  let masterEnabled = true;
  let masterSchedule = { startAt: '', endAt: '' };

  function safe(v) { return String(v == null ? '' : v); }
  function esc(v) { return safe(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function code(v) { return typeof getSafeSubjectCode === 'function' ? getSafeSubjectCode(v) : safe(v).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_'); }
  function isMainAdmin() { return (typeof isAdmin === 'function' && isAdmin()) || (typeof hasPermission === 'function' && hasPermission('manage_curriculum_subjects')); }
  function settingRowValue(row) {
    if (!row) return null;
    if (typeof row.value_text === 'string' && row.value_text.trim()) {
      try { return JSON.parse(row.value_text); } catch (_) { return row.value_text; }
    }
    if (Object.prototype.hasOwnProperty.call(row, 'value_boolean')) return row.value_boolean;
    return row.value || null;
  }
  function normalizeSchedule(v) {
    const x = v && typeof v === 'object' ? v : {};
    const valid = value => value && isFinite(new Date(value).getTime());
    return { startAt: valid(x.startAt) ? new Date(x.startAt).toISOString() : '', endAt: valid(x.endAt) ? new Date(x.endAt).toISOString() : '' };
  }
  function scheduleActive() {
    const now = Date.now(), start = masterSchedule.startAt ? new Date(masterSchedule.startAt).getTime() : null, end = masterSchedule.endAt ? new Date(masterSchedule.endAt).getTime() : null;
    return (!start || now >= start) && (!end || now <= end);
  }
  function masterVisible() { return masterEnabled !== false && scheduleActive(); }
  window.unemMasterVisible = masterVisible;
  window.unemReloadCurriculum = function () { return loadCurriculumEnhancementSettings(); };

  function syncSummariesCardDescription() {
    const el = document.querySelector('[data-i18n="card_summaries_desc"]');
    if (!el) return;
    const allLevels = masterVisible();
    const french = typeof currentLang !== 'undefined' && currentLang === 'fr';
    el.textContent = allLevels
      ? (french ? 'Toutes les filières (L1, L2, L3, M1, M2)' : 'جميع التخصصات (L1، L2، L3، M1، M2)')
      : (french ? 'Toutes les filières de Licence (L1, L2, L3)' : 'جميع تخصصات الليسانس (L1، L2، L3)');
  }

  // The supplied image is the authoritative M2 curriculum. Keep a fallback for offline/local HTML use.
  function ensureMasterIGM2Fallback() {
    if (typeof subjectsData === 'undefined' || !subjectsData.MASTER_IG) return;
    subjectsData.MASTER_IG.S3 = MASTER_IG_M2_S3.slice();
    subjectsData.MASTER_IG.S4 = MASTER_IG_M2_S4.slice();
  }

  async function loadCurriculumEnhancementSettings() {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
    try {
      const { data } = await supabaseClient.from('platform_settings').select('*').in('key', [MASTER_ENABLED_KEY, MASTER_SCHEDULE_KEY]);
      (data || []).forEach(row => {
        if (row.key === MASTER_ENABLED_KEY) {
          if (typeof row.value_boolean === 'boolean') masterEnabled = row.value_boolean;
          else {
            const raw = settingRowValue(row);
            if (raw === true || raw === false) masterEnabled = raw;
            else if (String(raw).toLowerCase() === 'true' || String(raw).toLowerCase() === 'false') masterEnabled = String(raw).toLowerCase() === 'true';
          }
        }
        if (row.key === MASTER_SCHEDULE_KEY) masterSchedule = normalizeSchedule(settingRowValue(row));
      });
    } catch (e) { console.warn('master settings', e); }
    try {
      const { data, error } = await supabaseClient.from('curriculum_subject_overrides').select('*').eq('is_active', true);
      if (!error && Array.isArray(data)) curriculumOverrides = data;
    } catch (e) { console.warn('curriculum overrides', e); }
    applyMasterVisibility();
  }
  function applyMasterVisibility() {
    const visible = masterVisible();
    syncSummariesCardDescription();
    document.querySelectorAll('.master-cycle-card, .master-specialization-card, .master-level-card, .whatsapp-level-card.master-level').forEach(el => {
      const isLevel = el.classList.contains('master-level-card');
      el.style.display = !visible ? 'none' : (el.classList.contains('master-specialization-card') ? ((el.dataset.cycle || 'master') === (window.__unemSpecCycle || 'licence') ? 'flex' : 'none') : '');
      el.setAttribute('aria-hidden', visible ? 'false' : 'true');
      if (isLevel) el.dataset.masterScheduled = visible ? 'visible' : 'hidden';
    });
    const cycle = document.querySelector('.master-cycle-card');
    if (cycle) cycle.classList.toggle('is-scheduled-hidden', !visible);
    document.querySelectorAll('.whatsapp-level-card.master-level').forEach(el => el.classList.toggle('is-scheduled-hidden', !visible));
    const cycleSection = document.getElementById('study-cycle-selection');
    if (!visible && cycleSection && !cycleSection.classList.contains('hidden') && typeof window.showSpecializationSelection === 'function') {
      window.showSpecializationSelection('licence');
    }
  }
  window.applyUnemMasterVisibility = applyMasterVisibility;
  async function saveMasterVisibility(enabled) {
    if (!isMainAdmin()) throw new Error('هذه العملية للمشرف الرئيسي فقط.');
    const { error } = await supabaseClient.from('platform_settings').upsert({ key: MASTER_ENABLED_KEY, value_boolean: !!enabled }, { onConflict: 'key' });
    if (error) throw error;
    masterEnabled = !!enabled; applyMasterVisibility();
  }
  async function saveMasterSchedule(startAt, endAt) {
    if (!isMainAdmin()) throw new Error('هذه العملية للمشرف الرئيسي فقط.');
    const value = normalizeSchedule({ startAt, endAt });
    if (value.startAt && value.endAt && new Date(value.endAt) < new Date(value.startAt)) throw new Error('تاريخ انتهاء ظهور الماستر يجب أن يكون بعد تاريخ البداية.');
    const { error } = await supabaseClient.from('platform_settings').upsert({ key: MASTER_SCHEDULE_KEY, value_text: JSON.stringify(value) }, { onConflict: 'key' });
    if (error) throw error;
    masterSchedule = value; applyMasterVisibility();
  }
  function localDateTime(v) {
    if (!v) return '';
    const d = new Date(v); if (!isFinite(d.getTime())) return '';
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function overrideFor(spec, level, semester, original) {
    const key = [safe(spec).toUpperCase(), safe(level).toUpperCase(), safe(semester).toUpperCase(), code(original)].join('|');
    return curriculumOverrides.find(x => [safe(x.specialization).toUpperCase(), safe(x.level).toUpperCase(), safe(x.semester).toUpperCase(), code(x.original_name)].join('|') === key) || null;
  }
  function preciseDescription(name, lang) {
    const n = safe(name), lower = n.toLowerCase();
    const ar = [
      [/comptabil|comptab|محاسب/, 'المبادئ والقواعد العملية لتسجيل العمليات وإعداد القوائم المحاسبية.'],
      [/finance|fiscal|trésor|tresor|investissement|marché|marches|crédit|credit|مالية|استثمار/, 'تحليل القرارات والآليات المالية وتقييم المخاطر والعوائد في المؤسسة والأسواق.'],
      [/gestion|management|pilotage|entreprise|organisation|تسيير|إدارة/, 'أدوات تنظيم الموارد واتخاذ القرار وتحسين أداء المؤسسة.'],
      [/droit|jurid|sociét|societ|قانون/, 'دراسة القواعد القانونية والمفاهيم التنظيمية المرتبطة بالمؤسسة والمعاملات.'],
      [/stat|probab|économ|econom|سلسلة|احتمال|إحصاء/, 'توظيف الأساليب الكمية لقياس الظواهر وتحليل البيانات ودعم القرار.'],
      [/math|algèbre|algeb|calcul|matrice|رياض|حساب/, 'المفاهيم والأدوات الرياضية اللازمة للنمذجة والتحليل وحل المسائل التطبيقية.'],
      [/réseau|reseau|systèm|system|architecture|شبك|نظم|أنظمة/, 'فهم بنية الأنظمة ومكوناتها وآليات تشغيلها وربطها وتأمينها.'],
      [/program|python|java|jee|php|c#|logiciel|développement|developpement|برمج|تطوير/, 'تصميم البرامج وكتابة الشيفرة واختبار الحلول البرمجية وفق منهجية عملية.'],
      [/marketing|commerce|vente|تسويق|تجارة|مبيعات/, 'تحليل السوق وسلوك العملاء وتخطيط الأنشطة التجارية والتسويقية.'],
      [/ressource|rh|personnel|موارد بشرية|الموارد/, 'تخطيط وتطوير الموارد البشرية وإدارة الأداء والعلاقات داخل المؤسسة.'],
      [/méthod|method|recherche|بحث|منهج/, 'منهجيات جمع المعلومات وبناء الإشكالية وتحليل النتائج وإعداد البحث العلمي.'],
      [/anglais|communication|rédaction|langue|إنجليزي|اتصال/, 'تطوير مهارات التواصل والتحرير واستعمال المصطلحات المهنية والأكاديمية.'],
      [/audit|contrôle|controle|reporting|مراقبة|تدقيق/, 'فحص المعلومات والإجراءات وقياس الانحرافات واقتراح إجراءات التحسين.'],
      [/big data|data|données|données|بيانات/, 'جمع البيانات واسعة الحجم وتنظيمها ومعالجتها واستخراج مؤشرات قابلة للاستعمال.'],
      [/mémoire|rapport|stage|مذكرة|تقرير|تدريب/, 'تطبيق مكتسبات التكوين في مشروع أو تدريب موثق بمنهجية أكاديمية ومهنية.']
    ];
    const fr = [
      [/comptabil|comptab/, 'Principes d’enregistrement des opérations et préparation des états comptables.'],
      [/finance|fiscal|trésor|tresor|investissement|marché|crédit/, 'Analyse des décisions financières, des risques et des rendements de l’entreprise et des marchés.'],
      [/gestion|management|pilotage|entreprise|organisation/, 'Outils de gestion des ressources, de décision et d’amélioration de la performance.'],
      [/droit|jurid|sociét|societ/, 'Règles juridiques et cadre organisationnel appliqués à l’entreprise et aux transactions.'],
      [/stat|probab|économ|econom/, 'Méthodes quantitatives pour mesurer les phénomènes, analyser les données et appuyer la décision.'],
      [/math|algèbre|algeb|calcul|matrice/, 'Outils mathématiques nécessaires à la modélisation, à l’analyse et à la résolution de problèmes.'],
      [/réseau|reseau|systèm|system|architecture/, 'Architecture des systèmes, fonctionnement des composants, interconnexion et sécurité.'],
      [/program|python|java|jee|php|c#|logiciel|développement|developpement/, 'Conception, programmation et test de solutions logicielles selon une démarche pratique.'],
      [/marketing|commerce|vente/, 'Analyse du marché, comportement du client et planification des actions commerciales et marketing.'],
      [/ressource|rh|personnel/, 'Planification, développement et évaluation des ressources humaines.'],
      [/méthod|method|recherche/, 'Méthodes de problématisation, collecte, analyse des résultats et rédaction scientifique.'],
      [/anglais|communication|rédaction|langue/, 'Communication professionnelle, rédaction et maîtrise du vocabulaire académique.'],
      [/audit|contrôle|controle|reporting/, 'Contrôle de l’information et des procédures, mesure des écarts et amélioration.'],
      [/big data|data|données/, 'Collecte, organisation, traitement et valorisation des données volumineuses.'],
      [/mémoire|rapport|stage/, 'Mise en pratique des acquis dans un projet ou un stage documenté selon une démarche académique.']
    ];
    const table = lang === 'fr' ? fr : ar;
    const hit = table.find(([pattern]) => pattern.test(lower));
    // حتى عند عدم وجود تخصيص محفوظ في القاعدة، نربط الوصف باسم المادة
    // وبموضوعها المحدد؛ فلا يمكن أن يظهر نفس النص حرفياً لمادتين مختلفتين.
    if (hit) {
      return lang === 'fr'
        ? hit[1]
        : hit[1];
    }
    return lang === 'fr'
      ? `Le cours « ${n} » traite ses notions fondamentales, ses méthodes de résolution et ses applications professionnelles propres.`
      : `يتناول مقرر «${n}» مفاهيمه الأساسية ومنهجيته الخاصة في الحل وتطبيقاته المهنية المرتبطة به.`;
  }
  function descriptionFor(name, original) {
    const ov = arguments.length > 2 ? arguments[2] : curriculumOverrides.find(x => code(x.original_name) === code(original || name));
    if (ov) { const t = currentLang === 'fr' ? (ov.description_fr || ov.description_ar) : (ov.description_ar || ov.description_fr); if (t) return t; }
    return DESC[currentLang === 'fr' ? 'fr' : 'ar'][original] || DESC[currentLang === 'fr' ? 'fr' : 'ar'][name] || preciseDescription(original || name, currentLang);
  }
  function subjectEntries(spec, level, semester, names) {
    return (names || []).map((original, index) => {
      if (/archive|أرشيف/i.test(original)) return null;
      const ov = overrideFor(spec, level, semester, original);
      return { original, name: ov?.display_name || original, description: descriptionFor(ov?.display_name || original, original, ov || null), order: Number.isFinite(Number(ov?.sort_order)) ? Number(ov.sort_order) : index };
    }).filter(x => x && (!overrideFor(spec, level, semester, x.original) || overrideFor(spec, level, semester, x.original).is_active !== false)).sort((a,b) => a.order - b.order);
  }
  function showSubjectExplanation(entry) {
    if (!entry || /archive|أرشيف/i.test(entry.original || entry.name)) return;
    let box = document.getElementById('unem-subject-explanation');
    if (!box) {
      box = document.createElement('aside'); box.id = 'unem-subject-explanation'; box.setAttribute('role','status');
    }
    box.innerHTML = `<strong><i class="fas fa-circle-info"></i> ${esc(entry.name)}</strong><span>${esc(entry.description)}</span>`;
    box.classList.add('show');
    const archive = /archive|أرشيف/i.test(entry.original || entry.name);
    const target = document.getElementById(archive ? 'file-list-container' : 'category-selection-container');
    if (target && box.parentNode !== target) target.insertBefore(box, target.firstChild);
  }
  function enhanceSubjectButtons() {
    const list = document.getElementById('dynamic-subjects-list'); if (!list) return;
    const spec = typeof currentSpecialization !== 'undefined' ? currentSpecialization : '';
    const level = typeof currentLevel !== 'undefined' ? currentLevel : (typeof levelForSemester === 'function' ? levelForSemester(currentSemester) : '');
    const semester = typeof currentSemester !== 'undefined' ? currentSemester : '';
    const entries = subjectEntries(spec, level, semester, typeof subjectsFor === 'function' ? subjectsFor(spec, semester) : []);
    [...list.querySelectorAll('button')].forEach(btn => {
      const entry = entries.find(x => safe(btn.textContent).trim().includes(safe(x.original).trim()) || safe(btn.textContent).trim() === safe(x.name).trim());
      if (!entry) return;
      const icon = btn.querySelector('i')?.outerHTML || '';
      // لا نعرض الشرح على زر المادة؛ يظهر فقط بعد الضغط عليها داخل شاشة الملفات.
      btn.innerHTML = `${icon}<span class="unem-subject-name">${esc(entry.name)}</span>`;
      btn.classList.add('unem-subject-button');
      const oldClick = btn.onclick;
      btn.onclick = function (ev) {
        const result = oldClick ? oldClick.call(this, ev) : undefined;
        setTimeout(() => showSubjectExplanation(entry), 0);
        return result;
      };
      btn.removeAttribute('title');
    });
  }
  function wrapShowSubjects() {
    if (typeof window.showSubjects !== 'function' || window.showSubjects.__unemEnhanced) return;
    const original = window.showSubjects;
    const enhanced = function (semester) { const result = original.apply(this, arguments); setTimeout(enhanceSubjectButtons, 0); return result; };
    enhanced.__unemEnhanced = true; window.showSubjects = enhanced;
  }

  async function saveOverride() {
    if (!isMainAdmin()) return alert('هذه العملية للمشرف الرئيسي فقط.');
    const data = {
      specialization: document.getElementById('uc-spec').value,
      level: document.getElementById('uc-level').value,
      semester: document.getElementById('uc-semester').value,
      original_name: document.getElementById('uc-original').value,
      display_name: document.getElementById('uc-display').value.trim(),
      description_ar: document.getElementById('uc-desc-ar').value.trim(),
      description_fr: document.getElementById('uc-desc-fr').value.trim(),
      sort_order: Number(document.getElementById('uc-order').value || 100),
      is_active: document.getElementById('uc-active').checked
    };
    if (!data.display_name) return alert('أدخل اسم المادة.');
    const { error } = await supabaseClient.from('curriculum_subject_overrides').upsert(data, { onConflict: 'specialization,level,semester,original_name' });
    if (error) return alert('❌ تعذر حفظ المادة: ' + error.message);
    await loadCurriculumEnhancementSettings(); renderCurriculumEditor(); enhanceSubjectButtons();
    alert('✅ تم حفظ تعديل المادة.');
  }
  function curriculumOptions() {
    const spec = document.getElementById('uc-spec')?.value || 'BA', level = document.getElementById('uc-level')?.value || 'L1', semester = document.getElementById('uc-semester')?.value || 'S1';
    const names = typeof subjectsFor === 'function' ? subjectsFor(spec, semester) : [];
    const sel = document.getElementById('uc-original'); if (!sel) return;
    sel.innerHTML = names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    sel.onchange = () => fillCurriculumEditor(); fillCurriculumEditor();
  }
  function fillCurriculumEditor() {
    const original = document.getElementById('uc-original')?.value || '', spec = document.getElementById('uc-spec')?.value || '', level = document.getElementById('uc-level')?.value || '', semester = document.getElementById('uc-semester')?.value || '';
    const ov = overrideFor(spec, level, semester, original);
    document.getElementById('uc-display').value = ov?.display_name || original;
    document.getElementById('uc-desc-ar').value = ov?.description_ar || (DESC.ar[original] || '');
    document.getElementById('uc-desc-fr').value = ov?.description_fr || (DESC.fr[original] || '');
    document.getElementById('uc-order').value = ov?.sort_order ?? 100;
    document.getElementById('uc-active').checked = ov?.is_active !== false;
  }
  function renderCurriculumEditor() {
    const box = document.getElementById('unem-curriculum-editor'); if (!box) return;
    const levels = ['L1','L2','L3','M1','M2'];
    box.innerHTML = `<div class="unem-admin-box"><div class="unem-admin-heading"><span>🧭 إدارة المناهج والمواد</span><small>تعديل مواد الليسانس والماستر من مكان واحد</small></div><div class="unem-editor-grid"><select id="uc-spec"><option value="BA">BA</option><option value="FC">FC</option><option value="TCM">TCM</option><option value="GRH">GRH</option><option value="SAE">SAE</option><option value="IG">IG</option><option value="MASTER_FC">Master FC</option><option value="MASTER_IG">Master IG</option></select><select id="uc-level">${levels.map(x=>`<option>${x}</option>`).join('')}</select><select id="uc-semester"></select><select id="uc-original"></select></div><label>اسم العرض<input id="uc-display"></label><label>الشرح بالعربية<input id="uc-desc-ar"></label><label>Résumé en français<input id="uc-desc-fr" dir="ltr"></label><div class="unem-editor-inline"><label>الترتيب<input id="uc-order" type="number" value="100"></label><label class="unem-switch"><input id="uc-active" type="checkbox" checked> إظهار المادة</label></div><button class="wa-save" id="uc-save">💾 حفظ تعديل المادة</button><p class="unem-admin-note">التعديل يحفظ الاسم الأصلي لربط الملفات القديمة، ويغيّر العرض والوصف والترتيب والحالة فقط.</p></div>`;
    const spec = document.getElementById('uc-spec'), level = document.getElementById('uc-level'), semester = document.getElementById('uc-semester');
    function sync() { const master = /^MASTER_/.test(spec.value), sems = master ? (level.value === 'M2' ? ['S3','S4'] : ['S1','S2']) : (typeof semestersForLevel === 'function' ? semestersForLevel(level.value) : ['S1','S2']); semester.innerHTML = sems.map(x=>`<option>${x}</option>`).join(''); curriculumOptions(); }
    spec.onchange = sync; level.onchange = sync; semester.onchange = curriculumOptions; document.getElementById('uc-save').onclick = saveOverride; sync();
  }
  function renderMasterScheduleAdmin() {
    const root = document.getElementById('unem-master-schedule-admin'); if (!root) return;
    root.innerHTML = `<div class="unem-admin-box"><div class="unem-admin-heading"><span>🎓 ظهور قسم الماستر</span><small>تحكم دقيق في زر الماستر ومواعيد ظهوره</small></div><label class="unem-switch"><input id="unem-master-enabled" type="checkbox" ${masterEnabled ? 'checked' : ''}> إظهار قسم الماستر للطلبة</label><div class="unem-editor-grid"><label>يظهر ابتداءً من<input id="unem-master-start" type="datetime-local" value="${localDateTime(masterSchedule.startAt)}"></label><label>يختفي بعد<input id="unem-master-end" type="datetime-local" value="${localDateTime(masterSchedule.endAt)}"></label></div><button class="wa-save" id="unem-master-save">💾 حفظ جدولة الماستر</button><p class="unem-admin-note">اترك التاريخين فارغين ليبقى الظهور دائماً. تعتمد الجدولة على توقيت الجهاز/الخادم بصيغة UTC محفوظة بدقة.</p></div>`;
    document.getElementById('unem-master-save').onclick = async () => { try { await saveMasterVisibility(document.getElementById('unem-master-enabled').checked); await saveMasterSchedule(document.getElementById('unem-master-start').value, document.getElementById('unem-master-end').value); alert('✅ تم حفظ ظهور الماستر وجدولته.'); } catch (e) { alert('❌ ' + e.message); } };
  }
  function openCurriculumAdmin() { if (!isMainAdmin()) return alert('ليست لديك صلاحية إعداد نتائج الطلاب.'); const content = document.getElementById('admin-dashboard-page-content'); if (!content) return; content.innerHTML = '<div id="unem-master-schedule-admin"></div><div id="unem-curriculum-editor"></div>'; renderMasterScheduleAdmin(); renderCurriculumEditor(); }

  function addAdminCards() {
    const home = document.getElementById('admin-dashboard-home'); if (!home || home.querySelector('.unem-curriculum-card')) return;
    const card = document.createElement('button'); card.type='button'; card.className='admin-dash-card unem-curriculum-card'; card.innerHTML='<b>🧭 إدارة المناهج والمواد</b><span>إضافة وتعديل مواد الليسانس والماستر والشرح</span>'; card.onclick=()=>{ currentAdminDashPage='curriculum'; home.style.display='none'; document.getElementById('admin-dashboard-page').style.display='block'; openCurriculumAdmin(); }; home.appendChild(card);
    const schedule = document.createElement('button'); schedule.type='button'; schedule.className='admin-dash-card unem-master-schedule-card'; schedule.innerHTML='<b>🎓 جدولة ظهور الماستر</b><span>إخفاء أو جدولة زر Master بدقة</span>'; schedule.onclick=()=>{ currentAdminDashPage='curriculum'; home.style.display='none'; document.getElementById('admin-dashboard-page').style.display='block'; openCurriculumAdmin(); }; home.appendChild(schedule);
    syncEnhancementAdminCards();
  }
  function syncEnhancementAdminCards() {
    const allowed = isMainAdmin();
    document.querySelectorAll('.unem-curriculum-card,.unem-master-schedule-card').forEach(card => {
      card.style.display = allowed ? 'flex' : 'none';
      card.style.visibility = allowed ? 'visible' : 'hidden';
      card.style.pointerEvents = allowed ? 'auto' : 'none';
    });
  }
  function dedupeWhatsAppGroups() {
    document.querySelectorAll('#whatsapp-general-list, #whatsapp-specialization-list').forEach(root => { const seen = new Set(); [...root.querySelectorAll('.whatsapp-group-link')].forEach(a => { const key = a.getAttribute('href') || a.textContent.trim(); if (seen.has(key)) a.remove(); else seen.add(key); }); });
  }
  function patchWhatsAppRendering() {
    if (typeof window.renderWhatsAppHubGroups === 'function' && !window.renderWhatsAppHubGroups.__unemEnhanced) { const old=window.renderWhatsAppHubGroups; const fn=async function(){const r=await old.apply(this,arguments); dedupeWhatsAppGroups(); return r;}; fn.__unemEnhanced=true; window.renderWhatsAppHubGroups=fn; }
    if (typeof window.loadWhatsAppSpecializationGroups === 'function' && !window.loadWhatsAppSpecializationGroups.__unemEnhanced) { const old=window.loadWhatsAppSpecializationGroups; const fn=async function(){const r=await old.apply(this,arguments); dedupeWhatsAppGroups(); return r;}; fn.__unemEnhanced=true; window.loadWhatsAppSpecializationGroups=fn; }
  }
  function patchAdminOpening() {
    if (typeof window.openAdminDashboard !== 'function' || window.openAdminDashboard.__unemEnhanced) return;
    const old = window.openAdminDashboard;
    const fn = function () {
      const result = old.apply(this, arguments);
      setTimeout(() => { addAdminCards(); syncEnhancementAdminCards(); }, 80);
      return result;
    };
    fn.__unemEnhanced = true;
    window.openAdminDashboard = fn;
  }

  window.saveMasterVisibility = saveMasterVisibility;
  window.saveMasterSchedule = saveMasterSchedule;
  window.openCurriculumAdmin = openCurriculumAdmin;
  document.addEventListener('DOMContentLoaded', async () => {
    ensureMasterIGM2Fallback();
    addAdminCards(); wrapShowSubjects(); patchWhatsAppRendering(); patchAdminOpening();
    await loadCurriculumEnhancementSettings(); applyMasterVisibility();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) applyMasterVisibility(); });
  });
  const oldSetLanguage = window.setLanguage;
  if (typeof oldSetLanguage === 'function' && !oldSetLanguage.__unemEnhanced) {
    const fn = function () { const result = oldSetLanguage.apply(this, arguments); setTimeout(() => { enhanceSubjectButtons(); syncSummariesCardDescription(); }, 0); return result; };
    fn.__unemEnhanced=true; window.setLanguage=fn;
  }
})();

