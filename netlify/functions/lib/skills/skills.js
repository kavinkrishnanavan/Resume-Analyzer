import { skillAliases, skillOntology, skillPatterns } from "./skillsOntology.js";

function cleanSkill(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/[^a-z0-9+.#/& -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeSkill(skill) {
  const cleaned = cleanSkill(skill);
  return skillAliases[cleaned] || cleaned;
}

export function extractSkillsFromText(text) {
  const out = new Set();
  const raw = String(text || "");

  for (const rx of skillPatterns) {
    const matches = raw.match(rx) || [];
    for (const m of matches) out.add(normalizeSkill(m));
  }

  const tokens = raw
    .toLowerCase()
    .split(/[\n\r\t ,;:\/|]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  for (const t of tokens) {
    const n = normalizeSkill(t);
    if (n.length >= 2 && (skillOntology.technical.has(n) || skillOntology.tools.has(n)))
      out.add(n);
  }

  return Array.from(out).sort();
}

export function mapSkillsToOntology(skills) {
  const all = Array.from(new Set((skills || []).map(normalizeSkill))).sort();
  const grouped = {
    technical: [],
    tools: [],
    domain: [],
    certifications: [],
    other: []
  };

  for (const s of all) {
    if (skillOntology.technical.has(s)) grouped.technical.push(s);
    else if (skillOntology.tools.has(s)) grouped.tools.push(s);
    else if (skillOntology.domain.has(s)) grouped.domain.push(s);
    else if (skillOntology.certifications.has(s)) grouped.certifications.push(s);
    else grouped.other.push(s);
  }

  return { all, ...grouped };
}

