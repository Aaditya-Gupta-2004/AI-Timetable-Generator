import React, { useState } from "react";
import {
  DAYS, SLOTS, BREAK_SLOT, SLOT_LBL,
  S, toCodeStr, generatePDF, generateLabRoomPDF, generateClassroomPDF,
} from "../timetableHelpers";

const DAY_SHORT = { Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu", Friday: "Fri" };

// ─────────────────────────────────────────────────────────────────────────────
// FIX #1: TimetableGrid — use toCodeStr() for every teacher code access
// so {code:"YM", name:"..."} objects render as "YM" not "[object Object]"
// ─────────────────────────────────────────────────────────────────────────────
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
                if (slot === BREAK_SLOT) return <td key={slot} style={TS.breakCell}>BREAK</td>;
                const cell = grid[day]?.[slot];

                if (cell?.subject === "REMEDIAL" || cell?.isRemedial) {
                  return <td key={slot} style={TS.remedialCell}>REMEDIAL</td>;
                }

                if (!cell?.subject) return <td key={slot} style={TS.emptyCell}>—</td>;

                // Lab batches
                if (cell.batches?.length) {
                  return (
                    <td key={slot} style={TS.labCell}>
                      <div style={TS.subjectLabel}>{cell.subject}</div>
                      {cell.batches.map((b, i) => {
                        // FIX #1: always use toCodeStr — handles string AND object
                        const code = toCodeStr(b.teacherCode ?? b.teacher_code);
                        return (
                          <div key={i} style={TS.batchRow}>
                            <span style={TS.batchTag}>{b.batch}</span>
                            <span style={{ fontSize: 10, fontWeight: 600 }}>{b.subjectName}</span>
                            <span style={TS.tcCode}>{code || "—"}</span>
                            {b.room && <span style={TS.roomTag}>{b.room}</span>}
                          </div>
                        );
                      })}
                    </td>
                  );
                }

                // Electives
                if (cell.electives?.length) {
                  return (
                    <td key={slot} style={TS.electiveCell}>
                      <div style={{ fontWeight: 700, fontSize: 10, marginBottom: 4, color: "#b45309" }}>
                        {cell.subject}
                      </div>
                      {cell.electives.map((e, i) => {
                        // FIX #1: toCodeStr for elective teacher codes too
                        const code = toCodeStr(e.teacherCode);
                        return (
                          <div key={i} style={{ fontSize: 10, marginBottom: 2 }}>
                            <strong>{e.name}</strong>
                            {code && <span style={TS.tcCode}> • {code}</span>}
                            {e.room && <span style={TS.roomTag}> {e.room}</span>}
                          </div>
                        );
                      })}
                    </td>
                  );
                }

                // Regular theory
                // FIX #1: toCodeStr for theory teacher code
                const code = toCodeStr(cell.teacherCode ?? cell.teacher_code);
                return (
                  <td key={slot} style={TS.theoryCell}>
                    <div style={TS.subjectLabel}>{cell.subject}</div>
                    {code && <div style={TS.tcCode}>{code}</div>}
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

export default function Step6Generate({
  dept,
  semLabel,
  rooms,
  yearBranches,
  teachers,
  allTimetables = {},
  teacherTTs    = {},
  labRoomTTs    = {},
  classroomTTs  = {},
  generated,
  generating,
  handleGenerate,
  downloadAll,
  downloadSingle,
  getFooterRolesForDiv,
  setActiveTab,
}) {
  const [activeView,      setActiveView]      = useState("division");
  const [activeYbId,      setActiveYbId]      = useState(yearBranches[0]?.id || "");
  const [activeDiv,       setActiveDiv]       = useState(yearBranches[0]?.divs[0] || "");
  const [activeTeacher,   setActiveTeacher]   = useState(teachers[0]?.code || "");
  const [activeClassroom, setActiveClassroom] = useState(rooms.find(r => r.type === "classroom")?.number || "");

  const currentYb   = yearBranches.find(yb => yb.id === activeYbId) || yearBranches[0];
  const currentGrid = allTimetables[activeYbId]?.[activeDiv] || null;
  const currentTTG  = teacherTTs[activeTeacher] || null;
  const labRooms    = rooms.filter(r => r.type === "lab");
  const classrooms  = rooms.filter(r => r.type === "classroom");

  return (
    <div>
      {/* Generate panel */}
      <div style={GS.panel}>
        <div style={GS.panelHeader}>
          <span style={GS.panelTitle}>⚡ Generate Timetable</span>
        </div>
        <p style={GS.hint}>
          Click <strong>Generate</strong> to run the scheduling algorithm across all Year-Branch-Divisions.
          <br />
          <strong>Note:</strong> Empty slots will be labeled as <strong>"REMEDIAL"</strong> for free periods.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              padding: "13px 36px", borderRadius: 10, border: "none",
              background: generating ? "#aaa" : "linear-gradient(90deg,#667eea,#764ba2)",
              color: "#fff", fontWeight: 700, fontSize: 15,
              cursor: generating ? "not-allowed" : "pointer",
              boxShadow: generating ? "none" : "0 4px 14px rgba(102,126,234,0.4)",
              transition: "all 0.2s",
            }}
          >
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
              }}
            >
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

      {generated && (
        <>
          {/* View mode tabs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {["division", "teacher", "classroom", "lab"].map(v => (
              <button key={v} onClick={() => setActiveView(v)} style={{
                padding: "8px 20px", borderRadius: 20, border: "none",
                background: activeView === v ? "#667eea" : "#f0f4ff",
                color:      activeView === v ? "#fff"    : "#4a6fa5",
                fontWeight: activeView === v ? 700       : 500,
                fontSize: 13, cursor: "pointer",
              }}>
                {v === "division" ? "🏫 Division TT" :
                 v === "teacher"  ? "👩‍🏫 Teacher TT" :
                 v === "classroom"? "🚪 Classroom TT" :
                 "🔬 Lab Room TT"}
              </button>
            ))}
          </div>

          {/* Division view */}
          {activeView === "division" && (
            <div style={GS.panel}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                {yearBranches.map(yb => (
                  <button key={yb.id} onClick={() => { setActiveYbId(yb.id); setActiveDiv(yb.divs[0]); }} style={{
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
              {currentYb && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                  {currentYb.divs.map(div => (
                    <button key={div} onClick={() => setActiveDiv(div)} style={{
                      padding: "5px 14px", borderRadius: 16,
                      border: `1.5px solid ${activeDiv === div ? "#667eea" : "#c8d5ea"}`,
                      background: activeDiv === div ? "#667eea" : "#fff",
                      color:      activeDiv === div ? "#fff"    : "#4a6fa5",
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
                  style={{ padding: "7px 18px", borderRadius: 8, border: "1.5px solid #5b8dee", background: "#f0f5ff", color: "#3451b2", fontWeight: 600, fontSize: 12, cursor: "pointer" }}
                >
                  📄 Download This Sheet
                </button>
              </div>
              <TimetableGrid grid={currentGrid} teachers={teachers} />
            </div>
          )}

          {/* Teacher view */}
          {activeView === "teacher" && (
            <div style={GS.panel}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                {teachers.map(t => (
                  <button key={t.code} onClick={() => setActiveTeacher(t.code)} style={{
                    padding: "6px 14px", borderRadius: 20,
                    border: `1.5px solid ${activeTeacher === t.code ? "transparent" : "#c8d5ea"}`,
                    background: activeTeacher === t.code ? "linear-gradient(90deg,#667eea,#764ba2)" : "#f0f4ff",
                    color:      activeTeacher === t.code ? "#fff" : "#4a6fa5",
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

          {/* Classroom view */}
          {activeView === "classroom" && (
            <div style={GS.panel}>
              {!classrooms.length ? (
                <div style={GS.emptyBox}>No classrooms added. Add classrooms in Step ③.</div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                    {classrooms.map(room => (
                      <button
                        key={room.number}
                        onClick={() => setActiveClassroom(room.number)}
                        style={{
                          padding: "6px 14px", borderRadius: 20,
                          border: `1.5px solid ${activeClassroom === room.number ? "transparent" : "#c8d5ea"}`,
                          background: activeClassroom === room.number ? "linear-gradient(90deg,#3451b2,#5b8dee)" : "#f0f4ff",
                          color:      activeClassroom === room.number ? "#fff" : "#4a6fa5",
                          fontWeight: 600, fontSize: 12, cursor: "pointer",
                        }}
                      >
                        🚪 {room.number}
                      </button>
                    ))}
                  </div>
                  {classroomTTs[activeClassroom] ? (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#1a2b4a" }}>
                          🚪 Classroom: {activeClassroom}
                        </div>
                        <button
                          onClick={() => generateClassroomPDF(activeClassroom, classroomTTs[activeClassroom], dept, semLabel, teachers)}
                          style={{ padding: "7px 18px", borderRadius: 8, border: "1.5px solid #5b8dee", background: "#f0f5ff", color: "#3451b2", fontWeight: 600, fontSize: 12, cursor: "pointer" }}
                        >
                          🖨️ Print PDF
                        </button>
                      </div>
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
                                  const entries = classroomTTs[activeClassroom][day]?.[slot] || [];
                                  if (!entries.length) return <td key={slot} style={TS.emptyCell}>—</td>;
                                  return (
                                    <td key={slot} style={entries[0].electives ? TS.electiveCell : TS.theoryCell}>
                                      {entries.map((entry, i) => (
                                        <div key={i} style={{ marginBottom: i < entries.length - 1 ? 8 : 0, borderBottom: i < entries.length - 1 ? "1px solid #e0e0e0" : "none", paddingBottom: i < entries.length - 1 ? 8 : 0 }}>
                                          {entry.electives ? (
                                            <>
                                              <div style={{ fontWeight: 700, fontSize: 10, color: "#b45309", marginBottom: 3 }}>{entry.subject}</div>
                                              {entry.electives.map((e, ei) => (
                                                <div key={ei} style={{ fontSize: 10, marginBottom: 2 }}>
                                                  <strong>{e.name}</strong>
                                                  {/* FIX #1: toCodeStr for elective codes in classroom view */}
                                                  {toCodeStr(e.teacherCode) && <span style={TS.tcCode}> • {toCodeStr(e.teacherCode)}</span>}
                                                </div>
                                              ))}
                                            </>
                                          ) : (
                                            <>
                                              <div style={TS.subjectLabel}>{entry.subject}</div>
                                              {/* FIX #1: toCodeStr for theory code in classroom view */}
                                              {toCodeStr(entry.teacherCode) && <div style={TS.tcCode}>{toCodeStr(entry.teacherCode)}</div>}
                                            </>
                                          )}
                                          <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>
                                            {entry.ybLabel} / Div {entry.div}
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
                    </>
                  ) : (
                    <div style={GS.emptyBox}>No classes assigned to this classroom yet.</div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Lab room view */}
          {activeView === "lab" && (
            <div style={GS.panel}>
              {!labRooms.length ? (
                <div style={GS.emptyBox}>No lab rooms added. Add lab rooms in Step ③.</div>
              ) : (
                labRooms.map(room => {
                  const lg = labRoomTTs[room.number];
                  return (
                    <div key={room.number} style={{ marginBottom: 28 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#1a2b4a" }}>
                          🔬 Lab Room: {room.number}
                        </div>
                        {lg && (
                          <button
                            onClick={() => generateLabRoomPDF(room.number, lg, dept, semLabel, teachers)}
                            style={{ padding: "7px 18px", borderRadius: 8, border: "1.5px solid #5b8dee", background: "#f0f5ff", color: "#3451b2", fontWeight: 600, fontSize: 12, cursor: "pointer" }}
                          >
                            🖨️ Print PDF
                          </button>
                        )}
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
                                    const entry = lg[day]?.[slot];
                                    if (!entry) return <td key={slot} style={TS.emptyCell}>—</td>;
                                    // FIX #1: toCodeStr for lab room teacher code
                                    const code = toCodeStr(entry.teacherCode);
                                    return (
                                      <td key={slot} style={TS.labCell}>
                                        <div style={TS.batchTag}>{entry.batch}</div>
                                        <div style={{ ...TS.subjectLabel, marginTop: 3 }}>{entry.subjectName}</div>
                                        <div style={TS.tcCode}>{code}</div>
                                        <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>
                                          {entry.ybLabel} / Div {entry.div}
                                        </div>
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
                    }}
                  >
                    {yb.id} – Div {div}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
        <button onClick={() => setActiveTab(5)} style={GS.navBtn("#f0f4ff", "#667eea")}>← Back</button>
      </div>
    </div>
  );
}

// ── Table styles ──────────────────────────────────────────────────────────────
const TS = {
  table:        { width: "100%", borderCollapse: "collapse", fontSize: 12, border: "1px solid #e2e8f0" },
  th:           { padding: "8px 6px", textAlign: "center", fontWeight: 700, fontSize: 11, borderBottom: "2px solid #d0d9f0", whiteSpace: "nowrap" },
  dayCell:      { padding: "8px 10px", fontWeight: 700, color: "#445", background: "#f7f8ff", borderRight: "2px solid #d0d9f0", fontSize: 12, whiteSpace: "nowrap" },
  breakCell:    { padding: "8px", textAlign: "center", background: "#fff3e0", color: "#e65100", fontStyle: "italic", fontSize: 11, border: "1px solid #e8ecf5" },
  remedialCell: { padding: "8px", textAlign: "center", background: "#f5f5f5", color: "#888", fontStyle: "italic", fontSize: 11, fontWeight: 600, border: "1px solid #e8ecf5" },
  emptyCell:    { padding: "8px", textAlign: "center", color: "#ccc", fontSize: 11, border: "1px solid #e8ecf5" },
  theoryCell:   { padding: "6px 8px", border: "1px solid #e8ecf5", verticalAlign: "top", background: "#fafbff" },
  labCell:      { padding: "6px 8px", border: "1px solid #e8ecf5", verticalAlign: "top", background: "#e8f5e9" },
  electiveCell: { padding: "6px 8px", border: "1px solid #e8ecf5", verticalAlign: "top", background: "#fffbf0" },
  subjectLabel: { fontWeight: 700, fontSize: 11, color: "#1a2b4a", marginBottom: 2 },
  tcCode:       { fontSize: 10, color: "#667eea", fontFamily: "monospace" },
  roomTag:      { fontSize: 9, color: "#2c5282", background: "#ebf4ff", padding: "1px 4px", borderRadius: 3, marginLeft: 3 },
  batchRow:     { display: "flex", gap: 4, alignItems: "center", marginBottom: 2, flexWrap: "wrap" },
  batchTag:     { fontSize: 10, fontWeight: 700, color: "#764ba2", background: "#f3e8ff", borderRadius: 4, padding: "1px 5px" },
};

// ── General styles ────────────────────────────────────────────────────────────
const GS = {
  panel:       { background: "#fff", borderRadius: 16, padding: "22px 26px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 20 },
  panelHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  panelTitle:  { fontSize: 16, fontWeight: 700, color: "#1a2b4a" },
  hint:        { color: "#666", fontSize: 13, lineHeight: 1.75, marginBottom: 14 },
  emptyBox:    { padding: "14px 18px", background: "#f8f9fb", borderRadius: 8, color: "#888", fontSize: 13, border: "1px dashed #d5dae3" },
  navBtn: (bg, color) => ({ padding: "10px 24px", borderRadius: 8, border: "none", background: bg, color, fontWeight: 600, fontSize: 14, cursor: "pointer" }),
};