#!/usr/bin/env node
/**
 * Live integration test for the upload image-classification endpoint.
 * Requires a real image of a study document and a valid Supabase session token
 * belonging to an uploader/admin. Does not upload or persist the image anywhere
 * except the classifier request (which is processed by the configured provider).
 */
import fs from "node:fs";
import path from "node:path";

const endpoint =
  process.env.CLASSIFIER_API_URL ||
  "https://unem-iscae2-test.vercel.app/api/public/upload/classify";
const token = process.env.CLASSIFIER_TOKEN;
const imagePath = process.env.CLASSIFIER_IMAGE;
const maxImageBytes = 6 * 1024 * 1024;
const mimeByExtension = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

function fail(message, details = "") {
  console.error(`FAIL: ${message}${details ? `\n${details}` : ""}`);
  process.exit(1);
}

if (!token) fail("Set CLASSIFIER_TOKEN to a valid Supabase access token for an uploader/admin.");
if (!imagePath) fail("Set CLASSIFIER_IMAGE to a JPG, PNG, or WebP image of a study document.");
const resolvedImagePath = path.resolve(imagePath);
if (!fs.existsSync(resolvedImagePath)) fail(`Image not found: ${resolvedImagePath}`);
const extension = path.extname(resolvedImagePath).toLowerCase();
const mime = mimeByExtension.get(extension);
if (!mime) fail("Unsupported image extension. Use JPG, PNG, or WebP.");
const image = fs.readFileSync(resolvedImagePath);
if (image.length === 0) fail("The image is empty.");
if (image.length > maxImageBytes) fail("Image exceeds the 6 MiB API limit.");

let response;
try {
  response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      mime,
      data: `data:${mime};base64,${image.toString("base64")}`,
    }),
    signal: AbortSignal.timeout(60_000),
  });
} catch (error) {
  fail(
    "Request to classifier endpoint failed.",
    error instanceof Error ? error.message : String(error),
  );
}

let result;
try {
  result = await response.json();
} catch {
  fail(`Endpoint returned non-JSON response (HTTP ${response.status}).`);
}
if (!response.ok) {
  const explanation =
    typeof result?.error === "string" ? result.error : "No error details returned.";
  const diagnostic = result?.diagnostic ? `\n${JSON.stringify(result.diagnostic, null, 2)}` : "";
  fail(`Classifier API returned HTTP ${response.status}.`, `${explanation}${diagnostic}`);
}
if (result?.error)
  fail("Classifier could not confidently classify this image.", String(result.error));

const expectedFields = ["specialization", "level", "semester", "subject", "type", "confidence"];
const missing = expectedFields.filter((key) => !(key in (result || {})));
if (missing.length) fail("Successful response is missing required fields.", missing.join(", "));
const specs = new Set(["BA", "FC", "TCM", "GRH", "SAE", "IG"]);
const levels = new Set(["L1", "L2", "L3"]);
const semesters = new Set(["S1", "S2", "S3", "S4", "S5", "S6"]);
const types = new Set(["cours", "td_tp", "devoir", "examen"]);
if (!specs.has(result.specialization))
  fail("Invalid specialization in response.", String(result.specialization));
if (!levels.has(result.level)) fail("Invalid level in response.", String(result.level));
if (!semesters.has(result.semester)) fail("Invalid semester in response.", String(result.semester));
if (typeof result.subject !== "string" || result.subject.trim() === "")
  fail("Response has no recognized subject.");
if (!types.has(result.type)) fail("Invalid document type in response.", String(result.type));
if (typeof result.confidence !== "number" || result.confidence < 0.75 || result.confidence > 1)
  fail("Confidence is below the API acceptance threshold or invalid.", String(result.confidence));

console.log("PASS: image classification endpoint returned a valid, confident result.");
console.log(
  JSON.stringify(
    {
      endpoint,
      specialization: result.specialization,
      level: result.level,
      semester: result.semester,
      subject: result.subject,
      type: result.type,
      confidence: result.confidence,
      source: result.source,
    },
    null,
    2,
  ),
);
