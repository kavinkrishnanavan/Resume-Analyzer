import { extractSkillsFromText, mapSkillsToOntology, normalizeSkill } from "../skills/skills.js";
import {
  countOccurrences,
  extractRequiredYears,
  normalizeText,
  tokenizeKeywords
} from "./textUtils.js";
import { parseResumeToJson } from "../resume/parseResume.js";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function percent(n) {
  return clamp(Math.round(n), 0, 100);
}

function setIntersectionCount(a, b) {
  let c = 0;
  for (const v of a) if (b.has(v)) c++;
  return c;
}

function scoreSkillMatch(jdSkills, cvSkills) {
  const jdSet = new Set(jdSkills.map(normalizeSkill));
  const cvSet = new Set(cvSkills.map(normalizeSkill));
  if (jdSet.size === 0) return { score: 0, matched: [], missing: [] };

  const matched = [];
  const missing = [];
  for (const s of jdSet) (cvSet.has(s) ? matched : missing).push(s);

  const overlap = setIntersectionCount(jdSet, cvSet);
  const score = (overlap / jdSet.size) * 100;
  return { score: percent(score), matched: matched.sort(), missing: missing.sort() };
}

function scoreSkillFrequency(jdSkills, cvText) {
  const cv = normalizeText(cvText);
  const top = jdSkills.slice(0, 18);
  if (top.length === 0) return { score: 0, perSkill: {} };

  const perSkill = {};
  let sum = 0;
  for (const s of top) {
    const key = normalizeSkill(s);
    const c = countOccurrences(cv, key);
    const capped = Math.min(c, 4);
    perSkill[key] = c;
    sum += capped;
  }
  const max = top.length * 4;
  const score = (sum / max) * 100;
  return { score: percent(score), perSkill };
}

function scoreContext(jdSkills, parsedResume) {
  const expText = (parsedResume?.experience || [])
    .flatMap((e) => [e.header, ...(e.bullets || [])])
    .filter(Boolean)
    .join("\n");

  const t = normalizeText(expText);
  if (!t) return { score: 0, hits: [] };

  const hits = [];
  for (const s of jdSkills) {
    const n = normalizeSkill(s);
    if (countOccurrences(t, n) > 0) hits.push(n);
  }

  const uniqueHits = Array.from(new Set(hits));
  const denom = Math.max(1, new Set(jdSkills.map(normalizeSkill)).size);
  const score = (uniqueHits.length / denom) * 100;
  return { score: percent(score), hits: uniqueHits.sort() };
}

function scoreKeywordMatch(jdKeywords, cvText, { keywordExactness = 0.6 } = {}) {
  const cv = normalizeText(cvText);
  if (!jdKeywords.length) return { score: 0, matched: [], missing: [] };

  const matched = [];
  const missing = [];

  for (const kw of jdKeywords) {
    const needle = kw.toLowerCase();
    const exact = countOccurrences(cv, needle) > 0;
    const partial = !exact && cv.includes(needle);
    const ok = exact || (partial && keywordExactness < 0.75);
    (ok ? matched : missing).push(kw);
  }

  const score = (matched.length / jdKeywords.length) * 100;
  return { score: percent(score), matched: matched.slice(0, 50), missing: missing.slice(0, 50) };
}

function detectTableLike(text) {
  const t = String(text || "");
  const lines = t.split("\n");
  const pipeLines = lines.filter((l) => (l.match(/\|/g) || []).length >= 3).length;
  const multiSpaceCols = lines.filter((l) => / {3,}\S+ {3,}\S+/.test(l)).length;
  return pipeLines >= 3 || multiSpaceCols >= 8;
}

function detectSectionPresence(text) {
  const t = String(text || "").toLowerCase();
  const hasSkills = /\bskills?\b/.test(t);
  const hasExperience = /\bexperience\b|\bwork experience\b|\bemployment\b/.test(t);
  const hasEducation = /\beducation\b/.test(t);
  return { hasSkills, hasExperience, hasEducation };
}

function scoreFormatting(cvText, { formatting = 0.6 } = {}) {
  const t = String(cvText || "");
  const penalties = [];

  if (detectTableLike(t)) penalties.push({ code: "tables", points: 30 });

  const sections = detectSectionPresence(t);
  if (!sections.hasExperience) penalties.push({ code: "missing_experience_section", points: 12 });
  if (!sections.hasSkills) penalties.push({ code: "missing_skills_section", points: 10 });
  if (!sections.hasEducation) penalties.push({ code: "missing_education_section", points: 6 });

  const hasWeirdBullets = /[•·‣▪]/.test(t);
  if (hasWeirdBullets) penalties.push({ code: "non_ascii_bullets", points: 6 });

  const base = 100;
  const rawPenalty = penalties.reduce((a, p) => a + p.points, 0);

  const strictMultiplier = 0.75 + (formatting * 0.5);
  const score = base - rawPenalty * strictMultiplier;
  return { score: percent(score), penalties };
}

function estimateYearsFromCv(cvText, parsedResume) {
  const exp = (parsedResume?.experience || [])
    .flatMap((e) => [e.header, ...(e.bullets || [])])
    .filter(Boolean)
    .join("\n");
  const source = exp || cvText || "";
  const years = Array.from(
    new Set((String(source).match(/\b(19\d{2}|20\d{2})\b/g) || []).map(Number))
  ).sort((a, b) => a - b);

  if (years.length < 2) return null;
  const earliest = years[0];
  const latest = years[years.length - 1];
  const span = latest - earliest;
  return clamp(span, 0, 50);
}

function scoreExperienceRelevance(jdText, cvText, parsedResume) {
  const required = extractRequiredYears(jdText);
  const estimated = estimateYearsFromCv(cvText, parsedResume);

  let yearsScore = 55;
  if (required != null && estimated != null) {
    if (estimated >= required) yearsScore = 100;
    else yearsScore = clamp((estimated / Math.max(1, required)) * 100, 0, 100);
  } else if (estimated != null) {
    yearsScore = clamp(50 + estimated * 3, 50, 100);
  }

  const jd = normalizeText(jdText);
  const cv = normalizeText(cvText);
  const domainSignals = [
    "fintech",
    "healthcare",
    "e-commerce",
    "supply chain",
    "manufacturing",
    "oil & gas",
    "process simulation"
  ];
  const jdDomains = domainSignals.filter((d) => jd.includes(d));
  const cvDomains = domainSignals.filter((d) => cv.includes(d));
  const overlap = jdDomains.filter((d) => cvDomains.includes(d)).length;
  const domainScore = jdDomains.length ? (overlap / jdDomains.length) * 100 : 70;

  const score = (yearsScore * 0.7 + domainScore * 0.3);
  return {
    score: percent(score),
    requiredYears: required,
    estimatedYears: estimated,
    jdDomains,
    cvDomains
  };
}

export function runAtsScoring({ cvText, jdText, profile }) {
  const parsedResume = parseResumeToJson(cvText);

  const cvSkills = extractSkillsFromText(cvText);
  const jdSkills = extractSkillsFromText(jdText);

  const cvOntology = mapSkillsToOntology(cvSkills);
  const jdOntology = mapSkillsToOntology(jdSkills);

  const jdKeywords = tokenizeKeywords(jdText, { max: 22 }).filter(
    (k) => !new Set(jdOntology.all).has(normalizeSkill(k))
  );

  const skillMatch = scoreSkillMatch(jdOntology.all, cvOntology.all);
  const skillFrequency = scoreSkillFrequency(jdOntology.all, cvText);
  const context = scoreContext(jdOntology.all, parsedResume);
  const keywordMatch = scoreKeywordMatch(jdKeywords, cvText, {
    keywordExactness: profile.strictness.keywordExactness
  });
  const formatting = scoreFormatting(cvText, {
    formatting: profile.strictness.formatting
  });
  const experienceRelevance = scoreExperienceRelevance(jdText, cvText, parsedResume);

  const weights = profile.weights;
  const final =
    skillMatch.score * weights.skillMatch +
    skillFrequency.score * weights.skillFrequency +
    context.score * weights.context +
    keywordMatch.score * weights.keywordMatch +
    formatting.score * weights.formatting +
    experienceRelevance.score * weights.experienceRelevance;

  return {
    profile: { key: profile.key, name: profile.name, weights: profile.weights, strictness: profile.strictness },
    parsedResume,
    extracted: {
      resumeSkills: cvOntology,
      jdSkills: jdOntology,
      jdKeywords
    },
    breakdown: {
      skillMatch,
      skillFrequency,
      context,
      keywordMatch,
      formatting,
      experienceRelevance
    },
    finalScore: percent(final)
  };
}

