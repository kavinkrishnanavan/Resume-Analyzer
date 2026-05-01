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


/**
 * Generates an ultra-ruthless, 100-point rubric prompt for an LLM to analyze a resume
 * against a specific Job Description (JD).
 * 
 * @param {Object} params
 * @param {string} params.resumeText - The raw text extracted from the resume.
 * @param {string} params.targetJobDescription - The full text of the job description.
 * @returns {string} The formatted prompt string.
 */
function buildAnalysisPrompt({ resumeText, targetJobDescription }) {
  const rubrics = [
    // --- 1. JOB DESCRIPTION ALIGNMENT: CORE (15) ---
    "JD: Exact Job Title Match or Logical Progression", "JD: Years of Experience vs Requirement", "JD: Industry Sector Alignment", "JD: Seniority Level Congruency", "JD: Primary Responsibility Coverage", "JD: Secondary Responsibility Coverage", "JD: Essential Requirement Satisfaction", "JD: Preferred/Bonus Qualification Matching", "JD: Regional/Location Requirement Check", "JD: Language Proficiency Requirements", "JD: Company Culture Keyword Alignment", "JD: Product/Service Familiarity", "JD: Business Model Experience (B2B/B2C)", "JD: Stakeholder Management Level", "JD: Regulatory/Compliance Alignment",

    // --- 2. SKILL GAP ANALYSIS (20) ---
    "Skills: Hard Skill #1 Match from JD", "Skills: Hard Skill #2 Match from JD", "Skills: Hard Skill #3 Match from JD", "Skills: Tech Stack Tool A Alignment", "Skills: Tech Stack Tool B Alignment", "Skills: Legacy Skill Bloat (Removing JD-irrelevant tech)", "Skills: Methodology Match (Agile/Scrum/Lean)", "Skills: Domain-Specific Vocabulary Usage", "Skills: Software/SaaS Tool Proficiency", "Skills: Scripting/Programming Language Match", "Skills: Certification Requirement Fulfillment", "Skills: License/Accreditation Validation", "Skills: Technical Breadth vs JD Depth", "Skills: Technical Depth vs JD Breadth", "Skills: Framework/Library Recency", "Skills: Soft Skill Evidence in Context", "Skills: Database/Infrastructure Alignment", "Skills: API/Integration Experience", "Skills: Security/Safety Protocol Knowledge", "Skills: Data Analysis/Visualization Tools",

    // --- 3. QUANTIFICATION & ROI (15) ---
    "ROI: Revenue Impact Matching JD Goals", "ROI: Cost Reduction Metrics", "ROI: Efficiency/Time-Saving Quantified", "ROI: Scale of Impact (JD-relevant volume)", "ROI: Team/Budget Management Scale", "ROI: Project Completion Timelines", "ROI: Error Rate/Quality Improvement", "ROI: STAR Method: Contextual relevance to JD", "ROI: XYZ Formula: Specificity of Result", "ROI: Data-Driven Decision Making Evidence", "ROI: KPI Ownership Clarity", "ROI: Market Share Growth Attribution", "ROI: Retention/Churn Metric Alignment", "ROI: Automation/Scaling Proof", "ROI: Customer/Client Satisfaction Metrics",

    // --- 4. ATS & STRUCTURAL INTEGRITY (15) ---
    "ATS: Section Header Standardized Parsing", "ATS: Multi-Column Layout Interference", "ATS: Graphic/Icon/Chart Noise", "ATS: Font Compatibility (Sans-Serif)", "ATS: Text Layer Extraction Quality", "ATS: Chronological Order Strictness", "ATS: Date Formatting Consistency", "ATS: Contact Info Header Extraction", "ATS: Keyword Density (Avoidance of Stuffing)", "ATS: File Length (Page Count vs Experience)", "ATS: Whitespace/Margin Ratio", "ATS: Bullet Point Symbol Standard", "ATS: Table/Grid Usage Risk", "ATS: Hyperlink Validity", "ATS: Bold/Italic Parsing Noise",

    // --- 5. TONE & WRITING QUALITY (15) ---
    "Tone: Action Verb Strength (Front-loaded)", "Tone: Elimination of First Person (I, me)", "Tone: Elimination of Passive Voice", "Tone: Buzzword/Corporate Fluff Removal", "Tone: Subjective Adjectives (Passionate/Driven)", "Tone: Industry Jargon Accuracy", "Grammar: Tense Consistency (Current/Past)", "Grammar: Punctuation Uniformity", "Grammar: Spelling Accuracy", "Grammar: Proper Noun Capitalization", "Grammar: Number Formatting (Digits vs Words)", "Grammar: Sentence Structure Clarity", "Grammar: Run-on Sentence Detection", "Grammar: Filler Word Elimination", "Grammar: Overall Professionalism Score",

    // --- 6. EDUCATION & CREDENTIALS (10) ---
    "Edu: Degree Level vs JD Requirement", "Edu: Major/Field Relevance to JD", "Edu: University/Institution Credibility", "Edu: Graduation Date Presence", "Edu: Honors/Awards Context", "Edu: Continuing Education/CEUs", "Edu: GPA (If JD-required/Early career)", "Edu: Placement Strategy (Top vs Bottom)", "Edu: Professional Development Relevance", "Edu: Thesis/Project Relevance to JD",

    // --- 7. RUTHLESS STRATEGY & RED FLAGS (10) ---
    "Red Flag: Job Hopping (>3 jobs in 2 years)", "Red Flag: Career Plateau (Stagnant titles)", "Red Flag: Unexplained Gaps (>4 months)", "Red Flag: Title Inflation (Unverifiable seniority)", "Red Flag: Vague Descriptions (No substance)", "Strategy: Professional Summary Sharpness", "Strategy: Career Trajectory Logic", "Strategy: Geographic/Relocation Feasibility", "Strategy: Outdated Technology Usage", "Strategy: Over-qualification (Flight risk)"
  ];

  return `
You are a cynical, elite Technical Recruiter conducting a high-stakes audit. 
Your goal is to REJECT this candidate by finding every possible failure in their alignment with the provided Job Description.

STRICT PROTOCOLS:
1. RUTHLESS EVALUATION: Scores above 90 are reserved for perfect matches. A "good" resume is a 60.
2. JD-CENTRIC: Every rubric point must be evaluated THROUGH THE LENS of the Job Description. If the JD requires HYSYS and the resume lists "Simulation Software," score it poorly for lack of specificity.
3. NO HALLUCINATION: If the data isn't there, the score is 0. Do not be "generous."
4. OUTPUT: Return ONLY a raw JSON object. No markdown, no code fences, no preamble.

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

TARGET JOB DESCRIPTION:
---
${targetJobDescription}
---

RUBRICS TO SCORE (Evaluate all 100 points):
${rubrics.map((r, i) => `${i + 1}. ${r}`).join("\n")}

RESUME TEXT FOR AUDIT:
---
${resumeText}
---
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
