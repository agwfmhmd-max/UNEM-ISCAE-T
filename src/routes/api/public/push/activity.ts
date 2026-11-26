import { createFileRoute } from "@tanstack/react-router";
import { corsOptions, json } from "@/lib/unem-server";
import { readVapidEnv, type StoredPushSubscription } from "@/lib/unem-push";
import { dispatchPush } from "@/lib/unem-push-fanout";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/unem-config";

/**
 * إشعار النشاط في المجتمع: رسالة جديدة في غرفة/مجموعة، منشور جديد، أو تعليق فيه @الكل من المشرف.
 * ونوع "test": إشعار تجريبي يُرسل لأجهزة الطالب نفسه فقط للتحقق من أن الإشعارات تعمل.
 * يستدعيه متصفح الكاتب بعد النشر؛ تتحقق قاعدة البيانات أن المستدعي هو كاتب العنصر نفسه،
 * وتحدد المستلمين (أعضاء الغرفة، دون الكاتم والكاتب) وتمنع تكرار الإشعار لنفس العنصر.
 */
type Targets = {
  title: string;
  body: string;
  url: string;
  tag?: string;
  quiet?: boolean;
  subs: StoredPushSubscription[];
};

const KINDS = new Set(["message", "post", "comment", "test", "card"]);
const CARD_TITLE = "🪪 بطاقة الانتساب الرقمية";
const CARD_BODY =
  "بطاقة انتسابك الرقمية للاتحاد الوطني لطلبة موريتانيا بالمعهد العالي للمحاسبة وإدارة المؤسسات أصبحت متاحة الآن";

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
  }).catch(() => null);
  if (!res || !res.ok) return null;
  return (await res.json().catch(() => null)) as T | null;
}

export const Route = createFileRoute("/api/public/push/activity")({
  server: {
    handlers: {
      OPTIONS: () => corsOptions(),
      POST: async ({ request }) => {
        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({ error: "طلب غير صالح." }, 400);
        }

        // إشعار «بطاقة الانتساب متاحة»: يستدعيه المشرف (Bearer) بعد إتاحة البطاقة؛ تتحقق قاعدة البيانات من صلاحيته.
        if (String(body["kind"] ?? "") === "card") {
          const auth = request.headers.get("authorization") ?? "";
          if (!/^Bearer\s+\S{20,}$/.test(auth)) return json({ error: "غير مصرّح." }, 401);
          const regs = (Array.isArray(body["regs"]) ? (body["regs"] as unknown[]) : [])
            .map((x) => String(x ?? "").trim().toUpperCase())
            .filter((x) => /^I[0-9]{5}$/.test(x))
            .slice(0, 300);
          if (regs.length === 0) return json({ error: "لا أرقام تسجيل صالحة." }, 400);
          const vapidCard = readVapidEnv();
          if (!vapidCard) return json({ sent: 0, accounts: 0, reason: "push_not_configured" });
          const rc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/student_card_push_targets`, {
            method: "POST",
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: auth, "content-type": "application/json" },
            body: JSON.stringify({ p_regs: regs, p_force: body["force"] === true }),
          }).catch(() => null);
          if (!rc) return json({ error: "تعذر الاتصال بقاعدة البيانات." }, 502);
          if (!rc.ok) return json({ error: "غير مصرّح." }, rc.status === 401 || rc.status === 403 ? 403 : 400);
          const ct = (await rc.json().catch(() => null)) as { accounts?: number; subs?: StoredPushSubscription[] } | null;
          const csubs = ct && Array.isArray(ct.subs) ? ct.subs : [];
          if (csubs.length === 0) return json({ sent: 0, accounts: ct?.accounts ?? 0 });
          const r = await dispatchPush(
            new URL(request.url).origin,
            csubs,
            { title: CARD_TITLE, body: CARD_BODY, url: "/community?card=1", tag: "card-enabled" },
            vapidCard,
          );
          return json({ sent: r.sent, expired: r.gone, accounts: ct?.accounts ?? 0 });
        }

        const token = String(body["token"] ?? "");
        const kind = String(body["kind"] ?? "");
        const id = String(body["id"] ?? "");
        if (token.length < 30 || token.length > 200 || !KINDS.has(kind) || id.length < 1 || id.length > 40) {
          return json({ error: "بيانات غير صالحة." }, 400);
        }

        const vapid = readVapidEnv();
        if (!vapid) return json({ sent: 0, reason: "push_not_configured" });

        const targets =
          kind === "test"
            ? await rpc<Targets>("community_push_test_targets", { p_token: token })
            : await rpc<Targets>("community_activity_push_targets", {
                p_token: token,
                p_kind: kind,
                p_id: id,
              });
        if (!targets || !Array.isArray(targets.subs) || targets.subs.length === 0) {
          return json({ sent: 0 });
        }

        const payload = {
          title: String(targets.title || "UNEM ISCAE").slice(0, 120),
          body: String(targets.body || "").slice(0, 500),
          url: String(targets.url || "/community"),
          ...(targets.tag ? { tag: String(targets.tag).slice(0, 120) } : {}),
          ...(targets.quiet === true ? { quiet: true } : {}),
        };

        // توزيع الإرسال على طلبات فرعية متوازية (يصل لأكثر من ألف طالب خلال ثوانٍ)
        const { sent, gone } = await dispatchPush(new URL(request.url).origin, targets.subs, payload, vapid);

        return json({ sent, expired: gone });
      },
    },
  },
});
