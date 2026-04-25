import { extractSkillsFromText, mapSkillsToOntology } from "../skills/skills.js";

const SECTION_HEADERS = [
  { key: "experience", patterns: [/work experience/i, /^experience$/im] },
  { key: "education", patterns: [/^education$/im] },
  {
    key: "certifications",
    patterns: [/^certifications?$/im, /^licenses?$/im]
  },
  { key: "skills", patterns: [/^skills?$/im, /^technical skills$/im] },
  { key: "projects", patterns: [/^projects?$/im] },
  { key: "summary", patterns: [/^summary$/im, /^profile$/im, /^objective$/im] }
];

function findFirstLine(text) {
  const lines = String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return lines[0] || "";
}

function guessName(text) {
  const first = findFirstLine(text);
  const cleaned = first.replace(/[^\p{L} .'-]/gu, "").trim();
  const looksLikeName =
    cleaned.length >= 4 &&
    cleaned.length <= 48 &&
    /^[\p{L}]+([\p{L} .'-]+)?$/u.test(cleaned) &&
    !/resume|curriculum vitae|cv/i.test(cleaned);
  return looksLikeName ? cleaned : "";
}

function splitSections(text) {
  const lines = String(text || "").split("\n");
  const sections = { _root: [] };
  let currentKey = "_root";

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      sections[currentKey].push("");
      continue;
    }

    const matched = SECTION_HEADERS.find((h) =>
      h.patterns.some((p) => p.test(line))
    );
    if (matched) {
      currentKey = matched.key;
      if (!sections[currentKey]) sections[currentKey] = [];
      continue;
    }

    if (!sections[currentKey]) sections[currentKey] = [];
    sections[currentKey].push(raw);
  }

  const normalized = {};
  for (const [k, v] of Object.entries(sections)) {
    normalized[k] = v.join("\n").trim();
  }
  return normalized;
}

function parseExperience(sectionText) {
  const lines = String(sectionText || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const entries = [];
  let current = null;

  for (const line of lines) {
    const isBullet = /^[-*•]\s+/.test(line);
    const dateLike = /\b(20\d{2}|19\d{2})\b/.test(line) && /-|\u2013|to/i.test(line);
    const looksLikeHeader = !isBullet && (dateLike || / at | @ | \| /.test(line));

    if (looksLikeHeader) {
      if (current) entries.push(current);
      current = { header: line, bullets: [] };
      continue;
    }

    if (!current) current = { header: "", bullets: [] };
    if (isBullet) current.bullets.push(line.replace(/^[-*•]\s+/, "").trim());
    else current.bullets.push(line);
  }

  if (current) entries.push(current);
  return entries.filter((e) => e.header || e.bullets.length);
}

function parseSimpleList(sectionText) {
  const lines = String(sectionText || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return lines
    .map((l) => l.replace(/^[-*•]\s+/, "").trim())
    .filter(Boolean);
}

export function parseResumeToJson(rawText) {
  const sections = splitSections(rawText);

  const extractedSkills = extractSkillsFromText(rawText);
  const ontology = mapSkillsToOntology(extractedSkills);

  return {
    name: guessName(rawText),
    experience: parseExperience(sections.experience || sections._root || ""),
    skills: ontology?.all ?? [],
    education: parseSimpleList(sections.education || ""),
    certifications: parseSimpleList(sections.certifications || ""),
    _meta: {
      sectionsDetected: Object.keys(sections).filter((k) => k !== "_root"),
      skillsOntology: ontology
    }
  };
}

