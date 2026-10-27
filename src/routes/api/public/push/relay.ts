import { createFileRoute } from "@tanstack/react-router";
import { corsOptions, json } from "@/lib/unem-server";
import { readVapidEnv, type PushNotificationPayload, type StoredPushSubscription } from "@/lib/unem-push";
import { RELAY_MAX_AGE_MS, dispatchPush, verifyRelayBody } from "@/lib/unem-push-fanout";

/**
 * مسار داخلي للإرسال الجماعي الموزّع (انظر unem-push-fanout.ts).
 * لا يقبل إلا طلبات موقّعة بـ HMAC من الخادم نفسه (المفتاح مشتق من VAPID_PRIVATE_KEY)، فلا يمكن لأي طرف
 * خارجي استعماله لإرسال إشعارات أو الوصول إلى عناوين اشتراكات.
 */
function validSub(x: unknown): x is StoredPushSubscription {
  if (!x || typeof x !== "object") return false;
  const s = x as Record<string, unknown>;
  return (
    typeof s["id"] === "string" &&
    typeof s["endpoint"] === "string" &&
    s["endpoint"].startsWith("https://") &&
    s["endpoint"].length < 1000 &&
    typeof s["p256dh"] === "string" &&
    typeof s["auth"] === "string"
  );
}

export const Route = createFileRoute("/api/public/push/relay")({
  server: {
    handlers: {
      OPTIONS: () => corsOptions(),
      POST: async ({ request }) => {
        const vapid = readVapidEnv();
        if (!vapid) return json({ error: "not_configured" }, 503);

        const raw = await request.text();
        const sig = request.headers.get("x-relay-sig") ?? "";
        if (!sig || !(await verifyRelayBody(raw, sig, String(vapid.privateKey ?? "")))) {
          return json({ error: "forbidden" }, 403);
        }

        let body: { subs?: unknown; payload?: unknown; ts?: unknown; depth?: unknown };
        try {
          body = JSON.parse(raw) as typeof body;
        } catch {
          return json({ error: "bad_request" }, 400);
        }
        const ts = Number(body.ts);
        if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > RELAY_MAX_AGE_MS) {
          return json({ error: "expired" }, 400);
        }
        if (!Array.isArray(body.subs) || body.subs.length > 5000 || !body.subs.every(validSub)) {
          return json({ error: "bad_subs" }, 400);
        }
        const p = (body.payload ?? {}) as Record<string, unknown>;
        const payload: PushNotificationPayload = {
          title: String(p["title"] ?? "UNEM ISCAE").slice(0, 120),
          body: String(p["body"] ?? "").slice(0, 500),
          url: String(p["url"] ?? "/community").slice(0, 500),
          ...(p["tag"] ? { tag: String(p["tag"]).slice(0, 120) } : {}),
          ...(p["quiet"] === true ? { quiet: true } : {}),
        };
        const depth = Math.max(0, Math.min(8, Number(body.depth) || 0));

        const origin = new URL(request.url).origin;
        const result = await dispatchPush(origin, body.subs as StoredPushSubscription[], payload, vapid, depth);
        return json(result);
      },
    },
  },
});
