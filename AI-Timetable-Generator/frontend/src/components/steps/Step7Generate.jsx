import React, { useState } from "react";
import {
  DAYS, SLOTS, BREAK_SLOT, SLOT_LBL,
  S,
} from "../timetableHelpers";

// ─────────────────────────────────────────────────────────────────────────────
// Step7Generate
//
// Props:
//   dept, semLabel        — institution info
//   rooms                 — [{ id, number, type }]
//   yearBranches          — [{ id, year, branch, divs }]
//   teachers              — [{ id, code, name }]
//   allTimetables         — { [ybId]: { [div]: grid } }
//   teacherTTs            — { [teacherCode]: grid }
//   labRoomTTs            — { [room]: grid }
//   generated             — boolean
//   generating            — boolean
//   handleGenerate        — fn
//   downloadAll           — fn
//   downloadSingle        — fn(ybId, div)
//   getFooterRolesForDiv  — fn(ybId, div)
//   setActiveTab          — fn
// ─────────────────────────────────────────────────────────────────────────────

const DAY_SHORT = { Monday:"Mon", Tuesday:"Tue", Wednesday:"Wed", Thursday:"Thu", Friday:"Fri" };

function TimetableGrid({ grid, teachers }) {
  if (!grid) return null;
  return (
    <div style={{ overflowX: "auto", marginTop: 12 }}>
      <table style={TS.table}>
        <thead>
          <tr>
            <th style={{ ...TS.th, width: 60, background: "#1a2b4a", color: "#fff" }}>Day</th>
            {SLOTS.map(slot => (
              <th key={slot} style={{
                ...TS.th,
                background: slot === BREAK_SLOT ? "#fff3e0" : "#f1f5ff",
                color:      slot === BREAK_SLOT ? "#e65100" : "#334",
                fontSize: 10, minWidth: 100,
              }}>
                {SLOT_LBL[slot]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day, di) => (
            <tr key={day} style={{ background: di % 2 === 0 ? "#fafbff" : "#fff" }}>
              <td style={TS.dayCell}>{DAY_SHORT[day]}</td>
              {SLOTS.map(slot => {
                if (slot === BREAK_SLOT) {
                  return (
                    <td key={slot} style={TS.breakCell}>BREAK</td>
                  );
                }
                const cell = grid[day]?.[slot];
                if (!cell?.subject) {
                  return <td key={slot} style={TS.emptyCell}>—</td>;
                }
                if (cell.batches?.length) {
                  return (
                    <td key={slot} style={TS.labCell}>
                      <div style={TS.subjectLabel}>{cell.subject}</div>
                      {cell.batches.map((b, i) => (
                        <div key={i} style={TS.batchRow}>
                          <span style={TS.batchTag}>{b.batch}</span>
                          <span style={TS.tcCode}>{b.teacherCode || b.teacher_code || "—"}</span>
                          {b.room && <span style={TS.roomTag}>{b.room}</span>}
                        </div>
                      ))}
                    </td>
                  );
                }
                return (
                  <td key={slot} style={TS.theoryCell}>
                    <div style={TS.subjectLabel}>{cell.subject}</div>
                    {(cell.teacherCode || cell.teacher_code) && (
                      <div style={TS.tcCode}>{cell.teacherCode || cell.teacher_code}</div>
                    )}
                    {cell.room && <div style={TS.roomTag}>{cell.room}</div>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Step7Generate({
  dept,
  semLabel,
  rooms,
  yearBranches,
  teachers,
  allTimetables = {},
  teacherTTs    = {},
  labRoomTTs    = {},
  generated,
  generating,
  handleGenerate,
  downloadAll,
  downloadSingle,
  getFooterRolesForDiv,
  setActiveTab,
}) {
  const [activeView,    setActiveView]    = useState("division"); // "division" | "teacher" | "lab"
  const [activeYbId,    setActiveYbId]    = useState(yearBranches[0]?.id || "");
  const [activeDiv,     setActiveDiv]     = useState(yearBranches[0]?.divs[0] || "");
  const [activeTeacher, setActiveTeacher] = useState(teachers[0]?.code || "");

  const currentYb   = yearBranches.find(yb => yb.id === activeYbId) || yearBranches[0];
  const currentGrid = allTimetables[activeYbId]?.[activeDiv] || null;
  const currentTTG  = teacherTTs[activeTeacher] || null;

  const labRooms = rooms.filter(r => r.type === "lab");

  return (
    <div>
      {/* ── Generate panel ── */}
      <div style={GS.panel}>
        <div style={GS.panelHeader}>
          <span style={GS.panelTitle}>⚡ Generate Timetable</span>
        </div>

        <p style={GS.hint}>
          Click <strong>Generate</strong> to run the scheduling algorithm across all
          Year-Branch-Divisions. Once done, browse timetables below and download as Excel.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              padding: "13px 36px", borderRadius: 10, border: "none",
              background: generating
                ? "#aaa"
                : "linear-gradient(90deg,#667eea,#764ba2)",
              color: "#fff", fontWeight: 700, fontSize: 15,
              cursor: generating ? "not-allowed" : "pointer",
              boxShadow: generating ? "none" : "0 4px 14px rgba(102,126,234,0.4)",
              transition: "all 0.2s",
            }}>
            {generating ? "⏳ Generating…" : "⚡ Generate Timetable"}
          </button>

          {generated && (
            <button
              onClick={downloadAll}
              style={{
                padding: "13px 28px", borderRadius: 10, border: "none",
                background: "#00C9A7", color: "#fff", fontWeight: 700,
                fontSize: 14, cursor: "pointer",
                boxShadow: "0 4px 14px rgba(0,201,167,0.35)",
              }}>
              📥 Download All (.xlsx)
            </button>
          )}
        </div>

        {generated && (
          <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 8, background: "#f0faf8", border: "1px solid #9ae6b4", fontSize: 13, color: "#276749" }}>
            ✅ Timetable generated successfully! Browse divisions below or download.
          </div>
        )}
      </div>

      {/* ── Only show viewer after generation ── */}
      {generated && (
        <>
          {/* View mode tabs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {["division", "teacher", "lab"].map(v => (
              <button key={v} onClick={() => setActiveView(v)} style={{
                padding: "8px 20px", borderRadius: 20, border: "none",
                background: activeView === v ? "#667eea" : "#f0f4ff",
                color:      activeView === v ? "#fff"    : "#4a6fa5",
                fontWeight: activeView === v ? 700       : 500,
                fontSize: 13, cursor: "pointer",
              }}>
                {v === "division" ? "🏫 Division TT" : v === "teacher" ? "👩‍🏫 Teacher TT" : "🔬 Lab Room TT"}
              </button>
            ))}
          </div>

          {/* ── Division view ── */}
          {activeView === "division" && (
            <div style={GS.panel}>
              {/* YB selector */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                {yearBranches.map(yb => (
                  <button key={yb.id} onClick={() => { setActiveYbId(yb.id); setActiveDiv(yb.divs[0]); }}
                    style={{
                      padding: "6px 16px", borderRadius: 20, border: "none", fontSize: 13,
                      background: activeYbId === yb.id ? "#1a2b4a" : "#f0f4ff",
                      color:      activeYbId === yb.id ? "#fff"    : "#4a6fa5",
                      fontWeight: activeYbId === yb.id ? 700       : 500,
                      cursor: "pointer",
                    }}>
                    {yb.id}
                  </button>
                ))}
              </div>

              {/* Div selector */}
              {currentYb && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                  {currentYb.divs.map(div => (
                    <button key={div} onClick={() => setActiveDiv(div)}
                      style={{
                        padding: "5px 14px", borderRadius: 16, border: "1.5px solid",
                        borderColor: activeDiv === div ? "#667eea" : "#c8d5ea",
                        background:  activeDiv === div ? "#667eea" : "#fff",
                        color:       activeDiv === div ? "#fff"    : "#4a6fa5",
                        fontWeight: 600, fontSize: 12, cursor: "pointer",
                      }}>
                      Div {div}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1a2b4a" }}>
                  {activeYbId} — Division {activeDiv}
                </div>
                <button
                  onClick={() => downloadSingle(activeYbId, activeDiv)}
                  style={{ padding: "7px 18px", borderRadius: 8, border: "1.5px solid #5b8dee", background: "#f0f5ff", color: "#3451b2", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                  📄 Download This Sheet
                </button>
              </div>

              <TimetableGrid grid={currentGrid} teachers={teachers} />
            </div>
          )}

          {/* ── Teacher view ── */}
          {activeView === "teacher" && (
            <div style={GS.panel}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                {teachers.map(t => (
                  <button key={t.code} onClick={() => setActiveTeacher(t.code)}
                    style={{
                      padding: "6px 14px", borderRadius: 20, border: "1.5px solid",
                      borderColor: activeTeacher === t.code ? "transparent" : "#c8d5ea",
                      background:  activeTeacher === t.code
                        ? "linear-gradient(90deg,#667eea,#764ba2)" : "#f0f4ff",
                      color:       activeTeacher === t.code ? "#fff" : "#4a6fa5",
                      fontWeight: 600, fontSize: 12, cursor: "pointer",
                    }}>
                    {t.code} — {t.name}
                  </button>
                ))}
              </div>

              {currentTTG ? (
                <div style={{ overflowX: "auto" }}>
                  <table style={TS.table}>
                    <thead>
                      <tr>
                        <th style={{ ...TS.th, width: 60, background: "#1a2b4a", color: "#fff" }}>Day</th>
                        {SLOTS.map(slot => (
                          <th key={slot} style={{
                            ...TS.th,
                            background: slot === BREAK_SLOT ? "#fff3e0" : "#f1f5ff",
                            color:      slot === BREAK_SLOT ? "#e65100" : "#334",
                            fontSize: 10, minWidth: 100,
                          }}>
                            {SLOT_LBL[slot]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {DAYS.map((day, di) => (
                        <tr key={day} style={{ background: di % 2 === 0 ? "#fafbff" : "#fff" }}>
                          <td style={TS.dayCell}>{DAY_SHORT[day]}</td>
                          {SLOTS.map(slot => {
                            if (slot === BREAK_SLOT) return <td key={slot} style={TS.breakCell}>BREAK</td>;
                            const items = currentTTG[day]?.[slot] || [];
                            if (!items.length) return <td key={slot} style={TS.emptyCell}>—</td>;
                            return (
                              <td key={slot} style={TS.theoryCell}>
                                {items.map((it, i) => (
                                  <div key={i} style={{ marginBottom: i < items.length - 1 ? 4 : 0 }}>
                                    <div style={TS.subjectLabel}>{it.subject}</div>
                                    <div style={{ fontSize: 10, color: "#667eea" }}>
                                      {it.ybLabel}/Div {it.div}{it.batch ? `/${it.batch}` : ""}
                                    </div>
                                    {it.room && <div style={TS.roomTag}>{it.room}</div>}
                                  </div>
                                ))}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={GS.emptyBox}>No sessions assigned to this teacher yet.</div>
              )}
            </div>
          )}

          {/* ── Lab room view ── */}
          {activeView === "lab" && (
            <div style={GS.panel}>
              {!labRooms.length ? (
                <div style={GS.emptyBox}>No lab rooms added. Add lab rooms in Step ③.</div>
              ) : (
                labRooms.map(room => {
                  const lg = labRoomTTs[room.number];
                  return (
                    <div key={room.number} style={{ marginBottom: 28 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#1a2b4a", marginBottom: 8 }}>
                        🔬 Lab Room: {room.number}
                      </div>
                      {lg ? (
                        <div style={{ overflowX: "auto" }}>
                          <table style={TS.table}>
                            <thead>
                              <tr>
                                <th style={{ ...TS.th, width: 60, background: "#1a2b4a", color: "#fff" }}>Day</th>
                                {SLOTS.map(slot => (
                                  <th key={slot} style={{
                                    ...TS.th,
                                    background: slot === BREAK_SLOT ? "#fff3e0" : "#f1f5ff",
                                    color:      slot === BREAK_SLOT ? "#e65100" : "#334",
                                    fontSize: 10, minWidth: 100,
                                  }}>
                                    {SLOT_LBL[slot]}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {DAYS.map((day, di) => (
                                <tr key={day} style={{ background: di % 2 === 0 ? "#fafbff" : "#fff" }}>
                                  <td style={TS.dayCell}>{DAY_SHORT[day]}</td>
                                  {SLOTS.map(slot => {
                                    if (slot === BREAK_SLOT) return <td key={slot} style={TS.breakCell}>BREAK</td>;
                                    const items = lg[day]?.[slot] || [];
                                    if (!items.length) return <td key={slot} style={TS.emptyCell}>—</td>;
                                    return (
                                      <td key={slot} style={TS.labCell}>
                                        {items.map((it, i) => (
                                          <div key={i} style={{ marginBottom: 2 }}>
                                            <div style={TS.subjectLabel}>{it.subject}</div>
                                            <div style={{ fontSize: 10, color: "#667eea" }}>
                                              {it.ybLabel}/Div {it.div}{it.batch ? `/${it.batch}` : ""}
                                            </div>
                                          </div>
                                        ))}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div style={GS.emptyBox}>No lab sessions assigned to this room yet.</div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Per-division download links */}
          <div style={GS.panel}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#1a2b4a", marginBottom: 12 }}>
              📄 Download Individual Sheets
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {yearBranches.map(yb =>
                yb.divs.map(div => (
                  <button
                    key={`${yb.id}-${div}`}
                    onClick={() => downloadSingle(yb.id, div)}
                    style={{
                      padding: "8px 18px", borderRadius: 8,
                      border: "1.5px solid #5b8dee",
                      background: "#f0f5ff", color: "#3451b2",
                      fontWeight: 600, fontSize: 13, cursor: "pointer",
                    }}>
                    {yb.id} – Div {div}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Navigation ── */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
        <button onClick={() => setActiveTab(5)} style={GS.navBtn("#f0f4ff", "#667eea")}>← Back</button>
      </div>
    </div>
  );
}

// ── Table styles ──────────────────────────────────────────────────────────────
const TS = {
  table:    { width: "100%", borderCollapse: "collapse", fontSize: 12, border: "1px solid #e2e8f0" },
  th:       { padding: "8px 6px", textAlign: "center", fontWeight: 700, fontSize: 11, borderBottom: "2px solid #d0d9f0", whiteSpace: "nowrap" },
  dayCell:  { padding: "8px 10px", fontWeight: 700, color: "#445", background: "#f7f8ff", borderRight: "2px solid #d0d9f0", fontSize: 12, whiteSpace: "nowrap" },
  breakCell:{ padding: "8px", textAlign: "center", background: "#fff3e0", color: "#e65100", fontStyle: "italic", fontSize: 11, border: "1px solid #e8ecf5" },
  emptyCell:{ padding: "8px", textAlign: "center", color: "#ccc", fontSize: 11, border: "1px solid #e8ecf5" },
  theoryCell:{ padding: "6px 8px", border: "1px solid #e8ecf5", verticalAlign: "top", background: "#fafbff" },
  labCell:  { padding: "6px 8px", border: "1px solid #e8ecf5", verticalAlign: "top", background: "#fff8f0" },
  subjectLabel: { fontWeight: 700, fontSize: 11, color: "#1a2b4a", marginBottom: 2 },
  tcCode:   { fontSize: 10, color: "#667eea", fontFamily: "monospace" },
  roomTag:  { fontSize: 10, color: "#888", marginTop: 1 },
  batchRow: { display: "flex", gap: 4, alignItems: "center", marginBottom: 2, flexWrap: "wrap" },
  batchTag: { fontSize: 10, fontWeight: 700, color: "#764ba2", background: "#f3e8ff", borderRadius: 4, padding: "1px 5px" },
};

// ── General styles ────────────────────────────────────────────────────────────
const GS = {
  panel:     { background: "#fff", borderRadius: 16, padding: "22px 26px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 20 },
  panelHeader:{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  panelTitle: { fontSize: 16, fontWeight: 700, color: "#1a2b4a" },
  hint:       { color: "#666", fontSize: 13, lineHeight: 1.75, marginBottom: 14 },
  emptyBox:   { padding: "14px 18px", background: "#f8f9fb", borderRadius: 8, color: "#888", fontSize: 13, border: "1px dashed #d5dae3" },
  navBtn: (bg, color) => ({ padding: "10px 24px", borderRadius: 8, border: "none", background: bg, color, fontWeight: 600, fontSize: 14, cursor: "pointer" }),
};