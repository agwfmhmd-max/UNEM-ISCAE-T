#!/usr/bin/env bash
# تطبيق كل ملفات SQL بالترتيب الزمني الصحيح على قاعدة بيانات (من الصفر أو فوق قاعدة موجودة).
# الاستعمال:   DATABASE_URL=postgres://... ./db/apply_all.sh        (أو  ./db/apply_all.sh "postgres://...")
# الترتيب: supabase/migrations + sql + db مدموجة حسب بادئة التاريخ في اسم الملف (db/MANIFEST.txt يعرض الترتيب).
# كل الملفات مكتوبة بحيث تُعاد دون ضرر (if not exists / create or replace / drop policy if exists).
set -euo pipefail
cd "$(dirname "$0")/.."
URL="${1:-${DATABASE_URL:-}}"
[ -n "$URL" ] || { echo "حدّد DATABASE_URL أو مرّره كوسيط أول"; exit 1; }
STOP="${ON_ERROR_STOP:-1}"
mapfile -t FILES < <(bash db/manifest.sh)
for f in "${FILES[@]}"; do
  echo "▶ $f"
  psql "$URL" -v ON_ERROR_STOP="$STOP" -q -f "$f" >/dev/null
done
echo "✅ تم تطبيق ${#FILES[@]} ملفاً بنجاح"
