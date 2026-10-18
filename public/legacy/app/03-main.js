
        document.getElementById('copyright-year').textContent = new Date().getFullYear();
        setLanguage(currentLang);

        const SUPABASE_URL = 'https://cbaswqaufawdsvadizyi.supabase.co';
        const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiYXN3cWF1ZmF3ZHN2YWRpenlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4Mzg1MTQsImV4cCI6MjA5MzQxNDUxNH0.tv-u05JTkUFFkdYgR4gUyRb0TZKtDEwEwRQLRQSljHU'; 
        /* تخزين آمن لجلسة Supabase: إن كان التخزين المحلي ممتلئاً (بسبب كاش ملفات GitHub القديم)
           يُفرَّغ الكاش غير الضروري أولاً بدل أن يفشل تسجيل الدخول برسالة "exceeded the quota". */
        function unemSafeAuthStorage() {
            function purgeNonEssentialCache() {
                try {
                    Object.keys(localStorage)
                        .filter(k => /^github_cache_/.test(k))
                        .forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
                } catch (_) {}
            }
            return {
                getItem(key) {
                    try { const v = localStorage.getItem(key); if (v !== null) return v; } catch (_) {}
                    try { return sessionStorage.getItem(key); } catch (_) { return null; }
                },
                setItem(key, value) {
                    try { localStorage.setItem(key, value); try { sessionStorage.removeItem(key); } catch (_) {} return; } catch (e1) {}
                    purgeNonEssentialCache();
                    try { localStorage.setItem(key, value); try { sessionStorage.removeItem(key); } catch (_) {} return; } catch (e2) {}
                    // ملاذ أخير: نُبقي الجلسة في sessionStorage حتى لا يفشل تسجيل الدخول كليّاً.
                    try { sessionStorage.setItem(key, value); } catch (_) {}
                },
                removeItem(key) {
                    try { localStorage.removeItem(key); } catch (_) {}
                    try { sessionStorage.removeItem(key); } catch (_) {}
                }
            };
        }
        let supabaseClient; try { supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { storage: unemSafeAuthStorage() } }); } catch (e) {}

        // عنوان API موحّد: يمنع خطأ Failed to fetch عند فتح نسخة HTML محلياً (content:// أو file://).
        const UNEM_PRODUCTION_ORIGIN = 'https://unem-iscae.vercel.app';
        function unemApi(path) {
            const clean = String(path || '').startsWith('/') ? String(path) : '/' + String(path || '');
            const proto = String(window.location?.protocol || '');
            const origin = String(window.location?.origin || '');
            if (proto === 'http:' || proto === 'https:') return origin + clean;
            return UNEM_PRODUCTION_ORIGIN + clean;
        }


        const repoOwner = "i21567etu-coder"; 
        const repoName = "UNEM-ISCAE-"; 
        const branchMap = { 'ba': 'BA', 'fc': 'FC', 'tcm': 'TCM', 'grh': 'GRH', 'sae': 'SAE', 'ig': 'IG', 'master_fc': 'FC', 'master_ig': 'IG' };
        // مفاتيح الخادم القديمة تبقى متوافقة مع فصل ملفات الماستر بالمستوى M1/M2.
        function storageSpecializationFor(value) { const key=String(value || '').toUpperCase(); return key==='MASTER_FC' ? 'FC' : key==='MASTER_IG' ? 'IG' : key; }
        function isMasterSpecialization(value) { return /^MASTER_(FC|IG)$/i.test(String(value || '')); }
        // خادم الرفع القديم يقبل L1/L2/L3؛ نحافظ على M1/M2 في الواجهة ونحوّلهما داخلياً فقط.
        function storageLevelFor(spec, level) { const s=String(spec || '').toUpperCase(), l=String(level || '').toUpperCase(); if(/^MASTER_/.test(s)) return l==='M1' ? 'L1' : l==='M2' ? 'L2' : l; return l; }
        function masterSubjectSpecFor(spec, subject) { const s=String(spec || '').toUpperCase(), name=String(subject || ''); if(s==='FC' && subjectsFor('MASTER_FC','S1').concat(subjectsFor('MASTER_FC','S2'),subjectsFor('MASTER_FC','S3'),subjectsFor('MASTER_FC','S4')).includes(name)) return 'MASTER_FC'; if(s==='IG' && subjectsFor('MASTER_IG','S1').concat(subjectsFor('MASTER_IG','S2'),subjectsFor('MASTER_IG','S3'),subjectsFor('MASTER_IG','S4')).includes(name)) return 'MASTER_IG'; return s; }
        function effectiveUploadSpec(spec, level, subject) { const s=String(spec || '').toUpperCase(), l=String(level || '').toUpperCase(); if(isMasterSpecialization(s)) return s; if((l==='M1' || l==='M2') && (s==='FC' || s==='IG')) return 'MASTER_' + s; return masterSubjectSpecFor(s, subject); }
        function isMasterUploadContext(spec, level, subject) { const s=String(spec || '').toUpperCase(), l=String(level || '').toUpperCase(); return isMasterSpecialization(s) || l==='M1' || l==='M2' || (s==='FC' && subjectsFor('MASTER_FC','S1').concat(subjectsFor('MASTER_FC','S2'),subjectsFor('MASTER_FC','S3'),subjectsFor('MASTER_FC','S4')).includes(String(subject || ''))) || (s==='IG' && subjectsFor('MASTER_IG','S1').concat(subjectsFor('MASTER_IG','S2'),subjectsFor('MASTER_IG','S3'),subjectsFor('MASTER_IG','S4')).includes(String(subject || ''))); }
        function subjectsForUpload(spec, level, semester) { return subjectsFor(effectiveUploadSpec(spec, level), semester); }
        /* ==================================================================
           مواد الماستر المضافة يدوياً (جدول master_subjects — يديرها المشرف الرئيسي)
           + رمز تخزين مستقل لمواد الماستر: يمنع تطابق Archive S1..S4 (وأي مادة بنفس الاسم)
           بين الماستر والليسانس لأن الماستر يُخزَّن بمفاتيح FC/IG + L1/L2 + S1..S4.
           ================================================================== */
        let masterSubjects = [];
        function isMasterCycle(spec, level) { return isMasterSpecialization(spec) || /^M[12]$/i.test(String(level || '')); }
        function masterStorageCode(name) { return ('m_' + getSafeSubjectCode(name)).slice(0, 60); }
        function storageSubjectCode(spec, level, name) { return isMasterCycle(spec, level) ? masterStorageCode(name) : getSafeSubjectCode(name); }
        function isArchiveLikeSubject(name) { return /^archive\s*s\d/i.test(String(name || '').trim()); }
        /** رموز البحث عن ملفات مادة: للماستر الرمز الجديد + (توافقاً مع الملفات القديمة) الرمز القديم لمواد FC الثابتة غير الأرشيف فقط */
        function documentCodeVariants(spec, level, name) {
            if (!isMasterCycle(spec, level)) return subjectCodeVariants(name);
            // الماستر لا يستخدم أبداً رمز مادة الليسانس؛ هذا هو الحاجز الأساسي ضد التداخل.
            const out = [masterStorageCode(name)];
            const hard = subjectsData[String(spec || '').toUpperCase()] || {};
            const isHardcoded = Object.keys(hard).some(k => (hard[k] || []).includes(name));
            if (isHardcoded && !isArchiveLikeSubject(name)) subjectCodeVariants(name).forEach(c => { if (!out.includes(c)) out.push(c); });
            return out;
        }

        // ملفات GitHub القديمة لا تحمل حقول الدورة؛ لا نسمح بها في الماستر
        // إلا إذا كان مسارها نفسه يعلن صراحةً أنها Master/M1/M2.
        function isExplicitMasterGithubFile(file) {
            const path = normalizeText((file && (file.path || file.name)) || '');
            return /(^|[\/ _-])(master|m[12])([\/ _-]|$)/i.test(path);
        }

        function isDocumentInCurrentScope(doc) {
            if (!doc) return false;
            const master = isMasterCycle(currentSpecialization, currentLevel);
            const code = String(doc.subject_code || '').toLowerCase();
            const wanted = documentCodeVariants(currentSpecialization, currentLevel, currentSubjectName).map(String).map(v => v.toLowerCase());
            if (master) {
                if (doc.source === 'github' && !isExplicitMasterGithubFile(doc)) return false;
                return code ? code === String(masterStorageCode(currentSubjectName)).toLowerCase() : doc.source === 'github' && isExplicitMasterGithubFile(doc);
            }
            if (/^m_/.test(code)) return false;
            if (!code || wanted.includes(code)) return true;
            // مادة مشتركة بين تخصصات محددة: ملفات بقية أعضاء المجموعة مسموحة أيضاً
            const shared = sharedTargetsFor(currentSpecialization, currentLevel, currentSemester, currentSubjectName);
            return shared.some(t => t.codes.includes(code));
        }

        let allFiles =[]; let currentSpecialization = ''; let currentLevel = ''; let currentSemester = ''; let currentBranch = 'main'; 
        let currentSubjectFiles =[]; let currentTab = 'cours'; let isArchiveSpecialCase = false; let isAdminLoggedIn = false; 

        /* ============ نظام الأدوار (يتم التحقق منه في Supabase وليس في الواجهة) ============ */
        let currentUserRole = 'user';   // 'admin' | 'uploader' | 'user'
        let currentUserId   = null;
        let myPermissions = {};
        const isAdmin    = () => currentUserRole === 'admin';
        const canUpload  = () => currentUserRole === 'admin' || currentUserRole === 'uploader' || myPermissions.upload_files === true;
        function hasAdminDashboardAccess(){ return canUpload() || Object.values(myPermissions || {}).some(value => value === true); }
        /** زر إدارة ثابت: يظهر لمن مُنح صلاحية إدارة واحدة على الأقل. */
        function syncAdminQuickAccess(){
            const btn=document.getElementById('admin-quick-access');
            if(!btn) return;
            btn.classList.toggle('visible', hasAdminDashboardAccess());
        }

        async function getAccessToken() {
            if (!supabaseClient) return null;
            const { data } = await supabaseClient.auth.getSession();
            return data && data.session ? data.session.access_token : null;
        }

        /** يقرأ الدور الحقيقي من قاعدة البيانات (RPC محمي بـ RLS) */
        async function refreshUserRole() {
            currentUserRole = 'user'; currentUserId = null; isAdminLoggedIn = false; myPermissions = {};
            syncAdminQuickAccess();
            if (!supabaseClient) return 'user';
            const { data: sessionData } = await supabaseClient.auth.getSession();
            const session = sessionData ? sessionData.session : null;
            if (!session) return 'user';
            currentUserId = session.user.id;
            const { data, error } = await supabaseClient.rpc('get_my_role');
            if (error) {
                console.error('get_my_role', error);
                throw new Error('تعذر قراءة صلاحيات الحساب من قاعدة البيانات. تأكد من تنفيذ ملف SQL.');
            }
            currentUserRole = (data === 'admin' || data === 'uploader') ? data : 'user';
            isAdminLoggedIn = canUpload();
            syncAdminQuickAccess();
            await loadMyPermissions();
            return currentUserRole;
        }

        /** يُظهر/يُخفي أدوات الإدارة الحساسة حسب الدور */
        function applyRoleUI() {
            const badge = document.getElementById('role-badge');
            if (badge) {
                // لا نعرض أي شارة تكشف نوع الحساب (مشرف عام / رافع ملفات)
                badge.textContent = '';
                badge.style.display = 'none';
            }
            const requirements = {
                'admin-only-analytics': 'view_analytics',
                'ann-admin-section': 'manage_announcements',
                'push-admin-section': 'send_notifications',
                'types-admin-section': 'manage_document_types',
                'admin-online-public-setting': 'manage_platform_settings',
                'admin-home-stats-setting': 'manage_platform_settings',
                'admin-onboarding-prompts-setting': 'manage_platform_settings'
            };
            Object.entries(requirements).forEach(([id, permission]) => {
                const el = document.getElementById(id);
                if (el) el.style.display = hasPermission(permission) ? '' : 'none';
            });
        }

        // استعادة الجلسة عند فتح الموقع (Supabase Auth وليس localStorage)
        (async function restoreSession() {
            try {
                await refreshUserRole();
                applyRoleUI();
            } catch (e) { console.error(e); }
            try { await loadDynamicRegistries(); } catch (e) { console.error(e); }
        })();

        // مزامنة مستمرة مع Supabase Auth: تسجيل الدخول/الخروج ينعكس فوراً على زر الإدارة.
        if (supabaseClient) {
            supabaseClient.auth.onAuthStateChange((event) => {
                if(event === 'SIGNED_OUT') {
                    currentUserRole='user'; currentUserId=null; isAdminLoggedIn=false; myPermissions={};
                    syncAdminQuickAccess();
                    return;
                }
                if(event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
                    setTimeout(async()=>{
                        try { await refreshUserRole(); applyRoleUI(); } catch(e) { console.error('auth sync',e); }
                    },0);
                }
            });
        }

        const subjectsData = {
            "BA": { "S1":["Principe de gestion", "Comptabilité financière I", "Statistique descriptive I", "Mathématique", "Anglais I", "Méthodologie du travail universitaire", "MS office", "Introduction à l’économie", "Introduction au droit", "Technique de communication", "Archive S1"], "S2":["Comptabilité financière II", "Micro-finance", "Economie d’entreprise", "Statistique descriptive II", "Mathématiques financières", "Anglais II", "Aptitudes en TIC", "Développement personnel", "Microéconomie", "Droit des affaires", "Archive S2"], "S3":["Technique Bancaire", "Système financier mauritanien", "Gestion Financière", "Comptabilité des Sociétés", "Anglais des affaires", "Logiciels Bancaire", "Marketing", "Droit administrative", "Macroéconomie", "Méthodes d’aide à la décision", "Archive S3"], "S4":["Comptabilité des Société assurance", "Assurances des biens", "Comptabilité Bancaire", "Comptabilité de Gestion", "Finance des marchés", "Analyse Financière", "Gestion de la trésorerie", "GRH", "Droit des assurances", "Commerce international", "Archive S4"], "S5":["Gestion de portefeuille", "Comptabilité bancaire II", "Gestion des risques", "Finance islamique", "Stratégie d’entreprise", "Gestion de patrimoine", "Fiscalité", "Politiques et choix d’investissement", "Droit bancaire et financier", "Rapport de stage de la 2ème année", "Archive S5"], "S6":["Méthodologie de recherche", "Séminaire sur l'entrepreneuriat", "Mémoire de fin d'études", "Archive S6"] },
            "FC": { "S1":["Principe de gestion", "Comptabilité financière I", "Statistique descriptive I", "Mathématique", "Anglais I", "Méthodologie du travail universitaire", "MS office", "Introduction à l’économie", "Introduction au droit", "Technique de communication", "Archive S1"], "S2":["Comptabilité financière II", "Comptabilité financière II", "Micro-finance", "Economie d’entreprise", "Statistique descriptive II", "Mathématiques financières", "Anglais II", "Aptitudes en TIC", "Développement personnel", "Microéconomie", "Droit des affaires", "Archive S2"], "S3":["Technique Bancaire", "Système financier mauritanien", "Gestion Financière", "Comptabilité des Sociétés", "Anglais des affaires", "Logiciels Comptables", "Marketing", "Droit administrative", "Macroéconomie", "Méthodes d’aide à la décision", "Archive S3"], "S4":["Analyse financière", "Comptabilité de gestion", "Comptabilité des Sociétés II", "Finance islamique", "Gestion de portefeuilles", "Finance des marchés", "Droit du travail", "GRH", "Fiscalité", "Les instruments de Crédits", "Archive S4"], "S5":["Gestion de Trésorerie", "Contrôle de Gestion", "Reporting financier", "Méthodes d'évaluation de l'entreprise", "Stratégie d'entreprise", "Audit financier", "Normes Comptables Internationnales", "Choix d'investissement", "Droit bancaire et financier", "Rapport de stage de la 2ème année", "Archive S5"], "S6":["Méthodologie de recherche", "Séminaire sur l'entrepreneuriat", "Mémoire de fin d'études", "Archive S6"] },
            "TCM": { "S1":["Initiation à la gestion commerciale", "Principe de gestion", "Comptabilité financière I", "Introduction à l’économie", "Anglais I", "Techniques de communication", "MS office", "Statistique descriptive I", "Mathématique", "Introduction au droit", "Archive S1"], "S2":["Gestion commerciale de la relation client", "Economie d'entreprise", "Comptabilité financière II", "Gestion financière", "Anglais II", "Aptitudes en TIC", "Développement personnel", "Microéconomie", "Macro-économie", "Statistique descriptive II", "Archive S2"], "S3":["Marketing I", "Commerce international I", "Business Intelligence", "Gestion financière II", "Anglais des affaires", "Gestion de production", "Logiciels de gestion commerciale", "Droit administratif", "Droit des affaires", "GRH", "Archive S3"], "S4":["Marketing II", "Commerce international II", "Commerce électronique", "Finance Internationale", "Techniques Douanières et Transit", "Analyse financière", "Stratégie d’entreprise", "Techniques de sondage", "Droit des assurances", "Recherche opérationnelle", "Archive S4"], "S5":["Communication Marketing et commerciale", "Planification Marketing", "Techniques de Négociations Commerciales", "Fiscalité", "E-Marketing", "Finance des Marchés", "Etude des marchés", "Logistique du commerce international", "Management des projects", "Rapport de stage de la 2ème année", "Archive S5"], "S6":["Méthodologie de recherche", "Séminaire sur l'entrepreneuriat", "Mémoire de fin d'études", "Archive S6"] },
            "GRH": { "S1":["Initiation à la gestion des RH", "Principes de gestion", "Comptabilité financière I", "Introduction à l’économie", "Anglais I", "MS Office", "Techniques de Communication", "Statistique descriptive I", "Mathématiques", "Introduction au droit", "Archive S1"], "S2":["Evaluation des compétences", "Gestion Administrative des RH I", "Comptabilité financière II", "Gestion financière I", "Anglais II", "Aptitudes en TIC", "Développement personnel", "Rédaction administrative I", "Droit de travail I", "Statistiques descriptives II", "Archive S2"], "S3":["Gestion de la paie", "Recrutement", "Sécurité sociale I", "Gestion financière II", "Plan et ingénierie de formation", "Logiciels paie", "Anglais des affaires", "Rédaction administrative II", "Droit de travail II", "Droit des obligations", "Archive S3"], "S4":["GPEC", "Sécurité sociale II", "Stratégie d'entreprise", "Macroéconomie", "Microéconomie", "Analyse financière", "Communication interne", "Système d'information RH", "Gestion des conflits et négociations", "Droit Administratif", "Archive S4"], "S5":["Sources de motivation du personnel", "Politique de rémunération", "Audit des Ressources Humaines", "Droit pénal général", "Passation des marchés", "Sociologie des organisations", "Rapport de stage de la 2ème année", "Outils pilotage RH", "Management des projects", "Gestion des connaissances", "Archive S5"], "S6":["Méthodologie de recherche", "Séminaire sur l'entrepreneuriat", "Mémoire de fin d'études", "Archive S6"] },
            "SAE": { "S1":["Introduction à l’économie", "Principe de gestion", "Calcul intégral I", "Calcul matricielle I", "Probabilité I", "Statistique descriptive", "Anglais technique", "Méthodologie de travail universitaire", "Introduction au droit", "MS office I", "Archive S1"], "S2":["Macro-économie", "Microéconomie", "Calcul intégral II", "Calcul matricielle II", "Probabilité II", "Statistique descriptive II", "Anglais technique II", "MS office II", "Comptabilité générale", "Technique de communication", "Archive S2"], "S3":["Statistique inferential", "Technique de sondage", "Programmation linéaire", "Comptabilité nationale", "Microeconomie 2", "Macro-économie 2", "Marketing", "Mangement", "Monnaies et crédit", "Logiciel (spss ou R)", "Archive S3"], "S4":["Finance public", "GRH", "Econometrie", "Commerce extérieur", "Optimisation", "Analyse des données", "Logiciel statistique", "Gestion des projects", "Finance des marchés", "Économie Mauritanienne", "Archive S4"], "S5":["Analyse Démographique", "Analyse des données II", "Chaîne de Markov", "Econométrie II", "Economie Monétaire", "Modélisation Macroéconomique", "Séries temporelles", "Sujet", "Théorie de croissance", "Théorie de décision", "Archive S5"], "S6":["Méthodologie de recherche", "Séminaire sur l'entrepreneuriat", "Mémoire de fin d'études", "Archive S6"] },
            "IG": { "S1":["Introduction à l’économie", "Introduction au droit", "Comptabilité financière", "Algorithmiques", "Architecture des ordinateurs", "MS office", "Anglais technique", "Méthodologie du travail universitaire", "Logique mathématique", "Analyse I", "Archive S1"], "S2":["Comptabilité financière II", "principe de gestion", "Langage C", "Système d'exploitation", "Programation Web", "Python", "Anglais technique", "Technique de communication", "Algèbre linéaire", "Analyse II", "Archive S2"], "S3":["Comptabilité analytique I", "Stratégie d’entreprise", "Java I", "PHP-My SQL", "Conception des bases de données I", "Réseaux informatiques", "Modélisation UML MERISE", "Calcul multi-variables", "Logiciel de Calcul Scientifique", "probabilités et Statistiques", "Archive S3"], "S4":["Comptabilité analytique II", "Gestion des ресурс humaines", "Java II", "C#", "PHP Frameworks", "Gestion de projet informatique", "Théories des Graphes", "Bases de données", "Réseaux informatique II", "Compilations", "Archive S4"], "S5":["Contrôle de gestion", "Gestion financière", "Technologie DotNet", "JEE Framework", "Programmation Mobile", "Intelligence artificielle", "Bases des données avancées", "Administration des Systèmes", "Système d'Informations Géographique", "Rapport de stage de la 2ème année", "Archive S5"], "S6":["Méthodologie de recherche", "Séminaire sur l'entrepreneuriat", "Mémoire de fin d'études", "Archive S6"] },
            "MASTER_FC": {
                "S1":["Comptabilité sectorielle", "Consolidation des entreprises", "Théorie financière", "Contrôle de gestion approfondi", "Droit des sociétés", "Fiscalité approfondie", "Option 1 : Communication et développement personnel", "Option 2 : Anglais des affaires", "Archive S1"],
                "S2":["Normes comptables internationales", "Audit financier et révision des comptes", "Finance internationale", "Analyse stratégique", "Méthodes quantitatives", "Fiscalité internationale", "Option 1 : Analyse des données", "Option 2 : Théorie des marchés", "Archive S2"],
                "S3":["Comptabilité financière avancée", "Évaluation des entreprises", "Finance des marchés", "Stratégie d’entreprises", "Séries temporelles", "Option 1 : Droit pénal des affaires", "Option 2 : Méthodologie de recherche", "Archive S3"],
                "S4":["Mémoire ou Stage de Fin d’Études", "Archive S4"]
            },
            "MASTER_IG": {
                "S1":["Systèmes", "Algo et structure de données", "Réseaux avancés", "PROJETS Python", "Anglais", "Gestion des entreprises", "Java avancé", "Comptabilité et États Financiers", "Archive S1"],
                "S2":["Architecture et Administration des SGBD", "Recherche Opérationnelle", "Contrôle de Gestion", "Communication et Rédaction", "Génie Logiciel", "JEE", "Comptabilité et États Financiers", "Archive S2"],
                "S3":["Archive S3"],
                "S4":["Archive S4"]
            }
        };

        // ================== نظام إحصائيات الدقيق والفريد للمتصفح ==================
        // ================== نظام إحصائيات الدقيق والفريد للمتصفح ==================
        // معرّف ثابت للجهاز يُستخدم لاحتساب الزوار الفريدين بدقة (لا يعتمد على الحقول النصية)
        function getUnemVisitorId() {
            try {
                let v = localStorage.getItem('unem_visitor_id');
                if (!v) {
                    v = (window.crypto && crypto.randomUUID)
                        ? crypto.randomUUID()
                        : 'v-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
                    localStorage.setItem('unem_visitor_id', v);
                }
                return v;
            } catch (e) {
                return 'anon-' + Math.random().toString(36).slice(2, 10);
            }
        }

        // إدراج آمن: إن لم يكن عمود visitor_id موجوداً بعد في قاعدة البيانات نعيد المحاولة بدونه
        async function insertAnalyticsRow(client, row) {
            if (!client) return;
            try {
                const { error } = await client.from('analytics').insert([{ ...row, visitor_id: getUnemVisitorId() }]);
                if (error) throw error;
            } catch (e) {
                try { await client.from('analytics').insert([row]); } catch (e2) {}
            }
        }

        async function logSupabaseAnalytics(actionType, actionDetail) {
            if (!supabaseClient) return;
            
            try {
                // ===== ضمان تسجيل "زيارة الموقع" قبل أي حدث آخر =====
                // إذا كان الحدث ليس زيارة موقع، ولم يُسجَّل للمستخدم زيارة بعد،
                // نسجّل زيارة فريدة أولاً حتى لا يتجاوز عدد النتائج عدد الزيارات.
                if (actionType !== 'زيارة الموقع' && !localStorage.getItem('unem_has_visited')) {
                    localStorage.setItem('unem_has_visited', 'true');
                    await insertAnalyticsRow(supabaseClient, {
                        action_type: 'زيارة الموقع',
                        action_detail: 'تلقائي - ' + (actionDetail || actionType)
                    });
                }

                let isFirstTime = false;

                if (actionType === 'زيارة الموقع') {
                    if (!localStorage.getItem('unem_has_visited')) {
                        localStorage.setItem('unem_has_visited', 'true');
                        isFirstTime = true;
                    }
                } 
                else if (actionType === 'دخول تخصص') {
                    let loggedSpecs = JSON.parse(localStorage.getItem('unem_logged_specs') || '[]');
                    if (!loggedSpecs.includes(actionDetail)) {
                        loggedSpecs.push(actionDetail);
                        localStorage.setItem('unem_logged_specs', JSON.stringify(loggedSpecs));
                        isFirstTime = true;
                    }
                }
                else if (actionType === 'دخول مستوى') {
                    let loggedLevels = JSON.parse(localStorage.getItem('unem_logged_levels') || '[]');
                    if (!loggedLevels.includes(actionDetail)) {
                        loggedLevels.push(actionDetail);
                        localStorage.setItem('unem_logged_levels', JSON.stringify(loggedLevels));
                        isFirstTime = true;
                    }
                }
                else if (actionType === 'دخول قسم') {
                    let loggedSections = JSON.parse(localStorage.getItem('unem_logged_sections') || '[]');
                    if (!loggedSections.includes(actionDetail)) {
                        loggedSections.push(actionDetail);
                        localStorage.setItem('unem_logged_sections', JSON.stringify(loggedSections));
                        isFirstTime = true;
                    }
                }

                // أحداث الملفات يجب أن تُسجّل دائمًا بنفس النوع حتى يمكن عدّ كل فتح/تحميل بدقة.
                // لا نضع عليها لاحقة "(متكرر)" لأن كل عملية فتح أو تحميل هي تفاعل مستقل.
                const isFileInteraction = actionType === 'فتح ملف' || actionType === 'تحميل ملف';
                let finalActionType = isFileInteraction
                    ? actionType
                    : (isFirstTime ? actionType : actionType + ' (متكرر)');

                await insertAnalyticsRow(supabaseClient, { action_type: finalActionType, action_detail: actionDetail });
            } catch (e) {}
        }

        window.addEventListener('load', () => {
            logSupabaseAnalytics('زيارة الموقع', 'الصفحة الرئيسية');
            loadActiveAnnouncement();
        });

        function applyAnalyticsFilter() {
            const startDate = document.getElementById('analytics-start-date').value;
            const endDate = document.getElementById('analytics-end-date').value;
            openAnalyticsDashboard(startDate, endDate);
        }

        async function openAnalyticsDashboard(startDate = null, endDate = null) {
            if(!hasPermission('view_analytics')){
                alert('❌ ليست لديك الصلاحية لعرض الإحصائيات.');
                return;
            }
            document.getElementById('upload-modal-overlay').classList.add('hidden');
            document.getElementById('analytics-overlay').classList.remove('hidden');
            const errDiv = document.getElementById('analytics-error');
            errDiv.classList.add('hidden');

            if (!supabaseClient) { 
                errDiv.textContent = "لم يتم الاتصال بقاعدة البيانات!"; 
                errDiv.classList.remove('hidden'); 
                return; 
            }

            try {
                if (!startDate && !endDate) {
                    document.getElementById('analytics-start-date').value = '';
                    document.getElementById('analytics-end-date').value = '';
                }

                ['stat-visits','stat-results','stat-today','stat-downloads','stat-searches','stat-events'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = '...';
                });

                let allData = [];
                let from = 0;
                const batchSize = 1000; 
                let keepFetching = true;

                while (keepFetching) {
                    let query = supabaseClient
                        .from('analytics')
                        .select('*')
                        .order('created_at', { ascending: false });

                    if (startDate) query = query.gte('created_at', startDate + 'T00:00:00.000Z');
                    if (endDate) query = query.lte('created_at', endDate + 'T23:59:59.999Z');

                    query = query.range(from, from + batchSize - 1);

                    const { data, error } = await query;
                    if (error) throw error;

                    allData = allData.concat(data);

                    if (data.length < batchSize) {
                        keepFetching = false;
                    } else {
                        from += batchSize;
                    }
                }

                /* ================= احتساب دقيق ومستقر =================
                   القاعدة: كل زائر يُحسب مرة واحدة عبر معرّف جهازه (visitor_id).
                   الصفوف القديمة بلا معرّف: تُحسب مرة واحدة عبر معرّف الصف غير المتكرر.
                   كل مجموعة قسم هي مجموعة جزئية من مجموعة الزوار الكلية،
                   لذلك يستحيل أن يتجاوز أي قسم إجمالي الزوار.
                ======================================================= */
                const visitorKey = (row) => {
                    if (row.visitor_id) return 'v:' + row.visitor_id;
                    if (!String(row.action_type || '').includes('(متكرر)')) return 'l:' + row.id;
                    return null; // صف متكرر قديم: لا يُحتسب في التفرّد
                };
                const baseType = (row) => String(row.action_type || '').replace(' (متكرر)', '').trim();

                const allVisitors = new Set();
                const resultsVisitors = new Set();
                const todayVisitors = new Set();
                const dailyVisitorSets = {};
                const dailyResultSets = {};
                const specVisitorSets = {};
                const levelVisitorSets = {};
                const fileCounts = {};
                let downloadEvents = 0;
                let searchEvents = 0;

                const todayStr = new Date().toISOString().split('T')[0];
                const addTo = (store, key, visitor) => {
                    if (!key) return;
                    if (!store[key]) store[key] = new Set();
                    if (visitor) store[key].add(visitor);
                };

                allData.forEach(row => {
                    const dateStr = String(row.created_at).split('T')[0];
                    const type = baseType(row);
                    const key = visitorKey(row);

                    if (key) {
                        allVisitors.add(key);
                        addTo(dailyVisitorSets, dateStr, key);
                        if (dateStr === todayStr) todayVisitors.add(key);
                    }

                    if (type === 'دخول قسم' && row.action_detail === 'النتائج') {
                        if (key) { resultsVisitors.add(key); addTo(dailyResultSets, dateStr, key); }
                    }
                    if (type === 'دخول تخصص' && row.action_detail) addTo(specVisitorSets, row.action_detail, key);
                    if (type === 'دخول مستوى' && row.action_detail) addTo(levelVisitorSets, row.action_detail, key);
                    if (type === 'تحميل ملف' || type === 'فتح ملف') {
                        downloadEvents++;
                        const name = row.action_detail || 'ملف غير معروف';
                        fileCounts[name] = (fileCounts[name] || 0) + 1;
                    }
                    if (type === 'بحث') searchEvents++;
                });

                const setsToCounts = (store, sortKeys) => {
                    const keys = Object.keys(store);
                    keys.sort(sortKeys ? undefined : (a, b) => store[b].size - store[a].size);
                    if (sortKeys) keys.sort();
                    const out = {};
                    keys.forEach(k => { out[k] = store[k].size; });
                    return out;
                };

                const displayedVisits = allVisitors.size;
                const uniqueResults = Math.min(resultsVisitors.size, displayedVisits);
                const sortedDailyVisits = setsToCounts(dailyVisitorSets, true);
                const sortedDailyResults = setsToCounts(dailyResultSets, true);
                const specCountsTotal = setsToCounts(specVisitorSets);
                const levelCountsTotal = setsToCounts(levelVisitorSets);

                document.getElementById('stat-visits').textContent = displayedVisits.toLocaleString('en-US');
                document.getElementById('stat-results').textContent = uniqueResults.toLocaleString('en-US');
                document.getElementById('stat-today').textContent = todayVisitors.size.toLocaleString('en-US');
                document.getElementById('stat-downloads').textContent = downloadEvents.toLocaleString('en-US');
                document.getElementById('stat-searches').textContent = searchEvents.toLocaleString('en-US');
                document.getElementById('stat-events').textContent = allData.length.toLocaleString('en-US');

                // جدول أكثر الملفات تفاعلاً
                const topFiles = Object.keys(fileCounts)
                    .sort((a, b) => fileCounts[b] - fileCounts[a])
                    .slice(0, 10)
                    .map(name => ({ name, count: fileCounts[name] }));
                renderTopFilesTable(topFiles);

                renderAnalyticsChart('dailyVisitsChart', 'line', 'الزوار الفريدون يومياً', sortedDailyVisits);
                renderAnalyticsChart('dailyResultsChart', 'line', 'زوار قسم النتائج يومياً', sortedDailyResults);
                renderAnalyticsChart('specChart', 'pie', 'التخصصات (زوار فريدون)', specCountsTotal);
                renderAnalyticsChart('levelChart', 'doughnut', 'المستويات (زوار فريدون)', levelCountsTotal);

                // حفظ البيانات لاستخدامها عند تصدير الصورة
                window.__lastStatsData = {
                    startDate, endDate,
                    displayedVisits, uniqueResults,
                    todayVisitors: todayVisitors.size,
                    downloadEvents, searchEvents,
                    totalEvents: allData.length,
                    topFiles,
                    specCountsTotal, levelCountsTotal,
                    dailyVisitsTotal: sortedDailyVisits,
                    dailyResultsTotal: sortedDailyResults
                };

            } catch(e) {
                console.error(e);
                errDiv.textContent = "حدث خطأ أثناء جلب البيانات أو أن الجدول (analytics) غير موجود.";
                errDiv.classList.remove('hidden');
            }
        }

        function renderTopFilesTable(rows) {
            const box = document.getElementById('top-files-body');
            if (!box) return;
            if (!rows || rows.length === 0) {
                box.innerHTML = '<tr><td colspan="3" style="padding:14px; text-align:center; color:var(--text-secondary); font-weight:700;">لا توجد بيانات في هذه الفترة</td></tr>';
                return;
            }
            box.innerHTML = rows.map((r, i) => (
                '<tr>' +
                '<td style="padding:10px 12px; border-bottom:1px solid var(--border-color); font-weight:800; color:var(--primary-color);">' + (i + 1) + '</td>' +
                '<td style="padding:10px 12px; border-bottom:1px solid var(--border-color); font-weight:700; word-break:break-word;">' + String(r.name).replace(/[<>&]/g, '') + '</td>' +
                '<td style="padding:10px 12px; border-bottom:1px solid var(--border-color); font-weight:800; text-align:center;">' + r.count + '</td>' +
                '</tr>'
            )).join('');
        }

        let activeCharts = {};
        function renderAnalyticsChart(canvasId, type, label, dataObj) {
            const ctx = document.getElementById(canvasId).getContext('2d');
            if (activeCharts[canvasId]) activeCharts[canvasId].destroy();

            const labels = Object.keys(dataObj);
            const dataVals = Object.values(dataObj);

            let dataset = {
                label: label,
                data: dataVals,
                borderWidth: 1
            };

            if (type === 'line') {
                dataset.borderColor = '#15803d'; 
                dataset.backgroundColor = 'rgba(21,128,61,0.22)';
                dataset.fill = true;
                dataset.tension = 0.35;
                dataset.borderWidth = 4;
                dataset.pointBackgroundColor = '#15803d';
                dataset.pointBorderColor = '#052e16';
                dataset.pointBorderWidth = 1.5;
                dataset.pointRadius = 4;
                dataset.pointHoverRadius = 6;
            } else {
                dataset.backgroundColor = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#8AC926', '#1982C4', '#F15BB5', '#00BBF9'];
            }

            activeCharts[canvasId] = new Chart(ctx, {
                type: type,
                data: {
                    labels: labels,
                    datasets: [dataset]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { font: { family: 'Tajawal', size: 14, weight: 'bold' } } },
                        tooltip: {
                            titleFont: { family: 'Tajawal', size: 16 },
                            bodyFont: { family: 'Tajawal', size: 16, weight: 'bold' },
                            padding: 12,
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) { label += ': '; }
                                    if (context.parsed.y !== undefined) { 
                                        label += context.parsed.y + (type === 'line' ? ' زيارة' : ' (زيارة)'); 
                                    } else if (context.parsed !== null) { 
                                        label += context.parsed + ' (زيارة)'; 
                                    }
                                    return label;
                                }
                            }
                        }
                    },
                    scales: type === 'line' ? {
                        y: { beginAtZero: true, ticks: { color: '#0f172a', font: { family: 'Tajawal', weight: 'bold', size: 13 } }, grid: { color: 'rgba(15,23,42,0.12)' } },
                        x: { ticks: { color: '#0f172a', font: { family: 'Tajawal', weight: 'bold', size: 12 } }, grid: { color: 'rgba(15,23,42,0.08)' } }
                    } : {} 
                }
            });
        }

        async function openTopFilesPage() {
            if (!hasPermission('view_analytics')) { alert('❌ ليست لديك صلاحية عرض إحصاءات الملفات.'); return; }
            document.getElementById('top-files-overlay')?.classList.remove('hidden');
            const err=document.getElementById('top-files-page-error');
            if(err) err.classList.add('hidden');
            await loadTopFilesPage();
        }

        function closeTopFilesPage() {
            document.getElementById('top-files-overlay')?.classList.add('hidden');
            document.getElementById('admin-dashboard-overlay')?.classList.remove('hidden');
            adminDashHome();
        }

        async function loadTopFilesPage() {
            if (!supabaseClient) return;
            const body=document.getElementById('top-files-page-body');
            const err=document.getElementById('top-files-page-error');
            if(err) err.classList.add('hidden');
            if(body) body.innerHTML='<tr><td colspan="5" style="padding:20px;text-align:center;font-weight:800;">⏳ جاري تحميل البيانات...</td></tr>';
            try {
                const start=document.getElementById('top-files-start-date')?.value || '';
                const end=document.getElementById('top-files-end-date')?.value || '';
                let all=[]; let from=0; const batch=1000;
                while(true){
                    // دعم السجلات القديمة التي أضيفت لها لاحقة "(متكرر)"، مع السجلات الجديدة.
                    let q=supabaseClient.from('analytics').select('action_type,action_detail,created_at').in('action_type',['تحميل ملف','فتح ملف','تحميل ملف (متكرر)','فتح ملف (متكرر)']).order('created_at',{ascending:false}).range(from,from+batch-1);
                    if(start) q=q.gte('created_at',start+'T00:00:00.000Z');
                    if(end) q=q.lte('created_at',end+'T23:59:59.999Z');
                    const {data,error}=await q; if(error) throw error;
                    all=all.concat(data||[]);
                    if(!data || data.length<batch) break;
                    from+=batch;
                }
                const map={}; let opens=0,downloads=0;
                all.forEach(r=>{
                    const name=String(r.action_detail||'ملف غير معروف').trim()||'ملف غير معروف';
                    if(!map[name]) map[name]={name,open:0,download:0,total:0};
                    if(String(r.action_type||'').startsWith('فتح ملف')){map[name].open++;opens++;}
                    if(String(r.action_type||'').startsWith('تحميل ملف')){map[name].download++;downloads++;}
                    map[name].total++;
                });
                const rows=Object.values(map).sort((a,b)=>b.total-a.total||b.download-a.download||b.open-a.open).slice(0,50);
                document.getElementById('top-files-total-events').textContent=all.length.toLocaleString('en-US');
                document.getElementById('top-files-open-events').textContent=opens.toLocaleString('en-US');
                document.getElementById('top-files-download-events').textContent=downloads.toLocaleString('en-US');
                document.getElementById('top-files-unique-count').textContent=Object.keys(map).length.toLocaleString('en-US');
                if(!rows.length){body.innerHTML='<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--text-secondary);font-weight:700;">لا توجد تفاعلات مسجلة في هذه الفترة.</td></tr>';return;}
                body.innerHTML=rows.map((r,i)=>'<tr><td style="padding:11px;text-align:center;border-bottom:1px solid var(--border-color);font-weight:900;color:var(--primary-color);">'+(i+1)+'</td><td style="padding:11px;border-bottom:1px solid var(--border-color);font-weight:800;word-break:break-word;">'+String(r.name).replace(/[<>&]/g,'')+'</td><td style="padding:11px;text-align:center;border-bottom:1px solid var(--border-color);font-weight:800;color:#15803d;">'+r.open+'</td><td style="padding:11px;text-align:center;border-bottom:1px solid var(--border-color);font-weight:800;color:#c2410c;">'+r.download+'</td><td style="padding:11px;text-align:center;border-bottom:1px solid var(--border-color);font-weight:900;">'+r.total+'</td></tr>').join('');
            } catch(e) {
                console.error('top files analytics',e);
                if(body) body.innerHTML='<tr><td colspan="5" style="padding:20px;text-align:center;color:#b91c1c;font-weight:800;">تعذر تحميل البيانات.</td></tr>';
                if(err){err.textContent='❌ تعذر قراءة تحليلات الملفات من قاعدة البيانات.';err.classList.remove('hidden');}
            }
        }

        function closeAnalyticsDashboard() {
            document.getElementById('analytics-overlay').classList.add('hidden');
            document.getElementById('upload-modal-overlay').classList.remove('hidden');
        }
function closeAnalyticsDashboard() {
    document.getElementById('analytics-overlay').classList.add('hidden');
    document.getElementById('upload-modal-overlay').classList.remove('hidden');
}

        // ================== تصدير صورة احترافية للإحصائيات ==================
        async function downloadStatsImage() {
            const d = window.__lastStatsData;
            if (!d) { alert('لا توجد بيانات للتصدير، الرجاء الانتظار حتى تحميل الإحصائيات.'); return; }

            const btn = event && event.currentTarget;
            const oldHtml = btn ? btn.innerHTML : '';
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحضير...'; }

            // اختيار المشرف: هل يضيف تذييلاً باسمه؟
            const adminName = 'Mohamed Dah Agove (MDA)';
            const includeAdminFooter = confirm(`هل تريد إضافة تذييل باسم المشرف؟\n\n${adminName}\n\nاضغط "موافق" للإضافة أو "إلغاء" لتنزيل الصورة بدون تذييل.`);

            try {
                // ====== أبعاد منطقية + تكبير ×2 للجودة العالية ======
                const SCALE = 2;
                const W = 1600, H = 2100;
                const extraFooter = includeAdminFooter ? 70 : 0;
                const totalH = H + extraFooter;
                const canvas = document.createElement('canvas');
                canvas.width = W * SCALE; canvas.height = totalH * SCALE;
                const ctx = canvas.getContext('2d');
                ctx.scale(SCALE, SCALE);
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';

                // خلفية متدرجة
                const bgGrad = ctx.createLinearGradient(0, 0, 0, totalH);
                bgGrad.addColorStop(0, '#f0fdf4');
                bgGrad.addColorStop(1, '#dcfce7');
                ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, W, totalH);

                // شريط علوي (أصفر)
                const headGrad = ctx.createLinearGradient(0, 0, W, 0);
                headGrad.addColorStop(0, '#0f5132');
                headGrad.addColorStop(1, '#157347');
                ctx.fillStyle = headGrad; ctx.fillRect(0, 0, W, 200);

                // عنوان UNEM ISCAE
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 70px "Segoe UI", Tahoma, Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('UNEM ISCAE', W/2, 90);

                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 38px "Segoe UI", Tahoma, Arial, sans-serif';
                ctx.fillText('تقرير إحصائيات الموقع', W/2, 145);

                ctx.font = '26px "Segoe UI", Tahoma, Arial, sans-serif';
                ctx.fillStyle = '#e6f4ea';
                ctx.fillText('https://unem-iscae.vercel.app/', W/2, 185);

                // معلومات الفترة وتاريخ التوليد
                ctx.textAlign = 'right';
                ctx.fillStyle = '#334155';
                ctx.font = 'bold 28px "Segoe UI", Tahoma, Arial, sans-serif';
                const period = (d.startDate || d.endDate)
                    ? `الفترة: من ${d.startDate || '—'} إلى ${d.endDate || '—'}`
                    : 'الإحصائيات العامة (كل الفترات)';
                ctx.fillText(period, W - 60, 260);

                ctx.textAlign = 'left';
                ctx.font = '24px "Segoe UI", Tahoma, Arial, sans-serif';
                ctx.fillStyle = '#64748b';
                const now = new Date();
                const genDate = now.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
                ctx.fillText('تاريخ التوليد: ' + genDate, 60, 260);

                // دالة رسم بطاقة
                function drawCard(x, y, w, h, title, value, color) {
                    ctx.fillStyle = '#ffffff';
                    ctx.strokeStyle = '#bbf7d0';
                    ctx.lineWidth = 2;
                    roundRect(ctx, x, y, w, h, 20, true, true);
                    ctx.fillStyle = color;
                    roundRect(ctx, x, y, 12, h, 6, true, false);
                    ctx.textAlign = 'center';
                    ctx.fillStyle = color;
                    ctx.font = 'bold 80px "Segoe UI", Tahoma, Arial, sans-serif';
                    ctx.fillText(String(value), x + w/2, y + h/2 + 10);
                    ctx.fillStyle = '#475569';
                    ctx.font = 'bold 26px "Segoe UI", Tahoma, Arial, sans-serif';
                    ctx.fillText(title, x + w/2, y + h - 30);
                }

                function roundRect(ctx, x, y, w, h, r, fill, stroke) {
                    ctx.beginPath();
                    ctx.moveTo(x+r, y);
                    ctx.arcTo(x+w, y, x+w, y+h, r);
                    ctx.arcTo(x+w, y+h, x, y+h, r);
                    ctx.arcTo(x, y+h, x, y, r);
                    ctx.arcTo(x, y, x+w, y, r);
                    ctx.closePath();
                    if (fill) ctx.fill();
                    if (stroke) ctx.stroke();
                }

                // بطاقات المؤشرات الدقيقة
                drawCard(80, 300, 340, 220, 'الزوار الفريدون', d.displayedVisits, '#0f5132');
                drawCard(450, 300, 340, 220, 'زوار النتائج', d.uniqueResults, '#15803d');
                drawCard(820, 300, 340, 220, 'زوار اليوم', d.todayVisitors ?? 0, '#0ea5e9');
                drawCard(1190, 300, 330, 220, 'الأحداث المسجلة', d.totalEvents ?? 0, '#b45309');

                // عنوان قسم الرسوم
                ctx.fillStyle = '#0f5132';
                ctx.textAlign = 'right';
                ctx.font = 'bold 32px "Segoe UI", Tahoma, Arial, sans-serif';
                ctx.fillText('الرسوم البيانية', W - 80, 580);

                // إدراج صور المخططات (بدون "شامل المتكرر")
                const chartIds = [
                    {id: 'dailyVisitsChart', title: 'الزوار الفريدون يومياً'},
                    {id: 'dailyResultsChart', title: 'زوار قسم النتائج يومياً'},
                    {id: 'specChart', title: 'التخصصات'},
                    {id: 'levelChart', title: 'المستويات'}
                ];

                const cw = 700, ch = 480;
                const positions = [
                    [80, 620], [820, 620],
                    [80, 1140], [820, 1140]
                ];

                // إنشاء نسخ نظيفة ومستقلة من المخططات للتصدير فقط.
                // هذا يلغي جذرياً أي tooltip أو hover عالق مثل L1، ولا يعتمد على حالة المخطط المعروض في الشاشة.
                if (document.fonts && document.fonts.ready) {
                    try { await document.fonts.ready; } catch(_) {}
                }

                async function createCleanChartSnapshot(canvasId, width, height) {
                    const srcChart = activeCharts[canvasId];
                    const fallbackCanvas = document.getElementById(canvasId);
                    if (!srcChart || !window.Chart) return { canvas: fallbackCanvas, destroy: function(){} };

                    const ratio = 2;
                    const snapCanvas = document.createElement('canvas');
                    snapCanvas.width = Math.round(width * ratio);
                    snapCanvas.height = Math.round(height * ratio);
                    snapCanvas.style.width = width + 'px';
                    snapCanvas.style.height = height + 'px';

                    const clonedData = {
                        labels: Array.from(srcChart.data.labels || []),
                        datasets: (srcChart.data.datasets || []).map(ds => ({
                            label: ds.label,
                            data: Array.from(ds.data || []),
                            backgroundColor: Array.isArray(ds.backgroundColor) ? Array.from(ds.backgroundColor) : ds.backgroundColor,
                            borderColor: ds.borderColor,
                            borderWidth: ds.borderWidth,
                            fill: ds.fill,
                            tension: ds.tension,
                            pointBackgroundColor: ds.pointBackgroundColor,
                            pointBorderColor: ds.pointBorderColor,
                            pointBorderWidth: ds.pointBorderWidth,
                            pointRadius: ds.pointRadius,
                            pointHoverRadius: 0,
                            hoverOffset: 0
                        }))
                    };

                    const chartType = srcChart.config.type;
                    const isLine = chartType === 'line';
                    const cleanChart = new Chart(snapCanvas.getContext('2d'), {
                        type: chartType,
                        data: clonedData,
                        options: {
                            responsive: false,
                            maintainAspectRatio: false,
                            animation: false,
                            events: [],
                            devicePixelRatio: 1,
                            hover: { mode: null },
                            layout: { padding: 12 },
                            plugins: {
                                legend: { position: 'bottom', labels: { color: '#0f172a', font: { family: 'Tajawal, Segoe UI, Tahoma, Arial, sans-serif', size: 26, weight: 'bold' } } },
                                tooltip: { enabled: false }
                            },
                            scales: isLine ? {
                                y: { beginAtZero: true, ticks: { color: '#0f172a', font: { family: 'Tajawal, Segoe UI, Tahoma, Arial, sans-serif', weight: 'bold', size: 22 } }, grid: { color: 'rgba(15,23,42,0.12)' } },
                                x: { ticks: { color: '#0f172a', font: { family: 'Tajawal, Segoe UI, Tahoma, Arial, sans-serif', weight: 'bold', size: 20 } }, grid: { color: 'rgba(15,23,42,0.08)' } }
                            } : {}
                        }
                    });

                    try { cleanChart.setActiveElements([]); } catch(_) {}
                    if (cleanChart.tooltip) {
                        try { cleanChart.tooltip.setActiveElements([], { x: -9999, y: -9999 }); } catch(_) {}
                    }
                    cleanChart.update('none');
                    cleanChart.draw();
                    await new Promise(r => requestAnimationFrame(r));
                    return { canvas: snapCanvas, destroy: function(){ try { cleanChart.destroy(); } catch(_) {} } };
                }

                for (let i = 0; i < chartIds.length; i++) {
                    const c = document.getElementById(chartIds[i].id);
                    const [px, py] = positions[i];
                    ctx.fillStyle = '#ffffff';
                    ctx.strokeStyle = '#bbf7d0'; ctx.lineWidth = 2;
                    roundRect(ctx, px, py, cw, ch, 20, true, true);
                    ctx.fillStyle = '#0f5132';
                    ctx.textAlign = 'center';
                    ctx.font = 'bold 24px "Segoe UI", Tahoma, Arial, sans-serif';
                    ctx.fillText(chartIds[i].title, px + cw/2, py + 40);
                    if (c) {
                        try {
                            const innerW = cw - 40, innerH = ch - 80;
                            const snap = await createCleanChartSnapshot(chartIds[i].id, innerW, innerH);
                            const sourceCanvas = snap.canvas || c;
                            const cr = sourceCanvas.width / sourceCanvas.height;
                            let dw = innerW, dh = innerW / cr;
                            if (dh > innerH) { dh = innerH; dw = innerH * cr; }
                            const dx = px + (cw - dw)/2;
                            const dy = py + 60 + (innerH - dh)/2;
                            ctx.drawImage(sourceCanvas, dx, dy, dw, dh);
                            snap.destroy();
                        } catch(e) { console.warn('chart draw fail', e); }
                    }
                }

                // تذييل أساسي
                ctx.fillStyle = '#0f5132';
                ctx.fillRect(0, H - 90, W, 90);
                ctx.textAlign = 'center';
                ctx.font = 'bold 28px "Segoe UI", Tahoma, Arial, sans-serif';
                // رسم "UNEM ISCAE • " بالأصفر و URL بالأزرق على نفس السطر
                {
                    const prefix = 'UNEM ISCAE • ';
                    const url = 'https://unem-iscae.vercel.app/';
                    const wPrefix = ctx.measureText(prefix).width;
                    const wUrl = ctx.measureText(url).width;
                    const total = wPrefix + wUrl;
                    const startX = (W - total) / 2;
                    ctx.textAlign = 'left';
                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(prefix, startX, H - 50);
                    ctx.fillStyle = '#60a5fa';
                    ctx.fillText(url, startX + wPrefix, H - 50);
                    // تسطير للرابط لتمييزه
                    ctx.strokeStyle = '#60a5fa';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(startX + wPrefix, H - 42);
                    ctx.lineTo(startX + wPrefix + wUrl, H - 42);
                    ctx.stroke();
                    ctx.textAlign = 'center';
                }
                ctx.fillStyle = '#e6f4ea';
                ctx.font = '20px "Segoe UI", Tahoma, Arial, sans-serif';
                ctx.fillText('© ' + now.getFullYear() + ' — جميع الحقوق محفوظة', W/2, H - 20);

                // تذييل المشرف (اختياري)
                if (includeAdminFooter) {
                    ctx.fillStyle = '#0f5132';
                    ctx.fillRect(0, H, W, extraFooter);
                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'center';
                    ctx.font = 'bold 26px "Segoe UI", Tahoma, Arial, sans-serif';
                    ctx.fillText('إعداد المشرف: ' + adminName, W/2, H + 44);
                }

                // تنزيل بجودة عالية
                const suffix = (d.startDate || d.endDate)
                    ? `${d.startDate || 'بداية'}_الى_${d.endDate || 'اليوم'}`
                    : 'عامة';
                const link = document.createElement('a');
                link.download = `UNEM_ISCAE_احصائيات_${suffix}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
            } catch(err) {
                console.error(err);
                alert('فشل توليد الصورة: ' + err.message);
            } finally {
                if (btn) { btn.disabled = false; btn.innerHTML = oldHtml; }
            }
        }


        let tapCount = 0; let tapTimer;
        document.getElementById('copyright-year').addEventListener('click', () => {
            tapCount++; clearTimeout(tapTimer); 
            if (tapCount === 5) { document.getElementById('admin-login-overlay').classList.remove('hidden'); tapCount = 0; }
            tapTimer = setTimeout(() => { tapCount = 0; }, 1000);
        });

        async function adminLogin() {
            const email = document.getElementById('admin-email').value; const pass = document.getElementById('admin-pass').value;
            const errorMsg = document.getElementById('admin-error'); const loginBtn = document.getElementById('admin-login-btn');
            if(!email || !pass) { errorMsg.textContent = "❌ يرجى إدخال البريد وكلمة المرور."; errorMsg.classList.remove('hidden'); return; }
            if(!supabaseClient) { errorMsg.textContent = "❌ تعذر الاتصال بالخادم."; errorMsg.classList.remove('hidden'); return; }
            loginBtn.textContent = "⏳..."; loginBtn.disabled = true;
            const resetBtn = () => { loginBtn.textContent = i18n[currentLang]['btn_login']; loginBtn.disabled = false; };
            try {
                const { error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
                if (error) throw new Error('بيانات الدخول غير صحيحة.');

                // الدور يأتي من قاعدة البيانات — لا يُستنتج من البريد في الواجهة
                const role = await refreshUserRole();
                applyRoleUI();

                if (!hasAdminDashboardAccess()) {
                    await supabaseClient.auth.signOut();
                    currentUserRole = 'user'; isAdminLoggedIn = false;
                    throw new Error('❌ ليس لديك صلاحية للوصول إلى لوحة الإدارة.');
                }
                document.getElementById('admin-login-overlay').classList.add('hidden');
                errorMsg.classList.add('hidden');
                resetBtn();
                document.getElementById('admin-pass').value = '';
                logSupabaseAnalytics('دخول الإدارة', role);
                openAdminDashboard();
            } catch (e) {
                errorMsg.textContent = e.message || '❌ فشل تسجيل الدخول.';
                errorMsg.classList.remove('hidden');
                resetBtn();
            }
        }

        async function adminLogout() {
            try { if (supabaseClient) await supabaseClient.auth.signOut(); }
            catch (e) { console.error(e); }
            currentUserRole = 'user'; currentUserId = null; isAdminLoggedIn = false;
            myPermissions = {};
            syncAdminQuickAccess();
            applyRoleUI();
            closeUploadModal();
            closeAdminDashboard();
        }
        function closeAdminLogin() { document.getElementById('admin-login-overlay').classList.add('hidden'); }

        // ==================== إدارة شريط الإعلانات ====================
        let _shownAnnId = null;
        let _shownAnnUrl = null;

        async function loadActiveAnnouncement() {
            if (!supabaseClient) return;
            try {
                const now = new Date().toISOString();
                const { data } = await supabaseClient
                    .from('announcements').select('*')
                    .lte('start_date', now).gte('end_date', now)
                    .order('created_at', { ascending: false }).limit(1);
                if (!data || !data.length) return;
                const ann = data[0];
                if (String(localStorage.getItem('unem_dismissed_ann')) === String(ann.id)) return;
                _shownAnnId = ann.id;
                _shownAnnUrl = ann.link_url || null;
                document.getElementById('announcement-text').textContent = ann.message;
                const bar = document.getElementById('announcement-bar');
                const hint = document.getElementById('announcement-link-hint');
                if (_shownAnnUrl) {
                    bar.classList.add('clickable');
                    bar.onclick = function(e) { if (!e.target.classList.contains('ann-close-btn')) window.open(_shownAnnUrl, '_blank', 'noopener'); };
                    hint.style.display = 'inline';
                } else {
                    bar.classList.remove('clickable');
                    bar.onclick = null;
                    hint.style.display = 'none';
                }
                bar.classList.add('show');
            } catch(e) {}
        }

        function closeAnnouncementBar() {
            document.getElementById('announcement-bar').classList.remove('show');
            if (_shownAnnId) localStorage.setItem('unem_dismissed_ann', String(_shownAnnId));
        }

        async function loadAnnouncementsAdmin() {
            const container = document.getElementById('ann-list-container');
            if (!supabaseClient || !container) return;
            const loadMsg = document.getElementById('ann-loading-msg');
            try {
                const { data } = await supabaseClient.from('announcements').select('*').order('created_at', { ascending: false });
                if (loadMsg) loadMsg.style.display = 'none';
                if (!data || !data.length) {
                    container.innerHTML = '<p style="text-align:center;color:var(--text-secondary);font-size:0.85rem;font-weight:700;">لا توجد إعلانات حالياً.</p>';
                    return;
                }
                const now = new Date();
                container.innerHTML = data.map(ann => {
                    const active = new Date(ann.start_date) <= now && new Date(ann.end_date) >= now;
                    const badge = active
                        ? '<span class="ann-active-badge">نشط</span>'
                        : '<span class="ann-active-badge ann-expired-badge">منتهي</span>';
                    const s = new Date(ann.start_date).toLocaleString('ar-MA');
                    const e = new Date(ann.end_date).toLocaleString('ar-MA');
                    const linkLine = ann.link_url ? `<div class="ann-link-tag">🔗 ${ann.link_url}</div>` : '';
                    return `<div class="ann-list-item"><div style="flex:1;"><div class="ann-msg">${ann.message}${badge}</div>${linkLine}<div class="ann-dates">من: ${s} — إلى: ${e}</div></div><button class="ann-del-btn" onclick="deleteAnnouncement(${ann.id})">🗑 حذف</button></div>`;
                }).join('');
            } catch(e) { if (loadMsg) loadMsg.textContent = 'حدث خطأ في التحميل.'; }
        }

        async function saveAnnouncement() {
            const msg   = document.getElementById('ann-input-msg').value.trim();
            const url   = document.getElementById('ann-input-url').value.trim();
            const start = document.getElementById('ann-input-start').value;
            const end   = document.getElementById('ann-input-end').value;
            const status = document.getElementById('ann-status');
            if (!msg || !start || !end) { status.textContent = '⚠️ يرجى ملء نص الإعلان والتواريخ.'; status.className = 'status-msg error'; return; }
            if (new Date(start) >= new Date(end)) { status.textContent = '⚠️ تاريخ البداية يجب أن يكون قبل تاريخ الانتهاء.'; status.className = 'status-msg error'; return; }
            if (!supabaseClient) return;
            try {
                const row = { message: msg, start_date: new Date(start).toISOString(), end_date: new Date(end).toISOString() };
                if (url) row.link_url = url;
                const { error } = await supabaseClient.from('announcements').insert([row]);
                if (error) throw error;
                status.textContent = '✅ تم نشر الإعلان بنجاح!'; status.className = 'status-msg success';
                document.getElementById('ann-input-msg').value = '';
                document.getElementById('ann-input-url').value = '';
                document.getElementById('ann-input-start').value = '';
                document.getElementById('ann-input-end').value = '';
                loadAnnouncementsAdmin(); loadActiveAnnouncement();
                setTimeout(() => { status.textContent = ''; }, 4000);
            } catch(e) { status.textContent = '❌ خطأ: ' + (e.message || e); status.className = 'status-msg error'; }
        }

        async function deleteAnnouncement(id) {
            if (!confirm('هل تريد حذف هذا الإعلان؟')) return;
            if (!supabaseClient) return;
            await supabaseClient.from('announcements').delete().eq('id', id);
            loadAnnouncementsAdmin(); loadActiveAnnouncement();
        }

        /* =====================================================================
           إشعارات Push حقيقية — الاشتراك من طرف الزائر + الإرسال من طرف المشرف
           تصل هذه الإشعارات حتى لو كان المتصفح/الموقع مغلقاً (عبر Service Worker)
           ===================================================================== */
        function urlBase64ToUint8Array(base64String) {
            const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
            const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
            const rawData = atob(base64);
            const output = new Uint8Array(rawData.length);
            for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
            return output;
        }

        // Android WebView لا يوفّر Push API أو Notifications API حتى عند توفر Service Worker.
        // نُبقي Web Push الأصلي للمتصفحات المدعومة، ونستخدم الجسر الأصلي لفتح Chrome
        // من داخل تطبيق Android بدل إظهار رسالة دعم غير صحيحة للمستخدم.
        function isAndroidWebView() {
            const ua = navigator.userAgent || '';
            return /Android/i.test(ua) &&
                (/[; ]wv\)/i.test(ua) || /AndroidWebView/i.test(ua) || /UNEMISCAE-Android/i.test(ua));
        }

        function webPushSupported() {
            return 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';
        }

        // أصل غير آمن (content:// أو file:// عند فتح نسخة محفوظة على الجهاز) لا يمكنه تسجيل
        // Service Worker أبداً، فتبقى navigator.serviceWorker.ready معلّقة للأبد دون أي خطأ.
        function unemPushOriginOk() {
            return typeof window.isSecureContext !== 'undefined'
                ? (window.isSecureContext && /^https?:$/.test(location.protocol))
                : /^https?:$/.test(location.protocol);
        }

        /** يعيد تسجيل Service Worker الجاهز، أو null بعد مهلة قصوى — بدل الانتظار للأبد. */
        async function getPushServiceWorker() {
            if (!('serviceWorker' in navigator) || !unemPushOriginOk()) return null;
            try {
                const timeout = new Promise(resolve => setTimeout(() => resolve(null), 8000));
                const ready = navigator.serviceWorker.ready.then(reg => reg).catch(() => null);
                return await Promise.race([ready, timeout]);
            } catch (_) { return null; }
        }

        function nativeFcmSupported() {
            return isAndroidWebView() && window.AndroidNotifications &&
                typeof window.AndroidNotifications.requestNotificationPermission === 'function' &&
                typeof window.AndroidNotifications.isNotificationPermissionGranted === 'function';
        }

        function pushSupported() {
            return webPushSupported() || nativeFcmSupported();
        }

        function openPushInSupportedBrowser() {
            if (!isAndroidWebView() || !window.AndroidNotifications ||
                typeof window.AndroidNotifications.openPushInBrowser !== 'function') return false;
            window.AndroidNotifications.openPushInBrowser();
            return true;
        }

        function setPushIcon(active) {
            const icon = document.getElementById('push-toggle-icon');
            const btn = document.getElementById('push-toggle-btn');
            if (!icon || !btn) return;
            icon.className = active ? 'fas fa-bell' : 'fas fa-bell-slash';
            btn.classList.toggle('active', !!active);
        }

        /** يعكس حالة الاشتراك الفعلية في الأيقونة عند تحميل الصفحة */
        async function initPushUI() {
            const btn = document.getElementById('push-toggle-btn');
            if (!webPushSupported()) {
                // داخل تطبيق Android لا نعرض زر Web Push؛ FCM الأصلي يعمل من النظام.
                if (btn) btn.style.display = 'none';
                return;
            }
            try {
                const reg = await getPushServiceWorker();
                if (!reg) { setPushIcon(false); return; }
                const sub = await reg.pushManager.getSubscription();
                const active = !!sub && Notification.permission === 'granted';
                setPushIcon(active);
                // إعادة مزامنة تلقائية: من فعّل الإشعارات سابقاً ولم يُسجَّل في القاعدة يُضاف الآن
                if (active) {
                    const saved = await savePushSubscriptionToDb(sub);
                    if (!saved.ok) console.warn('push sync failed:', saved.message);
                }
            } catch (e) { setPushIcon(false); }
        }

        async function subscribeToPush() {
            if (!webPushSupported()) return false;
            if (!unemPushOriginOk()) {
                throw new Error('الإشعارات تعمل فقط عند فتح المنصة عبر رابطها الرسمي (https)، لا من نسخة محفوظة على الجهاز.');
            }
            const reg = await getPushServiceWorker();
            if (!reg) {
                throw new Error('تعذّر تجهيز خدمة الإشعارات في هذا المتصفح. أعد تحميل الصفحة من الرابط الرسمي ثم حاول مجدداً.');
            }
            const res = await fetch(unemApi('/api/public/push/vapid-key'));
            const data = await res.json().catch(() => ({}));
            if (!data || !data.publicKey) {
                alert('❌ الإشعارات غير مفعّلة على الخادم حالياً.');
                return false;
            }
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') return false;

            let sub = await reg.pushManager.getSubscription();
            if (!sub) {
                sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(data.publicKey),
                });
            }
            const saved = await savePushSubscriptionToDb(sub);
            if (!saved.ok) {
                alert('❌ تعذّر تسجيل جهازك في قاعدة بيانات الإشعارات: ' + saved.message);
                return false;
            }
            localStorage.setItem('unem_push_enabled', '1');
            return true;
        }

        /** يحفظ اشتراك المتصفح في قاعدة البيانات (مع إظهار الخطأ بدل تجاهله) */
        async function savePushSubscriptionToDb(sub) {
            if (!supabaseClient) {
                return { ok: false, message: 'قاعدة البيانات غير متصلة.' };
            }

            try {
                const json = sub.toJSON();
                const endpoint = json.endpoint;
                const p256dh = json.keys?.p256dh;
                const auth = json.keys?.auth;
                const userAgent = navigator.userAgent;

                if (!endpoint || !p256dh || !auth) {
                    return { ok: false, message: 'بيانات اشتراك الإشعارات غير مكتملة.' };
                }

                // حفظ الاشتراك عبر RPC آمنة بدل الكتابة المباشرة إلى الجدول.
                // هذا يعمل للزائر anon وللمستخدم authenticated.
                const { data, error } = await supabaseClient.rpc(
                    'save_push_subscription',
                    {
                        p_endpoint: endpoint,
                        p_p256dh: p256dh,
                        p_auth: auth,
                        p_user_agent: userAgent
                    }
                );

                if (error) {
                    console.error('save_push_subscription RPC error:', error);
                    return { ok: false, message: error.message || 'تعذر حفظ اشتراك الإشعارات.' };
                }

                return { ok: true, id: data };
            } catch (e) {
                console.error('Push subscription save error:', e);
                return { ok: false, message: (e && e.message) || String(e) };
            }
        }

        async function unsubscribeFromPush() {
            try {
                const reg = await getPushServiceWorker();
                const sub = reg ? await reg.pushManager.getSubscription() : null;

                if (sub) {
                    const endpoint = sub.endpoint;

                    // إلغاء اشتراك المتصفح أولاً.
                    await sub.unsubscribe();

                    // حذف السجل عبر RPC بدل DELETE المباشر الذي تمنعه RLS.
                    if (supabaseClient && endpoint) {
                        const { error } = await supabaseClient.rpc(
                            'remove_push_subscription',
                            { p_endpoint: endpoint }
                        );

                        if (error) {
                            console.error('remove_push_subscription RPC error:', error);
                        }
                    }
                }
            } catch (e) {
                console.error('Push unsubscribe error:', e);
            }

            localStorage.setItem('unem_push_enabled', '0');
        }

        async function togglePushNotifications() {
            // لا يُستخدم هذا الزر داخل Android WebView؛ إشعارات التطبيق تُدار عبر FCM الأصلي.
            if (!webPushSupported()) return;
            const btn = document.getElementById('push-toggle-btn');
            if (btn) btn.disabled = true;
            try {
                const reg = await getPushServiceWorker();
                const existing = reg ? await reg.pushManager.getSubscription() : null;
                if (existing && Notification.permission === 'granted') {
                    await unsubscribeFromPush();
                    setPushIcon(false);
                } else if (Notification.permission === 'denied') {
                    alert('🔕 الإشعارات محظورة من إعدادات المتصفح. فعّلها من إعدادات الموقع في المتصفح ثم أعد المحاولة.');
                } else {
                    const ok = await subscribeToPush();
                    setPushIcon(ok);
                    if (ok) alert('🔔 تم تفعيل الإشعارات! ستصلك التنبيهات الجديدة حتى خارج الموقع.');
                }
            } catch (e) {
                console.error(e);
                alert('❌ تعذر تفعيل الإشعارات: ' + (e.message || e));
            } finally { if (btn) btn.disabled = false; }
        }

        if (pushSupported()) { window.addEventListener('load', () => setTimeout(initPushUI, 800)); }

        /** لوحة المشرف: إرسال إشعار حقيقي لجميع المشتركين */
        async function sendPushNotificationAdmin() {
            if (!hasPermission('send_notifications')) return;
            const titleEl = document.getElementById('push-input-title');
            const bodyEl = document.getElementById('push-input-body');
            const urlEl = document.getElementById('push-input-url');
            const status = document.getElementById('push-status');
            const btn = document.getElementById('push-send-btn');
            const title = titleEl.value.trim();
            const body = bodyEl.value.trim();
            const url = urlEl.value.trim();

            if (!title || !body) {
                status.textContent = '❌ العنوان والنص مطلوبان.';
                status.className = 'status-msg error';
                return;
            }

            btn.disabled = true;
            status.textContent = '⏳ جاري الإرسال...';
            status.className = 'status-msg';
            try {
                const token = await getAccessToken();
                if (!token) throw new Error('انتهت الجلسة، سجّل الدخول مجدداً.');
                const res = await fetch(unemApi('/api/public/push/send'), {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ title, body, url }),
                });
                const out = await res.json().catch(() => null);
                if (!res.ok) throw new Error((out && out.error) || 'فشل إرسال الإشعار.');

                status.textContent = `✅ النتيجة: ${out.delivered || 0} نجح، ${out.expired || 0} اشتراك منتهٍ/محذوف، ${out.failed || 0} فشل تقني من أصل ${out.total || 0} (ويب: ${out.web_delivered || 0} ناجح، ${out.web_expired || 0} منتهٍ؛ Android/FCM: ${out.fcm_delivered || 0} ناجح، ${out.fcm_expired || 0} منتهٍ).` +
                    ((out.expired || 0) > 0 ? ' ℹ️ الاشتراكات المنتهية حُذفت تلقائياً من القاعدة، وسيُجدَّد اشتراك أصحابها تلقائياً عند فتحهم الموقع مرة أخرى.' : '');
                status.className = 'status-msg success';
                titleEl.value = ''; bodyEl.value = ''; urlEl.value = '';
                loadPushHistoryAdmin();
                loadPushActiveDeviceCount();
            } catch (e) {
                status.textContent = '❌ خطأ: ' + (e.message || e);
                status.className = 'status-msg error';
            } finally { btn.disabled = false; }
        }

        /**
         * يعرض أعداد اشتراكات Web Push وFCM الأصلية المسجلة حالياً.
         * لا يغيّر هذا القسم نظام الإشعارات؛ يقرأ العددين فقط للمشرف.
         */
        /**
         * يحذف اشتراكات Web Push التي لم تُحدّث منذ 90 يوماً.
         * الاشتراكات التي يرفضها مزود الإشعارات تُحذف تلقائياً من الخادم عند الإرسال.
         */
        async function cleanupExpiredPushSubscriptions() {
            if (!hasPermission('send_notifications') || !supabaseClient) return;
            const status = document.getElementById('push-status');
            try {
                if (status) { status.textContent = '⏳ جاري تنظيف الاشتراكات غير النشطة...'; status.className = 'status-msg'; }
                const { data, error } = await supabaseClient.rpc('cleanup_expired_push_subscriptions', { p_inactive_days: 90 });
                if (error) throw error;
                const removed = Number(data || 0);
                if (status) { status.textContent = `✅ تم حذف ${removed} اشتراك غير نشط (أكثر من 90 يوماً).`; status.className = 'status-msg success'; }
                loadPushActiveDeviceCount();
            } catch (e) {
                console.error('cleanupExpiredPushSubscriptions', e);
                if (status) { status.textContent = '❌ تعذر تنظيف الاشتراكات: ' + (e.message || e); status.className = 'status-msg error'; }
            }
        }
        async function loadPushActiveDeviceCount() {
            const webEl = document.getElementById('push-active-device-count');
            const fcmEl = document.getElementById('push-active-fcm-count');
            if ((!webEl && !fcmEl) || !supabaseClient || !hasPermission('send_notifications')) return;
            if (webEl) webEl.textContent = '…';
            if (fcmEl) fcmEl.textContent = '…';

            try {
                const { count, error } = await supabaseClient
                    .from('push_subscriptions')
                    .select('id', { count: 'exact', head: true });
                if (error) throw error;
                if (webEl) webEl.textContent = Number.isFinite(count) ? String(count) : '0';
            } catch (e) {
                console.error('loadPushActiveDeviceCount:web', e);
                if (webEl) webEl.textContent = '—';
            }

            try {
                const { count, error } = await supabaseClient
                    .from('fcm_tokens')
                    .select('id', { count: 'exact', head: true })
                    .eq('platform', 'android')
                    .eq('app_id', 'mr.unem.iscae');
                if (error) throw error;
                if (fcmEl) fcmEl.textContent = Number.isFinite(count) ? String(count) : '0';
            } catch (e) {
                console.error('loadPushActiveDeviceCount:fcm', e);
                if (fcmEl) fcmEl.textContent = '—';
            }
        }

        async function loadPushHistoryAdmin() {
            const container = document.getElementById('push-list-container');
            if (!supabaseClient || !container) return;
            const loadMsg = document.getElementById('push-loading-msg');
            try {
                const { data } = await supabaseClient
                    .from('push_notifications_log')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(20);
                if (loadMsg) loadMsg.style.display = 'none';
                if (!data || !data.length) {
                    container.innerHTML = '<p style="text-align:center;color:var(--text-secondary);font-size:0.85rem;font-weight:700;">لا توجد إشعارات مرسلة بعد.</p>';
                    return;
                }
                container.innerHTML = data.map(n => {
                    const d = new Date(n.created_at).toLocaleString('ar-MA');
                    return `<div class="push-list-item">
                        <div class="push-title">${n.title}</div>
                        <div class="push-body">${n.body}</div>
                        <div class="push-meta">
                            <span>${d}</span>
                            <span class="ok">✔ ${n.delivered || 0} ناجح</span>
                            <span style="color:#b7791f">⚠ ${n.expired || 0} منتهٍ</span>
                            <span class="fail">✖ ${n.failed || 0} فشل تقني</span>
                            <span>من أصل ${n.recipients || 0}</span>
                        </div>
                    </div>`;
                }).join('');
            } catch (e) { if (loadMsg) loadMsg.textContent = 'حدث خطأ في التحميل.'; }
        }


        function hideAll() { document.querySelectorAll('.section-box').forEach(el => el.classList.add('hidden')); }
        
        function goBackToMainMenu() { hideAll(); document.getElementById('main-menu').classList.remove('hidden'); if (typeof window.applyUnemMasterVisibility === 'function') window.applyUnemMasterVisibility(); }
        function goBackToSpecialization() { hideAll(); document.getElementById('specialization-selection').classList.remove('hidden'); if (typeof window.applyUnemMasterVisibility === 'function') window.applyUnemMasterVisibility(); }
        function goBackToLevels() { hideAll(); document.getElementById('level-selection').classList.remove('hidden'); }
        function goBackToSemesters() { hideAll(); if(currentLevel) { document.getElementById('semesters-container').classList.remove('hidden'); } else { document.getElementById('level-selection').classList.remove('hidden'); } }
        function goBackToSubjects() { hideAll(); document.getElementById('subjects-container').classList.remove('hidden'); }
        function goBackToCategories() { hideAll(); document.getElementById('category-selection-container').classList.remove('hidden'); }

        function showStudyCycleSelection() {
            if (typeof window.unemMasterVisible === 'function' && !window.unemMasterVisible()) { showSpecializationSelection('licence'); return; }
            const masterCard = document.querySelector('.master-cycle-card');
            if (masterCard && getComputedStyle(masterCard).display === 'none') { showSpecializationSelection('licence'); return; }
            hideAll(); document.getElementById('study-cycle-selection').classList.remove('hidden');
            if (typeof window.applyUnemMasterVisibility === 'function') window.applyUnemMasterVisibility();
        }
        function goBackToStudyCycleSelection() {
            if (typeof window.unemMasterVisible === 'function' && !window.unemMasterVisible()) { goBackToMainMenu(); return; }
            hideAll(); document.getElementById('study-cycle-selection').classList.remove('hidden');
            if (typeof window.applyUnemMasterVisibility === 'function') window.applyUnemMasterVisibility();
        }
        function showSpecializationSelection(cycle) {
            if (cycle === 'master' && typeof window.unemMasterVisible === 'function' && !window.unemMasterVisible()) { cycle = 'licence'; }
            hideAll();
            const section=document.getElementById('specialization-selection');
            if(!section) return;
            section.classList.remove('hidden');
            const wanted=cycle==='master'?'master':'licence'; window.__unemSpecCycle=wanted;
            section.querySelectorAll('.specialization-card').forEach(card=>{
                card.style.display=(card.dataset.cycle===wanted)?'flex':'none';
            });
            if (typeof window.applyUnemMasterVisibility === 'function') window.applyUnemMasterVisibility();
        }
        
        function selectSpecialization(spec) { 
            if(typeof gtag === 'function') gtag('event', 'select_specialization', { 'specialization': spec });
            logSupabaseAnalytics('دخول تخصص', spec.toUpperCase()); 
            
            currentSpecialization = spec; currentBranch = branchMap[spec] || 'main'; allFiles =[]; hideAll(); document.getElementById('level-selection').classList.remove('hidden'); const regularLevels=document.querySelector('#level-selection > .semesters-grid:not(#master-level-options)'); const masterLevels=document.getElementById('master-level-options'); const isMaster=String(spec).startsWith('master_'); if(regularLevels) regularLevels.classList.toggle('hidden', isMaster); if(masterLevels) masterLevels.classList.toggle('hidden', !isMaster); fetchFilesFromGitHub(currentBranch); 
        }
        
        // ربط أزرار التخصصات بشكل صريح بالإضافة إلى onclick الموجود في HTML.
        // هذا يمنع تعطل التنقل إذا تغيّر سياق الصفحة أو تعامل المتصفح مع inline handlers بشكل مختلف.
        window.unemSelectSpecialization = function(spec) {
            try {
                if (typeof selectSpecialization === 'function') {
                    return selectSpecialization(String(spec || '').toLowerCase());
                }
            } catch (error) {
                console.error('UNEM specialization navigation error:', error);
                alert('❌ تعذر فتح التخصص. يرجى إعادة المحاولة.');
            }
        };

        window.addEventListener('DOMContentLoaded', () => {
            document.querySelectorAll('#specialization-cards .specialization-card').forEach(card => {
                const spec = card.getAttribute('data-specialization');
                if (!spec) return;
                const open = (event) => {
                    if (event) event.preventDefault();
                    window.unemSelectSpecialization(spec);
                };
                card.addEventListener('click', open);
                card.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' || event.key === ' ') open(event);
                });
            });
        });

        function showSemesters(level) {
            logSupabaseAnalytics('دخول مستوى', level.toUpperCase());
            currentLevel = level; hideAll(); document.getElementById('semesters-container').classList.remove('hidden');
            const grid = document.getElementById('semesters-grid-view'); grid.innerHTML = ''; 
            let semesters = (level === 'l1' || level === 'm1') ?['s1', 's2'] : (level === 'l2' || level === 'm2') ?['s3', 's4'] :['s5', 's6'];
            semesters.forEach(sem => {
                const div = document.createElement('div'); div.className = 'semester-card';
                div.innerHTML = `<div class="icon-box"><i class="fas fa-layer-group"></i></div><h3>Semestre ${sem.replace('s','')}</h3>`;
                div.onclick = () => showSubjects(sem); grid.appendChild(div);
            });
            // مجموعات WhatsApp أصبحت قسماً مستقلاً من القائمة الرئيسية، ولا تظهر داخل أرشيف المواد أو صفحة الفصول.
        }
        

        /* ==================================================================
           السجل الديناميكي: أنواع الملفات + المواد المشتركة
           كل شيء يُقرأ من قاعدة البيانات، ولا شيء ثابت في الكود.
           (القيم الافتراضية تُستعمل فقط إذا لم تُنفَّذ ملفات SQL بعد،
            حتى لا يتوقف الموقع ولا يختفي أي ملف قديم)
           ================================================================== */
        const FALLBACK_DOCUMENT_TYPES = [
            { id: null, name: 'Cours',   slug: 'cours',  sort_order: 10 },
            { id: null, name: 'TD / TP', slug: 'td_tp',  sort_order: 20 },
            { id: null, name: 'Devoir',  slug: 'devoir', sort_order: 30 },
            { id: null, name: 'Examen',  slug: 'examen', sort_order: 40 }
        ];
        const TYPE_ICONS = {
            cours: 'fa-chalkboard-teacher', td_tp: 'fa-laptop-code',
            devoir: 'fa-file-signature', examen: 'fa-file-alt'
        };
        const TYPE_DESCRIPTIONS = {
            cours: 'الدروس والملخصات', td_tp: 'أعمال موجهة وتطبيقية',
            devoir: 'الاختبارات والواجبات', examen: 'الامتحانات والأرشيف'
        };

        let documentTypes = FALLBACK_DOCUMENT_TYPES.slice();
        let commonSubjects = [];
        // مواد مشتركة بين تخصصات محددة (جدولا shared_subject_groups / shared_subject_members)
        let sharedSubjectGroups = [];
        let sharedGroupsVersion = 0;
        let sgPending = [];
        let sgEditingId = null;

        function typeSlug(value) {
            return String(value || '').toLowerCase().normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '');
        }

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

        /* ==================================================================
           المصدر الوحيد لمنطق أنواع الملفات:
             الأنواع الافتراضية (Cours / TD / TP / Devoir / Examen)
           + تخصيصات هذه المادة (إعادة تسمية / وصف / ترتيب)
           − الأنواع المعطّلة لهذه المادة
           + الأنواع المخصصة المضافة لهذه المادة فقط
           تُستعمل في: واجهة الطالب + نموذج الرفع + لوحة المشرف.
           ================================================================== */
        const DEFAULT_DOCUMENT_TYPES = [
            { slug: 'cours',  name: 'Cours',   description: 'الدروس والملخصات',      sort_order: 10 },
            { slug: 'td_tp',  name: 'TD / TP', description: 'أعمال موجهة وتطبيقية', sort_order: 20 },
            { slug: 'devoir', name: 'Devoir',  description: 'الاختبارات والواجبات',  sort_order: 30 },
            { slug: 'examen', name: 'Examen',  description: 'الامتحانات والأرشيف',   sort_order: 40 }
        ];

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

        /* ---------- أنواع الملفات في نموذج الرفع (حسب المادة المختارة فقط) ---------- */
        let uploadSubjectTypes = [];

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

        let sharedTargetsMemo = { key: '', value: [] };
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

        /** ملفات GitHub لفرع آخر دون المساس بـ allFiles (فرع الصفحة الحالية) */
        const sharedBranchMemCache = {};
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

        /* ==================================================================
           إدارة أنواع الملفات لمادة محددة (المشرف الرئيسي فقط)
           التسلسل الإجباري: نوع المادة → التخصص → المستوى → الفصل → المادة
           ================================================================== */
        let dtSubjectScope = null;
        let dtLinks = [];
        let dtEditingLinkId = null;

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

        /* ---------- إدارة المواد المشتركة بين تخصصات محددة (المشرف الرئيسي فقط) ---------- */
        const sgEl = (id) => document.getElementById(id);
        const sgKey = (m) => `${String(m.specialization).toUpperCase()}|${String(m.semester).toUpperCase()}|${m.subject_code}`;

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

        // مهلة كاش قصيرة جداً حتى تظهر ملفات GitHub الجديدة فوراً تقريباً
        const GITHUB_CACHE_TTL = 60 * 1000;

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

        /* ==================================================================
           توحيد تصنيف الملف بين قاعدة البيانات (Cours / TD_TP / Devoir / Examen)
           وبين تبويبات الواجهة (cours / td_tp / devoir / examen)
           ================================================================== */
        function normalizeFileCategory(value) {
            const v = String(value || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, '');
            if (!v) return null;
            if (v === 'cours' || v === 'course' || v === 'cour') return 'cours';
            if (v === 'tdtp' || v === 'td' || v === 'tp' || v === 'tptd') return 'td_tp';
            if (v === 'devoir' || v === 'test' || v === 'controle') return 'devoir';
            if (v === 'examen' || v === 'exam' || v === 'archive' || v === 'exemen') return 'examen';
            return null;
        }

        /** التصنيف النهائي لأي مستند: من قاعدة البيانات أولاً ثم من اسم الملف */
        function getDocumentCategory(doc) {
            // 1) النوع الديناميكي المسجّل في قاعدة البيانات (المرجع الأول)
            const raw = doc && (doc.file_type || doc.fileType);
            const match = raw ? findDocumentType(raw) : null;
            if (match) return typeSlug(match.slug || match.name);
            // 2) التوافق مع الأنواع القديمة ثم التخمين من اسم الملف
            return normalizeFileCategory(raw)
                || getFileCategory(String((doc && (doc.name || doc.original_name)) || ''));
        }



        function buildFileListItem(file) {
            const li = document.createElement('li');
            let displayName = file.name.replace(/\[.*?\]/g, '').replace(/^\d+-/, '').replace(/_/g, ' ').replace(/\.(pdf|docx?|pptx?|xlsx?)$/i, '');
            // أيقونة ولون حسب صيغة الملف الفعلية (PDF / Word / PowerPoint / Excel / صورة)
            const typeInfo = (window.UNEMUpload && window.UNEMUpload.infoFor(file.name)) || { icon: 'fa-file-pdf' };
            const infoDiv = document.createElement('div'); infoDiv.className = 'file-info'; infoDiv.innerHTML = `<i class="fas ${typeInfo.icon}"></i> <span>${displayName}</span>`;
            li.style.cursor = 'pointer';
            li.onclick = () => openSmartViewer(file);
            const actionsDiv = document.createElement('div'); actionsDiv.className = 'actions-group';
            actionsDiv.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end;';

            // الوصول إلى الملف: منفصل وظيفياً عن أدوات الإدارة.
            const accessGroup = document.createElement('div');
            accessGroup.style.cssText = 'display:flex;align-items:center;gap:5px;';
            const dlBtn = document.createElement('button'); dlBtn.className = 'action-btn'; dlBtn.title = 'تنزيل الملف'; dlBtn.setAttribute('aria-label','تنزيل الملف'); dlBtn.innerHTML = `<i class="fas fa-arrow-down"></i>`; dlBtn.onclick = (e) => { e.stopPropagation(); triggerDownload(file); };
            accessGroup.appendChild(dlBtn);
            if (window.UNEMFav) { try { accessGroup.appendChild(window.UNEMFav.fileButton(file)); } catch (_) {} }
            actionsDiv.appendChild(accessGroup);

            // أدوات الترتيب: لمن مُنح صلاحيتها، ومستقلة عن التنزيل والحذف.
            if (hasPermission('manage_file_order') && file && file.id && (file.source === 'supabase' || file.source === 'cloudinary')) {
                const orderGroup = document.createElement('div');
                orderGroup.style.cssText = 'display:flex;align-items:center;gap:5px;padding-inline-start:6px;border-inline-start:1px solid var(--border-color);';
                const reorderable = (currentSubjectFiles || [])
                    .filter(f => f && f.id && (f.source === 'supabase' || f.source === 'cloudinary'))
                    .filter(f => isArchiveSpecialCase ? true : getDocumentCategory(f) === currentTab)
                    .slice().sort((a,b) => (Number(a.sort_order ?? 100000) - Number(b.sort_order ?? 100000)) || String(a.name || '').localeCompare(String(b.name || '')));
                const orderIndex = reorderable.findIndex(f => String(f.id) === String(file.id));

                const upBtn = document.createElement('button');
                upBtn.type = 'button'; upBtn.className = 'action-btn'; upBtn.title = 'نقل الملف إلى الأعلى'; upBtn.setAttribute('aria-label','نقل الملف إلى الأعلى');
                upBtn.innerHTML = '<i class="fas fa-chevron-up"></i>';
                upBtn.disabled = orderIndex <= 0;
                upBtn.style.opacity = upBtn.disabled ? '0.4' : '1';
                upBtn.onclick = async (e) => { e.stopPropagation(); await moveCurrentFileOrder(file.id, -1); };

                const downBtn = document.createElement('button');
                downBtn.type = 'button'; downBtn.className = 'action-btn'; downBtn.title = 'نقل الملف إلى الأسفل'; downBtn.setAttribute('aria-label','نقل الملف إلى الأسفل');
                downBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
                downBtn.disabled = orderIndex < 0 || orderIndex >= reorderable.length - 1;
                downBtn.style.opacity = downBtn.disabled ? '0.4' : '1';
                downBtn.onclick = async (e) => { e.stopPropagation(); await moveCurrentFileOrder(file.id, 1); };

                orderGroup.appendChild(upBtn); orderGroup.appendChild(downBtn);
                actionsDiv.appendChild(orderGroup);
            }
            
            if (file.source === 'cloudinary') {
                const badge = document.createElement('span'); badge.className = 'cloud-badge'; badge.textContent = 'جديد';
                infoDiv.appendChild(badge);
            }

            // الحذف يتطلب صلاحية مستقلة (والخادم يعيد التحقق من الصلاحية)
            if (hasPermission('delete_files') && (file.source === 'supabase' || file.source === 'cloudinary')) {
                const managementGroup = document.createElement('div');
                managementGroup.style.cssText = 'display:flex;align-items:center;gap:5px;padding-inline-start:6px;border-inline-start:1px solid var(--border-color);';
                const delBtn = document.createElement('button'); delBtn.className = 'action-btn'; delBtn.title = 'حذف الملف'; delBtn.setAttribute('aria-label','حذف الملف'); delBtn.innerHTML = `<i class="fas fa-trash"></i>`; delBtn.style.color = '#ef4444'; delBtn.style.borderColor = '#fca5a5';
                delBtn.onclick = async (e) => {
                    e.stopPropagation();
                    if(!confirm("تأكيد حذف هذا الملف نهائياً؟")) return;
                    li.style.opacity = '0.4';
                    try {
                        if (file.source === 'supabase') {
                            const { error } = await supabaseClient.storage.from('pdf-files').remove([file.path]);
                            if (error) throw error;
                        } else {
                            const token = await getAccessToken();
                            if (!token) throw new Error('انتهت الجلسة');
                            const res = await fetch(unemApi('/api/public/cloudinary/destroy'), {
                                method: 'POST',
                                headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + token },
                                body: JSON.stringify({ documentId: file.id, publicId: file.publicId, resourceType: file.resourceType || 'raw' })
                            });
                            const out = await res.json().catch(() => null);
                            if (!res.ok) throw new Error((out && out.error) || 'فشل الحذف');
                        }
                        li.remove();
                        currentSubjectFiles = currentSubjectFiles.filter(f => f !== file);
                        documentsCache = {};
                    } catch (err) {
                        console.error(err);
                        alert('❌ تعذر حذف الملف: ' + (err.message || ''));
                        li.style.opacity = '1';
                    }
                };
                managementGroup.appendChild(delBtn);
                actionsDiv.appendChild(managementGroup);
            }
            li.appendChild(infoDiv); li.appendChild(actionsDiv); return li;
        }

        // نقل ملف واحد درجة واحدة للأعلى/للأسفل وحفظه فوراً في Supabase.
        async function moveCurrentFileOrder(fileId, direction) {
            if (!hasPermission('manage_file_order') || !fileId || ![1, -1].includes(direction)) return;
            const items = (currentSubjectFiles || [])
                .filter(f => f && f.id && (f.source === 'supabase' || f.source === 'cloudinary'))
                .filter(f => isArchiveSpecialCase ? true : getDocumentCategory(f) === currentTab)
                .slice().sort((a,b) => (Number(a.sort_order ?? 100000) - Number(b.sort_order ?? 100000)) || String(a.name || '').localeCompare(String(b.name || '')));
            const index = items.findIndex(f => String(f.id) === String(fileId));
            const target = index + direction;
            if (index < 0 || target < 0 || target >= items.length) return;

            const ids = items.map(f => f.id);
            [ids[index], ids[target]] = [ids[target], ids[index]];
            try {
                const { error } = await supabaseClient.rpc('reorder_documents', { p_document_ids: ids });
                if (error) throw error;
                ids.forEach((id, i) => {
                    const item = (currentSubjectFiles || []).find(f => String(f.id) === String(id));
                    if (item) item.sort_order = (i + 1) * 10;
                });
                documentsCache = {};
                await refreshCurrentSubjectFiles();
            } catch (err) {
                console.error(err);
                alert('❌ تعذر تغيير ترتيب الملف: ' + (err.message || ''));
            }
        }

// متغير جديد لتتبع عملية جلب الملفات في الخلفية
        let currentSubjectFilesPromise = null;
        let currentSubjectName = '';

        async function selectCategory(categoryName) { 
            document.getElementById('category-selection-container').classList.add('hidden'); 
            document.getElementById('file-list-container').classList.remove('hidden'); 
            currentTab = categoryName; 
            
            // إظهار التحميل فقط إذا لم تكتمل عملية الجلب في الخلفية
            document.getElementById('pdf-list').innerHTML = "";
            document.getElementById('no-files-msg').classList.add('hidden');
            document.getElementById('loading-spinner').classList.remove('hidden');

            // انتظار اكتمال جلب الملفات (غالباً ستكون قد اكتملت أثناء اختيار المستخدم للتصنيف)
            if (currentSubjectFilesPromise) {
                await currentSubjectFilesPromise;
            }
            
            document.getElementById('loading-spinner').classList.add('hidden');
            renderFilteredFiles(); 
        }

        function renderFilteredFiles() {
            const pdfList = document.getElementById('pdf-list'); pdfList.innerHTML = "";
            let filtered = currentSubjectFiles.filter(isDocumentInCurrentScope);
            filtered = isArchiveSpecialCase ? filtered : filtered.filter(f => getDocumentCategory(f) === currentTab);
            filtered = filtered.slice().sort((a,b) => (Number(a.sort_order ?? 100000) - Number(b.sort_order ?? 100000)) || String(a.name || '').localeCompare(String(b.name || '')));
            if (filtered.length === 0) { 
                document.getElementById('no-files-msg').classList.remove('hidden'); 
            } else { 
                document.getElementById('no-files-msg').classList.add('hidden'); 
                filtered.forEach(file => pdfList.appendChild(buildFileListItem(file))); 
            }
        }

        /* ==================================================================
           طبقة الروابط الموحّدة — مصدر واحد للحقيقة لكل روابط الملفات
           getDocumentOpenUrl / getDocumentDownloadUrl / getPdfViewerUrl
           ================================================================== */

        /** يتحقق أن الرابط رابط Cloudinary مباشر وحقيقي (وليس JSON pointer أو رابط Supabase) */
        function isRealCloudinaryUrl(url) {
            return typeof url === 'string' && /^https:\/\/res\.cloudinary\.com\/[^/]+\/(raw|image|video)\/upload\//.test(url);
        }

        // اسم سحابة Cloudinary (معلومة عمومية) — يُجلب مرة واحدة لإعادة بناء الروابط عند الحاجة
        let cloudinaryCloudName = null;
        let cloudNamePromise = null;
        function ensureCloudinaryCloudName() {
            if (cloudinaryCloudName) return Promise.resolve(cloudinaryCloudName);
            if (!cloudNamePromise) {
                cloudNamePromise = fetch(unemApi('/api/public/cloudinary/config'))
                    .then(r => r.ok ? r.json() : null)
                    .then(d => { cloudinaryCloudName = (d && d.cloudName) || null; return cloudinaryCloudName; })
                    .catch(() => null);
            }
            return cloudNamePromise;
        }
        ensureCloudinaryCloudName();

        /** رابط تسليم Cloudinary — المرجع الأساسي هو public_id وليس الرابط المخزَّن */
        function getCloudinaryDeliveryUrl(doc, options) {
            const download = !!(options && options.download);
            let base = isRealCloudinaryUrl(doc.cloudinary_url) ? doc.cloudinary_url : null;

            if (!base && doc.cloudinary_public_id && cloudinaryCloudName) {
                const type = ['raw', 'image', 'video'].includes(doc.cloudinary_resource_type) ? doc.cloudinary_resource_type : 'raw';
                const encoded = String(doc.cloudinary_public_id).split('/').map(encodeURIComponent).join('/');
                base = `https://res.cloudinary.com/${cloudinaryCloudName}/${type}/upload/${encoded}`;
            }

            if (!base) {
                // احتياطي: تحويل حقيقي 302 من الخادم (يعيد بناء الرابط من public_id) — لا يعيد JSON أبداً
                if (doc.id) return `/api/public/file?id=${encodeURIComponent(doc.id)}${download ? '&download=1' : ''}`;
                return null;
            }
            return download ? base.replace('/upload/', '/upload/fl_attachment/') : base;
        }

        /** رابط ملف GitHub — من github_url إن وُجد وإلا من github_path */
        function getGithubFileUrl(doc) {
            if (doc.github_url) return doc.github_url;
            const path = doc.github_path || doc.path;
            if (!path) return null;
            const branch = doc.branch || currentBranch || 'main';
            return `https://raw.githubusercontent.com/${repoOwner}/${repoName}/${branch}/${String(path).replace(/^"|"$/g, '').split('/').map(encodeURIComponent).join('/')}`;
        }

        /** رابط الفتح (عرض داخل الموقع) — يعتمد على العمود source وليس على وجود رابط ما */
        function getDocumentOpenUrl(doc) {
            if (doc.source === 'github') return getGithubFileUrl(doc);
            if (doc.source === 'supabase') {
                try { return supabaseClient.storage.from('pdf-files').getPublicUrl(doc.path).data.publicUrl; }
                catch (_) { return null; }
            }
            return getCloudinaryDeliveryUrl(doc, { download: false });
        }

        /** رابط التنزيل — مختلف تماماً عن رابط الفتح */
        function getDocumentDownloadUrl(doc) {
            if (doc.source === 'github') return getGithubFileUrl(doc);
            if (doc.source === 'supabase') {
                try { return supabaseClient.storage.from('pdf-files').getPublicUrl(doc.path, { download: true }).data.publicUrl; }
                catch (_) { return getDocumentOpenUrl(doc); }
            }
            return getCloudinaryDeliveryUrl(doc, { download: true });
        }

        /** رابط العارض — يعتمد على الصيغة الفعلية المخزنة، وليس امتداد الملف الأصلي.
         * الصور تُحوّل أثناء الرفع إلى PDF، لذلك original_name قد يبقى .jpg/.png
         * بينما name يصبح .pdf. يجب أن يستخدم العارض name حتى يُفتح الـPDF داخل المنصة.
         */
        function getPdfViewerUrl(doc) {
            const fileUrl = getDocumentOpenUrl(doc);
            if (!fileUrl) return null;
            const abs = absoluteUrl(fileUrl);

            const storedName = String(doc.name || '').trim();
            const originalName = String(doc.original_name || '').trim();
            const isStoredPdf = /\.pdf$/i.test(storedName) || String(doc.mime_type || '').toLowerCase() === 'application/pdf';
            const viewerName = isStoredPdf ? storedName : (originalName || storedName);

            // PDF الحقيقي، بما فيه PDF الناتج من صورة، يستخدم Google PDF Viewer داخل المنصة.
            if (isStoredPdf) {
                return `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(abs)}`;
            }

            // Office ← عارض Microsoft، الصور غير المحولة ← عرض مباشر.
            if (window.UNEMUpload) return window.UNEMUpload.viewerUrlFor(viewerName, abs);
            return `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(abs)}`;
        }

        function logDocumentError(context, doc, err) {
            console.error(context, {
                id: doc && doc.id,
                source: doc && doc.source,
                cloudinary_public_id: doc && doc.cloudinary_public_id,
                cloudinary_url: doc && doc.cloudinary_url,
                github_url: doc && doc.github_url,
                subject_code: doc && doc.subject_code,
                error: err
            });
        }

        /** التنزيل فقط — لا يفتح العارض أبداً */
        async function triggerDownload(fileObj) {
            const safeName = String(fileObj.name || 'document.pdf').replace(/^"|"$/g, '');
            if(typeof gtag === 'function') gtag('event', 'download_file', { 'file_name': safeName });
            logSupabaseAnalytics('تحميل ملف', safeName);

            if (fileObj.source === 'cloudinary' && !isRealCloudinaryUrl(fileObj.cloudinary_url)) {
                await ensureCloudinaryCloudName();
            }
            const downloadUrl = getDocumentDownloadUrl(fileObj);
            if (!downloadUrl) {
                logDocumentError('triggerDownload: رابط غير متوفر', fileObj);
                alert('❌ تعذر تحديد رابط تحميل هذا الملف.');
                return;
            }

            // [UNEM] تنزيل موقّع: يُجلب الملف ويُوقَّع بنفس توقيع الرفع (PDF/Word/PowerPoint) ثم يُحفظ.
            // عند أي فشل نكمل بالسلوك القديم أدناه فلا يتعطل التنزيل أبداً.
            try {
                if (window.UNEMFiles && await window.UNEMFiles.signedDownload(fileObj, safeName)) return;
            } catch (e) { console.warn('[UNEM] signed download fallback', e); }

            // Android يتعامل مع التنزيلات عبر طبقة أصلية تفحص محتوى الملف
            // وتصحح الامتداد الحقيقي (PDF/ZIP/Office/صور) بدل الاعتماد على امتداد الرابط.
            if (window.AndroidFileDownload && typeof window.AndroidFileDownload.downloadUrl === 'function') {
                window.AndroidFileDownload.downloadUrl(
                    downloadUrl,
                    safeName,
                    String(fileObj.mime_type || fileObj.mimeType || '')
                );
                return;
            }

            const link = document.createElement('a');
            link.href = downloadUrl;
            link.rel = 'noopener';
            link.download = /\.[A-Za-z0-9]+$/.test(safeName) ? safeName : `${safeName}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }



        // دالة العرض الفوري (بدون انتظار)
        function loadFiles(subjectName) {
            document.getElementById('selected-subject-name').textContent = subjectName; 
            document.getElementById('selected-subject-title-card').textContent = subjectName;
            
            const cleanSubject = normalizeText(subjectName); 
            
            // إظهار الواجهة فوراً للمستخدم بدون أي تأخير
            if (cleanSubject.includes("archive") && cleanSubject.match(/s[1-6]/)) { 
                isArchiveSpecialCase = true; 
                hideAll(); 
                document.getElementById('file-list-container').classList.remove('hidden'); 
                document.getElementById('file-list-back-btn').setAttribute('onclick', 'goBackToSubjects()'); 
                document.getElementById('pdf-list').innerHTML = ""; 
                document.getElementById('loading-spinner').classList.remove('hidden'); 
                document.getElementById('no-files-msg').classList.add('hidden');
            } else { 
                isArchiveSpecialCase = false; 
                hideAll(); 
                document.getElementById('category-selection-container').classList.remove('hidden'); 
                document.getElementById('file-list-back-btn').setAttribute('onclick', 'goBackToCategories()'); 
                applySubjectCategoryGrid(subjectName);
            }
            
            // بدء جلب الملفات في الخلفية بصمت
            currentSubjectName = subjectName;
            currentSubjectFilesPromise = performFileFetching(subjectName, cleanSubject);
            
            // إذا كان أرشيفاً، نعرض الملفات بمجرد انتهاء الوعد (لأنه لا توجد شاشة تصنيفات)
            if(isArchiveSpecialCase) {
                currentSubjectFilesPromise.then(() => {
                    document.getElementById('loading-spinner').classList.add('hidden');
                    renderFilteredFiles();
                });
            }
        }

        /** شاشة التصنيفات: الأنواع الافتراضية + تخصيصات هذه المادة (+ أنواع الملفات الموجودة فعلاً) */
        async function applySubjectCategoryGrid(subjectName) {
            const scope = subjectScopeFor(currentSpecialization, currentLevel, currentSemester, subjectName);
            let subjectTypes = [];
            try {
                subjectTypes = await getEffectiveDocumentTypes(scope, false);
            } catch (e) {
                console.warn('subject category types', e);
                subjectTypes = fallbackEffectiveTypes();
            }
            renderCategoryGrid(mergeTypesFoundInFiles(subjectTypes));
            if (currentSubjectFilesPromise) {
                currentSubjectFilesPromise
                    .then(() => renderCategoryGrid(mergeTypesFoundInFiles(subjectTypes)))
                    .catch(() => {});
            }
        }

        /** يضيف الأنواع التي تحتوي ملفات فعلية حتى لا يختفي أي ملف قديم */
        function mergeTypesFoundInFiles(subjectTypes) {
            const out = (subjectTypes || []).slice();
            const seen = new Set(out.map(t => typeSlug(t.slug || t.name)));
            (currentSubjectFiles || []).forEach(f => {
                const slug = getDocumentCategory(f);
                if (!slug || seen.has(slug)) return;
                const known = documentTypes.find(t => typeSlug(t.slug || t.name) === slug);
                out.push(known || { id: null, name: slug, slug: slug });
                seen.add(slug);
            });
            return out;
        }

        /* ====== طبقة المستندات الموحّدة (Supabase = المصدر الرسمي للـmetadata) ====== */
        const DOCUMENTS_CACHE_TTL = 60 * 1000; // كاش قصير جداً حتى لا يخفي الملفات الجديدة
        let documentsCache = {};

        function documentsCacheKey(subjectName) {
            return `${currentSpecialization}|${currentLevel}|${currentSemester}|${getSafeSubjectCode(subjectName)}`;
        }
        function invalidateDocumentsCache(subjectName) {
            if (!subjectName) { documentsCache = {}; return; }
            delete documentsCache[documentsCacheKey(subjectName)];
        }

        /** يحوّل سجل قاعدة البيانات إلى شكل مستند موحّد (نفس الشكل لكل المصادر) */
        function mapDocumentRow(row) {
            const source = (row.source || 'cloudinary').toLowerCase();
            const doc = {
                id: row.id,
                sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 100000,
                name: row.name || row.original_name,
                original_name: row.original_name || row.name,
                type: 'file',
                source: source,
                subject: row.subject || '',
                subject_code: row.subject_code || '',
                specialization: row.specialization || '',
                level: row.level || '',
                semester: row.semester || '',
                file_type: row.file_type || null,
                fileType: row.file_type || null,
                github_url: row.github_url || null,
                github_path: row.github_path || null,
                cloudinary_url: row.cloudinary_url || null,
                cloudinary_public_id: row.cloudinary_public_id || null,
                cloudinary_resource_type: row.cloudinary_resource_type || 'raw',
                mime_type: row.mime_type || '',
                publicId: row.cloudinary_public_id || null,
                resourceType: row.cloudinary_resource_type || 'raw',
                path: row.github_path || (row.folder ? `${row.folder}/${row.name}` : row.name)
            };
            doc.openUrl = getDocumentOpenUrl(doc);
            doc.downloadUrl = getDocumentDownloadUrl(doc);
            return doc;
        }

        /** يحوّل ملف GitHub (من واجهة GitHub API) إلى نفس الشكل الموحّد */
        function mapGithubFile(file, subjectName) {
            const doc = {
                id: null,
                name: file.name,
                original_name: file.name,
                type: 'file',
                source: 'github',
                subject: subjectName || '',
                subject_code: getSafeSubjectCode(subjectName || ''),
                specialization: currentSpecialization || '',
                level: currentLevel || '',
                semester: currentSemester || '',
                file_type: null,
                fileType: null,
                github_url: file.download_url || null,
                github_path: file.path || file.name,
                cloudinary_url: null,
                cloudinary_public_id: null,
                cloudinary_resource_type: null,
                branch: currentBranch,
                path: file.path || file.name
            };
            doc.openUrl = getDocumentOpenUrl(doc);
            doc.downloadUrl = getDocumentDownloadUrl(doc);
            return doc;
        }

        /** مستندات قاعدة البيانات (Cloudinary أساساً + أي سجلات GitHub مسجَّلة) */
        async function fetchDatabaseDocs(subjectName) {
            if (!supabaseClient || !currentSpecialization || !currentLevel || !currentSemester) return [];
            const key = documentsCacheKey(subjectName);
            const cached = documentsCache[key];
            if (cached && (Date.now() - cached.time) < DOCUMENTS_CACHE_TTL) return cached.items;
            await ensureCloudinaryCloudName();
            const caseVariants = (v) => Array.from(new Set([String(v), String(v).toUpperCase(), String(v).toLowerCase()]));
            const wanted = documentCodeVariants(currentSpecialization, currentLevel, subjectName).map(c => c.toLowerCase());
            // مادة مشتركة بين تخصصات محددة؟ (تعيد [] لباقي المواد فيبقى السلوك القديم كما هو)
            const sharedTargets = sharedTargetsFor(currentSpecialization, currentLevel, currentSemester, subjectName);
            const specVariants = sharedTargets.length
                ? Array.from(new Set(sharedTargets.flatMap(t => caseVariants(t.spec))))
                : caseVariants(storageSpecializationFor(currentSpecialization));
            const semVariants = sharedTargets.length
                ? Array.from(new Set(sharedTargets.flatMap(t => caseVariants(t.semester))))
                : caseVariants(currentSemester);
            try {
                // المفتاح الأساسي: التخصص + الفصل (الفصل يحدد المستوى حتماً: S1/S2→L1 ...)
                // نتسامح مع سجلات قديمة حُفظ فيها level خاطئ أو فارغ، دون كسر أي بيانات.
                const { data, error } = await supabaseClient
                    .from('documents')
                    .select('id,name,original_name,source,cloudinary_url,cloudinary_public_id,cloudinary_resource_type,mime_type,folder,storage_path,file_type,subject,subject_code,specialization,level,semester,status,sort_order,created_at')
                    .in('specialization', specVariants.concat(['COMMON', 'common']))
                    .in('semester', semVariants)
                    .order('sort_order', { ascending: true, nullsFirst: false })
                    .order('created_at', { ascending: false });
                if (error) throw error;
                const masterContext = isMasterCycle(currentSpecialization, currentLevel);
                const expectedLevel = levelForSemester(currentSemester) || String(currentLevel || '').toUpperCase();
                const strictMasterCode = String(masterStorageCode(subjectName)).toLowerCase();
                const mapped = (data || [])
                    .filter(r => !r.status || r.status === 'active')
                    .filter(r => {
                        const lvl = String(r.level || '').toUpperCase();
                        if (!masterContext && sharedTargets.length) return true; // يُفحص لكل عضو في المجموعة بالأسفل
                        return masterContext ? lvl === expectedLevel : (!lvl || lvl === expectedLevel);
                    })
                    .filter(r => {
                        const code = String(r.subject_code || '').toLowerCase();
                        if (!masterContext && sharedTargets.length) return sharedTargets.some(t => rowMatchesSharedTarget(r, t));
                        if (masterContext) return code === strictMasterCode;
                        if (code) return wanted.includes(code) && !/^m_/.test(code);
                        return !!r.subject && wanted.includes(getSafeSubjectCode(r.subject));
                    })
                    .map(mapDocumentRow);
                documentsCache[key] = { time: Date.now(), items: mapped };
                return mapped;

            } catch (err) {
                console.error('fetchDatabaseDocs', err);
                return [];
            }
        }

        // متوافق مع الاسم القديم
        const fetchCloudinaryDocs = fetchDatabaseDocs;

        /** يعيد تحميل ملفات المادة الحالية فوراً بعد الرفع (بدون أي إعادة تحميل للصفحة) */
        async function refreshCurrentSubjectFiles() {
            if (!currentSubjectName) { invalidateDocumentsCache(); return; }
            invalidateDocumentsCache(currentSubjectName);
            try { await fetchFilesFromGitHub(currentBranch, { force: true }); } catch (_) {}
            currentSubjectFilesPromise = performFileFetching(currentSubjectName, normalizeText(currentSubjectName));
            await currentSubjectFilesPromise;
            const listVisible = !document.getElementById('file-list-container').classList.contains('hidden');
            if (listVisible) renderFilteredFiles();
        }



     /** يجمع كل المستندات (GitHub + Cloudinary + Supabase) في قائمة واحدة موحّدة */
     async function fetchAllDocuments(subjectName, cleanSubject) {
            return performFileFetching(subjectName, cleanSubject);
     }

        /** فلتر ملفات GitHub لمادة محددة (نفس المنطق الأصلي حرفياً) — يُستعمل للمادة الحالية ولأعضاء المجموعة المشتركة */
        function githubFileMatchesSubject(file, cleanSubject, archiveCase) {
            // السماح لرموز # و + بالبقاء في اسم المادة
            const sanitizedSubject = cleanSubject.replace(/[^a-z0-9#+]/g, ' ').replace(/\s+/g, ' ').trim();
            const subjectKeywords = sanitizedSubject.split(' ');
                if(file.type !== "file" || !isValidFile(file.name)) return false; 
                const fName = normalizeText(file.name); 
                const sanitizedFile = fName.replace(/[^a-z0-9#+]/g, ' ').replace(/\s+/g, ' ').trim();

                if (archiveCase) {
                    if (!fName.includes("archive")) return false;
                    if (cleanSubject.includes("s1")) return (fName.includes("s1") || fName.includes("semestre 1")) && !fName.includes("s2") && !fName.includes("s3") && !fName.includes("s4");
                    if (cleanSubject.includes("s2")) return (fName.includes("s2") || fName.includes("semestre 2")) && !fName.includes("s1") && !fName.includes("s3") && !fName.includes("s4");
                    if (cleanSubject.includes("s3")) return (fName.includes("s3") || fName.includes("semestre 3")) && !fName.includes("s1") && !fName.includes("s2") && !fName.includes("s4");
                    if (cleanSubject.includes("s4")) return (fName.includes("s4") || fName.includes("semestre 4")) && !fName.includes("s3") && !fName.includes("s5");
                    if (cleanSubject.includes("s5")) return (fName.includes("s5") || fName.includes("semestre 5")) && !fName.includes("s4") && !fName.includes("s6");
                    if (cleanSubject.includes("s6")) return (fName.includes("s6") || fName.includes("semestre 6")) && !fName.includes("s5");
                    return false;
                }
                if (fName.startsWith("archive s")) return false;

                // حل مشكلة مادة C# و Langage C
                if (cleanSubject === 'c#') return sanitizedFile.includes('c#') || sanitizedFile.includes('c sharp');
                if (cleanSubject === 'langage c') return fName.includes('langage') && fName.match(/\bc\b/) && !fName.includes('sql') && !fName.includes('base de donnee') && !sanitizedFile.includes('c#');

                const subRom = sanitizedSubject.match(/\b(i|ii|iii|iv|v|vi)\b/)?.[0]; const fileRom = sanitizedFile.match(/\b(i|ii|iii|iv|v|vi)\b/)?.[0];
                if (subRom) { if (fileRom !== subRom) return false; } else { if (fileRom) return false; }

                const stopWords =['de', 'du', 'des', 'la', 'le', 'les', 'et', 'en', 'a', 'au', 'aux', 'l', 'd', 'pour', 'sur', 'dans'];
                const distinctKeywords = subjectKeywords.filter(w => !stopWords.includes(w) && w.length > 1);

                if (distinctKeywords.length > 0) {
                    const baseKeywords = distinctKeywords.map(w => w.endsWith('s') ? w.slice(0, -1) : w);
                    if (!baseKeywords.every(k => sanitizedFile.includes(k)) || !new RegExp(baseKeywords.join('.{0,35}')).test(sanitizedFile)) return false;
                    
                    // قائمة الممنوعات لضمان عدم تسرب أي ملفات لمادة أخرى
                    for (let word of ['assurance', 'approfondie', 'bancaire', 'international', 'internationale', 'islamique', 'portefeuille', 'tresorerie', 'patrimoine', 'financiere', 'financieres', 'commerciale', 'commerciales', 'descriptive', 'appliquee', 'analytique', 'nationale', 'statistique', 'c#', 'java', 'web', 'python', 'php', 'reseaux']) {
                        if (sanitizedFile.includes(word) && !sanitizedSubject.includes(word)) return false;
                    }
                    return true;
                }
                return sanitizedFile.includes(sanitizedSubject);
        }

     async function performFileFetching(subjectName, cleanSubject) {
            // السماح لرموز # و + بالبقاء في اسم المادة
            const sanitizedSubject = cleanSubject.replace(/[^a-z0-9#+]/g, ' ').replace(/\s+/g, ' ').trim(); 
            const subjectKeywords = sanitizedSubject.split(' ');
            // مادة مشتركة بين تخصصات محددة؟ ([] لباقي المواد → السلوك القديم كما هو)
            const sharedTargets = sharedTargetsFor(currentSpecialization, currentLevel, currentSemester, subjectName);
            
            if(allFiles.length === 0) await fetchFilesFromGitHub(currentBranch);
            
            let githubFiles = allFiles.map(f => ({...f, source: 'github'}));
            // GitHub لا يملك حقول cycle/subject_code؛ لا نستخدمه للماستر إلا لمسار معلن صراحةً.
            if (isMasterCycle(currentSpecialization, currentLevel)) {
                githubFiles = githubFiles.filter(isExplicitMasterGithubFile);
            }
            
            let supabaseFiles = [];
            
            // مستندات قاعدة البيانات (Cloudinary + أي سجلات GitHub مسجّلة)
            const dbFiles = await fetchDatabaseDocs(subjectName);

            if(supabaseClient && currentSpecialization && currentLevel && currentSemester) {
                const storageSpec = storageSpecializationFor(currentSpecialization);
                const storageLevel = storageLevelFor(currentSpecialization, currentLevel);
                const base = `${storageSpec.toUpperCase()}/${storageLevel.toUpperCase()}/${currentSemester.toUpperCase()}`;
                for (const code of documentCodeVariants(currentSpecialization, currentLevel, subjectName)) {
                    const folderPath = `${base}/${code}`;
                    const { data } = await supabaseClient.storage.from('pdf-files').list(folderPath);
                    if (data && data.length > 0) {
                        supabaseFiles = supabaseFiles.concat(
                            data.filter(f => isValidFile(f.name)).map(f => ({
                                id: null, name: f.name, original_name: f.name, type: 'file', source: 'supabase',
                                subject: subjectName, subject_code: getSafeSubjectCode(subjectName),
                                file_type: null, fileType: null,
                                github_url: null, github_path: null,
                                cloudinary_url: null, cloudinary_public_id: null, cloudinary_resource_type: null,
                                path: `${folderPath}/${f.name}`
                            }))
                        );
                    }
                }
                // مادة مشتركة: ملفات Supabase Storage لبقية أعضاء المجموعة
                for (const t of sharedTargets.filter(x => !x.isSelf)) {
                    const tBase = `${t.spec}/${t.level}/${t.semester}`;
                    for (const code of subjectCodeVariants(t.name)) {
                        const folderPath = `${tBase}/${code}`;
                        const { data } = await supabaseClient.storage.from('pdf-files').list(folderPath);
                        if (data && data.length > 0) {
                            supabaseFiles = supabaseFiles.concat(
                                data.filter(f => isValidFile(f.name)).map(f => ({
                                    id: null, name: f.name, original_name: f.name, type: 'file', source: 'supabase',
                                    subject: t.name, subject_code: getSafeSubjectCode(t.name),
                                    specialization: t.spec, level: t.level, semester: t.semester,
                                    file_type: null, fileType: null,
                                    github_url: null, github_path: null,
                                    cloudinary_url: null, cloudinary_public_id: null, cloudinary_resource_type: null,
                                    path: `${folderPath}/${f.name}`
                                }))
                            );
                        }
                    }
                }
                supabaseFiles.forEach(d => { d.openUrl = getDocumentOpenUrl(d); d.downloadUrl = getDocumentDownloadUrl(d); });
            }


            // الفلترة الذكية الجديدة
            const filteredGithub = githubFiles.filter(file => githubFileMatchesSubject(file, cleanSubject, isArchiveSpecialCase));
   

            // توحيد شكل ملفات GitHub ثم دمج كل المصادر في قائمة واحدة
            const githubDocs = filteredGithub.map(f => mapGithubFile(f, subjectName));
            // مادة مشتركة: ملفات GitHub الموجودة في فروع بقية أعضاء المجموعة (بدون نسخ أي شيء)
            for (const t of sharedTargets.filter(x => !x.isSelf)) {
                try {
                    const branchFiles = await fetchBranchFilesQuiet(t.branch);
                    const tClean = normalizeText(t.name);
                    const tArchive = tClean.includes('archive') && !!tClean.match(/s[1-6]/);
                    branchFiles
                        .map(f => ({ ...f, source: 'github' }))
                        .filter(f => githubFileMatchesSubject(f, tClean, tArchive))
                        .forEach(f => {
                            const d = mapGithubFile(f, t.name);
                            d.branch = t.branch; d.specialization = t.spec; d.level = t.level; d.semester = t.semester;
                            githubDocs.push(d);
                        });
                } catch (e) { console.warn('shared github branch', t.branch, e); }
            }
            // دمج كل المصادر مع منع التكرار، ثم تطبيق حارس النطاق النهائي على كل مصدر.
            const seen = new Set();
            const seenNames = new Map();
            const sharedMode = sharedTargets.length > 0;
            currentSubjectFiles = [...dbFiles, ...githubDocs, ...supabaseFiles].filter(isDocumentInCurrentScope).filter(d => {
                let key = `${(d.github_path || d.cloudinary_public_id || d.path || d.name || '')}`.toLowerCase();
                if (!key) return true;
                // مادة مشتركة: نفس المسار في فرعين مختلفين ليس ملفاً مكرراً بالضرورة
                if (sharedMode && d.source === 'github') key = `${sharedDocOrigin(d)}|${key}`;
                if (seen.has(key)) return false;
                seen.add(key);
                if (sharedMode) {
                    // نفس الملف (الاسم + النوع) موجود عند أكثر من تخصص في المجموعة → يظهر مرة واحدة فقط
                    const nameKey = `${normalizeText(String(d.name || d.original_name || ''))}|${getDocumentCategory(d)}`;
                    const origin = sharedDocOrigin(d);
                    if (seenNames.has(nameKey) && seenNames.get(nameKey) !== origin) return false;
                    if (!seenNames.has(nameKey)) seenNames.set(nameKey, origin);
                }
                return true;
            });
            return currentSubjectFiles;
        }
        let viewerFallbackTimer = null;

        function absoluteUrl(url) {
            try { return new URL(url, window.location.origin).href; } catch (_) { return url; }
        }

        /** لوحة البدائل — لا تبدأ أي تنزيل تلقائي */
        function showViewerFallback(fileObj, reason) {
            const area = document.getElementById('pdf-render-area');
            const msg = document.getElementById('rendering-msg');
            if (msg) msg.style.display = 'none';
            if (!area) return;
            const old = document.getElementById('viewer-fallback-panel');
            if (old) old.remove();

            const panel = document.createElement('div');
            panel.id = 'viewer-fallback-panel';
            panel.style.cssText = 'position:absolute; inset:auto 0 0 0; background:rgba(15,23,42,0.94); color:#fff; padding:14px; display:flex; flex-wrap:wrap; gap:10px; justify-content:center; align-items:center; font-weight:700; z-index:5;';
            const label = document.createElement('span');
            label.style.cssText = 'width:100%; text-align:center; font-size:0.9rem; font-weight:800;';
            label.textContent = reason || 'تعذر عرض الملف داخل العارض.';
            panel.appendChild(label);

            const mk = (text, handler) => {
                const b = document.createElement('button');
                b.textContent = text;
                b.style.cssText = 'background:#2563eb; color:#fff; border:none; padding:10px 16px; border-radius:50px; font-weight:800; cursor:pointer;';
                b.onclick = (e) => { e.stopPropagation(); handler(); };
                panel.appendChild(b);
            };
            mk('فتح مباشرة', () => {
                const direct = getDocumentOpenUrl(fileObj);
                if (direct) window.open(absoluteUrl(direct), '_blank', 'noopener');
            });
            mk('تحميل', () => triggerDownload(fileObj));
            mk('إعادة المحاولة', () => openSmartViewer(fileObj));
            area.appendChild(panel);
        }

        /**
         * فتح الملف داخل الموقع (لا تنزيل إطلاقاً):
         * تحديد المصدر → رابط الفتح → عارض Google → iframe داخل الـmodal
         */
        async function openSmartViewer(fileObj) {
            const safeName = String(fileObj.name || '').replace(/^"|"$/g, '');
            if(typeof gtag === 'function') gtag('event', 'view_file', { 'file_name': safeName });
            logSupabaseAnalytics('فتح ملف', safeName);

            document.getElementById('pdf-viewer-overlay').classList.remove('hidden');
            document.getElementById('viewer-filename').textContent = safeName;
            document.getElementById('rendering-msg').style.display = 'block';
            document.getElementById('viewer-action-btn').onclick = (e) => { if (e) e.stopPropagation(); triggerDownload(fileObj); };

            const area = document.getElementById('pdf-render-area');
            area.innerHTML = '';
            if (viewerFallbackTimer) { clearTimeout(viewerFallbackTimer); viewerFallbackTimer = null; }

            // 1) تحديد المصدر وبناء الرابط (مع إعادة بناء رابط Cloudinary عند الحاجة)
            if (fileObj.source === 'cloudinary' && !isRealCloudinaryUrl(fileObj.cloudinary_url)) {
                await ensureCloudinaryCloudName();
            }
            const openUrl = getDocumentOpenUrl(fileObj);
            if (!openUrl) {
                logDocumentError('openSmartViewer: رابط غير متوفر', fileObj);
                document.getElementById('rendering-msg').style.display = 'none';
                area.innerHTML = '<div style="padding:24px; text-align:center; font-weight:800; color:#b91c1c;">❌ تعذر تحديد رابط هذا الملف.<br><span style="font-weight:600; font-size:0.9rem; color:#334155;">يرجى إبلاغ المشرف.</span></div>';
                return;
            }

            // [UNEM] عرض موثوق: قراءة الملف وعرضه عبر pdf.js (GitHub / Cloudinary / Supabase)،
            // وعند أي فشل نكمل بالعارض السابق أدناه كما كان.
            try {
                if (window.UNEMFiles && await window.UNEMFiles.renderPdf(fileObj, area)) {
                    const rm = document.getElementById('rendering-msg'); if (rm) rm.style.display = 'none';
                    return;
                }
            } catch (e) { console.warn('[UNEM] pdf.js viewer fallback', e); }

            // 2) عرض PDF داخل الموقع عبر عارض Google (نفس السلوك لملفات GitHub و Cloudinary)
            const viewerUrl = getPdfViewerUrl(fileObj);
            const iframe = document.createElement('iframe');
            iframe.id = 'pdf-direct-frame';
            iframe.setAttribute('allowfullscreen', 'true');
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            iframe.style.border = 'none';
            iframe.style.display = 'block';
            iframe.src = viewerUrl;
            iframe.onload = () => { document.getElementById('rendering-msg').style.display = 'none'; };
            iframe.onerror = () => showViewerFallback(fileObj, 'تعذر عرض الملف داخل العارض.');
            area.appendChild(iframe);

            // 3) بدائل (بدون تنزيل تلقائي) إذا لم يظهر العرض
            viewerFallbackTimer = setTimeout(() => {
                const msgVisible = document.getElementById('rendering-msg').style.display !== 'none';
                if (msgVisible) showViewerFallback(fileObj, 'تعذر عرض الملف داخل العارض.');
            }, 9000);
        }



        /** أداة المشرف: فحص سلامة روابط Cloudinary (لا تحذف أي شيء) */
        async function runCloudinaryAudit() {
            if (!hasPermission('view_analytics')) return;
            const box = document.getElementById('cloudinary-audit-result');
            if (!box) return;
            box.style.display = 'block';
            box.innerHTML = '⏳ جاري الفحص...';
            if (!supabaseClient) { box.innerHTML = '❌ تعذر الاتصال بقاعدة البيانات.'; return; }
            try {
                const { data, error } = await supabaseClient
                    .from('documents')
                    .select('id,name,original_name,source,cloudinary_url,cloudinary_public_id,cloudinary_resource_type,created_at')
                    .order('created_at', { ascending: false })
                    .limit(1000);
                if (error) throw error;
                const rows = data || [];
                const valid = [], empty = [], pointer = [], invalid = [];
                rows.forEach(r => {
                    const u = r.cloudinary_url;
                    if (!u) { empty.push(r); return; }
                    if (u.includes('supabase.co') || u.includes('UNEM_CLOUDINARY_POINTER') || u.startsWith('/api/')) { pointer.push(r); return; }
                    if (isRealCloudinaryUrl(u)) { valid.push(r); return; }
                    invalid.push(r);
                });
                const list = (arr) => arr.slice(0, 20).map(r => `<li style="margin-bottom:4px;">${(r.original_name || r.name)} <span style="color:#64748b;">(${r.cloudinary_resource_type || 'raw'})</span></li>`).join('') || '<li style="color:#64748b;">لا شيء</li>';
                box.innerHTML = `
                    <div style="font-weight:800; margin-bottom:8px;">النتيجة: ${rows.length} سجل</div>
                    <div style="color:#15803d; font-weight:800;">✅ روابط Cloudinary صحيحة: ${valid.length}</div>
                    <div style="color:#b45309; font-weight:800; margin-top:6px;">⚠️ روابط فارغة: ${empty.length}</div><ul>${list(empty)}</ul>
                    <div style="color:#b91c1c; font-weight:800;">❌ روابط Supabase / JSON pointer: ${pointer.length}</div><ul>${list(pointer)}</ul>
                    <div style="color:#b91c1c; font-weight:800;">❌ روابط غير صالحة: ${invalid.length}</div><ul>${list(invalid)}</ul>
                    <div style="margin-top:8px; color:#334155;">هذه الأداة للفحص فقط ولا تحذف أي ملف. لإصلاح الروابط المعطوبة نفّذ دالة الإصلاح في قاعدة البيانات: <code>select public.repair_cloudinary_urls('CLOUD_NAME');</code></div>`;
            } catch (err) {
                console.error(err);
                box.innerHTML = '❌ تعذر تنفيذ الفحص: ' + (err.message || '');
            }
        }

        async function handleGlobalSearch(query) {
            if(query.length === 0) { closeSearch(); return; }
            if(query.length > 2) {
                if(typeof gtag === 'function') gtag('event', 'search', { 'search_term': query });
                logSupabaseAnalytics('بحث', query); 
            }

            hideAll(); document.getElementById('file-list-container').classList.remove('hidden'); document.getElementById('file-list-back-btn').setAttribute('onclick', 'closeSearch()'); document.getElementById('selected-subject-name').textContent = query;
            const pdfList = document.getElementById('pdf-list'); pdfList.innerHTML = ""; const term = normalizeText(query);
            if (allFiles.length === 0) await fetchFilesFromGitHub(currentBranch || 'main');
            const results = allFiles.filter(file => {
                                        const searchableName = String(file.name || file.path || '');
                                        return isSearchableDocument(file) && normalizeText(searchableName).includes(term);
                                    })
                                    .map(file => ({...file, source: 'github'}));

            // البحث أيضاً داخل الملفات الجديدة المرفوعة على Cloudinary
            let docResults = [];
            if (supabaseClient && query.length > 1) {
                try {
                    const { data } = await supabaseClient
                        .from('documents')
                        .select('id,name,original_name,source,cloudinary_url,cloudinary_public_id,cloudinary_resource_type,mime_type,folder,storage_path,github_url,github_path,file_type,subject,subject_code,status,created_at')
                        .or(`name.ilike.%${query}%,original_name.ilike.%${query}%,subject.ilike.%${query}%`)
                        .limit(50);
                    docResults = (data || []).map(mapDocumentRow).filter(isSearchableDocument);
                } catch (err) { console.error(err); }
            }

            const all = [...docResults, ...results];
            pdfList.innerHTML = "";
            if(all.length === 0) { document.getElementById('no-files-msg').classList.remove('hidden'); }
            else { document.getElementById('no-files-msg').classList.add('hidden'); all.forEach(file => pdfList.appendChild(buildFileListItem(file))); }
        }
        
        function closeSearch() { hideAll(); document.getElementById('main-menu').classList.remove('hidden'); }
        function closePdfViewer() { if (viewerFallbackTimer) { clearTimeout(viewerFallbackTimer); viewerFallbackTimer = null; } document.getElementById('pdf-viewer-overlay').classList.add('hidden'); document.getElementById('pdf-render-area').innerHTML = ""; }
        function openUnionModal() { document.getElementById('union-modal-overlay').classList.remove('hidden'); }
        
        function toggleAccordion(contentId, btn) {
            const content = document.getElementById(contentId);
            const icon = btn.querySelector('i');
            const isActive = content.classList.contains('active');

            document.querySelectorAll('.accordion-content').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.accordion-btn').forEach(el => {
                el.classList.remove('active-btn');
                el.querySelector('i').className = 'fas fa-chevron-down';
            });

            if (!isActive) {
                content.classList.add('active');
                btn.classList.add('active-btn');
                icon.className = 'fas fa-chevron-up';
            }
        }

        function closeUnionModal() { 
            document.getElementById('union-modal-overlay').classList.add('hidden'); 
            document.querySelectorAll('.accordion-content').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.accordion-btn').forEach(el => { el.classList.remove('active-btn'); el.querySelector('i').className = 'fas fa-chevron-down'; });
        }
        
        function openWebViewer(url, title) { document.getElementById('web-viewer-title').textContent = title; document.getElementById('web-frame').src = url; document.getElementById('web-viewer-overlay').classList.remove('hidden'); }
        function closeWebViewer() { document.getElementById('web-viewer-overlay').classList.add('hidden'); document.getElementById('web-frame').src = ''; }
        let currentAdminDashPage = null;
        const ADMIN_PERMISSIONS = [
            ['upload_files','رفع ملفات المواد للطلاب (بما فيها PDF)'],
            ['delete_files','حذف ملفات المواد'],
            ['manage_file_order','إعادة ترتيب ملفات المواد'],
            ['manage_whatsapp','إدارة مجموعات WhatsApp'],
            ['manage_announcements','إدارة الإعلانات'],
            ['send_notifications','إرسال الإشعارات ومراجعة سجلها'],
            ['view_analytics','عرض الإحصائيات وترتيب الملفات الأكثر استخداماً'],
            ['manage_document_types','إدارة أنواع الملفات وربطها بالمواد'],
            ['view_student_registrations','عرض أحدث تسجيلات الطلاب والطلبات وإحصاءات النشاط (قراءة فقط)'],
            ['manage_students','إدارة الطلاب: الموافقة والرفض والحذف وإدارة اللوائح والجلسات'],
            ['manage_schedules','إدارة الجداول الدراسية ورفع ملفات PDF الخاصة بها'],
            ['manage_curriculum_subjects','إدارة المناهج والمواد وإعدادات ظهور الماستر'],
            ['manage_platform_settings','إدارة إعدادات المنصة مثل عداد المتصلين'],
            ['manage_results','تغيير إعدادات عرض نتائج الطلاب'],
            ['moderate_community','إشراف المجتمع: دخول المجتمع كمشرف دون تسجيل كطالب، وحذف المحتوى ومراجعة البلاغات']
        ];
        function hasPermission(key){
            if(isAdmin()) return true;
            if(key === 'view_student_registrations') return myPermissions.view_student_registrations === true || myPermissions.manage_students === true;
            return myPermissions[key] === true || (key === 'upload_files' && currentUserRole === 'uploader');
        }
function escapeHtml(value){
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }
        async function loadMyPermissions(){
            myPermissions={};
            if(isAdmin() || !supabaseClient){ isAdminLoggedIn=canUpload(); syncAdminQuickAccess(); window.mdaRefreshAdminCards?.(); return; }
            const email=(await supabaseClient.auth.getUser()).data?.user?.email;
            if(!email){ isAdminLoggedIn=canUpload(); syncAdminQuickAccess(); window.mdaRefreshAdminCards?.(); return; }
            const {data,error}=await supabaseClient.from('supervisor_permissions').select('*').eq('email',email.toLowerCase()).maybeSingle();
            if(error) throw error;
            if(data) ADMIN_PERMISSIONS.forEach(([k])=>myPermissions[k]=data[k]===true);
            isAdminLoggedIn=canUpload();
            syncAdminQuickAccess();
            window.mdaRefreshAdminCards?.();
        }
        function openAdminDashboard(){
            if(!supabaseClient){
                document.getElementById('admin-login-overlay').classList.remove('hidden');
                return;
            }

            /*
             * نظام الدخول الجديد:
             * - Super Admin: لوحة المشرف الرئيسي كاملة.
             * - Supervisor بصلاحية رفع فقط: صفحة الرفع مباشرة.
             * - Supervisor لديه رفع + صلاحيات أخرى: تظهر له لوحة مشرف مصغرة
             *   تحتوي فقط على الأقسام التي منحه المشرف الرئيسي صلاحيتها.
             *
             * مهم: لا نربط ظهور اللوحة بوجود upload_files فقط، لأن ذلك كان
             * سبب اختفاء الصلاحيات الإضافية سابقاً.
             */
            loadMyPermissions().then(()=>{
                if(!hasAdminDashboardAccess()){
                    document.getElementById('admin-login-overlay').classList.remove('hidden');
                    return;
                }
                if(!isAdmin()){
                    const nonUploadPermissions = ADMIN_PERMISSIONS
                        .map(([key])=>key)
                        .filter(key=>key !== 'upload_files' && myPermissions[key] === true);

                    if(!hasPermission('upload_files') && nonUploadPermissions.length === 0){
                        alert('❌ ليست لديك صلاحية للوصول إلى لوحة الإدارة.');
                        return;
                    }

                    // إذا كانت الصلاحية الوحيدة هي رفع الملفات، افتح صفحة الرفع مباشرة.
                    if(nonUploadPermissions.length === 0 && hasPermission('upload_files')){
                        closeAdminDashboard();
                        openUploadModal('upload');
                        return;
                    }

                    // إذا كانت هناك صلاحيات إضافية، اعرض لوحة المشرف المصغرة.
                    const overlay=document.getElementById('admin-dashboard-overlay');
                    const home=document.getElementById('admin-dashboard-home');
                    if(!overlay || !home) return;
                    overlay.classList.remove('hidden');
                    adminDashHome();
                    updateAdminDashboardCards();
                    const title=overlay.querySelector('.admin-dashboard-title');
                    const subtitle=overlay.querySelector('.admin-dashboard-subtitle');
                    if(title) title.textContent='لوحة المشرف';
                    if(subtitle) subtitle.textContent='الأقسام التي منحك المشرف الرئيسي صلاحية الوصول إليها';
                    return;
                }

                // المشرف الرئيسي يرى اللوحة الكاملة.
                const overlay=document.getElementById('admin-dashboard-overlay');
                const home=document.getElementById('admin-dashboard-home');
                if(home) home.querySelectorAll('.admin-dash-card').forEach(b=>b.style.display='none');
                overlay.classList.remove('hidden');
                adminDashHome();
                updateAdminDashboardCards();
                const title=overlay.querySelector('.admin-dashboard-title');
                const subtitle=overlay.querySelector('.admin-dashboard-subtitle');
                if(title) title.textContent='لوحة المشرف الرئيسي';
                if(subtitle) subtitle.textContent='إدارة المنصة والصلاحيات والمجموعات من مكان واحد';
            }).catch(err=>{
                console.error('openAdminDashboard permissions', err);
                alert('❌ تعذر تحميل صلاحيات الحساب.');
            });
        }
        function updateAdminDashboardCards(){
            const map={
                upload:'upload_files',
                whatsapp:'manage_whatsapp',
                permissions:'__admin_only__',
                analytics:'view_analytics',
                announcements:'manage_announcements',
                notifications:'send_notifications',
                types:'manage_document_types',
                'top-files':'view_analytics',
                schedules:'manage_schedules',
                students:'view_student_registrations',
                'platform-settings':'manage_platform_settings',
                'file-order':'manage_file_order',
                'curriculum-subjects':'manage_curriculum_subjects',
                community:'moderate_community'
            };
            document.querySelectorAll('#admin-dashboard-home .admin-dash-card').forEach(b=>{
                const onclick=b.getAttribute('onclick')||'';
                let key=b.getAttribute('data-dash-key') || Object.keys(map).find(k=>onclick.includes("'"+k+"'")||onclick.includes(k+'Dashboard'));
                if(!key) return;
                const allowed=map[key]==='__admin_only__' ? isAdmin() : hasPermission(map[key]);
                b.style.display=allowed?'flex':'none';
                b.style.visibility=allowed?'visible':'hidden';
                b.style.pointerEvents=allowed?'auto':'none';
            });
        }

        function closeAdminDashboard(){document.getElementById('admin-dashboard-overlay')?.classList.add('hidden');}
        function adminDashHome(){currentAdminDashPage=null;document.getElementById('admin-dashboard-home').style.display='grid';document.getElementById('admin-dashboard-page').style.display='none';}
        async function adminDashOpen(page){
            const required={
                upload:'upload_files',
                whatsapp:'manage_whatsapp',
                announcements:'manage_announcements',
                notifications:'send_notifications',
                types:'manage_document_types',
                analytics:'view_analytics',
                'top-files':'view_analytics',
                students:'view_student_registrations',
                'platform-settings':'manage_platform_settings',
                'file-order':'manage_file_order',
                'curriculum-subjects':'manage_curriculum_subjects',
                curriculum:'manage_curriculum_subjects'
            }[page];
            if(page==='permissions'&&!isAdmin()) return alert('❌ إدارة الصلاحيات للمشرف الرئيسي فقط.');
            if(required && !hasPermission(required)) return alert('❌ ليست لديك الصلاحية لهذا القسم.');
            currentAdminDashPage=page;
            if(page==='top-files'){ closeAdminDashboard(); openTopFilesPage(); return; }
            if(page==='analytics'){ closeAdminDashboard(); openAnalyticsDashboard(); return; }
            if(page==='platform-settings'){ closeAdminDashboard(); openUploadModal('settings'); return; }
            if(page==='curriculum-subjects'){ closeAdminDashboard(); openUploadModal('curriculum-subjects'); return; }
            if(page==='file-order'){
                document.getElementById('admin-dashboard-home').style.display='none';
                document.getElementById('admin-dashboard-page').style.display='block';
                document.getElementById('admin-dashboard-page-content').innerHTML='<div class="admin-page-box"><h3>↕️ ترتيب ملفات المواد</h3><p>افتح التخصص والمستوى والفصل والمادة من الواجهة الرئيسية؛ ستظهر لك أدوات تحريك الملفات إلى الأعلى أو الأسفل بجوار الملف.</p></div>';
                return;
            }
            if(page==='upload'||page==='announcements'||page==='notifications'||page==='types'||page==='curriculum-subjects'){
                closeAdminDashboard();
                openUploadModal(page);
                return;
            }
            document.getElementById('admin-dashboard-home').style.display='none'; document.getElementById('admin-dashboard-page').style.display='block';
            const c=document.getElementById('admin-dashboard-page-content');
            if(page==='permissions'){renderPermissionsAdmin();return;}
            if(page==='whatsapp'){renderWhatsAppAdmin();return;}
            if(page==='students'){renderStudentsAdmin();return;}
        }

        // توافق مع أزرار HTML المباشرة: ضمان توفر دوال الإدارة عالمياً حتى داخل WebView/PWA.
        window.adminDashOpen = adminDashOpen;
        window.adminDashHome = adminDashHome;
        window.openAdminDashboard = openAdminDashboard;

        async function renderWhatsAppAdmin(){
            const c=document.getElementById('admin-dashboard-page-content');
            c.innerHTML='<div class="admin-page-box"><h3>🟢 إدارة مجموعات WhatsApp</h3><p>يمكنك إضافة مجموعات عامة للمستوى (تظهر لجميع التخصصات) أو مجموعة خاصة بتخصص ومستوى محدد. عند إضافة رابط جديد لنفس النوع والمستوى يتم استبدال الرابط القديم تلقائياً.</p><div class="wa-admin-row"><div style="display:grid;gap:8px;grid-template-columns:repeat(4,1fr)"><select id="wa-type" onchange="toggleWhatsAppSpecField()"><option value="general">🌐 مجموعة عامة للمستوى</option><option value="specialization">🎓 مجموعة خاصة بالتخصص</option></select><select id="wa-spec"><optgroup label="Licence"><option>BA</option><option>FC</option><option>TCM</option><option>GRH</option><option>SAE</option><option>IG</option></optgroup><optgroup label="Master"><option>MASTER_FC</option><option>MASTER_IG</option></optgroup></select><select id="wa-level"><optgroup label="Licence"><option>L1</option><option>L2</option><option>L3</option></optgroup><optgroup label="Master"><option>M1</option><option>M2</option></optgroup></select><input id="wa-url" type="url" placeholder="رابط مجموعة WhatsApp"></div><div class="wa-actions"><button class="wa-save" onclick="saveWhatsAppGroup()">حفظ الرابط</button></div></div><div id="wa-admin-list">⏳ جاري التحميل...</div></div>'; toggleWhatsAppSpecField();
            await loadWhatsAppAdminList();
        }
        function toggleWhatsAppSpecField(){
            const type=document.getElementById('wa-type')?.value||'general';
            const spec=document.getElementById('wa-spec');
            if(spec){spec.disabled=type==='general'; spec.style.opacity=type==='general'?'.55':'1';}
        }
        async function loadWhatsAppAdminList(){
            const el=document.getElementById('wa-admin-list'); if(!el||!supabaseClient)return;
            const {data,error}=await supabaseClient.from('whatsapp_groups').select('*').order('level').order('group_type').order('specialization');
            if(error){el.innerHTML='<div class="status-msg error">❌ '+escapeHtml(error.message)+'</div>';return;}
            const rows=data||[];
            el.innerHTML=rows.map(x=>{
                const isGeneral=(x.group_type||'specialization')==='general';
                const title=isGeneral?`🌐 مجموعة عامة · ${escapeHtml(x.level)}`:`🎓 ${escapeHtml(whatsappSpecLabel(x.specialization))} · ${escapeHtml(x.level)}`;
                const badge=isGeneral?'لجميع التخصصات':'خاصة بالتخصص';
                return `<div class="wa-admin-row"><div><b>${title}</b><div style="font-size:.78rem;color:#64748b;margin-top:5px">${badge} · ${escapeHtml(x.url)}</div></div><div class="wa-actions"><button class="wa-del" onclick="deleteWhatsAppGroup('${x.id}')">حذف</button></div></div>`;
            }).join('')||'<p>لا توجد مجموعات مضافة.</p>';
        }
        async function saveWhatsAppGroup(){
            if(!hasPermission('manage_whatsapp'))return;
            const v=id=>document.getElementById(id)?.value.trim()||'';
            const type=v('wa-type')||'general';
            const spec=v('wa-spec').toUpperCase();
            const level=v('wa-level').toUpperCase();
            const url=v('wa-url');
            const saveBtn=document.querySelector('#admin-dashboard-page-content .wa-save');

            if(!['general','specialization'].includes(type))return alert('❌ اختر نوع المجموعة.');
            if(type==='specialization'&&!spec)return alert('❌ اختر التخصص.');
            if(!level)return alert('❌ اختر المستوى.');
            if(!url)return alert('❌ أدخل رابط مجموعة WhatsApp.');
            if(!/^https:\/\/(chat\.whatsapp\.com|wa\.me)\//i.test(url)) return alert('❌ أدخل رابط WhatsApp صالحاً.');

            if(saveBtn){saveBtn.disabled=true;saveBtn.dataset.originalText=saveBtn.textContent;saveBtn.textContent='⏳ جاري الحفظ...';}
            try{
                if(!supabaseClient) throw new Error('Supabase غير متصل.');
                // نستبدل الرابط السابق لنفس النوع والمستوى (وللتخصص نفسه عند النوع الخاص).
                let del=supabaseClient.from('whatsapp_groups').delete().eq('level',level).eq('group_type',type);
                if(type==='specialization') del=del.eq('specialization',spec);
                else del=del.is('specialization',null);
                const {error:deleteError}=await del;
                if(deleteError) throw deleteError;

                const {error:insertError}=await supabaseClient.from('whatsapp_groups').insert({
                    name:type==='general'?'مجموعة WhatsApp عامة':'مجموعة WhatsApp للتخصص',
                    academic_year:null,
                    specialization:type==='general'?null:spec,
                    level:level,
                    group_type:type,
                    url:url,
                    is_active:true
                });
                if(insertError) throw insertError;
                const input=document.getElementById('wa-url'); if(input)input.value='';
                await loadWhatsAppAdminList();
                alert('✅ تم حفظ رابط WhatsApp بنجاح.');
            }catch(error){alert('❌ تعذر حفظ الرابط: '+(error?.message||error));}
            finally{if(saveBtn){saveBtn.disabled=false;saveBtn.textContent=saveBtn.dataset.originalText||'حفظ الرابط';}}
        }
        async function deleteWhatsAppGroup(id){if(!confirm('حذف رابط مجموعة WhatsApp؟'))return;const {error}=await supabaseClient.from('whatsapp_groups').delete().eq('id',id);if(error)alert('❌ '+error.message);else loadWhatsAppAdminList();}
        const WHATSAPP_LICENCE_SPECIALIZATIONS = [
            ['BA','spec_ba'],['FC','spec_fc'],['TCM','spec_tcm'],
            ['GRH','spec_grh'],['SAE','spec_sae'],['IG','spec_ig']
        ];
        const WHATSAPP_MASTER_SPECIALIZATIONS = [
            ['MASTER_FC','master_fc_desc'],['MASTER_IG','master_ig_desc']
        ];
        const WHATSAPP_SPECIALIZATIONS = WHATSAPP_LICENCE_SPECIALIZATIONS.concat(WHATSAPP_MASTER_SPECIALIZATIONS);
        let whatsappHubLevel = '';

        function whatsappText(key, fallback){
            return (i18n[currentLang] && i18n[currentLang][key]) || fallback;
        }
        function whatsappSpecLabel(spec){
            const value=String(spec||'').toUpperCase();
            const key=value==='MASTER_FC'?'master_fc_desc':value==='MASTER_IG'?'master_ig_desc':('spec_'+value.toLowerCase());
            return whatsappText(key, value.replace(/^MASTER_/, 'Master '));
        }
        function whatsappCleanSpecDescription(label, description){
            const normalize = value => String(value || '').toLowerCase()
                .replace(/[\u064B-\u065Fـ]/g,'').replace(/[\s،,:;.!؟!?·—–-]+/g,'')
                .replace(/^(ماستر|master|filiere|filière|تخصص)/,'');
            const a=normalize(label), b=normalize(description);
            if(!b || b===a || b.includes(a) || a.includes(b)) return '';
            return description;
        }

        function openWhatsAppHub(){
            const ov=document.getElementById('whatsapp-groups-overlay');
            if(!ov) return;
            ov.classList.remove('hidden');
            document.body.classList.add('whatsapp-page-open');
            const body=document.querySelector('#whatsapp-groups-overlay .whatsapp-hub-body');
            if(body) body.scrollTop=0;
            renderWhatsAppHubLevels();
        }

        function whatsappGoHome(){
            closeWhatsAppGroups();
            const home=document.getElementById('home-page') || document.querySelector('.home-page') || document.querySelector('[data-page="home"]');
            if(home && typeof home.scrollIntoView==='function') home.scrollIntoView({behavior:'smooth',block:'start'});
            window.scrollTo({top:0,behavior:'smooth'});
        }

        function renderWhatsAppHubLevels(){
            const picker=document.getElementById('whatsapp-level-picker');
            const content=document.getElementById('whatsapp-groups-content');
            if(!picker) return;
            const levels=[
                ['L1','level_1','licence'],['L2','level_2','licence'],['L3','level_3','licence'],
                ['M1','level_m1','master'],['M2','level_m2','master']
            ].filter(([, , cycle]) => cycle !== 'master' || (typeof window.unemMasterVisible !== 'function' || window.unemMasterVisible()));
            let previousCycle='';
            picker.innerHTML=levels.map(([level,key,cycle])=>{
                const heading = previousCycle !== cycle
                    ? `<div class="whatsapp-cycle-divider ${cycle}"><span>${escapeHtml(whatsappText(cycle==='master'?'whatsapp_cycle_master':'whatsapp_cycle_licence',cycle==='master'?'Master':'Licence'))}</span></div>`
                    : '';
                previousCycle=cycle;
                return heading + `<button type="button" class="whatsapp-level-card ${cycle==='master'?'master-level':''} ${whatsappHubLevel===level?'active':''}" onclick="selectWhatsAppHubLevel('${level}')"><i class="fas ${cycle==='master'?'fa-graduation-cap':'fa-layer-group'}"></i><strong>${level}</strong><small>${escapeHtml(whatsappText(key,level))}</small></button>`;
            }).join('');
            if(!whatsappHubLevel){
                content?.classList.add('hidden');
                return;
            }
            content?.classList.remove('hidden');
            renderWhatsAppHubGroups(whatsappHubLevel);
        }

        async function selectWhatsAppHubLevel(level){
            whatsappHubLevel=String(level||'').toUpperCase();
            renderWhatsAppHubLevels();
            const content=document.getElementById('whatsapp-groups-content');
            content?.scrollIntoView({behavior:'smooth',block:'nearest'});
        }

        function renderWhatsAppSpecializations(){
            const picker=document.getElementById('whatsapp-specialization-picker');
            if(!picker)return;
            const isMaster = /^M[12]$/i.test(String(whatsappHubLevel||''));
            const list = isMaster ? WHATSAPP_MASTER_SPECIALIZATIONS : WHATSAPP_LICENCE_SPECIALIZATIONS;
            const cycleKey = isMaster ? 'whatsapp_cycle_master' : 'whatsapp_cycle_licence';
            picker.innerHTML = `<div class="whatsapp-spec-cycle-label ${isMaster?'master':''}">${escapeHtml(whatsappText(cycleKey,isMaster?'Master':'Licence'))}</div>` +
                list.map(([spec,key])=>{
                    const label = whatsappSpecLabel(spec);
                    const description = whatsappCleanSpecDescription(label, whatsappText(key, spec));
                    return `<button type="button" class="whatsapp-spec-btn ${isMaster?'master-spec':''}" data-spec="${spec}" onclick="loadWhatsAppSpecializationGroups('${spec}')"><span>${escapeHtml(label)}</span>${description ? `<br><small>${escapeHtml(description)}</small>` : ''}</button>`;
                }).join('');
        }

        function whatsappBackToLevels(){
            whatsappHubLevel='';
            const content=document.getElementById('whatsapp-groups-content');
            content?.classList.add('hidden');
            const result=document.getElementById('whatsapp-specialization-result');
            result?.classList.add('hidden');
            const stage=document.getElementById('whatsapp-specialization-stage');
            stage?.classList.remove('hidden');
            renderWhatsAppHubLevels();
            document.getElementById('whatsapp-level-picker')?.scrollIntoView({behavior:'smooth',block:'nearest'});
        }

        function whatsappBackToSpecializations(){
            document.getElementById('whatsapp-specialization-result')?.classList.add('hidden');
            document.getElementById('whatsapp-specialization-stage')?.classList.remove('hidden');
            document.querySelectorAll('.whatsapp-spec-btn').forEach(btn=>btn.classList.remove('active'));
            document.getElementById('whatsapp-specialization-picker')?.scrollIntoView({behavior:'smooth',block:'nearest'});
        }

        function whatsappGroupLink(group, type, level, spec=''){
            const general=type==='general';
            const specLabel=whatsappSpecLabel(spec);
            const title=general ? whatsappText('whatsapp_general','🌐 مجموعة عامة للمستوى') : whatsappText('whatsapp_specialization','🎓 مجموعة خاصة بالتخصص');
            const desc=general
                ? whatsappText('whatsapp_general_desc','متاحة لجميع التخصصات')+' '+escapeHtml(level)
                : whatsappText('whatsapp_specialization_desc','خاصة بتخصص')+' '+escapeHtml(specLabel)+' · '+escapeHtml(level);
            return `<a class="whatsapp-group-link ${general?'general':'specialization'}" href="${escapeHtml(group.url)}" target="_blank" rel="noopener noreferrer"><span><span class="whatsapp-group-link-title"><i class="fab fa-whatsapp"></i>${title}</span><small>${desc}</small></span><span>${whatsappText('whatsapp_open','فتح ↗')}</span></a>`;
        }

        async function renderWhatsAppHubGroups(level){
            const generalEl=document.getElementById('whatsapp-general-list');
            if(!generalEl||!supabaseClient)return;
            document.getElementById('whatsapp-selected-level-title').textContent=level;
            document.getElementById('whatsapp-specialization-stage')?.classList.remove('hidden');
            document.getElementById('whatsapp-specialization-result')?.classList.add('hidden');
            renderWhatsAppSpecializations();
            generalEl.innerHTML='<div class="whatsapp-empty">'+whatsappText('whatsapp_loading','⏳ جاري التحميل...')+'</div>';

            const {data,error}=await supabaseClient.from('whatsapp_groups')
                .select('*').eq('is_active',true).eq('level',level).eq('group_type','general').order('created_at',{ascending:true});
            if(error){
                generalEl.innerHTML='<div class="whatsapp-empty">'+escapeHtml(whatsappText('whatsapp_load_error','تعذر تحميل المجموعات.'))+'</div>';
                return;
            }
            const groups=data||[];
            generalEl.innerHTML=groups.map(g=>whatsappGroupLink(g,'general',level)).join('') ||
                '<div class="whatsapp-empty">'+whatsappText('whatsapp_no_general','لا توجد مجموعة عامة لهذا المستوى حالياً.')+'</div>';
        }

        async function loadWhatsAppSpecializationGroups(spec){
            const level=whatsappHubLevel;
            if(!level||!supabaseClient)return;
            spec=String(spec||'').trim().toUpperCase();
            if(!WHATSAPP_SPECIALIZATIONS.some(([s])=>s===spec))return;

            document.querySelectorAll('.whatsapp-spec-btn').forEach(btn=>btn.classList.toggle('active',btn.dataset.spec===spec));
            document.getElementById('whatsapp-specialization-stage')?.classList.add('hidden');
            const result=document.getElementById('whatsapp-specialization-result');
            result?.classList.remove('hidden');
            const list=document.getElementById('whatsapp-specialization-list');
            if(!list)return;
            list.innerHTML='<div class="whatsapp-empty">'+whatsappText('whatsapp_loading','⏳ جاري التحميل...')+'</div>';

            const {data,error}=await supabaseClient.from('whatsapp_groups')
                .select('*').eq('is_active',true).eq('level',level).eq('group_type','specialization')
                .eq('specialization',spec).order('created_at',{ascending:true});
            if(error){
                list.innerHTML='<div class="whatsapp-empty">'+escapeHtml(whatsappText('whatsapp_load_error','تعذر تحميل المجموعات.'))+'</div>';
                return;
            }
            list.innerHTML=(data||[]).map(g=>whatsappGroupLink(g,'specialization',level,spec)).join('') ||
                '<div class="whatsapp-empty">'+whatsappText('whatsapp_no_spec','لا توجد مجموعة خاصة بهذا التخصص حالياً.')+'</div>';
        }

        /* Backward-compatible entry point for any existing call elsewhere in the legacy app. */
        async function openWhatsAppGroups(spec, level){
            openWhatsAppHub();
            if(level){
                whatsappHubLevel=String(level).toUpperCase();
                renderWhatsAppHubLevels();
                if(spec) await loadWhatsAppSpecializationGroups(String(spec).toUpperCase());
            }
        }

        function closeWhatsAppGroups(){
            document.getElementById('whatsapp-groups-overlay')?.classList.add('hidden');
            document.body.classList.remove('whatsapp-page-open');
            whatsappHubLevel='';
            const body=document.querySelector('#whatsapp-groups-overlay .whatsapp-hub-body');
            if(body) body.scrollTop=0;
        }
        async function renderPermissionsAdmin(){
            const c=document.getElementById('admin-dashboard-page-content');
            c.innerHTML='<div class="admin-page-box"><h3>🔐 صلاحيات المشرفين</h3><p>أدخل البريد الإلكتروني للمشرف، ثم اختر بدقة ما تريد منحه له. تشمل القائمة جميع أقسام التفويض؛ إدارة الصلاحيات نفسها تبقى للمشرف الرئيسي فقط.</p><div class="wa-admin-row"><input id="perm-email" type="email" autocomplete="off" placeholder="email@example.com"><button class="wa-save" onclick="loadSupervisorPermission()">تحميل الصلاحيات</button></div><div id="perm-box"></div></div>';
        }
        async function loadSupervisorPermission(){
            const email=document.getElementById('perm-email').value.trim().toLowerCase();if(!email)return alert('أدخل البريد الإلكتروني للمشرف.');const box=document.getElementById('perm-box');
            box.innerHTML='<p>⏳ جاري تحميل الصلاحيات…</p>';
            const {data,error}=await supabaseClient.from('supervisor_permissions').select('*').eq('email',email).maybeSingle();
            if(error){box.innerHTML='<div class="status-msg error" style="display:block">❌ '+escapeHtml(error.message)+'</div>';return;}
            box.innerHTML='<div style="display:grid;gap:10px;margin-top:15px">'+ADMIN_PERMISSIONS.map(([k,label])=>`<label style="display:flex;gap:10px;align-items:center;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:11px"><input type="checkbox" data-supervisor-permission="1" id="perm-${k}" ${data&&data[k]===true?'checked':''}> <span>${label}</span></label>`).join('')+'<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="wa-save" onclick="setAllSupervisorPermissions(true)">تحديد جميع الصلاحيات</button><button type="button" class="wa-save" style="background:#64748b" onclick="setAllSupervisorPermissions(false)">إلغاء التحديد</button></div><button class="btn-submit" onclick="saveSupervisorPermission()" style="margin-top:4px">حفظ الصلاحيات</button></div>';
        }
        function setAllSupervisorPermissions(checked){document.querySelectorAll('#perm-box input[data-supervisor-permission="1"]').forEach(el=>el.checked=!!checked);}
        async function saveSupervisorPermission(){
            const email=document.getElementById('perm-email')?.value.trim().toLowerCase();
            if(!email)return alert('أدخل البريد الإلكتروني للمشرف.');
            if(!supabaseClient)return alert('❌ تعذر الاتصال بقاعدة البيانات. أعد تحميل الصفحة وحاول مجددًا.');
            const row={email};
            ADMIN_PERMISSIONS.forEach(([k])=>row[k]=!!document.getElementById('perm-'+k)?.checked);
            const button=document.querySelector('#perm-box .btn-submit');
            const originalText=button?.textContent||'حفظ الصلاحيات';
            if(button){button.disabled=true;button.textContent='⏳ جاري حفظ الصلاحيات...';}
            try{
                let {error}=await supabaseClient.from('supervisor_permissions').upsert(row,{onConflict:'email'});
                let communityColumnMissing=false;
                if(error && /moderate_community/i.test(String(error.message||error))){
                    // قاعدة البيانات لم تُحدَّث بعد بصلاحية إشراف المجتمع: احفظ بقية الصلاحيات ونبّه المشرف.
                    const fallbackRow={...row}; delete fallbackRow.moderate_community;
                    communityColumnMissing=true;
                    ({error}=await supabaseClient.from('supervisor_permissions').upsert(fallbackRow,{onConflict:'email'}));
                }
                if(error)throw error;
                alert(communityColumnMissing
                    ? '✅ تم حفظ الصلاحيات، لكن «إشراف المجتمع» لم تُحفظ.\nشغّل db/20261018090000_community_staff_access_and_visitors.sql في Supabase SQL Editor ثم احفظ الصلاحيات مجدداً.'
                    : '✅ تم حفظ صلاحيات المشرف.');
            }catch(error){
                console.error('Supervisor permissions save failed:',error);
                const message=String(error?.message||error);
                const missingSchemaColumn=/Could not find the '.+' column of 'supervisor_permissions' in the schema cache|column .+ does not exist/i.test(message);
                const guidance=missingSchemaColumn
                    ?'قاعدة البيانات أو مخطط Supabase لم يُحدّث بعد. شغّل db/20261017090000_repair_supervisor_permissions_schema.sql في Supabase SQL Editor، ثم أعد تحميل الصفحة وحاول مجددًا.'
                    :message;
                alert('❌ تعذر حفظ صلاحيات المشرف.\n'+guidance);
            }finally{
                if(button){button.disabled=false;button.textContent=originalText;}
            }
        }

        function setAdminSectionVisibility(section){
            const overlay=document.getElementById('upload-modal-overlay'); if(!overlay)return;

            // كل قسم يعتمد على الصلاحية الفعلية، وليس على كون الحساب Super Admin فقط.
            // أدوات الإحصاءات وفحص الملفات للقراءة فقط، وتظهر لمن مُنح view_analytics;
            // أما تعديل الإعدادات العامة فله صلاحية منفصلة.
            let allowed=[];
            if(section==='upload'){
                allowed = ['upload-form'];
                if(hasPermission('view_analytics')) allowed.push('admin-only-analytics');
            } else if(section==='settings'){
                if(hasPermission('manage_platform_settings')) allowed = ['admin-only-analytics','admin-online-public-setting','admin-home-stats-setting','admin-onboarding-prompts-setting'];
            } else if(section==='types'){
                if(hasPermission('manage_document_types')) allowed = ['types-admin-section'];
            } else if(section==='curriculum-subjects'){
                if(hasPermission('manage_curriculum_subjects')) allowed = ['types-admin-section'];
            } else if(section==='announcements'){
                if(hasPermission('manage_announcements')) allowed = ['ann-admin-section'];
            } else if(section==='notifications'){
                if(hasPermission('send_notifications')) allowed = ['push-admin-section'];
            }

            const title=overlay.querySelector('[data-i18n="upload_title"]');
            if(title) title.textContent =
                section==='upload' ? 'لوحة رفع الملفات' :
                section==='types' ? 'إدارة أنواع الملفات' :
                section==='curriculum-subjects' ? 'إدارة المواد المشتركة والماستر' :
                section==='settings' ? 'إعدادات المنصة' :
                section==='announcements' ? 'إدارة الإعلانات' : 'إدارة الإشعارات';

            ['admin-only-analytics','admin-online-public-setting','admin-home-stats-setting','admin-onboarding-prompts-setting','upload-form','types-admin-section','ann-admin-section','push-admin-section'].forEach(id=>{
                const el=document.getElementById(id);
                if(el) el.style.display=allowed.includes(id)?'':'none';
            });
            const toggleSiblingRange=(startId,endId,visible)=>{
                const start=document.getElementById(startId), end=endId?document.getElementById(endId):null;
                if(!start)return;
                let node=start;
                while(node&&node!==end){node.style.display=visible?'':'none';node=node.nextElementSibling;}
            };
            const canManageTypes=hasPermission('manage_document_types');
            const canManageCurriculum=hasPermission('manage_curriculum_subjects');
            toggleSiblingRange('document-types-admin-heading','common-subject-admin-heading',section==='types'&&canManageTypes);
            toggleSiblingRange('common-subject-admin-heading','master-subject-admin-heading',canManageCurriculum&&(section==='types'||section==='curriculum-subjects'));
            toggleSiblingRange('master-subject-admin-heading',null,canManageCurriculum&&(section==='types'||section==='curriculum-subjects'));
            const analyticsButtons=overlay.querySelectorAll('#admin-only-analytics > button');
            analyticsButtons.forEach(el=>el.style.display=section==='settings'?'none':'');
            if(section==='settings'){
                const audit=document.getElementById('cloudinary-audit-result');
                if(audit){audit.innerHTML='';audit.style.display='none';}
            }

            if(!hasPermission('view_analytics')){
                const audit=document.getElementById('cloudinary-audit-result');
                if(audit){ audit.innerHTML=''; audit.style.display='none'; }
            }
        }

        function openUploadModal(section='upload') {
            const required={
                upload:'upload_files',
                types:'manage_document_types',
                announcements:'manage_announcements',
                notifications:'send_notifications',
                settings:'manage_platform_settings',
                'curriculum-subjects':'manage_curriculum_subjects'
            }[section]||'upload_files';

            if (!hasPermission(required)) {
                alert('❌ ليست لديك الصلاحية لهذا القسم.');
                return;
            }

            applyRoleUI();
            setAdminSectionVisibility(section);
            document.getElementById('upload-modal-overlay').classList.remove('hidden');

            if(section==='upload'){
                resetUploadSelectors();
                loadDynamicRegistries();
            }
            if(section==='announcements') loadAnnouncementsAdmin();
            if(section==='settings'){ loadPublicOnlineSetting(); loadHomeStatsSettings(); loadPromptSettings(); }
            if(section==='notifications') {
                loadPushHistoryAdmin();
                loadPushActiveDeviceCount();
            }
        }
        function closeUploadModal() {
            document.getElementById('upload-modal-overlay').classList.add('hidden');
            document.getElementById('upload-status').textContent = '';
            document.getElementById('upload-form').reset();
            resetUploadSelectors();
            uploadQueue = [];
            renderUploadQueue();
            setAdminSectionVisibility('upload');
        }

        /* =====================================================================
           نموذج الرفع المترابط: التخصص → المستوى → الفصل (تابع للمستوى) → المادة
           المرجع الوحيد للفصول التابعة لكل مستوى (نفس منطق showSemesters)
           ===================================================================== */
        const SEMESTERS_BY_LEVEL = { L1: ['S1', 'S2'], L2: ['S3', 'S4'], L3: ['S5', 'S6'], M1: ['S1', 'S2'], M2: ['S3', 'S4'] };

        function semestersForLevel(level) {
            return SEMESTERS_BY_LEVEL[String(level || '').toUpperCase()] || [];
        }
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

        /* =====================================================================
           نظام الرفع الجديد: المتصفح → (توقيع آمن من الخادم) → Cloudinary → Supabase
           - سر Cloudinary لا يوجد إطلاقاً في هذا الملف.
           - رفع متعدد + Drag & Drop + شريط تقدم لكل ملف + تحقق من الصلاحية.
           ===================================================================== */
        const MAX_UPLOAD_SIZE = 60 * 1024 * 1024; // 60 MB
        let uploadQueue = [];
        let isUploading = false;

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

        // ترتيب الملفات يتم الآن مباشرة من قائمة الملفات بواسطة زري ↑ و ↓ للمشرف الرئيسي فقط.

        // ===================== Online Presence =====================
        // عدّاد لحظي يعتمد على Supabase Realtime Presence، وليس على قيمة ثابتة أو cache.
        let unemPresenceChannel = null;
        let unemPresenceCount = 0;
        let publicOnlineSetting = false;
        let presenceBound = false;
        let presenceHeartbeat = null;
        let presenceRetryTimer = null;
        let presenceKey = null;

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

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                trackCurrentPresence();
            } else {
                stopPresenceHeartbeat();
                try { if (unemPresenceChannel) unemPresenceChannel.untrack(); } catch (_) {}
                setTimeout(refreshOnlineCount, 250);
            }
        });

        window.addEventListener('pagehide', () => {
            stopPresenceHeartbeat();
            try { if (unemPresenceChannel) unemPresenceChannel.untrack(); } catch (_) {}
        });

        window.addEventListener('beforeunload', () => {
            stopPresenceHeartbeat();
            try { if (unemPresenceChannel) unemPresenceChannel.untrack(); } catch (_) {}
        });

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

        const uploadForm = document.getElementById('upload-form');
        const statusDiv = document.getElementById('upload-status');
        const submitBtn = document.getElementById('upload-submit-btn');

        document.getElementById('public-online-count-toggle')?.addEventListener('change', e => savePublicOnlineSetting(e.target.checked));
        initOnlinePresence();

        // ---- Drag & Drop + اختيار الملفات ----
        (function initDropzone() {
            const dz = document.getElementById('upload-dropzone');
            const input = document.getElementById('upload-file');
            if (!dz || !input) return;
            dz.addEventListener('click', () => input.click());
            input.addEventListener('change', () => { addFilesToQueue(input.files); input.value = ''; });
            ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('dragover'); }));
            ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('dragover'); }));
            dz.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files) addFilesToQueue(e.dataTransfer.files); });
        })();

        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (isUploading) return;
            if (!supabaseClient) { statusDiv.textContent = '❌ تعذر الاتصال بقاعدة البيانات.'; statusDiv.className = 'status-msg error'; return; }

            const spec = document.getElementById('upload-spec').value;
            const level = document.getElementById('upload-level').value;
            const semester = document.getElementById('upload-semester').value;
            const subject = document.getElementById('upload-subject').value;
            const type = document.getElementById('upload-type').value;

            const fail = (msg) => { statusDiv.textContent = msg; statusDiv.className = 'status-msg error'; };
            if (!spec) { fail('⚠️ يرجى اختيار التخصص.'); return; }
            if (!level) { fail('⚠️ يرجى اختيار المستوى.'); return; }
            if (!semester) { fail('⚠️ يرجى اختيار الفصل.'); return; }
            if (!isLevelSemesterValid(level, semester)) {
                fail(`⚠️ الفصل ${semester} لا ينتمي إلى المستوى ${level}. المسموح: ${semestersForLevel(level).join(' / ')}.`); return;
            }
            if (!subject) { fail('⚠️ يرجى اختيار المادة.'); return; }
            if (!isMasterUploadContext(spec, level, subject) && !subjectsForUpload(spec, level, semester).includes(subject) && !isCommonSubjectName(subject)) {
                fail(`⚠️ المادة «${subject}» غير موجودة في ${spec} / ${semester}.`); return;
            }
            if (!type) { fail('⚠️ يرجى اختيار نوع الملف.'); return; }
            if (!uploadSubjectTypes.some(t => typeSlug(t.slug || t.name) === type)) {
                fail(`⚠️ نوع الملف المختار غير مرتبط بالمادة «${subject}». حدّث الصفحة أو اختر نوعاً من القائمة.`); return;
            }
            const pending = uploadQueue.filter(item => item.state === 'pending');
            if (pending.length === 0) { statusDiv.textContent = '⚠️ لم يتم اختيار أي ملف صالح.'; statusDiv.className = 'status-msg error'; return; }

            let token;
            try {
                await refreshUserRole();
                applyRoleUI();
                if (!canUpload()) throw new Error('❌ ليس لديك صلاحية لتنفيذ هذه العملية.');
                token = await getAccessToken();
                if (!token) throw new Error('❌ انتهت الجلسة، يرجى تسجيل الدخول مجدداً.');
            } catch (err) {
                statusDiv.textContent = err.message; statusDiv.className = 'status-msg error'; return;
            }

            isUploading = true; submitBtn.disabled = true;
            let success = 0, failed = 0;

            for (const item of pending) {
                updateQueueItem(item, { state: 'uploading', progress: 0, message: 'جاري الرفع...' });
                statusDiv.textContent = `⏳ جاري الرفع (${success + failed + 1}/${pending.length})...`;
                statusDiv.className = 'status-msg';
                try {
                    // معالجة الملف: توقيع UNEM للـ PDF، تحويل الصور إلى PDF، Office يبقى كما هو
                    updateQueueItem(item, { message: 'جاري معالجة الملف...' });
                    if (!window.UNEMUpload || typeof window.UNEMUpload.prepareFile !== 'function') {
                        throw new Error('❌ وحدة الرفع UNEMUpload غير متاحة. أعد تحميل الصفحة وحاول مرة أخرى.');
                    }
                    const prepared = await window.UNEMUpload.prepareFile(item.file, { sign: true });
                    if ((prepared.kind === 'image' || prepared.kind === 'pdf') && !prepared.signed) {
                        throw new Error('❌ تعذر توقيع الملف بعلامة UNEM. تم إيقاف الرفع بدلاً من رفع ملف بدون توقيع.');
                    }
                    const requestedName = String(item.displayName || '').trim().replace(/\.[A-Za-z0-9]+$/, '');
                    const fallbackBase = prepared.originalName.replace(/\.[A-Za-z0-9]+$/, '');
                    const safeBase = (requestedName || fallbackBase).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150) || 'document';
                    const uploadName = safeBase + '.' + prepared.ext;

                    const signature = await requestUploadSignature({
                        specialization: storageSpecializationFor(effectiveUploadSpec(spec, level, subject)), level: storageLevelFor(effectiveUploadSpec(spec, level, subject), level), semester,
                        subject: subject,
                        subjectCode: storageSubjectCode(spec, level, subject),
                        cycle: isMasterCycle(spec, level) ? 'master' : 'licence',
                        fileType: type,
                        fileTypeSlug: type,
                        fileName: uploadName,
                        fileSize: prepared.size
                    }, token);

                    updateQueueItem(item, { message: prepared.signed ? 'تم التوقيع، جاري الرفع...' : 'جاري الرفع...' });
                    const result = await uploadToCloudinary(signature, prepared.blob, (p) => {
                        updateQueueItem(item, { progress: Math.min(p, 99) });
                    });

                    updateQueueItem(item, { progress: 100, message: 'جاري حفظ البيانات...' });

                    // لا نحفظ أبداً أي رابط وسيط/JSON: يجب أن يكون secure_url رابط Cloudinary مباشراً
                    if (!isRealCloudinaryUrl(result.secure_url)) {
                        throw new Error('❌ Cloudinary لم يُرجع رابطاً مباشراً صالحاً. لم يتم حفظ الملف.');
                    }

                    const { error: dbError } = await supabaseClient.from('documents').insert([{
                        name: uploadName,
                        original_name: prepared.originalName,
                        source: 'cloudinary',
                        cloudinary_url: result.secure_url,
                        cloudinary_public_id: result.public_id,
                        cloudinary_resource_type: result.resource_type || signature.resourceType || 'raw',
                        folder: signature.folder,
                        scope_type: signature.scopeType || 'specialization',
                        file_type_id: signature.fileTypeId || null,
                        specialization: signature.specialization || storageSpecializationFor(effectiveUploadSpec(spec, level, subject)),
                        level: storageLevelFor(effectiveUploadSpec(spec, level, subject), level),
                        semester: semester,
                        subject: subject,
                        subject_code: storageSubjectCode(spec, level, subject),
                        file_type: signature.fileTypeName || type,
                        mime_type: prepared.mime,
                        file_size: prepared.size,
                        uploaded_by: currentUserId,
                        sort_order: await getNextDocumentSortOrder(spec, level, semester, storageSubjectCode(spec, level, subject), signature.fileTypeId || null)
                    }]);

                    if (dbError) {
                        console.error(dbError);
                        // تنظيف الأصل اليتيم على Cloudinary حتى لا يبقى ملف بلا سجل
                        try {
                            await fetch(unemApi('/api/public/cloudinary/destroy'), {
                                method: 'POST',
                                headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + token },
                                body: JSON.stringify({
                                    orphanPublicId: result.public_id,
                                    resourceType: result.resource_type || 'raw'
                                })
                            });
                        } catch (cleanupErr) { console.error('orphan cleanup failed', cleanupErr); }
                        const dup = (dbError.code === '23505') || /duplicate|unique/i.test(dbError.message || '');
                        throw new Error(dup
                            ? '⚠️ هذا الملف مرفوع مسبقاً لنفس المادة.'
                            : '❌ حدث خطأ أثناء حفظ بيانات الملف: ' + dbError.message);
                    }

                    updateQueueItem(item, { state: 'done', progress: 100, message: '✅ تم الرفع بنجاح' });
                    logSupabaseAnalytics('رفع ملف', item.file.name);
                    success++;
                } catch (err) {
                    console.error(err);
                    updateQueueItem(item, { state: 'failed', message: err.message || '❌ فشل رفع الملف، يرجى المحاولة مرة أخرى.' });
                    failed++;
                }
            }

            isUploading = false; submitBtn.disabled = false;
            statusDiv.textContent = failed === 0
                ? `✅ تم رفع ${success} ملف بنجاح!`
                : `⚠️ تم رفع ${success}، وفشل ${failed}. راجع رسائل الملفات أعلاه.`;
            statusDiv.className = failed === 0 ? 'status-msg success' : 'status-msg error';

            // تحديث فوري بدون إعادة تحميل الصفحة
            documentsCache = {};
            if (success > 0) { try { await refreshCurrentSubjectFiles(); } catch (e) { console.error(e); } }
        });
       // ================== تجربة المستخدم الجديد: التثبيت ثم الإشعارات ==================
        window.addEventListener('DOMContentLoaded', () => {
            let deferredPrompt = null;

            const installToast = document.getElementById('install-toast');
            const installBtn = document.getElementById('install-app-btn');
            const laterInstallBtn = document.getElementById('close-install-btn');
            const iosModal = document.getElementById('ios-install-modal');

            const pushModal = document.getElementById('push-onboarding-modal');
            const pushOnboardingBtn = document.getElementById('push-onboarding-btn');
            const pushOnboardingStatus = document.getElementById('push-onboarding-status');

            if (!installToast || !installBtn || !laterInstallBtn) return;

            // ===== تحكّم المشرف: إظهار/إخفاء نافذتي التثبيت والإشعارات (الإعدادات من get_public_platform_stats) =====
            // القاعدة: لا تظهر أي نافذة إلا إذا أعاد الخادم صراحةً true لها (المشرف فعّلها).
            // غياب الإعداد أو أي خلل أو بطء شديد في الاتصال = مخفية. (حارس CSS في app.html يكرّر هذه القاعدة كطبقة ثانية.)
            const HIDDEN_FLAGS = { install: false, push: false, reset: 0 };
            const applyResetIfNeeded = (reset) => {
                // «إعادة الإظهار» من المشرف: من أغلق النافذتين سابقاً (ولم يثبّت/يفعّل فعلاً) تظهران له من جديد مرة واحدة
                try {
                    const seen = Number(localStorage.getItem('unem_prompts_reset_seen') || 0);
                    if (reset && reset > seen) {
                        localStorage.setItem('unem_prompts_reset_seen', String(reset));
                        localStorage.removeItem('unem_push_onboarding_done');
                        if (localStorage.getItem('unem_install_state') === 'deferred') localStorage.setItem('unem_install_state', 'new');
                    }
                } catch (e) {}
            };
            const whenFlags = (window.unemPromptFlags ? window.unemPromptFlags() : new Promise((resolve) => {
                let settled = false;
                const done = (f) => { if (settled) return; settled = true; resolve(f); };
                setTimeout(() => done(HIDDEN_FLAGS), 10000);
                try {
                    if (typeof supabaseClient === 'undefined' || !supabaseClient) return done(HIDDEN_FLAGS);
                    supabaseClient.rpc('get_public_platform_stats').then((r) => {
                        let d = r && r.data; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) {} }
                        if (Array.isArray(d)) d = d[0];
                        if (!d || (r && r.error)) return done(HIDDEN_FLAGS);
                        done({ install: d.show_install_prompt === true, push: d.show_push_prompt === true, reset: Number(d.prompts_reset_at) || 0 });
                    }).catch(() => done(HIDDEN_FLAGS));
                } catch (e) { done(HIDDEN_FLAGS); }
            })).then((f) => { applyResetIfNeeded(f.reset); return f; });

            const isStandalone = () =>
                window.matchMedia('(display-mode: standalone)').matches ||
                window.matchMedia('(display-mode: fullscreen)').matches ||
                navigator.standalone === true;

            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
            const getInstallState = () => localStorage.getItem('unem_install_state') || 'new';
            const setInstallState = (state) => localStorage.setItem('unem_install_state', state);

            const showPushOnboarding = () => whenFlags.then((f) => { if (f.push) showPushOnboardingNow(); });
            const showInstallToast = () => whenFlags.then((f) => {
                if (f.install) installToast.classList.add('show');
                else setTimeout(showPushOnboarding, 300);   // المشرف أخفى نافذة التثبيت: ننتقل لطلب الإشعارات مباشرة
            });
            const showPushOnboardingNow = () => {
                // نافذة الطلب تعتمد على Web Push الحقيقي؛ لا تُعرض داخل Android WebView.
                if (!pushModal || !webPushSupported()) return;
                if (Notification.permission === 'granted') {
                    localStorage.setItem('unem_push_onboarding_done', '1');
                    return;
                }
                if (Notification.permission === 'denied') return;
                if (localStorage.getItem('unem_push_onboarding_done') === '1') return;
                pushModal.classList.remove('hidden');
            };

            const finishPushOnboarding = () => {
                localStorage.setItem('unem_push_onboarding_done', '1');
                if (pushModal) pushModal.classList.add('hidden');
            };

            // Android/Chrome/desktop: نحفظ طلب التثبيت الأصلي.
            window.addEventListener('beforeinstallprompt', (e) => {
                e.preventDefault();
                deferredPrompt = e;

                if (isStandalone()) {
                    setInstallState('installed');
                    setTimeout(showPushOnboarding, 500);
                    return;
                }

                // إذا كان التثبيت قد تم سابقاً، لا نعرض نافذة التثبيت مرة أخرى.
                // ننتقل مباشرة إلى طلب تفعيل الإشعارات.
                if (getInstallState() === 'installed' || localStorage.getItem('unem_pwa_installed') === 'true') {
                    setTimeout(showPushOnboarding, 500);
                    return;
                }

                // المستخدم الجديد أو من اختار "لاحقاً" يرى نافذة التثبيت في الدخول القادم.
                setTimeout(showInstallToast, 1200);
            });

            // إذا كان التطبيق مثبتاً بالفعل، لا نعرض نافذة التثبيت.
            // ننتقل مباشرة إلى تفعيل الإشعارات إذا لم تكن مفعلة.
            if (isStandalone()) {
                setInstallState('installed');
                setTimeout(showPushOnboarding, 700);
            } else if (getInstallState() === 'installed' || localStorage.getItem('unem_pwa_installed') === 'true') {
                // حالة مهمة: التطبيق تم تثبيته سابقاً لكن الصفحة فُتحت من المتصفح.
                // لا نطلب التثبيت مرة أخرى؛ نعرض طلب الإشعارات مباشرة.
                setTimeout(showPushOnboarding, 700);
            }

            // iPhone/iPad: لا يوجد beforeinstallprompt، لذلك نعرض تعليمات Safari
            // فقط للمستخدم الذي لم يثبت التطبيق بعد.
            if (isIOS && !isStandalone() &&
                getInstallState() !== 'installed' &&
                localStorage.getItem('unem_pwa_installed') !== 'true') {
                setTimeout(showInstallToast, 1200);
            }

            installBtn.addEventListener('click', async () => {
                installToast.classList.remove('show');

                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    const { outcome } = await deferredPrompt.userChoice;
                    deferredPrompt = null;

                    if (outcome === 'accepted') {
                        setInstallState('installed');
                        localStorage.setItem('unem_pwa_installed', 'true');
                        // بعد قبول التثبيت مباشرة نطلب تفعيل الإشعارات.
                        setTimeout(showPushOnboarding, 500);
                    } else {
                        // رفض المستخدم التثبيت: نعرض تفعيل الإشعارات مباشرة.
                        // التثبيت والإشعارات مستقلان؛ رفض التثبيت لا يمنع الإشعارات.
                        setInstallState('deferred');
                        setTimeout(showPushOnboarding, 300);
                    }
                    return;
                }

                // iOS: نعرض تعليمات الإضافة إلى الشاشة الرئيسية.
                if (isIOS && iosModal) {
                    iosModal.classList.remove('hidden');
                    return;
                }

                setInstallState('deferred');
            });

            // "لاحقاً" يؤجل التثبيت للدخول القادم، ثم نعرض تفعيل الإشعارات مباشرة.
            laterInstallBtn.addEventListener('click', () => {
                installToast.classList.remove('show');
                setInstallState('deferred');
                setTimeout(showPushOnboarding, 300);
            });

            // بعد رجوع مستخدم iOS من عملية الإضافة إلى الشاشة الرئيسية،
            // يتحول الموقع إلى standalone، وعندها فقط نعرض طلب الإشعارات.
            const checkInstalledAfterIOS = () => {
                if (isStandalone()) {
                    setInstallState('installed');
                    localStorage.setItem('unem_pwa_installed', 'true');
                    if (iosModal) iosModal.classList.add('hidden');
                    setTimeout(showPushOnboarding, 500);
                }
            };
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') checkInstalledAfterIOS();
            });

            // زر تفعيل الإشعارات — لا يوجد "لاحقاً".
            if (pushOnboardingBtn) {
                pushOnboardingBtn.addEventListener('click', async () => {
                    pushOnboardingBtn.disabled = true;
                    if (pushOnboardingStatus) pushOnboardingStatus.textContent = '⏳ جاري تفعيل الإشعارات...';

                    try {
                        const ok = await subscribeToPush();
                        if (ok) {
                            finishPushOnboarding();
                            setPushIcon(true);
                            alert('🔔 تم تفعيل الإشعارات بنجاح! ستصلك التنبيهات الجديدة حتى خارج الموقع.');
                        } else if (pushOnboardingStatus) {
                            pushOnboardingStatus.textContent =
                                Notification.permission === 'denied'
                                    ? '🔕 الإشعارات محظورة من إعدادات المتصفح. فعّلها من إعدادات الموقع.'
                                    : 'تعذر تفعيل الإشعارات، يرجى المحاولة مرة أخرى.';
                        }
                    } catch (e) {
                        console.error('Push onboarding error:', e);
                        if (pushOnboardingStatus) {
                            pushOnboardingStatus.textContent = '❌ تعذر تفعيل الإشعارات: ' + (e.message || e);
                        }
                    } finally {
                        pushOnboardingBtn.disabled = false;
                    }
                });
            }
        });

        // ================== بانر "افتح في التطبيق" ==================
        (function() {
            const banner = document.getElementById('open-in-app-banner');
            const btnOpen = document.getElementById('btn-open-app');
            const btnClose = document.getElementById('btn-close-banner');
            if (!banner || !btnOpen || !btnClose) return;

            // لا نعرض البانر إذا كان التطبيق مفتوحاً بالفعل في standalone mode
            const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
            if (isStandaloneMode) return;

            // لا نعرض البانر إذا أغلقه المستخدم مسبقاً (لمدة 24 ساعة)
            const dismissedAt = localStorage.getItem('unem_banner_dismissed_at');
            if (dismissedAt && (Date.now() - parseInt(dismissedAt)) < 24 * 60 * 60 * 1000) return;

            // نتحقق إذا كان التطبيق مثبتاً عبر getInstalledRelatedApps (Android Chrome 84+)
            async function checkAndShow() {
                let isInstalled = false;
                try {
                    if (navigator.getInstalledRelatedApps) {
                        const apps = await navigator.getInstalledRelatedApps();
                        if (apps.length > 0) isInstalled = true;
                    }
                } catch(e) {}

                // fallback: إذا سبق وقبل المستخدم التثبيت نعرض البانر
                if (!isInstalled) {
                    isInstalled = localStorage.getItem('unem_pwa_installed') === 'true';
                }

                if (isInstalled) {
                    setTimeout(() => banner.classList.add('show'), 800);
                }
            }
            checkAndShow();

            // زر "فتح التطبيق" — يحاول فتح الـ PWA عبر intent
            btnOpen.addEventListener('click', () => {
                banner.classList.remove('show');
                // intent URL يعمل على Samsung Internet و Chrome على Android
                const intentUrl = 'intent://' + location.host + location.pathname + '#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.android.chrome;end';
                const fallback = location.href;
                // نحاول الـ intent أولاً، وبعد ثانية نبقى في المتصفح إن لم يفتح
                window.location = intentUrl;
                setTimeout(() => { window.location = fallback; }, 1000);
            });

            btnClose.addEventListener('click', () => {
                banner.classList.remove('show');
                localStorage.setItem('unem_banner_dismissed_at', Date.now().toString());
            });
        })();
        // =============================================================

        // =============================================================================
    