/* ===== تقسيم 03-main.js — دوال =====
   يُحمَّل بعد الملفات التي تسبقه وقبل التي تليه (الترتيب محدد في src/legacy/app.html).
   الدوال: masterSemestersForLevel، renderMasterSubjectsAdmin، createMasterSubject، deleteMasterSubject، deleteCommonSubject، onSgSpecChange، onSgLevelChange، onSgSemesterChange، sgMemberLabel، renderSgPending، renderSharedGroupsAdmin، addSharedGroupMember، removeSharedGroupMember، resetSharedGroupEditor، editSharedGroup، afterSharedGroupsChanged، saveSharedGroup، deleteSharedGroup، showSubjects، unemSafeLocalSet، fetchFilesFromGitHub، normalizeText، getSafeSubjectCode، getLegacySubjectCode، subjectCodeVariants، isValidFile، isSearchableDocument، getFileCategory
   (الشيفرة منقولة حرفياً من 03-main.js دون أي تعديل) */


        /* ---------- مواد الماستر (المشرف الرئيسي فقط) ---------- */
        function masterSemestersForLevel(level) { return String(level || '').toUpperCase() === 'M2' ? ['S3', 'S4'] : ['S1', 'S2']; }

        function renderMasterSubjectsAdmin() {
            const list = document.getElementById('ms-list');
            if (list) {
                list.innerHTML = masterSubjects.map(m => `<div class="row-item"><span>${escapeDtText(m.name)} — Master ${escapeDtText(m.specialization)} · ${escapeDtText(m.level)}/${escapeDtText(m.semester)}</span><button onclick="deleteMasterSubject('${escapeDtText(m.id)}')">حذف</button></div>`).join('')
                    || '<p style="text-align:center;opacity:.7;">لا توجد مواد ماستر مضافة يدوياً بعد.</p>';
            }
            const lvl = document.getElementById('ms-level');
            const sem = document.getElementById('ms-semester');
            if (lvl && sem && !lvl.dataset.bound) {
                lvl.dataset.bound = '1';
                const sync = () => {
                    sem.innerHTML = '';
                    masterSemestersForLevel(lvl.value).forEach(v => {
                        const o = document.createElement('option'); o.value = v; o.textContent = v; sem.appendChild(o);
                    });
                };
                lvl.addEventListener('change', sync); sync();
            }
        }

        async function createMasterSubject() {
            if (!hasPermission('manage_curriculum_subjects')) { typesAdminStatus('❌ هذه العملية للمشرف الرئيسي فقط.', false); return; }
            const spec = String((document.getElementById('ms-spec') || {}).value || '').toUpperCase();
            const level = String((document.getElementById('ms-level') || {}).value || '').toUpperCase();
            const semester = String((document.getElementById('ms-semester') || {}).value || '').toUpperCase();
            const name = ((document.getElementById('ms-name') || {}).value || '').trim();
            const order = parseInt((document.getElementById('ms-order') || {}).value, 10);
            if (!name) { typesAdminStatus('⚠️ أدخل اسم مادة الماستر.', false); return; }
            if (spec !== 'FC' && spec !== 'IG') { typesAdminStatus('⚠️ تخصص الماستر غير صالح.', false); return; }
            if (!masterSemestersForLevel(level).includes(semester)) { typesAdminStatus('⚠️ الفصل لا ينتمي إلى المستوى.', false); return; }
            const code = getSafeSubjectCode(name);
            if (!code) { typesAdminStatus('⚠️ اسم المادة غير صالح.', false); return; }
            const builtIn = ((subjectsData['MASTER_' + spec] || {})[semester] || []).some(n => getSafeSubjectCode(n) === code);
            if (builtIn) { typesAdminStatus('⚠️ هذه المادة موجودة أصلاً في Master ' + spec + ' / ' + semester + '.', false); return; }
            const sortOrder = Number.isFinite(order) ? order : 100;
            const { data: existing, error: selErr } = await supabaseClient.from('master_subjects')
                .select('id,is_active').eq('specialization', spec).eq('semester', semester).eq('subject_code', code).maybeSingle();
            if (selErr) {
                const missing = selErr.code === '42P01' || /master_subjects/i.test(selErr.message || '');
                typesAdminStatus('❌ ' + selErr.message + (missing ? ' — نفّذ سكربت SQL الخاص بمواد الماستر في Supabase أولاً.' : ''), false);
                return;
            }
            let error = null;
            if (existing) {
                if (existing.is_active) { typesAdminStatus('⚠️ هذه المادة مضافة مسبقاً.', false); return; }
                ({ error } = await supabaseClient.from('master_subjects')
                    .update({ is_active: true, name, level, sort_order: sortOrder }).eq('id', existing.id));
            } else {
                ({ error } = await supabaseClient.from('master_subjects').insert([{
                    specialization: spec, level, semester, name, subject_code: code, sort_order: sortOrder
                }]));
            }
            if (error) { typesAdminStatus('❌ ' + error.message, false); return; }
            document.getElementById('ms-name').value = '';
            typesAdminStatus('✅ تمت إضافة مادة الماستر.', true);
            await loadDynamicRegistries();
            try { updateUploadSubjects(); } catch (_) {}
        }

        async function deleteMasterSubject(id) {
            if (!hasPermission('manage_curriculum_subjects')) return;
            if (!confirm('حذف مادة الماستر هذه؟ الملفات المرفوعة تبقى محفوظة.')) return;
            const { error } = await supabaseClient.from('master_subjects').update({ is_active: false }).eq('id', id);
            if (error) { typesAdminStatus('❌ ' + error.message, false); return; }
            typesAdminStatus('✅ تم إخفاء مادة الماستر.', true);
            await loadDynamicRegistries();
            try { updateUploadSubjects(); } catch (_) {}
        }

        async function deleteCommonSubject(id) {
            if (!hasPermission('manage_curriculum_subjects')) return;
            if (!confirm('حذف هذه المادة المشتركة؟ الملفات المرفوعة تبقى محفوظة.')) return;
            const { error } = await supabaseClient.from('common_subjects').update({ is_active: false }).eq('id', id);
            if (error) { typesAdminStatus('❌ ' + error.message, false); return; }
            typesAdminStatus('✅ تم إخفاء المادة المشتركة.', true);
            await loadDynamicRegistries();
        }

        function onSgSpecChange() {
            const spec = (sgEl('sg-spec') || {}).value || '';
            setSelectOptions(sgEl('sg-level'), '--- المستوى ---', ['L1', 'L2', 'L3'], !!spec);
            onSgLevelChange();
        }
        function onSgLevelChange() {
            const level = (sgEl('sg-level') || {}).value || '';
            setSelectOptions(sgEl('sg-semester'), '--- الفصل ---', semestersForLevel(level), !!level);
            onSgSemesterChange();
        }
        function onSgSemesterChange() {
            const spec = (sgEl('sg-spec') || {}).value || '';
            const level = (sgEl('sg-level') || {}).value || '';
            const semester = (sgEl('sg-semester') || {}).value || '';
            if (!spec || !level || !semester || !isLevelSemesterValid(level, semester)) {
                setSelectOptions(sgEl('sg-subject'), '--- المادة ---', [], false);
                return;
            }
            // المواد المشتركة لكل التخصصات لها نظامها الخاص؛ نستبعدها هنا
            const commonCodes = new Set(commonSubjects.map(c => getSafeSubjectCode(c.name)));
            const list = subjectsFor(spec, semester).filter(n => !commonCodes.has(getSafeSubjectCode(n)));
            setSelectOptions(sgEl('sg-subject'), '--- المادة ---', list, list.length > 0);
        }

        function sgMemberLabel(m) {
            return `${escapeDtText(m.specialization)} · ${escapeDtText(m.level)}/${escapeDtText(m.semester)} — ${escapeDtText(m.subject_name)}`;
        }

        function renderSgPending() {
            const box = sgEl('sg-pending');
            if (!box) return;
            box.innerHTML = sgPending.map((m, i) =>
                `<div class="row-item"><span>${sgMemberLabel(m)}</span><button onclick="removeSharedGroupMember(${i})" type="button">إزالة</button></div>`
            ).join('') || '<p style="text-align:center;opacity:.7;">لم تُضَف أي مادة إلى المجموعة بعد (أضف مادتين على الأقل).</p>';
            const cancel = sgEl('sg-cancel-btn');
            if (cancel) cancel.style.display = sgEditingId ? '' : 'none';
            const save = sgEl('sg-save-btn');
            if (save) save.textContent = sgEditingId ? '💾 حفظ تعديلات المجموعة' : '💾 حفظ المجموعة';
        }

        function renderSharedGroupsAdmin() {
            const list = sgEl('sg-list');
            if (list) {
                list.innerHTML = sharedSubjectGroups.map(g => `<div class="row-item"><span>${escapeDtText(g.name)}<div class="row-meta">${(g.members || []).map(sgMemberLabel).join('<br>')}</div></span><div class="row-actions"><button class="edit" onclick="editSharedGroup('${escapeDtText(g.id)}')" type="button">تعديل</button><button onclick="deleteSharedGroup('${escapeDtText(g.id)}')" type="button">حذف الربط</button></div></div>`).join('')
                    || '<p style="text-align:center;opacity:.7;">لا توجد مجموعات مواد مشتركة بين تخصصات بعد.</p>';
            }
            renderSgPending();
        }

        function addSharedGroupMember() {
            if (!isAdmin()) { typesAdminStatus('❌ هذه العملية للمشرف الرئيسي فقط.', false); return; }
            const spec = String((sgEl('sg-spec') || {}).value || '').toUpperCase();
            const level = String((sgEl('sg-level') || {}).value || '').toUpperCase();
            const semester = String((sgEl('sg-semester') || {}).value || '').toUpperCase();
            const name = String((sgEl('sg-subject') || {}).value || '');
            if (!spec || !level || !semester || !name) { typesAdminStatus('⚠️ اختر التخصص ثم المستوى ثم الفصل ثم المادة.', false); return; }
            if (!isLevelSemesterValid(level, semester)) { typesAdminStatus('⚠️ الفصل لا ينتمي إلى المستوى.', false); return; }
            const member = { specialization: spec, level, semester, subject_name: name, subject_code: getSafeSubjectCode(name) };
            if (!member.subject_code) { typesAdminStatus('⚠️ اسم المادة غير صالح.', false); return; }
            if (sgPending.some(m => sgKey(m) === sgKey(member))) { typesAdminStatus('⚠️ هذه المادة مضافة مسبقاً إلى المجموعة.', false); return; }
            const owner = sharedGroupOfSubject(spec, semester, name);
            if (owner && owner.id !== sgEditingId) {
                typesAdminStatus('⚠️ هذه المادة مرتبطة بالفعل بالمجموعة «' + owner.name + '». عدّل تلك المجموعة أو احذف ربطها أولاً.', false);
                return;
            }
            sgPending.push(member);
            typesAdminStatus('', true);
            renderSgPending();
        }

        function removeSharedGroupMember(index) {
            sgPending.splice(index, 1);
            renderSgPending();
        }

        function resetSharedGroupEditor() {
            sgPending = []; sgEditingId = null;
            const nameEl = sgEl('sg-name'); if (nameEl) nameEl.value = '';
            const specEl = sgEl('sg-spec'); if (specEl) specEl.value = '';
            onSgSpecChange();
            renderSgPending();
        }

        function editSharedGroup(id) {
            if (!isAdmin()) return;
            const g = sharedSubjectGroups.find(x => String(x.id) === String(id));
            if (!g) return;
            sgEditingId = g.id;
            sgPending = (g.members || []).map(m => ({
                specialization: String(m.specialization).toUpperCase(), level: String(m.level).toUpperCase(),
                semester: String(m.semester).toUpperCase(), subject_name: m.subject_name, subject_code: m.subject_code
            }));
            const nameEl = sgEl('sg-name'); if (nameEl) nameEl.value = g.name || '';
            renderSgPending();
            typesAdminStatus('✏️ تعديل المجموعة «' + g.name + '» — أضف أو أزل موادّ ثم احفظ.', true);
            const nameInput = sgEl('sg-name'); if (nameInput && nameInput.scrollIntoView) nameInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        async function afterSharedGroupsChanged() {
            await loadSharedSubjectGroups();
            documentsCache = {};
            renderSharedGroupsAdmin();
        }

        async function saveSharedGroup() {
            if (!isAdmin()) { typesAdminStatus('❌ هذه العملية للمشرف الرئيسي فقط.', false); return; }
            if (sgPending.length < 2) { typesAdminStatus('⚠️ أضف مادتين على الأقل (من تخصصين أو فصلين مختلفين) لتكوين مجموعة.', false); return; }
            const typedName = ((sgEl('sg-name') || {}).value || '').trim();
            const name = typedName || sgPending[0].subject_name;
            const rowFor = (groupId, m) => ({
                group_id: groupId, specialization: m.specialization, level: m.level, semester: m.semester,
                subject_name: m.subject_name, subject_code: m.subject_code
            });
            try {
                if (sgEditingId) {
                    const g = sharedSubjectGroups.find(x => String(x.id) === String(sgEditingId));
                    const existing = g ? (g.members || []) : [];
                    const wanted = new Set(sgPending.map(sgKey));
                    const have = new Set(existing.map(sgKey));
                    const removed = existing.filter(m => !wanted.has(sgKey(m)));
                    const added = sgPending.filter(m => !have.has(sgKey(m)));
                    let r = await supabaseClient.from('shared_subject_groups').update({ name }).eq('id', sgEditingId);
                    if (r.error) throw r.error;
                    if (removed.length) {
                        r = await supabaseClient.from('shared_subject_members').delete().in('id', removed.map(m => m.id));
                        if (r.error) throw r.error;
                    }
                    if (added.length) {
                        r = await supabaseClient.from('shared_subject_members').insert(added.map(m => rowFor(sgEditingId, m)));
                        if (r.error) throw r.error;
                    }
                    typesAdminStatus('✅ تم حفظ تعديلات المجموعة. الملفات لم تُنقل ولم تُنسخ.', true);
                } else {
                    const ins = await supabaseClient.from('shared_subject_groups')
                        .insert([{ name, created_by: currentUserId }]).select('id').single();
                    if (ins.error) throw ins.error;
                    const groupId = ins.data.id;
                    const mem = await supabaseClient.from('shared_subject_members').insert(sgPending.map(m => rowFor(groupId, m)));
                    if (mem.error) {
                        // تنظيف: لا نترك مجموعة فارغة إذا فشل إدراج الأعضاء
                        await supabaseClient.from('shared_subject_groups').delete().eq('id', groupId);
                        throw mem.error;
                    }
                    typesAdminStatus('✅ تم ربط المواد: سيرى كل تخصص في المجموعة نفس الملفات بدون تكرار.', true);
                }
                resetSharedGroupEditor();
                await afterSharedGroupsChanged();
            } catch (e) {
                const missing = e && (e.code === '42P01' || /shared_subject_/i.test(String(e.message || '')) && /does not exist|schema cache/i.test(String(e.message || '')));
                const dup = e && String(e.code) === '23505';
                typesAdminStatus('❌ ' + (dup ? 'إحدى هذه المواد مرتبطة بالفعل بمجموعة أخرى.' : ((e && e.message) || e)) + (missing ? ' — نفّذ ملف SQL: db/20260828090000_shared_subject_groups.sql في Supabase أولاً.' : ''), false);
            }
        }

        async function deleteSharedGroup(id) {
            if (!isAdmin()) return;
            if (!confirm('حذف هذا الربط؟ لن يُحذف أي ملف؛ سيرجع كل تخصص إلى ملفاته الخاصة فقط.')) return;
            const { error } = await supabaseClient.from('shared_subject_groups').delete().eq('id', id);
            if (error) { typesAdminStatus('❌ ' + error.message, false); return; }
            if (sgEditingId && String(sgEditingId) === String(id)) resetSharedGroupEditor();
            typesAdminStatus('✅ تم حذف الربط. الملفات بقيت كما هي.', true);
            await afterSharedGroupsChanged();
        }

        function showSubjects(semester) {
            currentSemester = semester; hideAll(); document.getElementById('subjects-container').classList.remove('hidden');
            const container = document.getElementById('dynamic-subjects-list'); container.innerHTML = ''; container.classList.remove('hidden');
            const specUpper = currentSpecialization.toUpperCase(); const semUpper = semester.toUpperCase();
            // المواد المشتركة تظهر لكل التخصصات (مصدرها قاعدة البيانات)
            const baseSubjects = subjectsFor(specUpper, semUpper).slice();
            const seen = new Set(baseSubjects.map(getSafeSubjectCode));
            commonSubjectsFor(semUpper).forEach(c => {
                const code = getSafeSubjectCode(c.name);
                if (!seen.has(code) && !seen.has(typeSlug(c.subject_code))) { baseSubjects.push(c.name); seen.add(code); }
            });
            if (baseSubjects.length) {
                baseSubjects.forEach(sub => {
                    const btn = document.createElement('button');
                    if(sub.toLowerCase().includes('archive')) { btn.className = 'archive-btn'; btn.innerHTML = `<i class="fas fa-archive"></i> ${sub}`; } 
                    else { btn.textContent = sub; }
                    btn.onclick = () => loadFiles(sub); container.appendChild(btn);
                });
            } else { container.innerHTML = `<p style="text-align:center; font-weight:700;">${i18n[currentLang]['no_subjects']}</p>`; }
            document.getElementById('current-semester-title').textContent = `${i18n[currentLang]['section_subjects']} (${specUpper} - ${semUpper})`;
        }

        /** كتابة آمنة للتخزين المحلي: إن امتلأ (QuotaExceededError) نحذف كاش الفروع القديم ونعيد المحاولة
         *  بدل ترك الاستثناء يتسرب خارج fetchFilesFromGitHub بلا داعٍ. */
        function unemSafeLocalSet(key, value) {
            try { localStorage.setItem(key, value); return true; } catch (e1) {}
            try {
                Object.keys(localStorage)
                    .filter(k => /^github_cache_/.test(k) && k !== key)
                    .forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
                localStorage.setItem(key, value); return true;
            } catch (e2) { return false; }
        }

        async function fetchFilesFromGitHub(branch, options) {
            const force = !!(options && options.force);
            const cacheKey = `github_cache_${branch}`; const cacheTimeKey = `github_cache_time_${branch}`;
            const cachedData = localStorage.getItem(cacheKey); const cachedTime = localStorage.getItem(cacheTimeKey); const now = new Date().getTime();
            if (!force && cachedData && cachedTime && (now - cachedTime < GITHUB_CACHE_TTL)) {
                try { allFiles = JSON.parse(cachedData); } catch (_) {}
                return allFiles;
            }
            // عرض فوري من الكاش (إن وُجد) ثم تحديث حقيقي من GitHub
            if (cachedData && allFiles.length === 0) { try { allFiles = JSON.parse(cachedData); } catch (_) {} }
            try {
                // اجلب شجرة Git كاملة حتى تظهر الملفات الموجودة داخل كل المجلدات،
                // وليس ملفات المجلد الجذر فقط. هذا يشمل PDF وWord وExcel وPowerPoint.
                const treeRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/git/trees/${encodeURIComponent(branch)}?recursive=1&v=${new Date().getTime()}`, { cache: 'no-store' });
                if (treeRes.ok) {
                    const treeData = await treeRes.json();
                    if (Array.isArray(treeData.tree)) {
                        allFiles = treeData.tree
                            .filter(item => item && item.type === 'blob' && item.path)
                            .map(item => ({
                                type: 'file',
                                name: String(item.path).split('/').pop(),
                                path: item.path,
                                download_url: `https://raw.githubusercontent.com/${repoOwner}/${repoName}/${encodeURIComponent(branch)}/${String(item.path).split('/').map(encodeURIComponent).join('/')}`
                            }));
                        unemSafeLocalSet(cacheKey, JSON.stringify(allFiles));
                        unemSafeLocalSet(cacheTimeKey, now.toString());
                    }
                } else {
                    // توافق احتياطي مع API المحتويات إذا تعذر endpoint الشجرة.
                    const res = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/?ref=${branch}&v=${new Date().getTime()}`, { cache: 'no-store' });
                    if (res.ok) {
                        const data = await res.json();
                        if (Array.isArray(data)) {
                            allFiles = data;
                            unemSafeLocalSet(cacheKey, JSON.stringify(data));
                            unemSafeLocalSet(cacheTimeKey, now.toString());
                        }
                    } else if (cachedData) allFiles = JSON.parse(cachedData);
                }
            } catch(err) { if (cachedData) { try { allFiles = JSON.parse(cachedData); } catch (_) {} } }
            return allFiles;
        }


        function normalizeText(text) { return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim(); }

        /* ==================================================================
           رمز المادة الموحّد (المرجع الوحيد في الواجهة والخادم وقاعدة البيانات)
           "C#" → "c"   |   "C++" → "c"   |   "Analyse Financière" → "analyse_financiere"
           ================================================================== */
        function getSafeSubjectCode(name) {
            return String(name || '')
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9]+/g, "_")
                .replace(/_+/g, "_")
                .replace(/^_+|_+$/g, "")
                .slice(0, 60);
        }

        /** الصيغة القديمة (كانت تحتفظ بـ # و +) — تُستعمل فقط لقراءة السجلات القديمة دون فقدانها */
        function getLegacySubjectCode(name) {
            return String(name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9#+]/g, "_").replace(/_+/g, "_");
        }

        /** كل الرموز الممكنة لمادة ما (الجديدة + القديمة) لضمان ظهور كل الملفات */
        function subjectCodeVariants(name) {
            return Array.from(new Set([getSafeSubjectCode(name), getLegacySubjectCode(name)].filter(Boolean)));
        }

        function isValidFile(filename) {
            // كل الصيغ المدعومة رسمياً: PDF, Word, PowerPoint, Excel, صور
            if (window.UNEMUpload) return window.UNEMUpload.isSupported(filename);
            return /\.(pdf|docx?|pptx?|xlsx?|jpe?g|png)$/i.test(String(filename || ''));
        }

        // البحث العام يعرض المستندات فقط؛ صور الواجهة مثل icon-192.png ليست ملفات دراسية.
        function isSearchableDocument(file) {
            if (!file) return false;
            const name = String(file.name || file.original_name || file.path || '');
            const mime = String(file.mime_type || file.mimeType || '').toLowerCase();
            return /\.(pdf|docx?|pptx?|xlsx?)$/i.test(name)
                || ['application/pdf', 'application/msword', 'application/vnd.ms-word',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'application/vnd.ms-powerpoint',
                    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                    'application/vnd.ms-excel',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(mime);
        }

        function getFileCategory(filename) {
            if (filename.startsWith('Cours_')) return 'cours'; if (filename.startsWith('TD_TP_')) return 'td_tp'; if (filename.startsWith('Devoir_')) return 'devoir'; if (filename.startsWith('Examen_') || filename.startsWith('Archive_')) return 'examen';
            let lowerName = filename.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (lowerName.includes('[archive]') || lowerName.includes('- archive -') || lowerName.includes('_archive_') || lowerName.includes('[examen]') || lowerName.includes('[exemen]') || lowerName.includes('[exeman]')) return 'examen';
            if (lowerName.includes('[td]') || lowerName.includes('- td -') || lowerName.includes('_td_') || lowerName.includes('[tp]') || lowerName.includes('- tp -') || lowerName.includes('_tp_')) return 'td_tp';
            if (lowerName.includes('[devoir]') || lowerName.includes('- devoir -') || lowerName.includes('_devoir_') || lowerName.includes('[test]')) return 'devoir';
            if (lowerName.includes('[cours]') || lowerName.includes('- cours -') || lowerName.includes('_cours_')) return 'cours';
            if (lowerName.includes('correction examen') || lowerName.includes('correction exemen') || lowerName.includes('correction exeman') || lowerName.includes('corrige examen') || lowerName.includes('corrige exemen') || lowerName.includes('corrige exeman') || lowerName.includes('correction de l\'examen')) return 'examen';
            if (lowerName.includes('correction dv') || lowerName.includes('corrige dv') || lowerName.includes('correction devoir') || lowerName.includes('corrige devoir')) return 'devoir';
            if (['devoir', 'test'].some(k => lowerName.includes(k))) return 'devoir';
            if (/control(e)?[ \-_]*\d+/.test(lowerName) || lowerName.includes('controle continu') || /(^|[^a-z0-9])(dev|dv|di)([^a-z0-9]|$)/.test(lowerName)) return 'devoir';
            if (['archive', 'examen', 'exemen', 'exeman', 'exam', 'sujet', 'rattrapage', 'session', 'partiel', 'epreuve'].some(k => lowerName.includes(k))) return 'examen';
            if (/(^|[^a-z])tp([^a-z]|$)/.test(lowerName) || /tp[ \-_]*\d+/.test(lowerName) ||['pratique', 'atelier', 'travaux pratiques'].some(k => lowerName.includes(k))) return 'td_tp';
            if (/(^|[^a-z])td([^a-z]|$)/.test(lowerName) || /td[ \-_]*\d+/.test(lowerName) ||['serie', 'exercice', 'exo', 'travaux diriges', 'corrige', 'correction', 'cas'].some(k => lowerName.includes(k))) return 'td_tp';
            if (lowerName.includes('cours') || lowerName.includes('chapitre') || lowerName.includes('resume') || lowerName.includes('partie')) return 'cours';
            return 'cours';
        }