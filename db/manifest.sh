#!/usr/bin/env bash
# يطبع مسارات ملفات SQL بالترتيب الصحيح (بادئة التاريخ تُحوَّل إلى 14 خانة لتُقارن بشكل سليم).
cd "$(dirname "$0")/.."
for f in supabase/migrations/*.sql sql/*.sql db/*.sql; do
  [ -f "$f" ] || continue
  b="$(basename "$f")"; p="${b%%_*}"
  printf '%-14s %s\n' "$(printf '%s' "$p" | awk '{printf "%-14s",$0}' | tr ' ' '0')" "$f"
done | sort -k1,1 -k2,2 | awk '{print $2}'
