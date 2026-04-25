import express from "express";
import cors from "cors";
import serverless from "serverless-http";

import { parseMultipart } from "./lib/http/multipart.js";
import { extractTextFromFile } from "./lib/resume/fileText.js";
import { parseResumeToJson } from "./lib/resume/parseResume.js";
import { analyzeAgainstJd } from "./lib/scoring/analyze.js";
import { optimizeResume } from "./lib/services/llmService.js";
import { atsProfiles } from "./lib/scoring/atsProfiles.js";
import { HttpError } from "./lib/http/errors.js";

const app = express();

app.use((req, _res, next) => {
  // eslint-disable-next-line no-console
  console.log(`[api] ${req.method} ${req.originalUrl}`);
  next();
});

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/profiles", (_req, res) => res.json({ atsProfiles }));

app.post("/parse-resume", async (req, res) => {
  try {
    const contentType = req.headers["content-type"] || "";

    // Supports JSON input too (avoids multipart issues).
    if (contentType.includes("application/json")) {
      const cvText = req.body?.cvText;
      if (!cvText) return res.status(400).json({ error: "Missing cvText." });
      const rawText = String(cvText);
      const parsed = parseResumeToJson(rawText);
      return res.json({ input: { type: "text" }, rawText, parsed });
    }

    const { file, fields } = await parseMultipart(req, { maxFileBytes: 6 * 1024 * 1024 });
    if (!file?.buffer || !file?.filename) return res.status(400).json({ error: "Missing resume file." });

    const rawText = await extractTextFromFile(file);
    const parsed = parseResumeToJson(rawText);

    return res.json({
      input: { filename: file.filename, mimeType: file.mimeType, fields },
      rawText,
      parsed
    });
  } catch (err) {
    const status = err instanceof HttpError ? err.statusCode : 500;
    return res.status(status).json({ error: "Failed to parse resume.", details: err?.message ?? String(err) });
  }
});

app.post("/analyze", async (req, res) => {
  try {
    const { cvText, jdText, atsType } = req.body ?? {};
    if (!cvText || !jdText || !atsType) {
      return res
        .status(400)
        .json({ error: "cvText, jdText, and atsType are required." });
    }
    if (!atsProfiles[atsType]) {
      return res.status(400).json({ error: "Unknown atsType." });
    }

    const result = analyzeAgainstJd({ cvText, jdText, atsType });
    res.json(result);
  } catch (err) {
    const status = err instanceof HttpError ? err.statusCode : 500;
    res.status(status).json({ error: "Failed to analyze.", details: err?.message ?? String(err) });
  }
});

app.post("/optimize", async (req, res) => {
  try {
    const { cvText, jdText, atsType } = req.body ?? {};
    if (!cvText || !jdText || !atsType) {
      return res
        .status(400)
        .json({ error: "cvText, jdText, and atsType are required." });
    }
    if (!atsProfiles[atsType]) {
      return res.status(400).json({ error: "Unknown atsType." });
    }

    const llm = await optimizeResume({ cvText, jdText, atsType });
    const analysisAfter = analyzeAgainstJd({
      cvText: llm.optimizedText,
      jdText,
      atsType
    });

    res.json({
      optimized: llm,
      analysisAfter
    });
  } catch (err) {
    const status = err instanceof HttpError ? err.statusCode : 500;
    res.status(status).json({ error: "Failed to optimize.", details: err?.message ?? String(err) });
  }
});

app.use((req, res) => {
  res.status(404).json({
    error: "Not found",
    path: req.path,
    hint:
      "Try GET /api/health or GET /.netlify/functions/api/health to verify routing."
  });
});

const serverlessHandler = serverless(app, {
  basePath: "/.netlify/functions/api"
});

// Netlify expects a named export called `handler`.
// Keep a default export too for compatibility with some local runners.
export const handler = async (event, context) => {
  try {
    return await serverlessHandler(event, context);
  } catch (err) {
    // Ensures Netlify logs show the underlying error instead of a generic 502.
    // eslint-disable-next-line no-console
    console.error("Function crash:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Function crashed", details: err?.message ?? String(err) })
    };
  }
};

export default handler;
