import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "./Layout";

const API_BASE = "https://ai-timetable-generator-j7qx.onrender.com";
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const SLOTS = ["9-10", "10-11", "11-12", "12-1", "1-2", "2-3", "3-4", "4-5"];
const BREAK_SLOT = "1-2";
const SLOT_LABELS = {
  "9-10": "9:00–10:00", "10-11": "10:00–11:00", "11-12": "11:00–12:00", "12-1": "12:00–1:00",
  "1-2": "1:00–2:00 (BREAK)", "2-3": "2:00–3:00", "3-4": "3:00–4:00", "4-5": "4:00–5:00",
};

function getPillStyle(subject) {
  if (!subject) return {};
  if (subject.toUpperCase().includes(" LAB")) return { background: "#e8f5e9", color: "#2e7d32", fontWeight: 600 };
  const palette = ["#e3f0ff", "#f0e6ff", "#fff0e0", "#e0fff4", "#ffe0f0", "#f0ffe0"];
  const textPal = ["#1a56db", "#7c3aed", "#c05621", "#065f46", "#9d174d", "#3f6212"];
  const i = subject.charCodeAt(0) % palette.length;
  return { background: palette[i], color: textPal[i], fontWeight: 600 };
}

function emptyGrid() {
  const g = {};
  DAYS.forEach(d => { g[d] = {}; SLOTS.forEach(s => { g[d][s] = s === BREAK_SLOT ? "BREAK" : ""; }); });
  return g;
}

function normaliseGrid(raw) {
  const g = emptyGrid(); if (!raw) return g;
  for (const [day, slots] of Object.entries(raw)) {
    if (!g[day]) continue;
    for (const [slot, subj] of Object.entries(slots))
      if (g[day][slot] !== undefined) g[day][slot] = subj || "";
  }
  return g;
}

function flattenTimetables(raw) {
  const flattened = {};
  if (!raw || typeof raw !== "object") return flattened;
  Object.values(raw).forEach((ybGrids) => {
    Object.entries(ybGrids || {}).forEach(([divName, grid]) => {
      flattened[divName] = normaliseGrid(grid);
    });
  });
  return flattened;
}

function getSubjectName(cell) {
  if (!cell) return "";
  if (typeof cell === "string") return cell;
  return cell.subject || "";
}

export default function Preview() {
  const navigate = useNavigate();
  const [timetables, setTimetables] = useState({});
  const [divisions, setDivisions] = useState([]);
  const [selDiv, setSelDiv] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { setLoading(false); return; }
    const h = { Authorization: "Bearer " + token };
    Promise.all([
      fetch(API_BASE + "/timetables", { headers: h }),
      fetch(API_BASE + "/divisions", { headers: h }),
    ]).then(async ([tR, dR]) => {
      let tts = {};
      if (tR.ok) {
        const d = await tR.json();

        if (d && Object.keys(d).length > 0) {
          // Get latest year-branch (last generated)
          const latestYB = Object.keys(d).sort().pop();
          const latestTT = d[latestYB] || {};

          // Normalize each division grid
          Object.entries(latestTT).forEach(([div, grid]) => {
            tts[div] = normaliseGrid(grid);
          });
        }
      }
      let divs = [];
      if (dR.ok) { const d = await dR.json(); divs = (Array.isArray(d) ? d : d.divisions || []).map(x => x.name || x); }
      if (!divs.length) divs = Object.keys(tts);
      setTimetables(tts); setDivisions(divs);
      setSelDiv(divs[0] || "");
      setLoading(false);
    }).catch(() => { setError("Could not load timetable data."); setLoading(false); });
  }, []);

  const grid = timetables[selDiv] || emptyGrid();
  const hasTT = Object.keys(timetables).length > 0;

  return (
    <Layout>
      <h2 className="page-title" style={{ marginBottom: 4 }}>Timetable Preview</h2>
      {error && <div className="banner banner-error">&#9888;&#65039; {error}</div>}
      {loading && <div className="banner banner-info">&#9203; Loading timetable...</div>}

      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Full Weekly Timetable</span>
          <span className="panel-dots">...</span>
        </div>
        <div className="tt-controls">
          <span className="tt-badge">{selDiv || "—"}</span>
          <select className="tt-select" value={selDiv} onChange={e => setSelDiv(e.target.value)}>
            {divisions.length > 0
              ? divisions.map(d => <option key={d} value={d}>{d}</option>)
              : <option value="">No divisions</option>}
          </select>
        </div>

        {!loading && !hasTT ? (
          <div style={S.emptyState}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>No timetable generated yet</div>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>Generate a timetable first to see it here.</div>
            <button onClick={() => navigate("/generate")} style={S.genBtn}>
              Generate Timetable
            </button>
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
                      <td style={Object.assign({}, S.slotTd, isBreak ? S.breakSlotTd : {})}>{SLOT_LABELS[slot]}</td>
                      {DAYS.map(day => {
                        const cell = (grid[day] && grid[day][slot]) || "";
                        const val = getSubjectName(cell);
                        const brk = isBreak || val === "BREAK";
                        return (
                          <td key={day} style={Object.assign({}, S.td, brk ? S.breakTd : {})}>
                            {brk
                              ? <span style={S.breakPill}>BREAK</span>
                              : val ? <span style={Object.assign({}, S.pill, getPillStyle(val))}>{val}</span> : null}
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

      {hasTT && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-header"><span className="panel-title">Legend</span></div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", padding: "10px 4px" }}>
            <span style={Object.assign({}, S.pill, { background: "#e8f5e9", color: "#2e7d32", fontWeight: 600 })}>Lab Session</span>
            <span style={Object.assign({}, S.pill, { background: "#fff3e0", color: "#e65100", fontWeight: 700 })}>Break</span>
            <span style={Object.assign({}, S.pill, { background: "#e3f0ff", color: "#1a56db", fontWeight: 600 })}>Theory / Elective</span>
          </div>
        </div>
      )}
    </Layout>
  );
}

const S = {
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  cornerTh: { background: "#f1f5ff", padding: "9px 14px", fontWeight: 700, fontSize: 11, borderBottom: "2px solid #d0d9f0", textAlign: "left", whiteSpace: "nowrap", minWidth: 120 },
  th: { background: "#f1f5ff", padding: "9px 10px", fontWeight: 700, fontSize: 11, borderBottom: "2px solid #d0d9f0", textAlign: "center", whiteSpace: "nowrap", minWidth: 90 },
  slotTd: { padding: "8px 14px", fontWeight: 600, fontSize: 11, color: "#556", background: "#f7f8ff", borderRight: "2px solid #d0d9f0", whiteSpace: "nowrap" },
  breakSlotTd: { background: "#fff3e0", color: "#e65100" },
  td: { padding: "7px 8px", textAlign: "center", border: "1px solid #eef0f8" },
  breakTd: { background: "#fff3e0" },
  pill: { display: "inline-block", borderRadius: 6, padding: "4px 10px", fontSize: 11 },
  breakPill: { display: "inline-block", borderRadius: 6, padding: "4px 10px", fontSize: 11, background: "#fff3e0", color: "#e65100", fontWeight: 700, fontStyle: "italic" },
  emptyState: { padding: "60px 20px", textAlign: "center", color: "#777" },
  genBtn: { padding: "10px 28px", borderRadius: 8, background: "linear-gradient(90deg,#667eea,#764ba2)", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600 },
};
