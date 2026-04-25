# ATS Resume Optimizer (Netlify)

## Setup

```bash
npm install
```

## Local Dev (recommended)

```bash
cp .env.example .env
# set GROQ_API_KEY in .env
npm run netlify:dev
```

Open:
- Frontend: http://localhost:8888
- API: http://localhost:8888/api/health

## Deploy to Netlify

1) Push this folder to a Git repo
2) In Netlify:
   - Build command: `npm run build`
   - Publish directory: `public`
   - Functions directory: `netlify/functions`
   - Add env var: `GROQ_API_KEY`
   - Optional env var: `GROQ_MODEL`

## Project Structure

```
.
├─ netlify/functions/api.js
├─ netlify/functions/lib/
│  ├─ http/multipart.js
│  ├─ resume/
│  │  ├─ fileText.js
│  │  └─ parseResume.js
│  ├─ skills/
│  │  ├─ skills.js
│  │  └─ skillsOntology.js
│  └─ scoring/
│     ├─ analyze.js
│     ├─ atsProfiles.js
│     ├─ scoreEngine.js
│     └─ textUtils.js
├─ public/
│  ├─ index.html
│  ├─ app.js
│  └─ styles.css
├─ netlify.toml
└─ .env.example
```

## API

Base: `/api/*` (redirects to `/.netlify/functions/api/*`)

- `GET /api/health`
- `GET /api/profiles`
- `POST /api/parse-resume` (multipart form-data; field: `file`)
- `POST /api/analyze` JSON: `{ cvText, jdText, atsType }`
- `POST /api/optimize` JSON: `{ cvText, jdText, atsType }`
