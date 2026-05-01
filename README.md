# ATS Resume Analyzer + Optimizer (Netlify + Ollama)

Static frontend in `public/` with Netlify Functions in `netlify/functions/`.

## Features
- Upload a PDF resume or paste text
- Analyze with rubric scoring table + overall score
- Extracts: skills present, missing keywords, editable recommendations, user-only issues
- Optimize button rewrites only what’s safe (preserves facts; never auto-fixes user-only issues)
- Export optimized resume as `.txt`, `.docx`, and `.pdf`

## Setup
1) Install deps:
- `npm install`

2) Set env var:
- `OLLAMA_API_KEY=...`
- Optional: `OLLAMA_MODEL=gpt-oss:120b-cloud`
- Optional: `OLLAMA_HOST=https://ollama.com`

3) Run locally:
- `npx netlify dev`

Open the local URL shown by Netlify.

## API endpoints
- `POST /api/analyze` `{ pdf_base64?: string, text?: string, target_role?: string }`
- `POST /api/optimize` `{ text: string, analysis: object, target_role?: string }`
- `POST /api/export` `{ format: "txt"|"docx"|"pdf", text: string }`
