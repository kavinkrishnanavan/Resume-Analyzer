import { chatToString } from "./ollama.js";
import { errorResponse, getJsonBody, jsonResponse, normalizeStringArray, safeJsonParse } from "./_utils.js";

function buildOptimizePrompt({ resumeText, analysis, targetRole }) {
  const recommendations = normalizeStringArray(analysis?.recommendations_editable);
  const missingKeywords = normalizeStringArray(analysis?.missing_keywords);
  const userOnlyIssues = normalizeStringArray(analysis?.user_only_issues);

  return `
You are a resume optimizer. Rewrite and restructure the resume to improve ATS readability and role fit.
You MUST preserve meaning and ALL facts exactly:
- Do NOT add employers, schools, dates, titles, locations, achievements, metrics, certifications, tools, or skills that are not already present.
- Do NOT change numbers, dates, names, or timelines.
- Do NOT fabricate quantified impact. If a metric is missing, do not invent one.
- You MAY: reword sentences, improve bullet style, reorder sections, fix grammar, normalize formatting, and highlight existing skills more clearly.
- You MUST NOT apply anything from "user_only_issues" (those require user input).

You MUST return a single JSON object and nothing else (no markdown, no code fences).

Schema:
{
  "optimized_text": string,
  "applied_recommendations": string[],
  "not_applied_because_user_only": string[]
}

Target role: ${targetRole ? JSON.stringify(targetRole) : "\"\""}

User-only issues (DO NOT change these; keep the resume as-is for those):
${userOnlyIssues.length ? userOnlyIssues.map((x) => `- ${x}`).join("\n") : "- (none)"}

Editable recommendations to apply (apply as many as possible without changing facts):
${recommendations.length ? recommendations.map((x) => `- ${x}`).join("\n") : "- (none)"}

Missing keywords: ONLY incorporate a missing keyword if it is ALREADY true and implied/present in the resume text.
If not already true, do NOT add it.
${missingKeywords.length ? missingKeywords.map((x) => `- ${x}`).join("\n") : "- (none)"}



Resume text:
${resumeText}
`.trim();
}

export async function handler(event) {
  try {
    const body = getJsonBody(event);
    const text = String(body?.text || "").trim();
    const analysis = body?.analysis || null;
    const targetRole = body?.target_role || null;
    const model = body?.model || process.env.OLLAMA_MODEL || "gpt-oss:20b-cloud";

    if (!text) return errorResponse(400, "Provide `text`.");
    if (!analysis) return errorResponse(400, "Provide `analysis` from /api/analyze.");
    if (text.length > 18000) return errorResponse(413, "Resume text is too long to optimize reliably. Please shorten it or optimize section-by-section.");

    const prompt = buildOptimizePrompt({ resumeText: text, analysis, targetRole });
    const modelText = await chatToString({
      model,
      messages: [{ role: "user", content: prompt }],
    });

    const parsed = safeJsonParse(modelText);
    if (!parsed?.optimized_text) return errorResponse(502, "Model did not return valid JSON with `optimized_text`.", modelText?.slice?.(0, 800));

    const optimizedText = String(parsed.optimized_text).trim();
    const applied = normalizeStringArray(parsed.applied_recommendations);
    const blocked = normalizeStringArray(parsed.not_applied_because_user_only);

    return jsonResponse(200, {
      optimized_text: optimizedText,
      applied_recommendations_count: applied.length,
      applied_recommendations: applied,
      not_applied_because_user_only: blocked,
    });
  } catch (err) {
    return errorResponse(500, "Optimize failed.", err?.message ? String(err.message) : undefined);
  }
}
