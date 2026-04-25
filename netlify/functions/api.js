import express from "express";
import cors from "cors";
import serverless from "serverless-http";

import { parseMultipart } from "./lib/http/multipart.js";
import { extractTextFromFile } from "./lib/resume/fileText.js";
import { parseResumeToJson } from "./lib/resume/parseResume.js";
import { analyzeAgainstJd } from "./lib/scoring/analyze.js";
import { optimizeResume } from "./lib/services/llmService.js";
import { atsProfiles } from "./lib/scoring/atsProfiles.js";

const app = express();

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
    const { file, fields } = await parseMultipart(req, {
      maxFileBytes: 6 * 1024 * 1024
    });

    if (!file?.buffer || !file?.filename) {
      return res.status(400).json({ error: "Missing resume file." });
    }

    const rawText = await extractTextFromFile(file);
    const parsed = parseResumeToJson(rawText);

    res.json({
      input: { filename: file.filename, mimeType: file.mimeType, fields },
      rawText,
      parsed
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to parse resume.",
      details: err?.message ?? String(err)
    });
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
    res.status(500).json({
      error: "Failed to analyze.",
      details: err?.message ?? String(err)
    });
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
    res.status(500).json({
      error: "Failed to optimize.",
      details: err?.message ?? String(err)
    });
  }
});

const handler = serverless(app, {
  basePath: "/.netlify/functions/api"
});

export default async (event, context) => handler(event, context);

