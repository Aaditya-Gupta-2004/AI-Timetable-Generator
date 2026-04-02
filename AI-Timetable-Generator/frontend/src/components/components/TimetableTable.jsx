import React, { useState, useEffect } from "react";
import { DAYS, DAY_SHORT, SLOTS, SLOT_LBL, BREAK_SLOT, S, generateLabRoomPDF } from "../timetableHelpers";

// ── Division Timetable Grid ───────────────────────────────────────────────────
export function TimetableTable({ grid, caption }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ ...S.table, tableLayout: "fixed" }}>
        <thead>
          <tr><th colSpan={SLOTS.length + 1} style={S.caption}>{caption}</th></tr>
          <tr>
            <th style={{ ...S.th, width: 60 }}>Day / Time</th>
            {SLOTS.map(s => <th key={s} style={{ ...S.th, ...(s === BREAK_SLOT ? S.breakTh : {}), width: 130 }}>{SLOT_LBL[s]}</th>)}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day, di) => (
            <tr key={day} style={{ background: di % 2 === 0 ? "#fafbff" : "#fff" }}>
              <td style={S.dayCell}>{DAY_SHORT[day]}</td>
              {SLOTS.map(slot => {
                const cell      = grid[day]?.[slot];
                const val       = cell?.subject || "";
                const isLab     = cell?.isLabRotation || cell?.batches?.length > 0;
                const isElective= !isLab && cell?.electives?.length > 0;
                const isBreak   = slot === BREAK_SLOT;
                return (
                  <td key={slot} style={{ ...S.td, ...(isBreak ? S.breakCell : {}), ...(isLab && !isBreak ? S.labCell : {}), ...(isElective ? S.electiveCell : {}), overflow: "visible" }}>
                    {isBreak ? "BREAK" : (
                      <>
                        {!isLab && !isElective && (
                          <>
                            <div style={{ fontWeight: 600, fontSize: 12 }}>{val || "—"}</div>
                            {cell?.teacherCode && <div style={{ fontSize: 10, color: "#666", marginTop: 2, fontFamily: "monospace" }}>{cell.teacherCode}</div>}
                            {cell?.room && <span style={S.roomBadge}>{cell.room}</span>}
                          </>
                        )}
                        {isElective && (
                          <>
                            <div style={{ fontWeight: 700, fontSize: 11, color: "#b45309", borderBottom: "1px solid #fcd34d", paddingBottom: 2, marginBottom: 4 }}>{val}</div>
                            {cell.electives.map((e, ei) => (
                              <div key={ei} style={{ marginBottom: 3, padding: "2px 5px", background: "#fffbf0", borderRadius: 4, border: "1px solid #fcd34d", fontSize: 10 }}>
                                <div style={{ fontWeight: 700, color: "#92400e" }}>{e.name}</div>
                                {e.teacherCode && <div style={{ fontSize: 9, color: "#666", fontFamily: "monospace" }}>{e.teacherCode}</div>}
                                {e.room && <span style={S.roomBadge}>{e.room}</span>}
                              </div>
                            ))}
                          </>
                        )}
                        {isLab && cell?.batches?.length > 0 && (
                          <div>
                            {cell.batches.map((b, bi) => (
                              <div key={bi} style={{ background: "#f0fff4", padding: "2px 4px", borderRadius: 4, marginBottom: 3, border: "1px solid #c6f6d5" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <span style={S.batchTag}>{b.batch}</span>
                                  <span style={{ fontWeight: 700, fontSize: 10, color: "#276749" }}>{b.subjectName}</span>
                                </div>
                                <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                                  {b.teacherCode && <span style={{ fontSize: 9, color: "#555", fontFamily: "monospace" }}>{b.teacherCode}</span>}
                                  {b.room && <span style={S.roomBadge}>{b.room}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
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

// ── Teacher Timetable Grid ────────────────────────────────────────────────────
export function TeacherTTTable({ teacherGrid, caption }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={S.table}>
        <thead>
          <tr><th colSpan={SLOTS.length + 1} style={{ ...S.caption, background: "linear-gradient(90deg,#2d6a4f,#40916c)" }}>{caption}</th></tr>
          <tr><th style={S.th}>Day / Time</th>{SLOTS.map(s => <th key={s} style={{ ...S.th, ...(s === BREAK_SLOT ? S.breakTh : {}) }}>{SLOT_LBL[s]}</th>)}</tr>
        </thead>
        <tbody>
          {DAYS.map((day, di) => (
            <tr key={day} style={{ background: di % 2 === 0 ? "#fafbff" : "#fff" }}>
              <td style={S.dayCell}>{DAY_SHORT[day]}</td>
              {SLOTS.map(slot => {
                if (slot === BREAK_SLOT) return <td key={slot} style={{ ...S.td, ...S.breakCell }}>BREAK</td>;
                const items = teacherGrid?.[day]?.[slot] || [];
                return (
                  <td key={slot} style={S.td}>
                    {items.map((it, i) => (
                      <div key={i} style={{ marginBottom: i < items.length - 1 ? 5 : 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 11 }}>{it.subject}</div>
                        <div style={{ fontSize: 10, color: "#888", fontFamily: "monospace" }}>{it.ybLabel}·Div{it.div}{it.batch ? `·${it.batch}` : ""}</div>
                        {it.room && <span style={S.roomBadge}>{it.room}</span>}
                      </div>
                    ))}
                    {!items.length && <span style={{ color: "#ccc" }}>—</span>}
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

// ── Lab Room Timetable Grid ───────────────────────────────────────────────────
export function LabRoomTTTable({ roomNumber, roomGrid, teachers, caption }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={S.table}>
        <thead>
          <tr><th colSpan={SLOTS.length + 1} style={{ ...S.caption, background: "linear-gradient(90deg,#276749,#38a169)" }}>{caption}</th></tr>
          <tr><th style={S.th}>Day / Time</th>{SLOTS.map(s => <th key={s} style={{ ...S.th, ...(s === BREAK_SLOT ? S.breakTh : {}) }}>{SLOT_LBL[s]}</th>)}</tr>
        </thead>
        <tbody>
          {DAYS.map((day, di) => (
            <tr key={day} style={{ background: di % 2 === 0 ? "#f0fff4" : "#fff" }}>
              <td style={{ ...S.dayCell, color: "#276749" }}>{DAY_SHORT[day]}</td>
              {SLOTS.map(slot => {
                if (slot === BREAK_SLOT) return <td key={slot} style={{ ...S.td, ...S.breakCell }}>BREAK</td>;
                const entry = roomGrid[day]?.[slot];
                if (!entry) return <td key={slot} style={{ ...S.td, color: "#ccc" }}>—</td>;
                const tO = teachers.find(t => t.code === entry.teacherCode);
                return (
                  <td key={slot} style={{ ...S.td, background: "#f0fff4", verticalAlign: "top" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
                      <span style={S.batchTag}>{entry.batch}</span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 11, color: "#276749" }}>{entry.subjectName}</div>
                    {tO ? <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>{tO.name}</div>
                        : entry.teacherCode ? <div style={{ fontSize: 10, color: "#888", fontFamily: "monospace", marginTop: 2 }}>{entry.teacherCode}</div> : null}
                    <div style={{ fontSize: 9, color: "#aaa", marginTop: 3 }}>{entry.ybLabel} / Div {entry.div}</div>
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

// ── Lab Schedule (Division) View ──────────────────────────────────────────────
export function LabViewTable({ allTimetables, yearBranches }) {
  const [activeYbId, setActiveYbId] = useState(yearBranches[0]?.id || null);
  const currentYB = yearBranches.find(yb => yb.id === activeYbId);
  const [activeDiv, setActiveDiv]   = useState(currentYB?.divs[0] || null);

  useEffect(() => { if (yearBranches.length > 0 && !activeYbId) setActiveYbId(yearBranches[0].id); }, [yearBranches]);
  useEffect(() => { if (currentYB && !activeDiv) setActiveDiv(currentYB.divs[0]); }, [currentYB]);

  const grid = allTimetables[activeYbId]?.[activeDiv];
  if (!grid) return <div style={S.emptyBox}>No timetable generated yet.</div>;

  const labsByDay = {};
  DAYS.forEach(day => {
    const slots = []; const seen = new Set();
    SLOTS.forEach(slot => {
      const cell = grid[day]?.[slot];
      if (!cell || cell.subject === "BREAK" || !cell.isLabRotation) return;
      if (!seen.has(slot)) { seen.add(slot); slots.push({ slot, cell }); }
    });
    if (slots.length) labsByDay[day] = slots;
  });

  const totalLabDays     = Object.keys(labsByDay).length;
  const totalLabSessions = Object.values(labsByDay).reduce((acc, s) => acc + s.length, 0);

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {yearBranches.map(yb => (
          <button key={yb.id} onClick={() => { setActiveYbId(yb.id); setActiveDiv(yb.divs[0]); }}
            style={{ ...S.tabBtn, ...(activeYbId === yb.id ? S.tabYBActive : {}) }}>{yb.year}-{yb.branch}</button>
        ))}
      </div>
      {currentYB && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
          {currentYB.divs.map(div => (
            <button key={div} onClick={() => setActiveDiv(div)} style={{ ...S.tabBtn, ...(activeDiv === div ? S.tabActive : {}) }}>Division {div}</button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ padding: "10px 18px", background: "#e8f5e9", borderRadius: 10, border: "1px solid #9ae6b4", fontSize: 13 }}>
          <span style={{ fontWeight: 700, color: "#276749", fontSize: 18, marginRight: 6 }}>{totalLabSessions}</span><span style={{ color: "#555" }}>Lab Sessions / Week</span>
        </div>
        <div style={{ padding: "10px 18px", background: "#f0f5ff", borderRadius: 10, border: "1px solid #c5d3f5", fontSize: 13 }}>
          <span style={{ fontWeight: 700, color: "#3451b2", fontSize: 18, marginRight: 6 }}>{totalLabDays}</span><span style={{ color: "#555" }}>Days with Labs</span>
        </div>
        {DAYS.filter(d => labsByDay[d]?.length > 1).length > 0 && (
          <div style={{ padding: "10px 18px", background: "#fff3cd", borderRadius: 10, border: "1px solid #ffc107", fontSize: 13 }}>
            <span style={{ fontWeight: 700, color: "#856404", marginRight: 6 }}>⚠</span>
            <span style={{ color: "#856404" }}>{DAYS.filter(d => labsByDay[d]?.length > 1).map(d => DAY_SHORT[d]).join(", ")} have 2 lab sessions</span>
          </div>
        )}
      </div>
      {totalLabSessions === 0
        ? <div style={S.emptyBox}>No lab sessions found. Make sure Core Lab subjects are added.</div>
        : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
            {DAYS.map(day => {
              const dayLabs = labsByDay[day] || [];
              return (
                <div key={day} style={{ border: dayLabs.length > 0 ? "1.5px solid #9ae6b4" : "1px dashed #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ padding: "8px 14px", background: dayLabs.length > 0 ? "#e8f5e9" : "#f8f9fb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: dayLabs.length > 0 ? "#276749" : "#aaa" }}>{day}</span>
                    {dayLabs.length > 0
                      ? <span style={{ fontSize: 11, background: "#276749", color: "#fff", borderRadius: 20, padding: "2px 8px" }}>{dayLabs.length} session{dayLabs.length > 1 ? "s" : ""}</span>
                      : <span style={{ fontSize: 11, color: "#ccc" }}>No labs</span>}
                  </div>
                  {dayLabs.length === 0 && <div style={{ padding: "14px", fontSize: 12, color: "#ccc", textAlign: "center" }}>Free day</div>}
                  {dayLabs.map(({ slot, cell }, si) => (
                    <div key={si} style={{ borderTop: "1px solid #9ae6b4", padding: "10px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ fontFamily: "monospace", fontSize: 11, background: "#f0fff4", border: "1px solid #9ae6b4", borderRadius: 4, padding: "2px 7px", color: "#276749", fontWeight: 700 }}>{SLOT_LBL[slot]?.replace(" (BREAK)", "") || slot}</span>
                        <span style={{ fontSize: 11, color: "#888" }}>{cell.subject}</span>
                        {dayLabs.length > 1 && <span style={{ fontSize: 10, background: "#fff3cd", color: "#856404", borderRadius: 20, padding: "1px 6px" }}>⚠ double</span>}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {cell.batches?.map((b, bi) => (
                          <div key={bi} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "5px 8px", background: "#fafffe", borderRadius: 6, border: "1px solid #c6f6d5" }}>
                            <span style={S.batchTag}>{b.batch}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: 11, color: "#276749" }}>{b.subjectName}</div>
                              <div style={{ display: "flex", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
                                {b.teacherCode && <span style={{ fontSize: 10, fontFamily: "monospace", color: "#555" }}>{b.teacherCode}</span>}
                                {b.room && <span style={S.roomBadge}>{b.room}</span>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}

// ── Lab Room Selector + View ──────────────────────────────────────────────────
export function LabRoomView({ labRoomTTs, teachers, dept, semLabel }) {
  const roomNumbers        = Object.keys(labRoomTTs).sort();
  const [activeRoom, setActiveRoom] = useState(roomNumbers[0] || null);
  useEffect(() => { if (roomNumbers.length && !activeRoom) setActiveRoom(roomNumbers[0]); }, [roomNumbers]);

  if (!roomNumbers.length) return <div style={S.emptyBox}>No lab room timetables found. Generate timetable first with Core Lab subjects and lab rooms assigned.</div>;

  const roomGrid    = labRoomTTs[activeRoom];
  let totalSessions = 0; const daysUsed = new Set();
  if (roomGrid) DAYS.forEach(day => SLOTS.forEach(slot => { if (slot !== BREAK_SLOT && roomGrid[day]?.[slot]) { totalSessions++; daysUsed.add(day); } }));

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {roomNumbers.map(rn => (
          <button key={rn} onClick={() => setActiveRoom(rn)}
            style={{ ...S.tabBtn, ...(activeRoom === rn ? S.tabLabRoomActive : {}), display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 16 }}>🔬</span>
            <span style={{ fontWeight: 700, fontFamily: "monospace" }}>{rn}</span>
          </button>
        ))}
      </div>
      {activeRoom && roomGrid && (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
            {[
              { val: totalSessions, label: "Slots Used / Week",  bg: "#e8f5e9", border: "#9ae6b4", color: "#276749" },
              { val: daysUsed.size, label: "Days Active",        bg: "#f0f5ff", border: "#c5d3f5", color: "#3451b2" },
              { val: SLOTS.length - 1 - totalSessions, label: "Free Slots", bg: "#fff3f0", border: "#fbb", color: "#c53030" },
            ].map((s, i) => (
              <div key={i} style={{ padding: "10px 18px", background: s.bg, borderRadius: 10, border: `1px solid ${s.border}`, fontSize: 13 }}>
                <span style={{ fontWeight: 700, color: s.color, fontSize: 18, marginRight: 6 }}>{s.val}</span>
                <span style={{ color: "#555" }}>{s.label}</span>
              </div>
            ))}
          </div>
          <LabRoomTTTable roomNumber={activeRoom} roomGrid={roomGrid} teachers={teachers} caption={`🔬 Lab Room ${activeRoom}  ·  ${dept}  ·  ${semLabel}`} />
          <div style={{ marginTop: 14 }}>
            <button className="card-btn btn-teal" style={{ fontSize: 13, padding: "8px 20px" }}
              onClick={() => generateLabRoomPDF(activeRoom, roomGrid, dept, semLabel, teachers)}>
              📄 PDF: Lab Room {activeRoom}
            </button>
          </div>
        </>
      )}
    </div>
  );
}