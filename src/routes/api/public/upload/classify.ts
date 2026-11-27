import { createFileRoute } from "@tanstack/react-router";
import {
  authenticateCaller,
  bearerToken,
  corsOptions,
  fetchSubjectDocumentTypes,
  json,
  normalizeSubjectCode,
} from "@/lib/unem-server";
import {
  isLevelSemesterValid,
  masterSubjectsFor,
  normalizeMasterScope,
  subjectsFor,
  MASTER_SPECS,
} from "@/lib/unem-subjects";

const SPECS = ["BA", "FC", "TCM", "GRH", "SAE", "IG"] as const;
const LEVELS = ["L1", "L2", "L3"] as const;
const SEMESTERS = ["S1", "S2", "S3", "S4", "S5", "S6"] as const;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const BASE_TYPES = ["cours", "td_tp", "devoir", "examen"] as const;
// Allow deployments to select an enabled vision model; use a compatible default.
const CLASSIFIER_MODEL = process.env["OPENAI_CLASSIFIER_MODEL"] || "gpt-4o-mini";
const schema = {
  type: "object",
  properties: {
    specialization: { type: "string", enum: [...SPECS] },
    level: { type: "string", enum: [...LEVELS] },
    semester: { type: "string", enum: [...SEMESTERS] },
    subject: {
      type: "string",
      enum: [
        "",
        ...SPECS.flatMap((s) =>
          ["S1", "S2", "S3", "S4", "S5", "S6"].flatMap((sem) => subjectsFor(s, sem)),
        ),
        ...MASTER_SPECS.flatMap((s) =>
          ["S1", "S2", "S3", "S4"].flatMap((sem) => subjectsFor(`MASTER_${s}`, sem)),
        ),
      ].filter((v, i, a) => a.indexOf(v) === i),
    },
    type: { type: "string", enum: [...BASE_TYPES] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["specialization", "level", "semester", "subject", "type", "confidence"],
  additionalProperties: false,
};

export const Route = createFileRoute("/api/public/upload/classify")({
  server: {
    handlers: {
      OPTIONS: () => corsOptions(),
      POST: async ({ request }) => {
        const auth = await authenticateCaller(request);
        if ("error" in auth) return auth.error;
        if (auth.caller.role !== "admin" && auth.caller.role !== "uploader") {
          return json({ error: "ليس لديك صلاحية تحليل ملفات الرفع." }, 403);
        }
        const apiKey = process.env["OPENAI_API_KEY"];
        if (!apiKey) return json({ error: "مساعد التصنيف غير مهيأ على الخادم." }, 503);
        const length = Number(request.headers.get("content-length") ?? 0);
        if (length > MAX_IMAGE_BYTES * 1.38 + 8192)
          return json({ error: "حجم الصورة أكبر من الحد المسموح للتحليل." }, 413);
        let body: Record<string, unknown>;
        try {
          if (!request.body) return json({ error: "طلب غير صالح." }, 400);
          const reader = request.body.getReader();
          const chunks: Uint8Array[] = [];
          let total = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > MAX_IMAGE_BYTES * 1.42 + 8192) {
              await reader.cancel();
              return json({ error: "حجم الصورة أكبر من الحد المسموح للتحليل." }, 413);
            }
            chunks.push(value);
          }
          const payload = new Uint8Array(total);
          let offset = 0;
          for (const chunk of chunks) {
            payload.set(chunk, offset);
            offset += chunk.byteLength;
          }
          body = JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;
        } catch {
          return json({ error: "طلب غير صالح." }, 400);
        }
        const mime = String(body["mime"] ?? "").toLowerCase();
        const data = String(body["data"] ?? "");
        const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(data);
        if (
          !match ||
          match[1] !== mime ||
          !["image/jpeg", "image/png", "image/webp"].includes(mime)
        )
          return json({ error: "صيغة الصورة غير مدعومة للتحليل." }, 400);
        const bytes =
          Math.floor((match[2]!.length * 3) / 4) -
          (match[2]!.endsWith("==") ? 2 : match[2]!.endsWith("=") ? 1 : 0);
        if (bytes <= 0 || bytes > MAX_IMAGE_BYTES)
          return json({ error: "حجم الصورة أكبر من الحد المسموح للتحليل." }, 413);
        const visionPrompt =
          "صنّف الورقة الجامعية الظاهرة فقط. التخصص يُستدل عليه من رمز/اسم الشعبة، المستوى والفصل من العناوين. لا تخمّن عند غياب الدليل؛ استخدم confidence منخفضاً. اختر subject حرفياً من القائمة المتاحة. الأنواع: examen للامتحان/الاستدراك، devoir للتكليف/الفرض، td_tp للأعمال التطبيقية/الموجهة، cours لما عدا ذلك. أعد JSON مطابقاً للمخطط فقط.";
        let output: unknown;
        try {
          const response = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: CLASSIFIER_MODEL,
              store: false,
              input: [
                {
                  role: "user",
                  content: [
                    {
                      type: "input_text",
                      text: `${visionPrompt}\nالمواد الممكنة: ${schema.properties.subject.enum.join(" | ")}`,
                    },
                    { type: "input_image", image_url: data, detail: "high" },
                  ],
                },
              ],
              text: {
                format: {
                  type: "json_schema",
                  name: "study_document_classification",
                  strict: true,
                  schema,
                },
              },
              max_output_tokens: 400,
            }),
            signal: AbortSignal.timeout(25000),
          });
          const result = (await response.json()) as {
            output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
            error?: { message?: string; code?: string; type?: string };
          };
          if (!response.ok) {
            const rawCode = result.error?.code ?? result.error?.type ?? "unknown";
            const providerCode = /^[a-zA-Z0-9_.-]{1,80}$/.test(rawCode) ? rawCode : "unknown";
            const messageByStatus: Record<number, string> = {
              400: "رفض مزود التحليل صيغة الطلب؛ تحقق من توافق النموذج وإعداداته.",
              401: "مفتاح خدمة التحليل غير صالح أو منتهي؛ يلزم تحديث OPENAI_API_KEY في إعدادات الإنتاج.",
              403: "مفتاح خدمة التحليل لا يملك صلاحية استخدام النموذج المحدد.",
              404: "نموذج التحليل المحدد غير متاح؛ تحقق من OPENAI_CLASSIFIER_MODEL.",
              429: "تم رفض التحليل بسبب حد الاستخدام أو معدل الطلبات لدى المزود.",
            };
            const error = messageByStatus[response.status] ?? "رفض مزود التحليل الطلب مؤقتاً.";
            console.error("OpenAI classifier error", response.status, providerCode);
            return json(
              {
                error,
                diagnostic: { provider: "openai", status: response.status, code: providerCode },
              },
              502,
            );
          }
          const text = result.output
            ?.flatMap((item) => item.content ?? [])
            .find((part) => part.type === "output_text")?.text;
          if (!text) return json({ error: "لم يُرجع التحليل نتيجة قابلة للاستخدام." }, 502);
          output = JSON.parse(text);
        } catch (error) {
          const errorType = error instanceof Error ? error.name : "unknown";
          console.error("OpenAI classifier request failed", errorType);
          return json(
            {
              error: "تعذر الاتصال بمساعد التصنيف حالياً.",
              diagnostic: { provider: "openai", errorType },
            },
            502,
          );
        }
        const result = output as {
          specialization?: string;
          level?: string;
          semester?: string;
          subject?: string;
          type?: string;
          confidence?: number;
        };
        const spec = String(result.specialization ?? "").toUpperCase();
        const level = String(result.level ?? "").toUpperCase();
        const semester = String(result.semester ?? "").toUpperCase();
        const subject = String(result.subject ?? "");
        const confidence = Number(result.confidence);
        const type = String(result.type ?? "").toLowerCase();
        if (
          !(SPECS as readonly string[]).includes(spec) ||
          !(LEVELS as readonly string[]).includes(level) ||
          !(SEMESTERS as readonly string[]).includes(semester) ||
          !isLevelSemesterValid(level, semester) ||
          !(BASE_TYPES as readonly string[]).includes(type) ||
          !Number.isFinite(confidence) ||
          confidence < 0.75
        ) {
          return json(
            {
              error: "ثقة التصنيف غير كافية؛ اختر البيانات يدوياً.",
              confidence: Number.isFinite(confidence) ? confidence : 0,
            },
            200,
          );
        }
        const isMaster =
          (spec === "FC" || spec === "IG") &&
          masterSubjectsFor(spec, level, semester).includes(subject);
        const allowedSubjects = isMaster
          ? masterSubjectsFor(spec, level, semester)
          : subjectsFor(spec, semester);
        if (!allowedSubjects.includes(subject))
          return json({ error: "لم تُطابق المادة كتالوج الموقع؛ اخترها يدوياً.", confidence }, 200);
        const scope = {
          scopeType: "specialization" as const,
          specialization: spec,
          level,
          semester,
          subjectCode: isMaster
            ? `m_${normalizeSubjectCode(subject)}`
            : normalizeSubjectCode(subject),
        };
        const actualTypes = await fetchSubjectDocumentTypes(scope, bearerToken(request));
        const allowedType = actualTypes.some((item) => {
          const slug = String(item.slug ?? "").toLowerCase();
          return (
            slug === type ||
            (type === "td_tp" &&
              ["td", "tp", "travaux_diriges", "travaux_pratiques"].includes(slug))
          );
        });
        if (!allowedType)
          return json(
            { error: "نوع الملف المقترح غير مفعّل لهذه المادة؛ اختر النوع يدوياً.", confidence },
            200,
          );
        return json({
          specialization: spec,
          level,
          semester,
          subject,
          type,
          confidence,
          source: "vision",
        });
      },
    },
  },
});
