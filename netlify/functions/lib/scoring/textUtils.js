const STOPWORDS = new Set([
  "the",
  "and",
  "with",
  "for",
  "to",
  "of",
  "a",
  "an",
  "in",
  "on",
  "at",
  "by",
  "from",
  "as",
  "or",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "this",
  "that",
  "these",
  "those",
  "you",
  "we",
  "they",
  "their",
  "our",
  "your",
  "it",
  "its",
  "will",
  "can",
  "may",
  "must",
  "should",
  "required",
  "requirements",
  "responsibilities",
  "role",
  "team",
  "work",
  "working",
  "years",
  "year",
  "experience",
  "strong",
  "preferred"
]);

export function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\r/g, "\n")
    .replace(/[^\p{L}\p{N}+.#/&\n -]/gu, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  const rx = new RegExp(`\\b${escapeRegExp(needle)}\\b`, "gi");
  const matches = String(haystack || "").match(rx);
  return matches ? matches.length : 0;
}

export function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function tokenizeKeywords(text, { minLen = 4, max = 25 } = {}) {
  const normalized = normalizeText(text);
  const tokens = normalized
    .split(/[\n ,;:()\/|]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => t.length >= minLen && t.length <= 28)
    .filter((t) => !STOPWORDS.has(t));

  const freq = new Map();
  for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1);

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([t]) => t);
}

export function extractRequiredYears(jdText) {
  const t = normalizeText(jdText);
  const m =
    t.match(/(\d{1,2})\s*\+?\s*years? of experience/) ||
    t.match(/minimum\s+of\s+(\d{1,2})\s*years?/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

