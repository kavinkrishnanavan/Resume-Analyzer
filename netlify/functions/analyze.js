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
    // --- ATS & Parsing ---
    "ATS Parsability & Formatting (Hidden tables, graphics, complex columns)",
    "Standardized Section Headers (Experience, Education, Skills)",
    "Keyword Optimization & Density (Target Role alignment)",

    // --- Content & Impact ---
    "Quantifiable Impact ($, %, time saved, specific metrics)",
    "Action-Result Linkage (Use of STAR/XYZ formats)",
    "Action Verbs & Active Voice (Strong, varied verbs)",
    "Skill Evidence Integration (Skills demonstrated in bullets, not just listed)",
    "Relevance to Target Role (Prioritization of relevant experience)",

    // --- Tone & Professionalism ---
    "Elimination of Fluff & Clichés ('Team player', 'Synergy', etc.)",
    "Pronoun Usage (Zero 1st/3rd person pronouns: I, me, he, she)",
    "Clarity, Brevity & Readability (Avoiding run-on sentences or dense blocks)",

    // --- Mechanics & Consistency ---
    "Chronological Consistency (Dates, missing gaps)",
    "Tense Consistency (Past tense for past roles, present for current)",
    "Grammar, Spelling & Typographical Accuracy",

    // --- Strategy & Red Flags ---
    "Career Trajectory & Progression (Evidence of growth or promotions)",
    "Credibility & Verifiability of Claims (Are the metrics realistic?)",
    "Red Flags (Unexplained gaps, suspicious overlap, vague titles)"
  ];

  return `
You are an uncompromising, highly analytical ATS (Applicant Tracking System) parser and expert technical recruiter.
Your sole purpose is to evaluate the provided resume against the target role and output a STRICTLY formatted JSON object.

CRITICAL DIRECTIVES - FAILURE TO OBEY WILL RESULT IN SYSTEM ERROR:
1. OUTPUT FORMAT: You MUST return a single JSON object and nothing else. Absolutely NO markdown formatting (do not use \`\`\`json or code fences), NO introductory text, and NO concluding remarks. 
2. ZERO HALLUCINATION: Only use evidence from the resume text. You are forbidden from inventing, assuming, or deducing any skills, experiences, dates, employers, or metrics not explicitly written in the resume text.
3. HARSH BUT FAIR SCORING: Do not inflate scores. An average resume should score around 50-60. Only top-tier, perfectly optimized resumes should score 90+.
4. FIELD DEFINITIONS:
   - "missing_keywords": Must be highly specific hard skills, technical tools, or standard ATS terms directly relevant to the target role. No generic buzzword spam.
   - "recommendations_editable": Actionable rewrites and formatting changes that can be made without requiring new facts.
   - "user_only_issues": Information gaps ONLY the user can fix (missing dates, unverifiable claims, unclear company names, etc.). These MUST NOT be auto-fixed later.
   - "rubrics": Provide scores per rubric (0-100 integers) and a short "notes" array per rubric.

EXPECTED JSON SCHEMA:
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

TARGET ROLE (Evaluate strictly against this, if provided):
${targetRole ? JSON.stringify(targetRole) : "\"General Professional (No specific role provided)\""}

RUBRICS TO SCORE (You must evaluate exactly these ${rubrics.length} rubrics using these exact names):
${rubrics.map((r) => `- ${r}`).join("\n")}

RESUME TEXT TO ANALYZE:
--- START RESUME ---
${resumeText}
--- END RESUME ---
`.trim();
}

async function extractTextFromPdfBase64(pdfBase64) {
  const buf = Buffer.from(pdfBase64, "base64");
  const parsed = await pdfParse(buf);
  const text = String(parsed?.text || "").trim();
  if (!text) throw new Error("Could not extract text from PDF.");
  return text;
}

function maybeTruncate(text, limitChars = 14000) {
  const s = String(text || "").trim();
  if (s.length <= limitChars) return { text: s, truncated: false };
  const head = s.slice(0, Math.floor(limitChars * 0.75));
  const tail = s.slice(-Math.floor(limitChars * 0.25));
  return {
    text: `${head}\n\n[...TRUNCATED FOR SPEED...]\n\n${tail}`.trim(),
    truncated: true,
  };
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
    const model = body?.model || process.env.OLLAMA_MODEL || "gpt-oss:20b-cloud";

    if (!pdfBase64 && !text) return errorResponse(400, "Provide `pdf_base64` or `text`.");
    // Netlify/AWS request payload limits are small; base64 adds overhead.
    if (pdfBase64 && String(pdfBase64).length > 5_600_000) {
      return errorResponse(413, "PDF payload too large. Use a smaller PDF (≤ 4MB) or paste text.");
    }

    const extractedTextRaw = pdfBase64 ? await extractTextFromPdfBase64(pdfBase64) : String(text).trim();
    const { text: extractedText, truncated } = maybeTruncate(extractedTextRaw, 14000);
    if (!extractedText) return errorResponse(400, "Empty resume text.");

    const prompt = buildAnalysisPrompt({ resumeText: extractedText, targetRole });
    const modelText = await chatToString({
      model,
      messages: [{ role: "user", content: prompt }],
    });

    const parsed = safeJsonParse(modelText);
    if (!parsed) return errorResponse(502, "Model did not return valid JSON.", modelText?.slice?.(0, 800));

    const analysis = normalizeAnalysis(parsed);
    if (!analysis.rubrics.length) return errorResponse(502, "Model response missing rubrics.", parsed);

    return jsonResponse(200, {
      source: pdfBase64 ? "pdf" : "text",
      extracted_text: extractedText,
      truncated,
      analysis,
    });
  } catch (err) {
    return errorResponse(500, "Analyze failed.", err?.message ? String(err.message) : undefined);
  }
}
