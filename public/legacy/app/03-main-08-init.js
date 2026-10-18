/* ===== تقسيم 03-main.js — تنفيذ عند التحميل (متغيرات ومعالجات أحداث وتهيئة) =====
   يُحمَّل بعد الملفات التي تسبقه وقبل التي تليه (الترتيب محدد في src/legacy/app.html).
   (الشيفرة منقولة حرفياً من 03-main.js دون أي تعديل) */

        document.getElementById('copyright-year').textContent = new Date().getFullYear();
        setLanguage(currentLang);

        const SUPABASE_URL = 'https://cbaswqaufawdsvadizyi.supabase.co';
        const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiYXN3cWF1ZmF3ZHN2YWRpenlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4Mzg1MTQsImV4cCI6MjA5MzQxNDUxNH0.tv-u05JTkUFFkdYgR4gUyRb0TZKtDEwEwRQLRQSljHU';
        let supabaseClient; try { supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { storage: unemSafeAuthStorage() } }); } catch (e) {}

        // عنوان API موحّد: يمنع خطأ Failed to fetch عند فتح نسخة HTML محلياً (content:// أو file://).
        const UNEM_PRODUCTION_ORIGIN = 'https://unem-iscae.vercel.app';


        const repoOwner = "i21567etu-coder"; 
        const repoName = "UNEM-ISCAE-"; 
        const branchMap = { 'ba': 'BA', 'fc': 'FC', 'tcm': 'TCM', 'grh': 'GRH', 'sae': 'SAE', 'ig': 'IG', 'master_fc': 'FC', 'master_ig': 'IG' };
        /* ==================================================================
           مواد الماستر المضافة يدوياً (جدول master_subjects — يديرها المشرف الرئيسي)
           + رمز تخزين مستقل لمواد الماستر: يمنع تطابق Archive S1..S4 (وأي مادة بنفس الاسم)
           بين الماستر والليسانس لأن الماستر يُخزَّن بمفاتيح FC/IG + L1/L2 + S1..S4.
           ================================================================== */
        let masterSubjects = [];

        let allFiles =[]; let currentSpecialization = ''; let currentLevel = ''; let currentSemester = ''; let currentBranch = 'main'; 
        let currentSubjectFiles =[]; let currentTab = 'cours'; let isArchiveSpecialCase = false; let isAdminLoggedIn = false; 

        /* ============ نظام الأدوار (يتم التحقق منه في Supabase وليس في الواجهة) ============ */
        let currentUserRole = 'user';   // 'admin' | 'uploader' | 'user'
        let currentUserId   = null;
        let myPermissions = {};
        const isAdmin    = () => currentUserRole === 'admin';
        const canUpload  = () => currentUserRole === 'admin' || currentUserRole === 'uploader' || myPermissions.upload_files === true;

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

        window.addEventListener('load', () => {
            logSupabaseAnalytics('زيارة الموقع', 'الصفحة الرئيسية');
            loadActiveAnnouncement();
        });

        let activeCharts = {};


        let tapCount = 0; let tapTimer;
        document.getElementById('copyright-year').addEventListener('click', () => {
            tapCount++; clearTimeout(tapTimer); 
            if (tapCount === 5) { document.getElementById('admin-login-overlay').classList.remove('hidden'); tapCount = 0; }
            tapTimer = setTimeout(() => { tapCount = 0; }, 1000);
        });

        // ==================== إدارة شريط الإعلانات ====================
        let _shownAnnId = null;
        let _shownAnnUrl = null;

        if (pushSupported()) { window.addEventListener('load', () => setTimeout(initPushUI, 800)); }
        
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

        /* ---------- أنواع الملفات في نموذج الرفع (حسب المادة المختارة فقط) ---------- */
        let uploadSubjectTypes = [];

        let sharedTargetsMemo = { key: '', value: [] };

        /** ملفات GitHub لفرع آخر دون المساس بـ allFiles (فرع الصفحة الحالية) */
        const sharedBranchMemCache = {};

        /* ==================================================================
           إدارة أنواع الملفات لمادة محددة (المشرف الرئيسي فقط)
           التسلسل الإجباري: نوع المادة → التخصص → المستوى → الفصل → المادة
           ================================================================== */
        let dtSubjectScope = null;
        let dtLinks = [];
        let dtEditingLinkId = null;

        /* ---------- إدارة المواد المشتركة بين تخصصات محددة (المشرف الرئيسي فقط) ---------- */
        const sgEl = (id) => document.getElementById(id);
        const sgKey = (m) => `${String(m.specialization).toUpperCase()}|${String(m.semester).toUpperCase()}|${m.subject_code}`;

        // مهلة كاش قصيرة جداً حتى تظهر ملفات GitHub الجديدة فوراً تقريباً
        const GITHUB_CACHE_TTL = 60 * 1000;

// متغير جديد لتتبع عملية جلب الملفات في الخلفية
        let currentSubjectFilesPromise = null;
        let currentSubjectName = '';

        // اسم سحابة Cloudinary (معلومة عمومية) — يُجلب مرة واحدة لإعادة بناء الروابط عند الحاجة
        let cloudinaryCloudName = null;
        let cloudNamePromise = null;
        ensureCloudinaryCloudName();

        /* ====== طبقة المستندات الموحّدة (Supabase = المصدر الرسمي للـmetadata) ====== */
        const DOCUMENTS_CACHE_TTL = 60 * 1000; // كاش قصير جداً حتى لا يخفي الملفات الجديدة
        let documentsCache = {};

        // متوافق مع الاسم القديم
        const fetchCloudinaryDocs = fetchDatabaseDocs;
        let viewerFallbackTimer = null;
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

        // توافق مع أزرار HTML المباشرة: ضمان توفر دوال الإدارة عالمياً حتى داخل WebView/PWA.
        window.adminDashOpen = adminDashOpen;
        window.adminDashHome = adminDashHome;
        window.openAdminDashboard = openAdminDashboard;
        const WHATSAPP_LICENCE_SPECIALIZATIONS = [
            ['BA','spec_ba'],['FC','spec_fc'],['TCM','spec_tcm'],
            ['GRH','spec_grh'],['SAE','spec_sae'],['IG','spec_ig']
        ];
        const WHATSAPP_MASTER_SPECIALIZATIONS = [
            ['MASTER_FC','master_fc_desc'],['MASTER_IG','master_ig_desc']
        ];
        const WHATSAPP_SPECIALIZATIONS = WHATSAPP_LICENCE_SPECIALIZATIONS.concat(WHATSAPP_MASTER_SPECIALIZATIONS);
        let whatsappHubLevel = '';

        /* =====================================================================
           نموذج الرفع المترابط: التخصص → المستوى → الفصل (تابع للمستوى) → المادة
           المرجع الوحيد للفصول التابعة لكل مستوى (نفس منطق showSemesters)
           ===================================================================== */
        const SEMESTERS_BY_LEVEL = { L1: ['S1', 'S2'], L2: ['S3', 'S4'], L3: ['S5', 'S6'], M1: ['S1', 'S2'], M2: ['S3', 'S4'] };

        /* =====================================================================
           نظام الرفع الجديد: المتصفح → (توقيع آمن من الخادم) → Cloudinary → Supabase
           - سر Cloudinary لا يوجد إطلاقاً في هذا الملف.
           - رفع متعدد + Drag & Drop + شريط تقدم لكل ملف + تحقق من الصلاحية.
           ===================================================================== */
        const MAX_UPLOAD_SIZE = 60 * 1024 * 1024; // 60 MB
        let uploadQueue = [];
        let isUploading = false;

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
    