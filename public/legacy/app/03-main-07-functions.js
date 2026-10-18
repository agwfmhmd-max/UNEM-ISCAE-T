/* ===== تقسيم 03-main.js — دوال =====
   يُحمَّل بعد الملفات التي تسبقه وقبل التي تليه (الترتيب محدد في src/legacy/app.html).
   الدوال: levelForSemester، isLevelSemesterValid، subjectsFor، setSelectOptions، onUploadSpecChange، resetUploadSemester، resetUploadSubject، onUploadLevelChange، onUploadSemesterChange، updateUploadSubjects، resetUploadSelectors، formatFileSize، validatePdfFile، addFilesToQueue، removeFromQueue، renderUploadQueue، updateQueueItem، uploadToCloudinary، getNextDocumentSortOrder، getPresenceKey، getPresenceCount، refreshOnlineCount، updateOnlineCountUI، loadPublicOnlineSetting، savePublicOnlineSetting، loadHomeStatsSettings، saveHomeStatSetting، loadPromptSettings، savePromptSetting، resetOnboardingPrompts، stopPresenceHeartbeat، trackCurrentPresence، schedulePresenceReconnect، initOnlinePresence، requestUploadSignature
   (الشيفرة منقولة حرفياً من 03-main.js دون أي تعديل) */

        function levelForSemester(semester) {
            const sem = String(semester || '').toUpperCase();
            if (isMasterSpecialization(currentSpecialization)) return sem === 'S1' || sem === 'S2' ? 'L1' : sem === 'S3' || sem === 'S4' ? 'L2' : '';
            return Object.keys(SEMESTERS_BY_LEVEL).find(l => SEMESTERS_BY_LEVEL[l].includes(sem)) || '';
        }
        function isLevelSemesterValid(level, semester) {
            return semestersForLevel(level).includes(String(semester || '').toUpperCase());
        }
        function subjectsFor(spec, semester) {
            const s = String(spec || '').toUpperCase(), sem = String(semester || '').toUpperCase();
            const base = (subjectsData[s] && subjectsData[s][sem]) ? subjectsData[s][sem] : [];
            if (!/^MASTER_/.test(s) || !masterSubjects.length) return base;
            // مواد الماستر المضافة يدوياً تُدرج قبل عناصر Archive
            const list = base.slice();
            const seen = new Set(list.map(getSafeSubjectCode));
            masterSubjects.filter(m => ('MASTER_' + String(m.specialization || '').toUpperCase()) === s && String(m.semester || '').toUpperCase() === sem)
                .forEach(m => {
                    const code = getSafeSubjectCode(m.name);
                    if (!code || seen.has(code)) return;
                    seen.add(code);
                    const at = list.findIndex(isArchiveLikeSubject);
                    if (at === -1) list.push(m.name); else list.splice(at, 0, m.name);
                });
            return list;
        }

        function setSelectOptions(el, placeholder, values, enabled) {
            if (!el) return;
            el.innerHTML = '';
            const opt0 = document.createElement('option');
            opt0.value = ''; opt0.textContent = placeholder;
            el.appendChild(opt0);
            values.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; el.appendChild(o); });
            el.value = '';
            el.disabled = !enabled;
        }

        function onUploadSpecChange() {
            const spec = document.getElementById('upload-spec').value;
            const levelSel = document.getElementById('upload-level');
            const levels = /^MASTER_/.test(String(spec || '').toUpperCase()) ? ['M1', 'M2'] : ['L1', 'L2', 'L3']; setSelectOptions(levelSel, '--- اختر المستوى ---', levels, !!spec);
            resetUploadSemester();
        }

        function resetUploadSemester() {
            const level = document.getElementById('upload-level').value;
            setSelectOptions(document.getElementById('upload-semester'), '--- اختر الفصل ---', semestersForLevel(level), !!level);
            resetUploadSubject();
        }

        function resetUploadSubject() {
            setSelectOptions(document.getElementById('upload-subject'), '--- اختر المادة ---', [], false);
            refreshUploadTypeOptions();
        }

        function onUploadLevelChange() { resetUploadSemester(); }
        function onUploadSemesterChange() { updateUploadSubjects(); }

        /** المادة تعتمد على: التخصص + المستوى + الفصل (مع التحقق من توافق الفصل مع المستوى) */
        function updateUploadSubjects() {
            const spec = document.getElementById('upload-spec').value;
            const level = document.getElementById('upload-level').value;
            const semester = document.getElementById('upload-semester').value;
            const subjectSelect = document.getElementById('upload-subject');
            if (!spec || !level || !semester || !isLevelSemesterValid(level, semester)) {
                resetUploadSubject();
                return;
            }
            const list = subjectsForUpload(spec, level, semester).slice();
            const seen = new Set(list.map(getSafeSubjectCode));
            commonSubjectsFor(semester).forEach(c => {
                if (!seen.has(getSafeSubjectCode(c.name))) { list.push(c.name); seen.add(getSafeSubjectCode(c.name)); }
            });
            setSelectOptions(subjectSelect, '--- اختر المادة ---', list, true);
            refreshUploadTypeOptions();
        }

        /** يعيد النموذج إلى حالته الأولى (لا يمكن اختيار عنصر تابع قبل سابقه) */
        function resetUploadSelectors() {
            const specSel = document.getElementById('upload-spec');
            if (specSel) specSel.value = '';
            setSelectOptions(document.getElementById('upload-level'), '--- اختر المستوى ---', ['L1', 'L2', 'L3'], false);
            setSelectOptions(document.getElementById('upload-semester'), '--- اختر الفصل ---', [], false);
            resetUploadSubject();
        }

        function formatFileSize(bytes) {
            if (!bytes && bytes !== 0) return '';
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
        }

        /** تحقق موحّد لكل الصيغ المدعومة (PDF, Word, PowerPoint, Excel, صور) */
        function validatePdfFile(file) {
            if (window.UNEMUpload) return window.UNEMUpload.validateFile(file);
            if (!file) return '❌ لم يتم اختيار ملف.';
            if (!/\.(pdf|docx?|pptx?|xlsx?|jpe?g|png)$/i.test(file.name)) return '❌ نوع الملف غير مدعوم.';
            if (file.size === 0) return '❌ الملف فارغ.';
            if (file.size > MAX_UPLOAD_SIZE) return '❌ حجم الملف كبير جداً (الحد الأقصى 60 ميغابايت).';
            if (file.name.length > 180) return '❌ اسم الملف طويل جداً.';
            return null;
        }

        function addFilesToQueue(fileList) {
            const files = Array.from(fileList || []);
            files.forEach(file => {
                const duplicate = uploadQueue.some(item => item.file.name === file.name && item.file.size === file.size);
                if (duplicate) return;
                const invalid = validatePdfFile(file);
                uploadQueue.push({
                    id: 'q' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                    file, displayName: '', progress: 0,
                    state: invalid ? 'failed' : 'pending',
                    message: invalid || 'في الانتظار'
                });
            });
            renderUploadQueue();
        }

        function removeFromQueue(id) {
            if (isUploading) return;
            uploadQueue = uploadQueue.filter(item => item.id !== id);
            renderUploadQueue();
        }

        function renderUploadQueue() {
            const box = document.getElementById('upload-queue');
            if (!box) return;
            box.innerHTML = '';
            uploadQueue.forEach(item => {
                const div = document.createElement('div');
                div.className = 'up-item' + (item.state === 'done' ? ' done' : item.state === 'failed' ? ' failed' : '');
                const head = document.createElement('div'); head.className = 'up-head';
                const qTypeInfo = (window.UNEMUpload && window.UNEMUpload.infoFor(item.file.name)) || { icon: 'fa-file-pdf', color: '#ef4444' };
                head.innerHTML = `<i class="fas ${qTypeInfo.icon}" style="color:${qTypeInfo.color};"></i>
                    <span class="up-name"></span>
                    <span class="up-size">${formatFileSize(item.file.size)}</span>`;
                head.querySelector('.up-name').textContent = item.file.name;
                if (item.state === 'pending' || item.state === 'failed') {
                    const rm = document.createElement('button');
                    rm.type = 'button'; rm.className = 'up-remove'; rm.innerHTML = '<i class="fas fa-xmark"></i>';
                    rm.onclick = () => removeFromQueue(item.id);
                    head.appendChild(rm);
                }
                const nameWrap = document.createElement('div');
                nameWrap.className = 'up-custom-name';
                nameWrap.style.cssText = 'margin-top:8px;display:flex;align-items:center;gap:7px;';
                const nameInput = document.createElement('input');
                nameInput.type = 'text';
                nameInput.value = item.displayName || '';
                nameInput.placeholder = 'اسم الملف النهائي (اختياري)';
                nameInput.disabled = isUploading || item.state === 'done';
                nameInput.style.cssText = 'flex:1;width:100%;padding:9px 10px;border:1px solid var(--border-color);border-radius:9px;background:var(--bg-color);color:var(--text-primary);font-family:inherit;font-weight:700;';
                nameInput.oninput = () => { item.displayName = nameInput.value; };
                nameWrap.appendChild(nameInput);
                const bar = document.createElement('div'); bar.className = 'up-bar';
                bar.innerHTML = `<span style="width:${item.progress}%"></span>`;
                const state = document.createElement('div'); state.className = 'up-state';
                state.textContent = (item.state === 'uploading' ? `جاري الرفع... ${item.progress}%` : item.message);
                div.appendChild(head); div.appendChild(nameWrap); div.appendChild(bar); div.appendChild(state);
                box.appendChild(div);
            });
        }

        function updateQueueItem(item, patch) {
            Object.assign(item, patch);
            renderUploadQueue();
        }

        /** يطلب توقيعاً آمناً من الخادم ثم يرفع الملف مباشرة إلى Cloudinary مع متابعة التقدم */
        function uploadToCloudinary(signature, file, onProgress) {
            return new Promise((resolve, reject) => {
                const form = new FormData();
                form.append('file', file, signature.publicId || 'file');
                form.append('api_key', signature.apiKey);
                form.append('timestamp', signature.timestamp);
                form.append('signature', signature.signature);
                form.append('folder', signature.folder);
                form.append('public_id', signature.publicId);

                const xhr = new XMLHttpRequest();
                xhr.open('POST', signature.uploadUrl, true);
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
                };
                xhr.onload = () => {
                    let body = null;
                    try { body = JSON.parse(xhr.responseText); } catch (err) { body = null; }
                    if (xhr.status >= 200 && xhr.status < 300 && body && body.secure_url) { resolve(body); return; }
                    let msg = (body && body.error && body.error.message) || 'فشل الرفع إلى Cloudinary.';
                    if (/pdf|zip|not allowed|untrusted/i.test(msg)) {
                        msg = 'Cloudinary يمنع تسليم PDF حالياً. فعّل «Allow delivery of PDF and ZIP files» من إعدادات Security في Cloudinary.';
                    }
                    reject(new Error(msg));
                };
                xhr.onerror = () => reject(new Error('انقطع الاتصال أثناء الرفع.'));
                xhr.onabort  = () => reject(new Error('تم إلغاء الرفع.'));
                xhr.send(form);
            });
        }

        async function getNextDocumentSortOrder(spec, level, semester, subjectCode, fileTypeId) {
            try {
                const q = supabaseClient.from('documents').select('sort_order').eq('specialization', storageSpecializationFor(effectiveUploadSpec(spec, level))).eq('level', storageLevelFor(effectiveUploadSpec(spec, level), level)).eq('semester', semester).eq('subject_code', subjectCode).order('sort_order', { ascending: false }).limit(1);
                const { data, error } = await q;
                if (error) throw error;
                const max = Number(data?.[0]?.sort_order);
                return Number.isFinite(max) ? max + 10 : 10;
            } catch (_) {
                return 100000;
            }
        }

        function getPresenceKey() {
            // sessionStorage يجعل كل تبويب جلسة مستقلة؛ localStorage كان يدمج التبويبات
            // في هوية واحدة، لذلك كان فتح الموقع أكثر من مرة لا يغيّر العداد.
            try {
                let id = sessionStorage.getItem('unem_presence_id');
                if (!id) {
                    id = 'tab_' + (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
                    sessionStorage.setItem('unem_presence_id', id);
                }
                return id;
            } catch (_) {
                return 'tab_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
            }
        }

        function getPresenceCount() {
            if (!unemPresenceChannel || typeof unemPresenceChannel.presenceState !== 'function') return 0;
            const state = unemPresenceChannel.presenceState() || {};
            // Presence state قد يحتوي على أكثر من metadata لنفس المفتاح؛ نعدّ الجلسات
            // الفعلية فقط، حتى لا يتضخم الرقم بسبب إعادة الاتصال.
            return Object.values(state).reduce((count, metas) => {
                return count + (Array.isArray(metas) && metas.length > 0 ? 1 : 0);
            }, 0);
        }

        function refreshOnlineCount() {
            updateOnlineCountUI(getPresenceCount());
        }

        function updateOnlineCountUI(count) {
            unemPresenceCount = Math.max(0, Number(count) || 0);
            const adminEl = document.getElementById('stat-online');
            if (adminEl) adminEl.textContent = String(unemPresenceCount);
            const publicEl = document.getElementById('public-online-count');
            const publicValue = document.getElementById('public-online-count-value');
            if (publicValue) publicValue.textContent = String(unemPresenceCount);
            if (publicEl) publicEl.style.display = publicOnlineSetting ? 'block' : 'none';
        }

        async function loadPublicOnlineSetting() {
            if (!supabaseClient) return false;
            try {
                const { data, error } = await supabaseClient.from('platform_settings').select('value_boolean').eq('key', 'show_online_count').maybeSingle();
                if (error) throw error;
                publicOnlineSetting = data?.value_boolean === true;
                const toggle = document.getElementById('public-online-count-toggle');
                if (toggle) toggle.checked = publicOnlineSetting;
                updateOnlineCountUI(unemPresenceCount);
                return publicOnlineSetting;
            } catch (e) {
                console.warn('online setting', e);
                return false;
            }
        }

        async function savePublicOnlineSetting(enabled) {
            if (!hasPermission('manage_platform_settings')) return;
            const status = document.getElementById('public-online-count-status');
            try {
                const { data, error } = await supabaseClient.rpc('set_public_online_count', { p_enabled: !!enabled });
                if (error) throw error;
                publicOnlineSetting = data === true;
                updateOnlineCountUI(unemPresenceCount);
                if (status) { status.textContent = publicOnlineSetting ? '✅ سيظهر العدد للجميع.' : '✅ تم إخفاء العدد عن الزوار.'; status.className = 'status-msg success'; }
            } catch (e) {
                if (status) { status.textContent = '❌ تعذر حفظ الإعداد: ' + (e.message || e); status.className = 'status-msg error'; }
                const toggle = document.getElementById('public-online-count-toggle');
                if (toggle) toggle.checked = publicOnlineSetting;
            }
        }

        /* ===== إحصائيات الصفحة الرئيسية: إظهار/إخفاء عدد الزوار وعدد المسجّلين ===== */
        async function loadHomeStatsSettings() {
            if (!supabaseClient) return;
            const status = document.getElementById('home-stats-status');
            try {
                const { data, error } = await supabaseClient.rpc('get_public_platform_stats');
                if (error) throw error;
                let d = data; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (_) {} }
                if (Array.isArray(d)) d = d[0];
                const v = document.getElementById('home-visitors-toggle'), r = document.getElementById('home-registered-toggle');
                if (v) v.checked = !(d && d.show_visitors === false);
                if (r) r.checked = !(d && d.show_registered === false);
                if (status) { status.textContent = ''; status.className = 'status-msg'; }
            } catch (e) {
                if (status) { status.textContent = '⚠️ نفّذ ملف SQL: db/20261025090000_public_platform_stats.sql لتفعيل هذا التحكم.'; status.className = 'status-msg error'; }
            }
        }

        async function saveHomeStatSetting(key, enabled) {
            if (!hasPermission('manage_platform_settings')) return;
            const status = document.getElementById('home-stats-status');
            const toggle = document.getElementById(key === 'show_visitors_count' ? 'home-visitors-toggle' : 'home-registered-toggle');
            try {
                const { data, error } = await supabaseClient.rpc('set_public_stat_visibility', { p_key: key, p_enabled: !!enabled });
                if (error) throw error;
                const on = data !== false;
                if (toggle) toggle.checked = on;
                if (typeof window.unemHomeStatsFlags === 'function') {
                    window.unemHomeStatsFlags(key === 'show_visitors_count' ? on : null, key === 'show_registered_count' ? on : null);
                }
                const label = key === 'show_visitors_count' ? 'عدد الزوار' : 'عدد المسجّلين';
                if (status) { status.textContent = on ? ('✅ سيظهر ' + label + ' للجميع.') : ('✅ تم إخفاء ' + label + ' عن الجميع.'); status.className = 'status-msg success'; }
            } catch (e) {
                if (toggle) toggle.checked = !enabled;
                if (status) { status.textContent = '❌ تعذر حفظ الإعداد: ' + (e.message || e) + ' — تأكد من تنفيذ db/20261025090000_public_platform_stats.sql'; status.className = 'status-msg error'; }
            }
        }

        /* ===== تحكّم المشرف بنافذتي «ثبّت التطبيق» و«فعّل الإشعارات» ===== */
        async function loadPromptSettings() {
            if (!supabaseClient) return;
            const status = document.getElementById('prompts-status');
            try {
                const { data, error } = await supabaseClient.rpc('get_public_platform_stats');
                if (error) throw error;
                let d = data; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (_) {} }
                if (Array.isArray(d)) d = d[0];
                const i = document.getElementById('prompt-install-toggle'), p = document.getElementById('prompt-push-toggle');
                if (i) i.checked = !!(d && d.show_install_prompt === true);
                if (p) p.checked = !!(d && d.show_push_prompt === true);
                if (status) { status.textContent = ''; status.className = 'status-msg'; }
            } catch (e) {
                if (status) { status.textContent = '⚠️ نفّذ ملف SQL: db/20261027090000_onboarding_prompts_control.sql لتفعيل هذا التحكم.'; status.className = 'status-msg error'; }
            }
        }

        async function savePromptSetting(key, enabled) {
            if (!hasPermission('manage_platform_settings')) return;
            const status = document.getElementById('prompts-status');
            const toggle = document.getElementById(key === 'show_install_prompt' ? 'prompt-install-toggle' : 'prompt-push-toggle');
            try {
                const { data, error } = await supabaseClient.rpc('set_public_stat_visibility', { p_key: key, p_enabled: !!enabled });
                if (error) throw error;
                const on = data !== false;
                if (toggle) toggle.checked = on;
                try { if (window.unemPromptFlagsReset) window.unemPromptFlagsReset(); } catch (_) {}
                const label = key === 'show_install_prompt' ? 'نافذة «ثبّت التطبيق»' : 'نافذة «فعّل الإشعارات»';
                if (status) { status.textContent = on ? ('✅ ستظهر ' + label + ' للطلاب الجدد ولمن لم يثبّت/يفعّل (خلال لحظات من فتحهم الموقع).') : ('✅ تم إخفاء ' + label + ' عن الجميع.'); status.className = 'status-msg success'; }
            } catch (e) {
                if (toggle) toggle.checked = !enabled;
                if (status) { status.textContent = '❌ تعذر حفظ الإعداد: ' + (e.message || e) + ' — تأكد من تنفيذ db/20261027090000_onboarding_prompts_control.sql'; status.className = 'status-msg error'; }
            }
        }

        async function resetOnboardingPrompts() {
            if (!hasPermission('manage_platform_settings')) return;
            if (!confirm('إعادة إظهار النافذتين لكل من أغلقهما سابقاً (ولم يثبّت التطبيق أو يفعّل الإشعارات)؟')) return;
            const status = document.getElementById('prompts-status');
            try {
                const { error } = await supabaseClient.rpc('reset_onboarding_prompts');
                if (error) throw error;
                try { if (window.unemPromptFlagsReset) window.unemPromptFlagsReset(); localStorage.setItem('unem_prompts_reset_seen', String(Math.floor(Date.now() / 1000))); } catch (_) {}
                if (status) { status.textContent = '✅ ستظهر النافذتان من جديد لمن أغلقهما عند زيارته القادمة للموقع.'; status.className = 'status-msg success'; }
            } catch (e) {
                if (status) { status.textContent = '❌ تعذرت الإعادة: ' + (e.message || e) + ' — تأكد من تنفيذ db/20261027090000_onboarding_prompts_control.sql'; status.className = 'status-msg error'; }
            }
        }

        function stopPresenceHeartbeat() {
            if (presenceHeartbeat) {
                clearInterval(presenceHeartbeat);
                presenceHeartbeat = null;
            }
        }

        async function trackCurrentPresence() {
            if (!unemPresenceChannel || document.visibilityState === 'hidden') return;
            try {
                await unemPresenceChannel.track({
                    online_at: new Date().toISOString(),
                    last_seen_at: new Date().toISOString(),
                    user_id: currentUserId || null
                });
                refreshOnlineCount();
            } catch (e) {
                console.warn('online presence heartbeat', e);
            }
        }

        function schedulePresenceReconnect() {
            if (presenceRetryTimer || !supabaseClient) return;
            presenceRetryTimer = setTimeout(() => {
                presenceRetryTimer = null;
                presenceBound = false;
                initOnlinePresence();
            }, 4000);
        }

        async function initOnlinePresence() {
            if (!supabaseClient || presenceBound) return;
            presenceBound = true;
            await loadPublicOnlineSetting();
            try {
                presenceKey = getPresenceKey();
                const channel = supabaseClient.channel('unem-iscae-online', {
                    config: { presence: { key: presenceKey } }
                });
                unemPresenceChannel = channel;

                const refreshFromEvent = () => refreshOnlineCount();
                channel.on('presence', { event: 'sync' }, refreshFromEvent);
                channel.on('presence', { event: 'join' }, refreshFromEvent);
                channel.on('presence', { event: 'leave' }, refreshFromEvent);

                await channel.subscribe(async status => {
                    if (status === 'SUBSCRIBED') {
                        stopPresenceHeartbeat();
                        await trackCurrentPresence();
                        // إعادة النبضة تمنع بقاء جلسة قديمة وتُبقي الرقم متزامناً
                        // حتى مع الأجهزة المحمولة والشبكات غير المستقرة.
                        presenceHeartbeat = setInterval(trackCurrentPresence, 20000);
                    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                        stopPresenceHeartbeat();
                        if (unemPresenceChannel === channel) unemPresenceChannel = null;
                        presenceBound = false;
                        updateOnlineCountUI(0);
                        schedulePresenceReconnect();
                    }
                });
            } catch (e) {
                presenceBound = false;
                unemPresenceChannel = null;
                updateOnlineCountUI(0);
                console.warn('online presence unavailable', e);
                schedulePresenceReconnect();
            }
        }

        async function requestUploadSignature(meta, token) {
            const res = await fetch(unemApi('/api/public/cloudinary/sign'), {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify(meta)
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error((data && data.error) || '❌ تعذر بدء الرفع (صلاحية أو إعدادات الخادم).');
            return data;
        }