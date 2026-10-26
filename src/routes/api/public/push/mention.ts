import { createFileRoute } from "@tanstack/react-router";
import { corsOptions, json } from "@/lib/unem-server";
import { readVapidEnv, sendPushNotification, type StoredPushSubscription } from "@/lib/unem-push";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/unem-config";

/**
 * إشعار الإشارة (@) في مجتمع الطلاب.
 * يستدعيه متصفح كاتب الرسالة بعد الإرسال؛ تتحقق قاعدة البيانات أن المستدعي هو كاتب الرسالة نفسه،
 * وتعيد اشتراكات الطلاب المشار إليهم فقط ونص الإشعار مرة واحدة لكل إشارة (لا تكرار).
 */
type Targets = {
  title: string;
  body: string;
  url: string;
  subs: StoredPushSubscription[];
};

const CONCURRENCY = 25;

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

export const Route = createFileRoute("/api/public/push/mention")({
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

        const token = String(body["token"] ?? "");
        const messageId = Number(body["message_id"]);
        if (token.length < 30 || token.length > 200 || !Number.isSafeInteger(messageId) || messageId < 1) {
          return json({ error: "بيانات غير صالحة." }, 400);
        }

        const vapid = readVapidEnv();
        if (!vapid) return json({ sent: 0, reason: "push_not_configured" });

        const targets = await rpc<Targets>("community_mention_push_targets", {
          p_token: token,
          p_message_id: messageId,
        });
        if (!targets || !Array.isArray(targets.subs) || targets.subs.length === 0) {
          return json({ sent: 0 });
        }

        const payload = {
          title: String(targets.title || "UNEM ISCAE").slice(0, 120),
          body: String(targets.body || "").slice(0, 500),
          url: String(targets.url || "/community"),
          tag: `mention-${messageId}`,
        };

        let sent = 0;
        const gone: string[] = [];
        for (let i = 0; i < targets.subs.length; i += CONCURRENCY) {
          const batch = targets.subs.slice(i, i + CONCURRENCY);
          const results = await Promise.all(
            batch.map(async (sub) => ({ sub, outcome: await sendPushNotification(sub, payload, vapid) })),
          );
          for (const { sub, outcome } of results) {
            if (outcome === "ok") sent += 1;
            else if (outcome === "gone") gone.push(sub.endpoint);
          }
        }

        // اشتراكات انتهت صلاحيتها لدى مزود الإشعارات: تُحذف لتفادي إرسال متكرر فاشل.
        await Promise.all(gone.map((endpoint) => rpc("remove_push_subscription", { p_endpoint: endpoint })));

        return json({ sent, expired: gone.length });
      },
    },
  },
});
