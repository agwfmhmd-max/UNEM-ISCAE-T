#!/usr/bin/env bash
# نسخة احتياطية مشفّرة من قاعدة البيانات (مخطط public فقط: كل جداول المنصة وبياناتها).
# المتغيرات المطلوبة:  DATABASE_URL (رابط الاتصال)،  BACKUP_PASSPHRASE (عبارة التشفير — احفظها في مكان آمن؛ بدونها لا يمكن فتح النسخة)
# الناتج: ملف  backup-YYYYMMDD-HHMM.sql.gz.enc  في المجلد الحالي (أو OUT_DIR).
# الاستعادة: انظر docs/OPERATIONS.md  (openssl ... -d  ثم gunzip  ثم psql).
set -euo pipefail
: "${DATABASE_URL:?حدّد DATABASE_URL}"
: "${BACKUP_PASSPHRASE:?حدّد BACKUP_PASSPHRASE (النسخة تحوي بيانات طلاب ولا تُحفَظ دون تشفير)}"
[ "${#BACKUP_PASSPHRASE}" -ge 12 ] || { echo "عبارة التشفير قصيرة (12 حرفاً على الأقل)"; exit 1; }
OUT_DIR="${OUT_DIR:-.}"; mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/backup-$(date -u +%Y%m%d-%H%M).sql.gz.enc"
pg_dump "$DATABASE_URL" --schema=public --no-owner --no-privileges --format=plain \
  | gzip -9 \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$FILE"
[ -s "$FILE" ] || { echo "النسخة فارغة!"; rm -f "$FILE"; exit 1; }
echo "✅ $FILE ($(du -h "$FILE" | cut -f1))"
