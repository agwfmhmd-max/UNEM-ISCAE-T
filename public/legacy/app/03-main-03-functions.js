/* ===== تقسيم 03-main.js — دوال =====
   يُحمَّل بعد الملفات التي تسبقه وقبل التي تليه (الترتيب محدد في src/legacy/app.html).
   الدوال: loadDynamicRegistries، findDocumentType، renderCategoryGrid، escapeDtText، commonSubjectByName، subjectScopeFor، isScopeComplete، fallbackEffectiveTypes، getEffectiveDocumentTypes، onUploadSubjectChange، refreshUploadTypeOptions، commonSubjectsFor، isCommonSubjectName، loadSharedSubjectGroups، sharedMemberMatches، sharedGroupOfSubject، sharedTargetsFor، rowMatchesSharedTarget، sharedDocOrigin، fetchBranchFilesQuiet، typesAdminStatus، renderTypesAdminLists، dtEl، clearDtSubject، dtLevelsForSpec، onDtScopeChange، onDtSpecChange، onDtLevelChange، onDtSemesterChange، updateDtSubjects، onDtSubjectChange، reloadDtLinks، renderDtTypesList، dtDialogStatus، dtEntry، openDocumentTypeDialog، closeDocumentTypeDialog، ensureDocumentType، upsertSubjectTypeOverride، saveDocumentTypeDialog، countDocumentsForLink، restoreDocumentTypeLink، deleteDocumentTypeLink، restoreSubjectDefaultTypes، createCommonSubject
   (الشيفرة منقولة حرفياً من 03-main.js دون أي تعديل) */


        /** تحميل الأنواع والمواد المشتركة من قاعدة البيانات */
        async function loadDynamicRegistries() {
            if (!supabaseClient) return;
            try {
                const { data, error } = await supabaseClient
                    .from('document_types').select('id,name,slug,sort_order')
                    .eq('is_active', true).order('sort_order', { ascending: true });
                if (!error && Array.isArray(data) && data.length) documentTypes = data;
            } catch (e) { console.warn('document_types', e); }
            try {
                const { data, error } = await supabaseClient
                    .from('common_subjects').select('id,name,subject_code,level,semester,module,sort_order')
                    .eq('is_active', true).order('sort_order', { ascending: true });
                if (!error && Array.isArray(data)) commonSubjects = data;
            } catch (e) { console.warn('common_subjects', e); }
            try {
                const { data, error } = await supabaseClient
                    .from('master_subjects').select('id,name,subject_code,specialization,level,semester,sort_order')
                    .eq('is_active', true).order('sort_order', { ascending: true }).order('created_at', { ascending: true });
                if (!error && Array.isArray(data)) masterSubjects = data;
            } catch (e) { console.warn('master_subjects', e); }
            await loadSharedSubjectGroups();
            renderCategoryGrid();
            renderTypesAdminLists();
            refreshUploadTypeOptions();
        }

        function findDocumentType(value) {
            const slug = typeSlug(value);
            return documentTypes.find(t => typeSlug(t.slug) === slug || typeSlug(t.name) === slug || t.id === value) || null;
        }

        /** بطاقات أنواع الملفات تُبنى ديناميكياً */
        function renderCategoryGrid(list) {
            const grid = document.getElementById('category-grid');
            if (!grid) return;
            // بدون قائمة محددة نعرض الأنواع الافتراضية الأربعة (لا شيء عام من أنواع مادة أخرى)
            const types = (Array.isArray(list) && list.length) ? list : DEFAULT_DOCUMENT_TYPES;
            grid.innerHTML = '';
            types.forEach(t => {
                const slug = typeSlug(t.slug || t.name);
                const card = document.createElement('div');
                card.className = 'category-card';
                card.onclick = () => selectCategory(slug);
                const desc = (t.description != null && String(t.description).trim())
                    ? String(t.description).trim()
                    : (TYPE_DESCRIPTIONS[slug] || '');
                card.innerHTML = `<div class="icon-box"><i class="fas ${TYPE_ICONS[slug] || 'fa-folder-open'}"></i></div><h3>${escapeDtText(t.name)}</h3><p>${escapeDtText(desc)}</p>`;
                grid.appendChild(card);
            });
        }

        function escapeDtText(value) {
            return String(value == null ? '' : value)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }

        /* ==================================================================
           نطاق المادة: نوع المادة → التخصص → المستوى → الفصل → المادة
           كل نوع ملف مرتبط بمادة واحدة فقط عبر جدول subject_document_types.
           ================================================================== */
        function commonSubjectByName(name) {
            const code = getSafeSubjectCode(name);
            return commonSubjects.find(c => typeSlug(c.subject_code) === code || getSafeSubjectCode(c.name) === code) || null;
        }

        function subjectScopeFor(spec, level, semester, subjectName) {
            if (!subjectName) return null;
            const common = commonSubjectByName(subjectName);
            if (common && !isMasterCycle(spec, level)) {
                return {
                    scopeType: 'common', specialization: 'COMMON',
                    level: String(common.level || '').toUpperCase(),
                    semester: String(common.semester || '').toUpperCase(),
                    subjectCode: typeSlug(common.subject_code) || getSafeSubjectCode(common.name),
                    subjectName: common.name
                };
            }
            // الماستر: نفس مفاتيح التخزين المستعملة في الرفع والخادم (MASTER_FC + M1 -> FC + L1 ...)
            // ورمز مادة مستقل (m_...) حتى لا تتطابق مواد الماستر (مثل Archive) مع مواد الليسانس.
            const storageSpec = effectiveUploadSpec(spec, level, subjectName);
            return {
                scopeType: 'specialization',
                specialization: storageSpecializationFor(storageSpec),
                level: storageLevelFor(storageSpec, level),
                semester: String(semester || '').toUpperCase(),
                subjectCode: storageSubjectCode(spec, level, subjectName),
                subjectName: subjectName
            };
        }

        function isScopeComplete(scope) {
            return !!(scope && scope.scopeType && scope.specialization && scope.level && scope.semester && scope.subjectCode);
        }

        /** الأنواع الافتراضية كنتيجة احتياطية إذا تعذّر الاتصال بقاعدة البيانات */
        function fallbackEffectiveTypes() {
            return DEFAULT_DOCUMENT_TYPES.map(t => {
                const known = documentTypes.find(d => typeSlug(d.slug || d.name) === t.slug);
                return {
                    typeId: known ? known.id : null,
                    linkId: null,
                    slug: t.slug,
                    baseName: t.name,
                    name: t.name,
                    description: t.description,
                    sortOrder: t.sort_order,
                    isDefault: true,
                    isOverridden: false,
                    isActive: true,
                    type: { id: known ? known.id : null, name: t.name, slug: t.slug }
                };
            });
        }

        /**
         * getEffectiveDocumentTypes(scope, includeDisabled)
         * الدالة المركزية الوحيدة لحساب أنواع الملفات الفعّالة لمادة محددة.
         */
        async function getEffectiveDocumentTypes(scope, includeDisabled) {
            if (!isScopeComplete(scope)) return [];
            if (!supabaseClient) return includeDisabled ? [] : fallbackEffectiveTypes();
            const { data, error } = await supabaseClient.rpc('effective_document_types_for_subject', {
                _scope: scope.scopeType,
                _spec: String(scope.specialization || '').toUpperCase(),
                _level: String(scope.level || '').toUpperCase(),
                _semester: String(scope.semester || '').toUpperCase(),
                _code: String(scope.subjectCode || '').toLowerCase()
            });
            if (error) throw error;
            const rows = (Array.isArray(data) ? data : []).map(row => ({
                typeId: row.type_id,
                linkId: row.link_id || null,
                slug: typeSlug(row.slug || row.base_name),
                baseName: row.base_name,
                name: row.name || row.base_name,
                description: row.description || TYPE_DESCRIPTIONS[typeSlug(row.slug || row.base_name)] || '',
                sortOrder: Number.isFinite(row.sort_order) ? row.sort_order : 100,
                isDefault: row.is_default === true,
                isOverridden: row.is_overridden === true,
                isActive: row.is_active !== false,
                scope: scope,
                type: { id: row.type_id, name: row.name || row.base_name, slug: typeSlug(row.slug || row.base_name) }
            }));
            const list = includeDisabled ? rows : rows.filter(r => r.isActive);
            return list.sort((a, b) => (a.sortOrder - b.sortOrder) || String(a.name).localeCompare(String(b.name)));
        }

        function onUploadSubjectChange() { refreshUploadTypeOptions(); }

        async function refreshUploadTypeOptions() {
            const sel = document.getElementById('upload-type');
            const empty = document.getElementById('upload-type-empty');
            if (!sel) return;
            uploadSubjectTypes = [];
            sel.innerHTML = '<option value="">--- اختر النوع ---</option>';
            sel.value = ''; sel.disabled = true;
            if (empty) empty.style.display = 'none';

            const spec = (document.getElementById('upload-spec') || {}).value || '';
            const level = (document.getElementById('upload-level') || {}).value || '';
            const semester = (document.getElementById('upload-semester') || {}).value || '';
            const subject = (document.getElementById('upload-subject') || {}).value || '';
            if (!spec || !level || !semester || !subject) return;

            const scope = subjectScopeFor(spec, level, semester, subject);
            try {
                uploadSubjectTypes = await getEffectiveDocumentTypes(scope, false);
            } catch (e) {
                console.error('subject document types', e);
                if (empty) { empty.textContent = '❌ تعذر تحميل أنواع الملفات لهذه المادة.'; empty.style.display = 'block'; }
                return;
            }
            uploadSubjectTypes.forEach(t => {
                const o = document.createElement('option');
                o.value = t.slug; o.textContent = t.name;
                sel.appendChild(o);
            });
            sel.disabled = uploadSubjectTypes.length === 0;
            if (empty) {
                empty.textContent = isAdmin()
                    ? "لا يوجد أي نوع مفعّل لهذه المادة (تم تعطيل الأنواع الافتراضية). أعِد تفعيلها من «إدارة أنواع الملفات» بالأسفل."
                    : "Aucun type de fichier n'est configuré pour cette matière.";
                empty.style.display = uploadSubjectTypes.length ? 'none' : 'block';
            }
        }

        /* ---------- المواد المشتركة ---------- */
        function commonSubjectsFor(semester) {
            const sem = String(semester || '').toUpperCase();
            return commonSubjects.filter(c => String(c.semester || '').toUpperCase() === sem);
        }
        function isCommonSubjectName(name) {
            const code = getSafeSubjectCode(name);
            return commonSubjects.some(c => typeSlug(c.subject_code) === code || getSafeSubjectCode(c.name) === code);
        }

        /* ==================================================================
           مواد مشتركة بين تخصصات محددة
           المشرف الرئيسي يربط مادة (أو أكثر) في تخصصات محددة؛ فيرى طلاب كل تخصص
           في المجموعة نفس ملفات المادة (GitHub + Cloudinary/Supabase) بدون تكرار،
           حتى لو رُفع الملف على تخصص واحد فقط. لا يُنسخ ولا يُنقل أي ملف.
           ================================================================== */
        async function loadSharedSubjectGroups() {
            if (!supabaseClient) return;
            try {
                const { data, error } = await supabaseClient
                    .from('shared_subject_groups')
                    .select('id,name,sort_order,shared_subject_members(id,specialization,level,semester,subject_name,subject_code)')
                    .eq('is_active', true)
                    .order('sort_order', { ascending: true })
                    .order('created_at', { ascending: true });
                if (!error && Array.isArray(data)) {
                    sharedSubjectGroups = data.map(g => ({
                        id: g.id, name: g.name, members: Array.isArray(g.shared_subject_members) ? g.shared_subject_members : []
                    }));
                    sharedGroupsVersion++;
                    documentsCache = {};
                }
            } catch (e) { console.warn('shared_subject_groups', e); }
        }

        function sharedMemberMatches(m, spec, semester, codes) {
            if (String(m.specialization || '').toUpperCase() !== spec) return false;
            if (String(m.semester || '').toUpperCase() !== semester) return false;
            return subjectCodeVariants(m.subject_name).concat([m.subject_code])
                .some(c => codes.includes(String(c || '').toLowerCase()));
        }

        /** المجموعة التي تنتمي إليها مادة معيّنة (أو null) */
        function sharedGroupOfSubject(spec, semester, subjectName) {
            if (!sharedSubjectGroups.length || !spec || !semester || !subjectName) return null;
            const s = storageSpecializationFor(spec).toUpperCase();
            const sem = String(semester).toUpperCase();
            const codes = subjectCodeVariants(subjectName).map(c => c.toLowerCase());
            return sharedSubjectGroups.find(g => (g.members || []).some(m => sharedMemberMatches(m, s, sem, codes))) || null;
        }
        /**
         * أهداف البحث عن الملفات لمادة مشتركة: كل عضو في المجموعة (المادة الحالية أولاً).
         * تعيد [] إذا لم تكن المادة مشتركة (وبالتالي يبقى السلوك القديم كما هو تماماً).
         */
        function sharedTargetsFor(spec, level, semester, subjectName) {
            if (!sharedSubjectGroups.length || !subjectName) return [];
            if (isMasterCycle(spec, level)) return [];
            const memoKey = [sharedGroupsVersion, spec, semester, subjectName].join('|');
            if (sharedTargetsMemo.key === memoKey) return sharedTargetsMemo.value;
            let result = [];
            const group = sharedGroupOfSubject(spec, semester, subjectName);
            if (group && (group.members || []).length > 1) {
                const s = storageSpecializationFor(spec).toUpperCase();
                const sem = String(semester).toUpperCase();
                const codes = subjectCodeVariants(subjectName).map(c => c.toLowerCase());
                const all = group.members.map(m => {
                    const mSpec = String(m.specialization || '').toUpperCase();
                    const mSem = String(m.semester || '').toUpperCase();
                    return {
                        spec: mSpec,
                        semester: mSem,
                        level: String(m.level || '').toUpperCase() || (Object.keys(SEMESTERS_BY_LEVEL).find(l => SEMESTERS_BY_LEVEL[l].includes(mSem)) || ''),
                        name: m.subject_name,
                        codes: Array.from(new Set(subjectCodeVariants(m.subject_name).concat([m.subject_code]).map(c => String(c || '').toLowerCase()).filter(Boolean))),
                        branch: branchMap[mSpec.toLowerCase()] || 'main',
                        isSelf: sharedMemberMatches(m, s, sem, codes)
                    };
                });
                result = all.filter(t => t.isSelf).concat(all.filter(t => !t.isSelf));
            }
            sharedTargetsMemo = { key: memoKey, value: result };
            return result;
        }

        /** هل يطابق سجل قاعدة البيانات أحد أعضاء المجموعة؟ (التخصص + الفصل + المستوى + رمز المادة) */
        function rowMatchesSharedTarget(r, t) {
            const rs = String(r.specialization || '').toUpperCase();
            if (rs !== t.spec && rs !== 'COMMON') return false;
            if (String(r.semester || '').toUpperCase() !== t.semester) return false;
            const lvl = String(r.level || '').toUpperCase();
            if (lvl && t.level && lvl !== t.level) return false;
            const code = String(r.subject_code || '').toLowerCase();
            if (/^m_/.test(code)) return false;
            if (code) return t.codes.includes(code);
            return !!r.subject && t.codes.includes(getSafeSubjectCode(r.subject));
        }

        /** مصدر الملف (التخصص الذي يحتويه فعلياً) — يُستعمل فقط لمنع التكرار بين أعضاء المجموعة */
        function sharedDocOrigin(d) {
            return String((d && (d.branch || d.specialization)) || '').toUpperCase();
        }
        async function fetchBranchFilesQuiet(branch) {
            if (branch === currentBranch) {
                if (allFiles.length === 0) await fetchFilesFromGitHub(currentBranch);
                return allFiles;
            }
            const cacheKey = `github_cache_${branch}`, cacheTimeKey = `github_cache_time_${branch}`;
            const mem = sharedBranchMemCache[branch];
            if (mem && (Date.now() - mem.time) < GITHUB_CACHE_TTL) return mem.files;
            let cached = null, cachedTime = 0;
            try { cached = JSON.parse(localStorage.getItem(cacheKey) || 'null'); cachedTime = Number(localStorage.getItem(cacheTimeKey) || 0); } catch (_) {}
            if (Array.isArray(cached) && (Date.now() - cachedTime) < GITHUB_CACHE_TTL) {
                sharedBranchMemCache[branch] = { time: Date.now(), files: cached };
                return cached;
            }
            try {
                const treeRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/git/trees/${encodeURIComponent(branch)}?recursive=1&v=${Date.now()}`, { cache: 'no-store' });
                if (treeRes.ok) {
                    const treeData = await treeRes.json();
                    if (Array.isArray(treeData.tree)) {
                        const files = treeData.tree
                            .filter(item => item && item.type === 'blob' && item.path)
                            .map(item => ({
                                type: 'file',
                                name: String(item.path).split('/').pop(),
                                path: item.path,
                                download_url: `https://raw.githubusercontent.com/${repoOwner}/${repoName}/${encodeURIComponent(branch)}/${String(item.path).split('/').map(encodeURIComponent).join('/')}`
                            }));
                        unemSafeLocalSet(cacheKey, JSON.stringify(files));
                        unemSafeLocalSet(cacheTimeKey, String(Date.now()));
                        sharedBranchMemCache[branch] = { time: Date.now(), files };
                        return files;
                    }
                }
            } catch (_) {}
            return Array.isArray(cached) ? cached : [];
        }

        /* ---------- لوحة المشرف: إدارة الأنواع والمواد المشتركة ---------- */
        function typesAdminStatus(msg, ok) {
            const el = document.getElementById('types-admin-status');
            if (!el) return;
            el.textContent = msg || '';
            el.className = 'status-msg' + (msg ? (ok ? ' success' : ' error') : '');
        }

        function renderTypesAdminLists() {
            renderMasterSubjectsAdmin();
            renderSharedGroupsAdmin();
            renderDtTypesList();
            updateDtSubjects();
            const cs = document.getElementById('cs-list');
            if (cs) {
                cs.innerHTML = commonSubjects.map(c => `<div class="row-item"><span>${c.name} — ${c.level}/${c.semester}</span><button onclick="deleteCommonSubject('${c.id}')">حذف</button></div>`).join('') || '<p style="text-align:center;opacity:.7;">لا توجد مواد مشتركة بعد.</p>';
            }
            const lvl = document.getElementById('cs-level');
            const sem = document.getElementById('cs-semester');
            if (lvl && sem && !lvl.dataset.bound) {
                lvl.dataset.bound = '1';
                const sync = () => {
                    sem.innerHTML = '';
                    semestersForLevel(lvl.value).forEach(v => {
                        const o = document.createElement('option'); o.value = v; o.textContent = v; sem.appendChild(o);
                    });
                };
                lvl.addEventListener('change', sync); sync();
            }
        }

        function dtEl(id) { return document.getElementById(id); }

        function clearDtSubject() {
            dtSubjectScope = null; dtLinks = [];
            const panel = dtEl('dt-types-panel');
            if (panel) panel.style.display = 'none';
            const list = dtEl('dt-list');
            if (list) list.innerHTML = '';
        }

        function dtLevelsForSpec(spec) {
            return /^MASTER_/i.test(String(spec || '')) ? ['M1', 'M2'] : ['L1', 'L2', 'L3'];
        }

        function onDtScopeChange() {
            const scope = (dtEl('dt-scope') || {}).value || '';
            const specGroup = dtEl('dt-spec-group');
            if (specGroup) specGroup.style.display = scope === 'specialization' ? '' : 'none';
            if (scope !== 'specialization' && dtEl('dt-spec')) dtEl('dt-spec').value = '';
            const spec = (dtEl('dt-spec') || {}).value || '';
            const canLevel = scope === 'common' || (scope === 'specialization' && !!spec);
            setSelectOptions(dtEl('dt-level'), '--- اختر المستوى ---', scope === 'common' ? ['L1', 'L2', 'L3'] : dtLevelsForSpec(spec), canLevel);
            onDtLevelChange();
        }

        function onDtSpecChange() {
            const spec = (dtEl('dt-spec') || {}).value || '';
            setSelectOptions(dtEl('dt-level'), '--- اختر المستوى ---', dtLevelsForSpec(spec), !!spec);
            onDtLevelChange();
        }

        function onDtLevelChange() {
            const level = (dtEl('dt-level') || {}).value || '';
            setSelectOptions(dtEl('dt-semester'), '--- اختر الفصل ---', semestersForLevel(level), !!level);
            onDtSemesterChange();
        }

        function onDtSemesterChange() { updateDtSubjects(); }

        function updateDtSubjects() {
            const subjectSel = dtEl('dt-subject');
            if (!subjectSel) return;
            const scope = (dtEl('dt-scope') || {}).value || '';
            const spec = (dtEl('dt-spec') || {}).value || '';
            const level = (dtEl('dt-level') || {}).value || '';
            const semester = (dtEl('dt-semester') || {}).value || '';
            if (!scope || !level || !semester || !isLevelSemesterValid(level, semester) || (scope === 'specialization' && !spec)) {
                setSelectOptions(subjectSel, '--- اختر المادة ---', [], false);
                clearDtSubject();
                return;
            }
            let list = [];
            if (scope === 'common') {
                list = commonSubjects
                    .filter(c => String(c.level || '').toUpperCase() === level.toUpperCase()
                        && String(c.semester || '').toUpperCase() === semester.toUpperCase())
                    .map(c => c.name);
            } else {
                const commonCodes = /^MASTER_/i.test(String(spec || '')) ? new Set() : new Set(commonSubjects.map(c => getSafeSubjectCode(c.name)));
                list = subjectsFor(spec, semester).filter(n => !commonCodes.has(getSafeSubjectCode(n)));
            }
            setSelectOptions(subjectSel, '--- اختر المادة ---', list, list.length > 0);
            clearDtSubject();
            if (!list.length) typesAdminStatus('⚠️ لا توجد مواد بهذا الاختيار.', false);
        }

        async function onDtSubjectChange() {
            const subject = (dtEl('dt-subject') || {}).value || '';
            if (!subject) { clearDtSubject(); return; }
            const spec = (dtEl('dt-spec') || {}).value || '';
            const level = (dtEl('dt-level') || {}).value || '';
            const semester = (dtEl('dt-semester') || {}).value || '';
            dtSubjectScope = subjectScopeFor(spec, level, semester, subject);
            if ((dtEl('dt-scope') || {}).value === 'common' && dtSubjectScope) {
                dtSubjectScope.scopeType = 'common';
                dtSubjectScope.specialization = 'COMMON';
            }
            await reloadDtLinks();
        }

        async function reloadDtLinks() {
            const panel = dtEl('dt-types-panel');
            const title = dtEl('dt-types-title');
            if (!isScopeComplete(dtSubjectScope)) { clearDtSubject(); return; }
            if (title) {
                title.textContent = `أنواع ملفات المادة: ${dtSubjectScope.subjectName} — ${dtSubjectScope.specialization} / ${dtSubjectScope.level} / ${dtSubjectScope.semester}`;
            }
            try {
                dtLinks = await getEffectiveDocumentTypes(dtSubjectScope, true);
            } catch (e) {
                dtLinks = [];
                typesAdminStatus('❌ تعذر تحميل أنواع الملفات: ' + (e.message || e), false);
            }
            if (panel) panel.style.display = '';
            renderDtTypesList();
        }

        /** لوحة المشرف: تعرض الأنواع الافتراضية + تخصيصات هذه المادة مع حالة كل نوع */
        function renderDtTypesList() {
            const el = dtEl('dt-list');
            if (!el) return;
            if (!isScopeComplete(dtSubjectScope)) { el.innerHTML = ''; return; }
            if (!dtLinks.length) {
                el.innerHTML = '<div class="dt-empty">لا توجد أنواع ملفات لهذه المادة بعد.</div>';
                return;
            }
            el.innerHTML = dtLinks.map(entry => {
                const badges = [];
                if (entry.isDefault) badges.push(entry.isOverridden ? '[افتراضي معدّل لهذه المادة]' : '[افتراضي]');
                else badges.push('[مخصص لهذه المادة]');
                badges.push(entry.isActive ? '[مفعّل]' : '[محذوف من هذه المادة]');
                const desc = entry.description ? ' — ' + escapeDtText(entry.description) : '';
                return `<div class="row-item ${entry.isActive ? '' : 'inactive'}">`
                    + `<span>${escapeDtText(entry.name)}<span class="row-meta"> ${escapeDtText(badges.join(' '))} — ترتيب ${entry.sortOrder}${desc}</span></span>`
                    + `<span class="row-actions">`
                    + `<button class="edit" onclick="openDocumentTypeDialog('${entry.typeId}')">تعديل</button>`
                    + (entry.isActive
                        ? `<button onclick="deleteDocumentTypeLink('${entry.typeId}')">حذف</button>`
                        : `<button class="toggle" onclick="restoreDocumentTypeLink('${entry.typeId}')">إعادة تفعيل</button>`)
                    + `</span></div>`;
            }).join('');
        }

        function dtDialogStatus(msg, ok) {
            const el = dtEl('dt-dialog-status');
            if (!el) return;
            el.textContent = msg || '';
            el.className = 'status-msg' + (msg ? (ok ? ' success' : ' error') : '');
            el.style.display = msg ? 'block' : 'none';
        }

        function dtEntry(typeId) {
            return dtLinks.find(e => String(e.typeId) === String(typeId)) || null;
        }

        function openDocumentTypeDialog(typeId) {
            if (!hasPermission('manage_document_types')) { typesAdminStatus('❌ ليست لديك صلاحية إدارة المناهج.', false); return; }
            if (!isScopeComplete(dtSubjectScope)) { typesAdminStatus('⚠️ اختر المادة أولاً.', false); return; }
            const entry = typeId ? dtEntry(typeId) : null;
            dtEditingLinkId = entry ? entry.typeId : null;
            dtEl('dt-dialog-title').textContent = entry ? 'تعديل نوع الملف (لهذه المادة فقط)' : 'Ajouter un type de fichier';
            dtEl('dt-dialog-subject').textContent = `${dtSubjectScope.subjectName} — ${dtSubjectScope.specialization} / ${dtSubjectScope.level} / ${dtSubjectScope.semester}`;
            dtEl('dt-dialog-name').value = entry ? entry.name : '';
            if (dtEl('dt-dialog-desc')) dtEl('dt-dialog-desc').value = entry ? (entry.description || '') : '';
            dtEl('dt-dialog-order').value = entry ? entry.sortOrder : (dtLinks.length + 1) * 10;
            dtEl('dt-dialog-active').checked = entry ? entry.isActive : true;
            dtDialogStatus('', true);
            dtEl('dt-dialog').classList.remove('hidden');
        }

        function closeDocumentTypeDialog() {
            dtEditingLinkId = null;
            const d = dtEl('dt-dialog');
            if (d) d.classList.add('hidden');
        }

        /** ينشئ (أو يعيد) سجل النوع في document_types بحسب الاسم — نوع غير افتراضي */
        async function ensureDocumentType(name, order) {
            const slug = typeSlug(name);
            const { data, error } = await supabaseClient.from('document_types')
                .select('id,name,slug,is_active,sort_order,is_default').eq('slug', slug).limit(1);
            if (error) throw error;
            if (data && data.length) {
                if (data[0].is_active === false) {
                    const { error: e2 } = await supabaseClient.from('document_types').update({ is_active: true }).eq('id', data[0].id);
                    if (e2) throw e2;
                    data[0].is_active = true;
                }
                return data[0];
            }
            const { data: inserted, error: e3 } = await supabaseClient.from('document_types')
                .insert([{ name, slug, sort_order: Number.isFinite(order) ? order : 100 }])
                .select('id,name,slug,is_active,sort_order,is_default');
            if (e3) throw e3;
            return (inserted || [])[0];
        }

        /**
         * التخصيص يُخزَّن دائماً في subject_document_types (طبقة المادة)،
         * ولا يُعدَّل أبداً السجل العام في document_types.
         */
        async function upsertSubjectTypeOverride(entry, patch) {
            if (entry && entry.linkId) {
                const { error } = await supabaseClient.from('subject_document_types')
                    .update(patch).eq('id', entry.linkId);
                if (error) throw error;
                return;
            }
            const row = Object.assign({
                scope_type: dtSubjectScope.scopeType,
                specialization: dtSubjectScope.specialization,
                level: dtSubjectScope.level,
                semester: dtSubjectScope.semester,
                subject_code: dtSubjectScope.subjectCode,
                subject_name: dtSubjectScope.subjectName,
                document_type_id: entry ? entry.typeId : patch.document_type_id
            }, patch);
            const { error } = await supabaseClient.from('subject_document_types').insert([row]);
            if (error) throw error;
        }

        async function saveDocumentTypeDialog() {
            if (!hasPermission('manage_document_types')) { dtDialogStatus('❌ ليست لديك صلاحية إدارة المناهج.', false); return; }
            if (!isScopeComplete(dtSubjectScope)) { dtDialogStatus('⚠️ اختر المادة أولاً.', false); return; }
            const name = (dtEl('dt-dialog-name').value || '').trim();
            const descRaw = dtEl('dt-dialog-desc') ? (dtEl('dt-dialog-desc').value || '').trim() : '';
            const orderRaw = parseInt(dtEl('dt-dialog-order').value, 10);
            const order = Number.isFinite(orderRaw) ? orderRaw : 100;
            const active = !!dtEl('dt-dialog-active').checked;
            if (!name) { dtDialogStatus('⚠️ أدخل اسم نوع الملف.', false); return; }

            try {
                const editing = dtEditingLinkId ? dtEntry(dtEditingLinkId) : null;
                const nameKey = typeSlug(name);
                const duplicate = dtLinks.find(e =>
                    (!editing || String(e.typeId) !== String(editing.typeId)) &&
                    (typeSlug(e.name) === nameKey || typeSlug(e.baseName) === nameKey || typeSlug(e.slug) === nameKey));
                if (duplicate) { dtDialogStatus('⚠️ هذا النوع موجود بالفعل لهذه المادة.', false); return; }

                if (editing) {
                    // تعديل خاص بهذه المادة فقط (Override) — لا يمسّ باقي المواد
                    await upsertSubjectTypeOverride(editing, {
                        display_name: (name === editing.baseName) ? null : name,
                        description: descRaw || null,
                        sort_order: order,
                        is_active: active
                    });
                } else {
                    // نوع جديد خاص بهذه المادة فقط
                    const type = await ensureDocumentType(name, order);
                    if (!type) { dtDialogStatus('❌ تعذر إنشاء نوع الملف.', false); return; }
                    if (type.is_default === true) {
                        dtDialogStatus('⚠️ هذا نوع افتراضي وموجود أصلاً لهذه المادة.', false); return;
                    }
                    await upsertSubjectTypeOverride(null, {
                        document_type_id: type.id,
                        display_name: (name === type.name) ? null : name,
                        description: descRaw || null,
                        sort_order: order,
                        is_active: active
                    });
                }
                closeDocumentTypeDialog();
                typesAdminStatus('✅ تم حفظ نوع الملف لهذه المادة فقط.', true);
                await reloadDtLinks();
                await refreshUploadTypeOptions();
            } catch (e) {
                if (String(e && e.code) === '23505') { dtDialogStatus('⚠️ هذا النوع موجود بالفعل لهذه المادة.', false); return; }
                dtDialogStatus('❌ ' + ((e && e.message) || e), false);
            }
        }

        /** عدد الملفات المرتبطة بهذا النوع في هذه المادة تحديداً */
        async function countDocumentsForLink(entry) {
            const { count, error } = await supabaseClient.from('documents')
                .select('id', { count: 'exact', head: true })
                .eq('file_type_id', entry.typeId)
                .eq('specialization', dtSubjectScope.specialization)
                .eq('level', dtSubjectScope.level)
                .eq('semester', dtSubjectScope.semester)
                .eq('subject_code', dtSubjectScope.subjectCode);
            if (error) throw error;
            return count || 0;
        }

        /** إعادة تفعيل نوع سبق حذفه من هذه المادة (بدون إنشاء نسخة مكررة) */
        async function restoreDocumentTypeLink(typeId) {
            if (!hasPermission('manage_document_types')) { typesAdminStatus('❌ ليست لديك صلاحية إدارة المناهج.', false); return; }
            const entry = dtEntry(typeId);
            if (!entry) return;
            try {
                await upsertSubjectTypeOverride(entry, { is_active: true });
            } catch (e) { typesAdminStatus('❌ ' + ((e && e.message) || e), false); return; }
            typesAdminStatus('✅ تمت إعادة تفعيل النوع لهذه المادة.', true);
            await reloadDtLinks();
            await refreshUploadTypeOptions();
        }

        /**
         * «حذف» النوع = إخفاؤه من هذه المادة فقط.
         * لا يُحذف أي ملف ولا أي رابط Cloudinary/GitHub، ولا يتأثر أي مادة أخرى.
         */
        async function deleteDocumentTypeLink(typeId) {
            if (!hasPermission('manage_document_types')) { typesAdminStatus('❌ ليست لديك صلاحية إدارة المناهج.', false); return; }
            const entry = dtEntry(typeId);
            if (!entry) return;
            let used = 0;
            try {
                used = await countDocumentsForLink(entry);
            } catch (e) {
                typesAdminStatus('❌ تعذر التحقق من الملفات المرتبطة: ' + ((e && e.message) || e), false);
                return;
            }
            const msg = used > 0
                ? `هذا النوع يحتوي على ${used} ملف مرتبط به. سيتم إخفاؤه من هذه المادة دون حذف الملفات. هل تريد المتابعة؟`
                : 'سيتم إخفاء هذا النوع من هذه المادة فقط (يمكن استعادته لاحقاً). هل تريد المتابعة؟';
            if (!confirm(msg)) return;

            try {
                if (!entry.isDefault && used === 0 && entry.linkId) {
                    const { error } = await supabaseClient.from('subject_document_types')
                        .delete().eq('id', entry.linkId);
                    if (error) throw error;
                } else {
                    await upsertSubjectTypeOverride(entry, { is_active: false });
                }
            } catch (e) { typesAdminStatus('❌ ' + ((e && e.message) || e), false); return; }
            typesAdminStatus('✅ تم إخفاء النوع من هذه المادة (الملفات محفوظة كما هي).', true);
            await reloadDtLinks();
            await refreshUploadTypeOptions();
        }

        /** إعادة المادة المحددة إلى الأنواع الافتراضية الأربعة (لا تتأثر أي مادة أخرى) */
        async function restoreSubjectDefaultTypes() {
            if (!hasPermission('manage_document_types')) { typesAdminStatus('❌ ليست لديك صلاحية إعداد نتائج الطلاب.', false); return; }
            if (!isScopeComplete(dtSubjectScope)) { typesAdminStatus('⚠️ اختر المادة أولاً.', false); return; }
            if (!confirm('استعادة الأنواع الافتراضية (Cours / TD / TP / Devoir / Examen) لهذه المادة فقط؟\nلن يُحذف أي ملف، وستفقد التخصيصات الخاصة بهذه المادة فقط.')) return;
            const { error } = await supabaseClient.from('subject_document_types').delete()
                .eq('scope_type', dtSubjectScope.scopeType)
                .eq('specialization', dtSubjectScope.specialization)
                .eq('level', dtSubjectScope.level)
                .eq('semester', dtSubjectScope.semester)
                .eq('subject_code', dtSubjectScope.subjectCode);
            if (error) { typesAdminStatus('❌ ' + error.message, false); return; }
            typesAdminStatus('✅ تمت استعادة الأنواع الافتراضية لهذه المادة.', true);
            await reloadDtLinks();
            await refreshUploadTypeOptions();
        }

        async function createCommonSubject() {
            if (!hasPermission('manage_curriculum_subjects')) { typesAdminStatus('❌ هذه العملية للمشرف الرئيسي فقط.', false); return; }
            const name = (document.getElementById('cs-name').value || '').trim();
            const module = (document.getElementById('cs-module').value || '').trim() || null;
            const level = document.getElementById('cs-level').value;
            const semester = document.getElementById('cs-semester').value;
            const order = parseInt(document.getElementById('cs-order').value, 10);
            if (!name) { typesAdminStatus('⚠️ أدخل اسم المادة.', false); return; }
            if (!isLevelSemesterValid(level, semester)) { typesAdminStatus('⚠️ الفصل لا ينتمي إلى المستوى.', false); return; }
            const { error } = await supabaseClient.from('common_subjects').insert([{
                name, subject_code: getSafeSubjectCode(name), level, semester, module,
                sort_order: Number.isFinite(order) ? order : 100
            }]);
            if (error) { typesAdminStatus('❌ ' + error.message, false); return; }
            document.getElementById('cs-name').value = '';
            typesAdminStatus('✅ تمت إضافة المادة المشتركة لكل التخصصات.', true);
            await loadDynamicRegistries();
        }