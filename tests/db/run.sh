#!/usr/bin/env bash
# اختبار: بناء قاعدة بيانات فارغة بالكامل من ملفات المشروع (على PostgreSQL محلي مع مُحاكي Supabase) ثم تشغيل اختبارات SQL.
# يحتاج PostgreSQL ≥ 15 ومستخدماً يملك صلاحية إنشاء قواعد.  مثال:  PGURL=postgres://postgres@localhost/postgres tests/db/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
BASE="${PGURL:-postgres:///postgres}"
DB="unem_scratch_$$"
psql "$BASE" -qc "create database $DB" 
trap 'psql "$BASE" -qc "drop database if exists $DB" >/dev/null 2>&1 || true' EXIT
SCR="$(echo "$BASE" | sed -E "s#/[^/?]*(\?|$)#/$DB\1#")"
psql "$SCR" -q -v ON_ERROR_STOP=1 -f tests/db/supabase_stub.sql >/dev/null
bash db/apply_all.sh "$SCR"
echo "— إعادة التطبيق فوق قاعدة موجودة (يجب ألا يفشل شيء) —"
bash db/apply_all.sh "$SCR"
if [ -f tests/db/checks.sql ]; then psql "$SCR" -q -v ON_ERROR_STOP=1 -f tests/db/checks.sql; fi
if [ -f tests/db/security.sql ]; then psql "$SCR" -q -v ON_ERROR_STOP=1 -f tests/db/security.sql; fi
# إعادة تشغيل ملف «الافتراضي مخفي» بعد أن اختار المشرف «ظاهر» يجب ألا تُعيد الإخفاء (إعادة الضبط تُنفَّذ مرة واحدة فقط)
psql "$SCR" -q -v ON_ERROR_STOP=1 -f db/20261028090000_onboarding_prompts_default_off.sql >/dev/null
psql "$SCR" -tA -v ON_ERROR_STOP=1 -c "select case when (select value_boolean from public.platform_settings where key='show_push_prompt') then 'OK: اختيار المشرف محفوظ بعد إعادة التشغيل' else 'FAIL: إعادة التشغيل أعادت الإخفاء' end" | tee /dev/stderr | grep -q '^OK'
