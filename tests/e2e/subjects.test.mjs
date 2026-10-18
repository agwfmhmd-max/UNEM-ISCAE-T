// اختبار «فتح مادة»: جلب ملفات المادة من قاعدة البيانات + التخزين + GitHub، ومنطق المواد المشتركة بين التخصصات بدون تكرار.
// يشغّل دوال app.html الحقيقية (مستخرجة) على بيانات وهمية.
import { suite, legacy, extractFn, newPage } from './helpers.mjs';

export default async function run() {
  const s = suite('فتح مادة + المواد المشتركة (دوال app.html الحقيقية)');
  const html = legacy('app.html');
  const REAL = ['getSafeSubjectCode', 'getLegacySubjectCode', 'subjectCodeVariants', 'storageSpecializationFor', 'storageLevelFor',
    'documentCodeVariants', 'documentsCacheKey', 'normalizeText', 'fetchDatabaseDocs', 'isDocumentInCurrentScope', 'performFileFetching',
    'sharedMemberMatches', 'sharedGroupOfSubject', 'sharedTargetsFor', 'rowMatchesSharedTarget', 'sharedDocOrigin', 'githubFileMatchesSubject'];
  const code = REAL.map((n) => extractFn(html, n)).join('\n');

  const harness = `
  let currentSpecialization='BA',currentLevel='L1',currentSemester='S1',currentSubjectName='',isArchiveSpecialCase=false,allFiles=[],currentBranch='main',currentSubjectFiles=[];
  let documentsCache={},sharedSubjectGroups=[],sharedGroupsVersion=0;const DOCUMENTS_CACHE_TTL=60000;
  const SEMESTERS_BY_LEVEL={L1:['S1','S2'],L2:['S3','S4'],L3:['S5','S6'],M1:['S1','S2'],M2:['S3','S4']};
  const branchMap={ba:'main',fc:'fc-branch',tcm:'tcm-branch'};
  const isMasterCycle=()=>false; const isExplicitMasterGithubFile=()=>false; const masterStorageCode=n=>'m_'+n;
  const levelForSemester=s=>({S1:'L1',S2:'L1'}[s]); const isValidFile=n=>/\\.(pdf|docx?|pptx?)$/i.test(n);
  const ensureCloudinaryCloudName=async()=>null; const getDocumentOpenUrl=()=>'#'; const getDocumentDownloadUrl=()=>'#';
  const fetchFilesFromGitHub=async()=>{};
  const getDocumentCategory=d=>String(d.file_type||'cours').toLowerCase();
  const mapGithubFile=(f,s)=>({...f,name:f.name,github_path:f.path,source:'github',subject:s,subject_code:'',file_type:null});
  const mapDocumentRow=r=>({id:r.id,name:r.name,original_name:r.name,source:'cloudinary',subject:'',subject_code:r.subject_code||'',specialization:r.specialization,level:r.level,semester:r.semester,file_type:r.file_type,cloudinary_public_id:r.cloudinary_public_id});
  const BRANCH_FILES={'main':[{name:'Comptabilite generale cours.pdf',path:'BA/L1/compta_ba.pdf',type:'file'},{name:'Marketing.pdf',path:'BA/L1/mkt.pdf',type:'file'}],
                      'fc-branch':[{name:'Compta generale FC TD.pdf',path:'FC/L1/compta_fc.pdf',type:'file'},{name:'Comptabilite generale cours.pdf',path:'FC/L1/compta_ba_dup.pdf',type:'file'}]};
  const fetchBranchFilesQuiet=async b=>BRANCH_FILES[b]||[];
  const DB=[
   {id:1,name:'cours_A.pdf',specialization:'BA',level:'L1',semester:'S1',subject_code:'comptabilite_generale',file_type:'Cours',cloudinary_public_id:'a1',status:'active'},
   {id:2,name:'td_FC.pdf',specialization:'FC',level:'L1',semester:'S1',subject_code:'compta_generale_fc',file_type:'TD / TP',cloudinary_public_id:'f1',status:'active'},
   {id:3,name:'same.pdf',specialization:'BA',level:'L1',semester:'S1',subject_code:'comptabilite_generale',file_type:'Cours',cloudinary_public_id:'a2',status:'active'},
   {id:4,name:'SAME.PDF',specialization:'FC',level:'L1',semester:'S1',subject_code:'compta_generale_fc',file_type:'Cours',cloudinary_public_id:'f2',status:'active'},
   {id:5,name:'autre_FC.pdf',specialization:'FC',level:'L1',semester:'S1',subject_code:'marketing',file_type:'Cours',cloudinary_public_id:'f3',status:'active'},
   {id:6,name:'tcm_other.pdf',specialization:'TCM',level:'L1',semester:'S1',subject_code:'comptabilite_generale',file_type:'Cours',cloudinary_public_id:'t1',status:'active'}];
  const STORAGE={'FC/L1/S1/compta_generale_fc':['storage_fc.pdf']};
  function qb(rows){const st={};const o={select(){return o},in(c,v){st[c]=v;return o},eq(){return o},order(){return o},then(res){res({data:rows.filter(x=>Object.keys(st).every(k=>st[k].includes(x[k]))),error:null})}};return o}
  const supabaseClient={from:()=>qb(DB),storage:{from:()=>({list:async p=>({data:(STORAGE[p]||[]).map(n=>({name:n}))})})}};
  const group={id:'g1',name:'compta',members:[
     {id:'m1',specialization:'BA',level:'L1',semester:'S1',subject_name:'Comptabilite generale',subject_code:'comptabilite_generale'},
     {id:'m2',specialization:'FC',level:'L1',semester:'S1',subject_name:'Compta generale FC',subject_code:'compta_generale_fc'}]};
  window.openSubject=async function(spec,subject,groups){
    sharedSubjectGroups=groups;sharedGroupsVersion++;sharedTargetsMemo={key:'',value:[]};documentsCache={};
    currentSpecialization=spec;currentSubjectName=subject;currentBranch=branchMap[spec.toLowerCase()]||'main';allFiles=(BRANCH_FILES[currentBranch]||[]).slice();
    const r=await performFileFetching(subject,normalizeText(subject));return r.map(d=>d.name).sort()};
  `;
  const pg = await newPage();
  await pg.setContent('<html><body></body></html>');
  // sharedTargetsMemo معرّفة في app.html كـ let خارج الدوال: نعرّفها هنا
  await pg.addScriptTag({ content: 'let sharedTargetsMemo={key:"",value:[]};' + harness + code });
  const open = (spec, subject, groups) => pg.evaluate(([a, b, c]) => openSubject(a, b, c), [spec, subject, groups]);
  const group = {
    id: 'g1', name: 'compta', members: [
      { id: 'm1', specialization: 'BA', level: 'L1', semester: 'S1', subject_name: 'Comptabilite generale', subject_code: 'comptabilite_generale' },
      { id: 'm2', specialization: 'FC', level: 'L1', semester: 'S1', subject_name: 'Compta generale FC', subject_code: 'compta_generale_fc' }],
  };

  // 1) مادة غير مشتركة: السلوك القديم تماماً
  const ba0 = await open('BA', 'Comptabilite generale', []);
  s.check('غير مشتركة (BA): ملفاتها فقط', ba0.includes('cours_A.pdf') && ba0.includes('same.pdf') && !ba0.includes('td_FC.pdf') && !ba0.includes('storage_fc.pdf') && !ba0.includes('tcm_other.pdf'), ba0);
  const fc0 = await open('FC', 'Compta generale FC', []);
  s.check('غير مشتركة (FC): ملفاتها فقط', fc0.includes('td_FC.pdf') && fc0.includes('storage_fc.pdf') && !fc0.includes('cours_A.pdf'), fc0);

  // 2) مشتركة: كل تخصص يرى ملفات الآخر
  const ba1 = await open('BA', 'Comptabilite generale', [group]);
  s.check('مشتركة: BA يرى ملف DB رُفع على FC فقط (td_FC)', ba1.includes('td_FC.pdf'), ba1);
  s.check('مشتركة: BA يرى ملف التخزين الخاص بـFC (storage_fc)', ba1.includes('storage_fc.pdf'), ba1);
  s.check('مشتركة: BA يرى ملف GitHub من فرع FC', ba1.includes('Compta generale FC TD.pdf'), ba1);
  s.check('مشتركة: لا تسرب من تخصص غير شريك (TCM) ولا مادة أخرى (marketing)', !ba1.includes('tcm_other.pdf') && !ba1.includes('autre_FC.pdf') && !ba1.includes('Marketing.pdf'), ba1);
  const fc1 = await open('FC', 'Compta generale FC', [group]);
  s.check('مشتركة: FC يرى ملف DB رُفع على BA فقط (cours_A)', fc1.includes('cours_A.pdf'), fc1);
  s.check('مشتركة: FC يرى ملفات GitHub من فرع BA', fc1.some((n) => /Comptabilite generale cours/i.test(n)), fc1);

  // 3) بلا تكرار: same.pdf موجود عند BA وFC → مرة واحدة
  const count = (arr, re) => arr.filter((n) => re.test(n)).length;
  s.eq('بلا تكرار (BA): same.pdf مرة واحدة فقط', count(ba1, /^same\.pdf$/i), 1);
  s.eq('بلا تكرار (FC): same.pdf مرة واحدة فقط', count(fc1, /^same\.pdf$/i), 1);
  s.eq('GitHub: ملف فرع BA يظهر مرة واحدة', count(ba1, /^Comptabilite generale cours\.pdf$/i), 1);
  s.eq('GitHub: ملف فرع FC يظهر مرة واحدة عند BA', count(ba1, /^Compta generale FC TD\.pdf$/i), 1);

  // 4) ماستر/تخصص خارج المجموعة لا يتأثر
  const tcm = await open('TCM', 'Comptabilite generale', [group]);
  s.check('تخصص خارج المجموعة (TCM) لا يرى ملفات المجموعة', !tcm.includes('td_FC.pdf') && !tcm.includes('cours_A.pdf'), tcm);

  s.check('لا أخطاء جافاسكربت في الصفحة', pg.errors.length === 0, pg.errors);
  await pg.context().close();
  return s.done();
}
