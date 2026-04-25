import Groq from "groq-sdk";
import { atsProfiles } from "../scoring/atsProfiles.js";

function safeJsonParse(s) {
  const str = String(s || "").trim();
  const start = str.indexOf("{");
  const end = str.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(str.slice(start, end + 1));
  } catch {
    return null;
  }
}

function buildPrompt({ cvText, jdText, atsType }) {
  const profile = atsProfiles[atsType];
  const strict = profile?.strictness || {};

  return [
    "You are an ATS resume optimization engine.",
    "Rewrite the resume to maximize ATS match against the job description.",
    "Target ATS platform: " + atsType.toUpperCase(),
    "ATS strictness hints:",
    `- parsing_strictness: ${strict.parsing}`,
    `- formatting_strictness: ${strict.formatting}`,
    `- keyword_exactness: ${strict.keywordExactness}`,
    "",
    "Hard rules:",
    "- Output MUST be valid JSON only (no markdown, no code fences).",
    "- Do NOT hallucinate employers, dates, degrees, certifications, or metrics not in the resume.",
    "- Keep the resume ATS-readable: no tables, no columns, no special bullet characters (use '-' only).",
    "- Add/maintain a dedicated SKILLS section with grouped categories (Technical, Tools/Software, Domain Knowledge, Certifications).",
    "- Rewrite experience bullets to: Action + Skill + Context + Outcome (keep outcomes factual; if missing, omit metrics).",
    "- Preserve the candidate's identity and truthfulness. You may reorder and rephrase.",
    "",
    "Return JSON with this schema:",
    `{
  "optimizedText": "string (ATS-friendly plain text resume)",
  "changeLog": ["string"],
  "addedSkills": ["string (skills added ONLY if clearly implied by resume)"],
  "emphasizedKeywords": ["string (keywords pulled from JD and placed where truthful)"]
}`,
    "",
    "JOB DESCRIPTION:",
    jdText,
    "",
    "RESUME:",
    cvText
  ].join("\n");
}

export async function optimizeResume({ cvText, jdText, atsType }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GROQ_API_KEY env var.");
  }

  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const groq = new Groq({ apiKey });

  const completion = await groq.chat.completions.create({
    model,
    temperature: 0.2,
    max_tokens: 2048,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "You are a careful, truth-preserving resume editor."
      },
      {
        role: "user",
        content: buildPrompt({ cvText, jdText, atsType })
      }
    ]
  });

  const content = completion?.choices?.[0]?.message?.content ?? "";
  const parsed = safeJsonParse(content);
  if (!parsed?.optimizedText) {
    return {
      optimizedText: String(content || "").trim(),
      changeLog: ["LLM returned non-JSON or missing optimizedText."],
      addedSkills: [],
      emphasizedKeywords: []
    };
  }

  return {
    optimizedText: parsed.optimizedText,
    changeLog: Array.isArray(parsed.changeLog) ? parsed.changeLog : [],
    addedSkills: Array.isArray(parsed.addedSkills) ? parsed.addedSkills : [],
    emphasizedKeywords: Array.isArray(parsed.emphasizedKeywords)
      ? parsed.emphasizedKeywords
      : [],
    _meta: {
      model,
      usage: completion?.usage || null
    }
  };
}

