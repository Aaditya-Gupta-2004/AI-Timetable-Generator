import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "./Layout";
import { API_BASE } from "../config/api";

const DAYS      = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const SLOTS     = ["9-10", "10-11", "11-12", "12-1", "1-2", "2-3", "3-4", "4-5"];
const BREAK_SLOT = "1-2";
const SLOT_LABELS = {
  "9-10":  "9:00–10:00",
  "10-11": "10:00–11:00",
  "11-12": "11:00–12:00",
  "12-1":  "12:00–1:00",
  "1-2":   "1:00–2:00 (BREAK)",
  "2-3":   "2:00–3:00",
  "3-4":   "3:00–4:00",
  "4-5":   "4:00–5:00",
};

function getPillStyle(subject) {
  if (!subject) return {};
  if (typeof subject === "string" && subject.toUpperCase().includes(" LAB")) {
    return { background: "#e8f5e9", color: "#2e7d32", fontWeight: 600 };
  }
  const palette  = ["#e3f0ff","#f0e6ff","#fff0e0","#e0fff4","#ffe0f0","#f0ffe0"];
  const textPal  = ["#1a56db","#7c3aed","#c05621","#065f46","#9d174d","#3f6212"];
  const name     = typeof subject === "string" ? subject : (subject.subject || "");
  const i        = name.length > 0 ? name.charCodeAt(0) % palette.length : 0;
  return { background: palette[i], color: textPal[i], fontWeight: 600 };
}

function emptyGrid() {
  const g = {};
  DAYS.forEach(d => {
    g[d] = {};
    SLOTS.forEach(s => { g[d][s] = s === BREAK_SLOT ? "BREAK" : ""; });
  });
  return g;
}

function getSubjectName(cell) {
  if (!cell) return "";
  if (typeof cell === "string") return cell;
  return cell.subject || "";
}

export default function Dashboard() {
  const navigate = useNavigate();

  const [subjects,   setSubjects]   = useState([]);
  const [divisions,  setDivisions]  = useState([]);
  const [timetables, setTimetables] = useState({});   // flat: { "SE-IT › A": grid }
  const [selDiv,     setSelDiv]     = useState("");
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      setError("Not logged in — please sign in again.");
      return;
    }
    const h    = { Authorization: `Bearer ${token}` };
    const safe = (promise) => promise.then(r => r.ok ? r.json() : null).catch(() => null);

    Promise.all([
      safe(fetch(`${API_BASE}/subjects`,   { headers: h })),
      safe(fetch(`${API_BASE}/divisions`,  { headers: h })),
      safe(fetch(`${API_BASE}/timetables`, { headers: h })), // returns { yb_key: { div: grid } }
    ]).then(([sData, dData, tData]) => {

      // ── Subjects ─────────────────────────────────────────────────────────
      if (sData) {
        const arr = Array.isArray(sData) ? sData : sData.subjects || [];
        setSubjects(arr);
      }

      // ── Divisions ────────────────────────────────────────────────────────
      if (dData) {
        const arr = (Array.isArray(dData) ? dData : dData.divisions || []).map(x => x.name || x);
        setDivisions(arr);
      }

      // ── Timetables ───────────────────────────────────────────────────────
      // /timetables returns { yb_key: { div: grid } }
      // Flatten into { "SE-IT › A": grid, "SE-IT › B": grid, ... }
      // so the dropdown shows every division of every year-branch.
      if (tData && Object.keys(tData).length > 0) {
        const flat = {};
        for (const [ybKey, divGrids] of Object.entries(tData)) {
          if (!divGrids || typeof divGrids !== "object") continue;
          for (const [div, grid] of Object.entries(divGrids)) {
            if (!grid || typeof grid !== "object") continue;
            flat[`${ybKey} › ${div}`] = grid;
          }
        }

        setTimetables(flat);

        // Auto-select first available division
        const firstKey = Object.keys(flat)[0];
        if (firstKey) setSelDiv(firstKey);
      }

      setLoading(false);
    }).catch(err => {
      console.error("Dashboard fetch error:", err);
      setError("Could not reach backend.");
      setLoading(false);
    });
  }, []);

  // ── Derived state ──────────────────────────────────────────────────────────
  // timetables[selDiv] is now directly the day→slot grid for the selected division
  const grid     = timetables[selDiv] || emptyGrid();
  const labCount = subjects.filter(s => s.type === "core_lab").length;
  const hasTT    = Object.keys(timetables).length > 0;

  return (
    <Layout>
      <h2 className="page-title" style={{ marginBottom: 4 }}>Dashboard</h2>

      {/* ── Quick-action cards ─────────────────────────────────────────────── */}
      <div className="top-cards">
        <div className="card card-accent-pink">
          <div className="card-title">Generate Timetable</div>
          <button className="card-btn btn-pink" onClick={() => navigate("/generate")}>Go →</button>
        </div>
        <div className="card card-accent-teal">
          <div className="card-title">Preview Timetable</div>
          <button className="card-btn btn-teal" onClick={() => navigate("/preview")}>Go →</button>
        </div>
        <div className="card card-accent-yellow">
          <div className="card-title">Settings</div>
          <button className="card-btn btn-yellow" onClick={() => navigate("/settings")}>Go →</button>
        </div>
      </div>

      {/* ── Error / loading banners ────────────────────────────────────────── */}
      {error && (
        <div className="banner banner-error" style={{ lineHeight: 1.8 }}>
          <strong>⚠️ {error}</strong>
          <div style={{ fontSize: 12, marginTop: 6, opacity: 0.85 }}>
            Quick checklist:&nbsp;① Backend running?&nbsp;② Check terminal for errors.
          </div>
        </div>
      )}
      {loading && <div className="banner banner-info">⏳ Loading data…</div>}

      {/* ── Status panel ──────────────────────────────────────────────────── */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">AI Scheduling Engine Status</span>
          <span className="panel-dots">···</span>
        </div>
        <div className="status-grid">
          <div className="status-row">Subjects loaded: <strong>{subjects.length}</strong></div>
          <div className="status-row">Labs detected: <strong>{labCount}</strong></div>
          <div className="status-row">Divisions: <strong>{divisions.length}</strong></div>
          <div className="status-row">
            Status:{" "}
            <strong>
              {loading
                ? "Loading…"
                : hasTT
                  ? "Timetable Ready"
                  : subjects.length > 0
                    ? "Ready to Generate"
                    : "No Data"}
            </strong>
          </div>
          {/* Now correctly counts all division-timetables across all yb_keys */}
          <div className="status-row">
            Division timetables loaded: <strong>{Object.keys(timetables).length}</strong>
          </div>
          <div className="status-row">
            <span
              className="status-dot"
              style={{
                background: hasTT
                  ? "#00C9A7"
                  : subjects.length > 0
                    ? "#f5a623"
                    : "#ccc",
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Timetable preview panel ───────────────────────────────────────── */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Timetable Preview</span>
          <span className="panel-dots">···</span>
        </div>

        <div className="tt-controls">
          <span className="tt-badge">{selDiv || "—"}</span>
          <select
            className="tt-select"
            value={selDiv}
            onChange={e => setSelDiv(e.target.value)}
          >
            {Object.keys(timetables).length > 0
              ? Object.keys(timetables).map(label => (
                  <option key={label} value={label}>{label}</option>
                ))
              : <option value="">No generated data</option>}
          </select>
        </div>

        {!loading && !hasTT ? (
          <div style={S.emptyState}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📋</div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>No timetable generated yet</div>
            <div style={{ fontSize: 13, color: "#888" }}>
              Go to{" "}
              <button style={S.linkBtn} onClick={() => navigate("/generate")}>
                Generate Timetable
              </button>{" "}
              first
            </div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.cornerTh}>Time</th>
                  {DAYS.map(d => <th key={d} style={S.th}>{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {SLOTS.map(slot => {
                  const isBreak = slot === BREAK_SLOT;
                  return (
                    <tr key={slot} style={isBreak ? { background: "#fff8f0" } : {}}>
                      <td style={{ ...S.slotTd, ...(isBreak ? S.breakSlotTd : {}) }}>
                        {SLOT_LABELS[slot]}
                      </td>
                      {DAYS.map(day => {
                        const cell      = grid[day]?.[slot];
                        const subjName  = getSubjectName(cell);
                        const isCellBreak = isBreak || subjName === "BREAK";
                        return (
                          <td key={day} style={{ ...S.td, ...(isCellBreak ? S.breakTd : {}) }}>
                            {isCellBreak
                              ? <span style={S.breakPill}>BREAK</span>
                              : subjName
                                ? <span style={{ ...S.pill, ...getPillStyle(subjName) }}>{subjName}</span>
                                : null}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}

const S = {
  table:       { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  cornerTh:    { background: "#f1f5ff", padding: "8px 12px", fontWeight: 700, fontSize: 11, borderBottom: "2px solid #d0d9f0", textAlign: "left", whiteSpace: "nowrap", minWidth: 110 },
  th:          { background: "#f1f5ff", padding: "8px 10px", fontWeight: 700, fontSize: 11, borderBottom: "2px solid #d0d9f0", textAlign: "center", whiteSpace: "nowrap", minWidth: 80 },
  slotTd:      { padding: "7px 12px", fontWeight: 600, fontSize: 11, color: "#556", background: "#f7f8ff", borderRight: "2px solid #d0d9f0", whiteSpace: "nowrap" },
  breakSlotTd: { background: "#fff3e0", color: "#e65100" },
  td:          { padding: "6px 8px", textAlign: "center", border: "1px solid #eef0f8" },
  breakTd:     { background: "#fff3e0" },
  pill:        { display: "inline-block", borderRadius: 6, padding: "3px 8px", fontSize: 11 },
  breakPill:   { display: "inline-block", borderRadius: 6, padding: "3px 8px", fontSize: 11, background: "#fff3e0", color: "#e65100", fontWeight: 700, fontStyle: "italic" },
  emptyState:  { padding: "40px 20px", textAlign: "center", color: "#777" },
  linkBtn:     { background: "none", border: "none", cursor: "pointer", color: "#667eea", textDecoration: "underline", fontSize: 13, padding: 0 },
};