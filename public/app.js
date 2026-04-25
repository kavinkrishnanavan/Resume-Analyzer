const API_BASE = "/api";

const { useEffect, useMemo, useRef, useState } = React;
const html = htm.bind(React.createElement);

async function jsonFetch(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : undefined,
    body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = payload?.error || `Request failed (${res.status})`;
    throw new Error(payload?.details ? `${msg}: ${payload.details}` : msg);
  }
  return payload;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function ScorePill({ score }) {
  const color = score >= 80 ? "var(--ok)" : score >= 60 ? "var(--warn)" : "var(--bad)";
  return html`<span className="pill">
    <span style=${{ width: 8, height: 8, borderRadius: 999, background: color, display: "inline-block" }}></span>
    <span>${score}/100</span>
  </span>`;
}

function App() {
  const [atsType, setAtsType] = useState("workday");
  const [cvText, setCvText] = useState("");
  const [jdText, setJdText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [fileLabel, setFileLabel] = useState("");

  const [analysis, setAnalysis] = useState(null);
  const [optimized, setOptimized] = useState(null);

  const score = analysis?.atsScore ?? 0;
  const breakdown = analysis?.breakdown ?? null;
  const matchedSkills = analysis?.matchedSkills ?? [];
  const missingSkills = analysis?.missingSkills ?? [];
  const extracted = analysis?.extracted ?? {};

  const fileInputRef = useRef(null);

  const canRun = useMemo(() => cvText.trim() && jdText.trim() && !busy, [cvText, jdText, busy]);

  async function onUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr("");
    setBusy(true);
    setAnalysis(null);
    setOptimized(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const parsed = await jsonFetch("/parse-resume", { method: "POST", body: form });
      setCvText(parsed?.rawText || "");
      setFileLabel(`Loaded: ${parsed?.input?.filename || file.name}`);
    } catch (error) {
      setErr(error.message);
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onAnalyze() {
    setErr("");
    setBusy(true);
    setAnalysis(null);
    setOptimized(null);
    try {
      const r = await jsonFetch("/analyze", { method: "POST", body: { cvText, jdText, atsType } });
      setAnalysis(r);
    } catch (error) {
      setErr(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function onOptimize() {
    setErr("");
    setBusy(true);
    setOptimized(null);
    try {
      const r = await jsonFetch("/optimize", { method: "POST", body: { cvText, jdText, atsType } });
      setOptimized(r);
      setAnalysis(r.analysisAfter || null);
    } catch (error) {
      setErr(error.message);
    } finally {
      setBusy(false);
    }
  }

  function onReset() {
    setErr("");
    setBusy(false);
    setFileLabel("");
    setCvText("");
    setJdText("");
    setAnalysis(null);
    setOptimized(null);
  }

  const breakdownRows = [
    ["Skill Match", breakdown?.skillMatch?.score],
    ["Skill Frequency", breakdown?.skillFrequency?.score],
    ["Context", breakdown?.context?.score],
    ["Keyword Match", breakdown?.keywordMatch?.score],
    ["Formatting", breakdown?.formatting?.score],
    ["Experience Relevance", breakdown?.experienceRelevance?.score]
  ].filter((r) => typeof r[1] === "number");

  return html`
    <div className="container">
      <div className="topbar">
        <div className="brand">
          <div className="logo"></div>
          <div>
            <h1>ATS Resume Optimizer</h1>
            <p>Cornerstone · Workday · Taleo — parsing, scoring, and Groq rewrite</p>
          </div>
        </div>
        <div className="row">
          <span className="pill">Target: ${atsType}</span>
          ${fileLabel ? html`<span className="pill">${fileLabel}</span>` : null}
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <h2>Inputs</h2>

          <div className="row" style=${{ alignItems: "end" }}>
            <div className="field">
              <label>ATS Platform</label>
              <select value=${atsType} disabled=${busy} onChange=${(e) => setAtsType(e.target.value)}>
                <option value="cornerstone">Cornerstone</option>
                <option value="workday">Workday</option>
                <option value="taleo">Taleo</option>
              </select>
            </div>
            <div className="field">
              <label>Upload Resume (PDF/DOCX)</label>
              <input
                ref=${fileInputRef}
                type="file"
                disabled=${busy}
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange=${onUpload}
              />
              <div className="muted">Upload fills the Resume Text box.</div>
            </div>
          </div>

          <div className="field" style=${{ marginTop: 12 }}>
            <label>Resume Text</label>
            <textarea
              value=${cvText}
              disabled=${busy}
              onInput=${(e) => setCvText(e.target.value)}
              placeholder="Paste your resume text here, or upload PDF/DOCX above..."
            ></textarea>
          </div>

          <div className="field" style=${{ marginTop: 12 }}>
            <label>Job Description</label>
            <textarea
              value=${jdText}
              disabled=${busy}
              onInput=${(e) => setJdText(e.target.value)}
              placeholder="Paste the job description here..."
            ></textarea>
          </div>

          <div className="btnbar">
            <button className="primary" disabled=${!canRun} onClick=${onAnalyze}>Analyze</button>
            <button disabled=${!canRun} onClick=${onOptimize}>Optimize with Groq</button>
            <button className="danger" disabled=${busy} onClick=${onReset}>Reset</button>
            <span className="muted">${busy ? "Working…" : "Tip: Optimize runs LLM rewrite then re-scores."}</span>
          </div>

          ${err ? html`<div className="err">${err}</div>` : null}
        </div>

        <div className="card">
          <h2>Results</h2>

          <div className="kpi">
            <div>
              <div className="muted">ATS Score</div>
              <strong>${score}</strong>
            </div>
            <${ScorePill} score=${score} />
          </div>

          <div className="progressWrap">
            <div className="progress">
              <div className="bar" style=${{ width: `${clamp(score, 0, 100)}%` }}></div>
            </div>
            <div className="muted" style=${{ marginTop: 8 }}>
              Weighted score (0–100) using ATS-specific profile.
            </div>
          </div>

          <div style=${{ marginTop: 14 }}>
            <div className="muted" style=${{ marginBottom: 8 }}>Breakdown</div>
            <table className="table">
              <thead>
                <tr><th>Factor</th><th>Score</th></tr>
              </thead>
              <tbody>
                ${breakdownRows.length
                  ? breakdownRows.map(([name, s]) => html`<tr key=${name}><td>${name}</td><td>${s}</td></tr>`)
                  : html`<tr><td colSpan="2" className="muted">Run Analyze to see factor scores.</td></tr>`}
              </tbody>
            </table>
          </div>

          <div style=${{ marginTop: 14 }}>
            <div className="muted" style=${{ marginBottom: 8 }}>Skills</div>
            <div className="list">
              ${matchedSkills.slice(0, 30).map((s) => html`<span key=${"m-" + s} className="tag ok">${s}</span>`)}
              ${missingSkills.slice(0, 30).map((s) => html`<span key=${"x-" + s} className="tag bad">${s}</span>`)}
              ${!matchedSkills.length && !missingSkills.length ? html`<span className="muted">No skills extracted yet.</span>` : null}
            </div>
            ${missingSkills.length ? html`<div className="muted" style=${{ marginTop: 8 }}>Missing skills shown in red.</div>` : null}
          </div>
        </div>
      </div>

      <div className="card" style=${{ marginTop: 16 }}>
        <h2>Before vs After</h2>
        <div className="split">
          <div>
            <div className="muted" style=${{ marginBottom: 8 }}>Before (current resume text)</div>
            <div className="mono">${cvText || "—"}</div>
          </div>
          <div>
            <div className="muted" style=${{ marginBottom: 8 }}>After (optimized output)</div>
            <div className="mono">${optimized?.optimized?.optimizedText || "—"}</div>
          </div>
        </div>
      </div>

      <div className="grid" style=${{ marginTop: 16 }}>
        <div className="card">
          <h2>Skill Match Breakdown</h2>
          <div className="row" style=${{ justifyContent: "space-between" }}>
            <span className="pill">JD skills: ${extracted?.jdSkills?.all?.length ?? 0}</span>
            <span className="pill">Resume skills: ${extracted?.resumeSkills?.all?.length ?? 0}</span>
            <span className="pill">Matched: ${matchedSkills.length}</span>
            <span className="pill">Missing: ${missingSkills.length}</span>
          </div>
          <div style=${{ marginTop: 12 }}>
            <div className="muted">Missing Skills</div>
            <div className="list" style=${{ marginTop: 8 }}>
              ${missingSkills.length
                ? missingSkills.map((s) => html`<span key=${"ms-" + s} className="tag bad">${s}</span>`)
                : html`<span className="muted">—</span>`}
            </div>
          </div>
        </div>

        <div className="card">
          <h2>LLM Change Log</h2>
          <div className="muted" style=${{ marginBottom: 8 }}>
            Uses <span style=${{ fontFamily: "var(--mono)" }}>GROQ_API_KEY</span> in Netlify env vars.
          </div>
          <div className="mono">
            ${(optimized?.optimized?.changeLog?.length
              ? optimized.optimized.changeLog.map((l) => `- ${l}`).join("\n")
              : "—")}
          </div>
        </div>
      </div>
    </div>
  `;
}

ReactDOM.createRoot(document.getElementById("root")).render(html`<${App} />`);
