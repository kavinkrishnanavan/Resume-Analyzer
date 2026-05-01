export function jsonResponse(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

export function errorResponse(statusCode, message, details) {
  const body = { error: message };
  if (details) body.details = details;
  return jsonResponse(statusCode, body);
}

export function getJsonBody(event) {
  if (!event?.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    const err = new Error(`Missing server env var: ${name}`);
    err.code = "MISSING_ENV";
    throw err;
  }
  return v;
}

export function safeJsonParse(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  try {
    return JSON.parse(trimmed);
  } catch {}

  // Try to extract JSON object from a larger response.
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const maybe = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(maybe);
    } catch {}
  }
  return null;
}

export function clampScore(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

export function normalizeStringArray(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const v of arr) {
    const s = String(v ?? "").trim();
    if (!s) continue;
    out.push(s);
  }
  return Array.from(new Set(out));
}

