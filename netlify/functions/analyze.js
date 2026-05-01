import pdfParse from "pdf-parse";
import { chatToString } from "./ollama.js";
import {
  clampScore,
  errorResponse,
  getJsonBody,
  jsonResponse,
  normalizeStringArray,
  safeJsonParse,
} from "./_utils.js";

function buildAnalysisPrompt({ resumeText, targetRole }) {
  const rubrics = [
    "ATS Keyword Coverage",
    "Role Fit (Target Role)",
    "Impact & Metrics",
    "Clarity & Brevity",
    "Structure & Readability",
    "Consistency (dates/tense/format)",
    "Action Verbs & Ownership",
    "Evidence of Skills (projects/experience)",
    "Red Flags (gaps/unclear claims)",
  ];

  return `
You are an ATS-focused resume analyzer.
You MUST return a single JSON object and nothing else (no markdown, no code fences).

Hard rules:
- Only use evidence from the resume text.
- Do not invent skills, employers, education, dates, or achievements.
- "missing_keywords" should be reasonable keywords for the target role and common ATS terms, but should NOT be buzzword spam.
- "recommendations_editable" are changes that can be made by rewriting/reformatting without requiring new facts.
- "user_only_issues" are problems that require the user's input or verification (missing dates, unverifiable claims, unclear company names, etc.). These MUST NOT be auto-fixed later.
- Provide scores per rubric (0-100 integers) and a short "notes" array per rubric.

Schema:
{
  "overall_score_percent": number,
  "rubrics": [
    { "name": string, "score_percent": number, "notes": string[] }
  ],
  "skills_present": string[],
  "missing_keywords": string[],
  "recommendations_editable": string[],
  "user_only_issues": string[]
}

Target role (may be empty): ${targetRole ? JSON.stringify(targetRole) : "\"\""}

Rubrics to score (use these names exactly):
${rubrics.map((r) => `- ${r}`).join("\n")}

Resume text:
${resumeText}
`.trim();
}

async function extractTextFromPdfBase64(pdfBase64) {
  const buf = Buffer.from(pdfBase64, "base64");
  const parsed = await pdfParse(buf);
  const text = String(parsed?.text || "").trim();
  if (!text) throw new Error("Could not extract text from PDF.");
  return text;
}

function normalizeAnalysis(raw) {
  const rubrics = Array.isArray(raw?.rubrics) ? raw.rubrics : [];
  const normalizedRubrics = rubrics
    .map((r) => ({
      name: String(r?.name ?? "").trim(),
      score_percent: clampScore(r?.score_percent ?? r?.score_percent),
      notes: normalizeStringArray(r?.notes),
    }))
    .filter((r) => r.name);

  const overall = clampScore(raw?.overall_score_percent);
  const skills = normalizeStringArray(raw?.skills_present);
  const missing = normalizeStringArray(raw?.missing_keywords);
  const recs = normalizeStringArray(raw?.recommendations_editable);
  const issues = normalizeStringArray(raw?.user_only_issues);

  return {
    overall_score_percent: overall,
    rubrics: normalizedRubrics,
    skills_present: skills,
    missing_keywords: missing,
    recommendations_editable: recs,
    user_only_issues: issues,
  };
}

export async function handler(event) {
  try {
    const body = getJsonBody(event);
    const pdfBase64 = body?.pdf_base64 || null;
    const text = body?.text || null;
    const targetRole = body?.target_role || null;

    if (!pdfBase64 && !text) return errorResponse(400, "Provide `pdf_base64` or `text`.");

    const extractedText = pdfBase64 ? await extractTextFromPdfBase64(pdfBase64) : String(text).trim();
    if (!extractedText) return errorResponse(400, "Empty resume text.");

    const prompt = buildAnalysisPrompt({ resumeText: extractedText, targetRole });
    const modelText = await chatToString({
      model: "gpt-oss:120b",
      messages: [{ role: "user", content: prompt }],
    });

    const parsed = safeJsonParse(modelText);
    if (!parsed) return errorResponse(502, "Model did not return valid JSON.", modelText?.slice?.(0, 800));

    const analysis = normalizeAnalysis(parsed);
    if (!analysis.rubrics.length) return errorResponse(502, "Model response missing rubrics.", parsed);

    return jsonResponse(200, {
      source: pdfBase64 ? "pdf" : "text",
      extracted_text: extractedText,
      analysis,
    });
  } catch (err) {
    return errorResponse(500, "Analyze failed.", err?.message ? String(err.message) : undefined);
  }
}

