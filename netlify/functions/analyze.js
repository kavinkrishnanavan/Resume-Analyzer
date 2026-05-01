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
    // --- 1. ATS & PARSABILITY (8 Points) ---
    "ATS: Table/Column Usage (Detection of complex layouts)",
    "ATS: Standard Section Heading Naming",
    "ATS: Contact Info Placement (Header vs Body)",
    "ATS: Font Accessibility (Standard vs Non-standard)",
    "ATS: Removal of Graphics/Icons/Images",
    "ATS: Bullet Point Symbol Compatibility",
    "ATS: Keyword Frequency (Target Role Alignment)",
    "ATS: File Structure Logic (Chronological vs Functional)",

    // --- 2. IMPACT & QUANTIFICATION (10 Points) ---
    "Impact: Hard Revenue/Profit Figures",
    "Impact: Percentage-based Improvements",
    "Impact: Time-saving/Efficiency Metrics",
    "Impact: Scale of Responsibility (Budget/Team Size)",
    "Impact: Frequency of Tasks (Daily/Monthly volumes)",
    "Impact: STAR Method Execution (Situation/Task/Action/Result)",
    "Impact: XYZ Formula Utilization",
    "Impact: Market/Industry Context for Achievements",
    "Impact: Evidence of Scope (Local vs Global)",
    "Impact: Awards, Recognition, or Promotions",

    // --- 3. WRITING & TONE (10 Points) ---
    "Tone: Action Verb Variety (No repetitive 'Managed')",
    "Tone: Elimination of First Person (I, me, my)",
    "Tone: Elimination of Third Person (He, she, [Name])",
    "Tone: Removal of Subjective Adjectives (e.g., 'Passionate')",
    "Tone: Removal of Corporate Cliches/Fluff",
    "Tone: Active vs Passive Voice Ratio",
    "Tone: Professional Industry-Specific Vocabulary",
    "Tone: Sentence Length Diversity",
    "Tone: Concise Delivery (No 'Responsible for...')",
    "Tone: Parallelism in Lists",

    // --- 4. TECHNICAL & SKILLS (8 Points) ---
    "Skills: Hard Skill Extraction Accuracy",
    "Skills: Tool Proficiency Levels (Beginner vs Expert)",
    "Skills: Skill Integration within Experience Bullets",
    "Skills: Separation of Tools vs Frameworks vs Methods",
    "Skills: Recency of Technical Skills",
    "Skills: Certification/License Verifiability",
    "Skills: Relevance of Skills to Target Role",
    "Skills: Soft Skill Evidence (Demonstrated, not listed)",

    // --- 5. FORMAT & CONSISTENCY (7 Points) ---
    "Format: Date Format Uniformity (e.g., MM/YYYY)",
    "Format: Location Formatting Consistency",
    "Format: Punctuation Consistency (End-of-bullet periods)",
    "Format: Tense Consistency (Present for current, Past for old)",
    "Format: Bold/Italic Usage Logic",
    "Format: Proper Noun Capitalization",
    "Format: White Space Distribution",

    // --- 6. STRATEGY & RED FLAGS (7 Points) ---
    "Strategy: Employment Gap Identification",
    "Strategy: Career Progression/Upward Mobility",
    "Strategy: Over-qualification/Under-qualification Risk",
    "Strategy: Resume Length Appropriateness",
    "Strategy: Education Level Relevance",
    "Strategy: Professional Summary/Objective Sharpness",
    "Strategy: Contact Information Professionalism"
  ];

  return `
You are a ruthless, world-class executive recruiter and a highly sophisticated ATS algorithm. 
Your goal is to tear apart the provided resume with extreme prejudice. Do not be "nice." Do not "encourage." Be objective, technical, and hyper-critical.

STRICT OPERATING CONSTRAINTS:
1. OUTPUT: Return a SINGLE JSON object. NO markdown, NO code fences (\`\`\`), NO preamble.
2. EVIDENCE ONLY: Do not invent facts. If a metric isn't there, score that rubric 0. 
3. SCORING SCALE: 
   - 0-30: Fatal flaws / Missing entirely.
   - 31-60: Present but weak/generic.
   - 61-85: Strong and quantified.
   - 86-100: World-class; impossible to improve.
4. FIELD LOGIC:
   - "missing_keywords": Hard technical skills and industry terms only.
   - "recommendations_editable": Rewrites that do NOT require new info from the user.
   - "user_only_issues": Questions about missing data, gaps, or unverifiable claims.

JSON SCHEMA:
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

TARGET ROLE:
${targetRole ? JSON.stringify(targetRole) : "\"Not specified - evaluate against general professional standards\""}

RUBRICS TO EVALUATE (You must evaluate all 50 items):
${rubrics.map((r) => `- ${r}`).join("\n")}

RESUME TEXT:
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
