// تشغيل كل اختبارات الواجهة ثم (اختيارياً) اختبارات القاعدة.   الاستعمال:  cd tests && npm i && npx playwright install chromium && npm test
import { closeBrowser } from './e2e/helpers.mjs';
import { spawnSync } from 'node:child_process';

const suites = ['app-load', 'subjects', 'community', 'home', 'prompts-admin', 'prompts-guard', 'gate-login', 'upload'];
let bad = 0;
for (const name of suites) {
  try { const mod = await import(`./e2e/${name}.test.mjs`); bad += await mod.default(); }
  catch (e) { console.error('❌ تعذّر تشغيل', name, e); bad += 1; }
}
await closeBrowser();
if (!process.argv.includes('--e2e-only')) {
  if (process.env.PGURL || process.env.RUN_DB) {
    const r = spawnSync('bash', ['db/run.sh'], { stdio: 'inherit', cwd: new URL('.', import.meta.url).pathname });
    if (r.status) bad += 1;
  } else console.log('\nℹ️ تخطّي اختبارات القاعدة (حدّد PGURL=postgres://... لتشغيلها).');
}
console.log(bad ? `\n❌ فشل ${bad} مجموعة` : '\n✅ كل الاختبارات نجحت');
process.exit(bad ? 1 : 0);
