import React, { useState } from "react";

const API_BASE = "https://ai-timetable-generator-j7qx.onrender.com";
const DAYS      = ["Monday","Tuesday","Wednesday","Thursday","Friday"];
const DAY_SHORT = { Monday:"Mon", Tuesday:"Tue", Wednesday:"Wed", Thursday:"Thu", Friday:"Fri" };
const SLOTS     = ["9-10","10-11","11-12","12-1","1-2","2-3","3-4","4-5"];
const BREAK_SLOT= "1-2";
const SLOT_LBL  = {
  "9-10":"9:00–10:00","10-11":"10:00–11:00","11-12":"11:00–12:00","12-1":"12:00–1:00",
  "1-2":"BREAK","2-3":"2:00–3:00","3-4":"3:00–4:00","4-5":"4:00–5:00",
};

function authHeaders() {
  const token = localStorage.getItem("token");
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}
async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST", headers: authHeaders(), body: JSON.stringify(body),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || `${res.status}`); }
  return res.json();
}
async function apiDelete(path) {
  const res = await fetch(`${API_BASE}${path}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// PersonalTimetableTab
//
// Props:
//   teachers            — array of { id, code, name }
//   yearBranches        — array of { id, year, branch, divs }
//   personalTimetables  — { [teacherCode]: { [day]: { [slot]: { subject, room, ybKey, div } } } }
//   setPersonalTimetables — setter for the above
//   activeTab           — current tab index (number)
//   setActiveTab        — tab setter
// ─────────────────────────────────────────────────────────────────────────────
export default function PersonalTimetableTab({
  teachers,
  yearBranches,
  personalTimetables,
  setPersonalTimetables,
  activeTab,
  setActiveTab,
}) {
  const [selectedTeacher, setSelectedTeacher] = useState(teachers[0]?.code || "");
  const [editCell,   setEditCell]   = useState(null);   // { day, slot }
  const [cellSubject,setCellSubject]= useState("");
  const [cellRoom,   setCellRoom]   = useState("");
  const [cellYbKey,  setCellYbKey]  = useState(yearBranches[0]?.id || "");
  const [cellDiv,    setCellDiv]    = useState(yearBranches[0]?.divs[0] || "");
  const [saving,     setSaving]     = useState(false);
  const [saveOk,     setSaveOk]     = useState(false);
  const [error,      setError]      = useState("");

  const currentPT = personalTimetables[selectedTeacher] || {};

  // Count pinned slots for the selected teacher
  const pinnedCount = Object.values(currentPT).reduce(
    (acc, daySlots) => acc + Object.keys(daySlots).length, 0
  );

  const getCellData = (day, slot) => currentPT[day]?.[slot] || null;

  // Open edit popover for a slot
  const openEdit = (day, slot) => {
    const existing = getCellData(day, slot);
    setEditCell({ day, slot });
    setCellSubject(existing?.subject || "");
    setCellRoom(existing?.room || "");
    const defYb = existing?.ybKey || yearBranches[0]?.id || "";
    setCellYbKey(defYb);
    const yb = yearBranches.find(y => y.id === defYb);
    setCellDiv(existing?.div || yb?.divs[0] || "");
  };

  // Commit edit (or remove if subject is blank)
  const commitEdit = () => {
    if (!editCell) return;
    const { day, slot } = editCell;
    setPersonalTimetables(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      if (!next[selectedTeacher]) next[selectedTeacher] = {};
      if (!next[selectedTeacher][day]) next[selectedTeacher][day] = {};
      if (!cellSubject.trim()) {
        delete next[selectedTeacher][day][slot];
        if (!Object.keys(next[selectedTeacher][day]).length) delete next[selectedTeacher][day];
        if (!Object.keys(next[selectedTeacher]).length) delete next[selectedTeacher];
      } else {
        next[selectedTeacher][day][slot] = {
          subject: cellSubject.trim(),
          room:    cellRoom.trim(),
          ybKey:   cellYbKey,
          div:     cellDiv,
        };
      }
      return next;
    });
    setEditCell(null);
  };

  // Save to backend
  const saveToAPI = async () => {
    setSaving(true); setError(""); setSaveOk(false);
    try {
      await apiPost("/personal-timetable", {
        teacher_code: selectedTeacher,
        slots: personalTimetables[selectedTeacher] || {},
      });
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2500);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Clear all pins for this teacher (locally + API)
  const clearPins = async () => {
    setPersonalTimetables(prev => {
      const next = { ...prev };
      delete next[selectedTeacher];
      return next;
    });
    try { await apiDelete(`/personal-timetable/${selectedTeacher}`); } catch {}
  };

  return (
    <div>
      <div style={S.panel}>
        <div style={S.panelHeader}>
          <span style={S.panelTitle}>📌 Personal Timetable Lock</span>
        </div>

        <p style={S.hint}>
          Pin the slots a teacher <strong>must</strong> teach in — the AI will place those subjects
          exactly there and fill the rest of the timetable around them. That teacher is also
          marked <strong>busy</strong> in pinned slots so no other division's sessions conflict.
        </p>

        {/* ── Teacher selector ── */}
        {!teachers.length
          ? <div style={S.emptyBox}>Add teachers in Step ④ first.</div>
          : (
          <>
            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>Select teacher to pin slots for</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {teachers.map(t => {
                  const hasPins = Object.values(personalTimetables[t.code] || {})
                    .some(d => Object.keys(d).length > 0);
                  const isActive = selectedTeacher === t.code;
                  return (
                    <button key={t.code}
                      onClick={() => { setSelectedTeacher(t.code); setEditCell(null); }}
                      style={{
                        padding: "7px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                        fontWeight: isActive ? 700 : 500, border: "1.5px solid",
                        borderColor: isActive ? "transparent" : "#c8d5ea",
                        background: isActive
                          ? "linear-gradient(90deg,#667eea,#764ba2)"
                          : "#f0f4ff",
                        color: isActive ? "#fff" : "#4a6fa5",
                        display: "flex", alignItems: "center", gap: 6,
                      }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{t.code}</span>
                      <span style={{ opacity: 0.8 }}>{t.name}</span>
                      {hasPins && (
                        <span style={{
                          background: isActive ? "rgba(255,255,255,.3)" : "#FF3B7A",
                          color: "#fff", borderRadius: 8, padding: "1px 6px", fontSize: 10,
                        }}>📌</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Stats row ── */}
            {selectedTeacher && (
              <>
                <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                  <div style={{
                    padding: "8px 14px", borderRadius: 8, fontSize: 13,
                    background: pinnedCount > 0 ? "#fff0f4" : "#f8f9fb",
                    border: `1px solid ${pinnedCount > 0 ? "#ffb3c6" : "#e2e8f0"}`,
                  }}>
                    <span style={{ fontWeight: 700, color: pinnedCount > 0 ? "#FF3B7A" : "#aaa", fontSize: 18 }}>
                      {pinnedCount}
                    </span>
                    <span style={{ color: "#666", marginLeft: 6 }}>slots pinned</span>
                  </div>
                  <div style={{
                    padding: "8px 14px", borderRadius: 8, fontSize: 12,
                    background: "#f0faf8", border: "1px solid #9ae6b4", color: "#276749",
                  }}>
                    Click any cell to pin or edit it. Click again on a pinned cell to edit or remove it.
                  </div>
                </div>

                {/* ── Grid ── */}
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 700 }}>
                    <thead>
                      <tr>
                        <th style={{ ...S.th, background: "#1a2b4a", color: "#fff", width: 60, borderRadius: "6px 0 0 0" }}>
                          Day
                        </th>
                        {SLOTS.map(slot => (
                          <th key={slot} style={{
                            ...S.th,
                            background: slot === BREAK_SLOT ? "#fff3e0" : "#f1f5ff",
                            color:      slot === BREAK_SLOT ? "#e65100" : "#334",
                            fontSize: 10, minWidth: 110,
                          }}>
                            {SLOT_LBL[slot]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {DAYS.map((day, di) => (
                        <tr key={day} style={{ background: di % 2 === 0 ? "#fafbff" : "#fff" }}>
                          <td style={{
                            padding: "8px 10px", fontWeight: 700, color: "#445",
                            background: "#f7f8ff", borderRight: "2px solid #d0d9f0",
                            fontSize: 12, whiteSpace: "nowrap",
                          }}>
                            {DAY_SHORT[day]}
                          </td>
                          {SLOTS.map(slot => {
                            if (slot === BREAK_SLOT) {
                              return (
                                <td key={slot} style={{
                                  padding: "8px", textAlign: "center",
                                  background: "#fff3e0", color: "#e65100",
                                  fontStyle: "italic", fontSize: 11,
                                  border: "1px solid #e8ecf5",
                                }}>
                                  BREAK
                                </td>
                              );
                            }

                            const cellData  = getCellData(day, slot);
                            const isEditing = editCell?.day === day && editCell?.slot === slot;
                            const isPinned  = !!cellData;

                            return (
                              <td key={slot}
                                onClick={() => !isEditing && openEdit(day, slot)}
                                style={{
                                  border: isPinned ? "1.5px solid #f5a623" : "1px solid #e8ecf5",
                                  background: isPinned ? "#fff8e6"
                                    : isEditing ? "#f0f8ff" : "transparent",
                                  cursor: "pointer", verticalAlign: "top",
                                  padding: "6px 7px", minHeight: 60, minWidth: 110,
                                  transition: "background 0.15s",
                                  position: "relative",
                                }}
                              >
                                {isEditing
                                  ? /* ── Inline edit form ── */
                                    <div onClick={e => e.stopPropagation()}
                                      style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                      <input
                                        autoFocus type="text"
                                        value={cellSubject}
                                        onChange={e => setCellSubject(e.target.value)}
                                        onKeyDown={e => e.key === "Enter" && commitEdit()}
                                        placeholder="Subject"
                                        style={{ ...S.miniInput }}
                                      />
                                      <input
                                        type="text" value={cellRoom}
                                        onChange={e => setCellRoom(e.target.value)}
                                        placeholder="Room (opt.)"
                                        style={{ ...S.miniInput }}
                                      />
                                      <select
                                        value={cellYbKey}
                                        onChange={e => {
                                          setCellYbKey(e.target.value);
                                          const yb = yearBranches.find(y => y.id === e.target.value);
                                          if (yb) setCellDiv(yb.divs[0]);
                                        }}
                                        style={{ ...S.miniInput }}
                                      >
                                        {yearBranches.map(yb => (
                                          <option key={yb.id} value={yb.id}>{yb.id}</option>
                                        ))}
                                      </select>
                                      <select
                                        value={cellDiv}
                                        onChange={e => setCellDiv(e.target.value)}
                                        style={{ ...S.miniInput }}
                                      >
                                        {(yearBranches.find(y => y.id === cellYbKey)?.divs || []).map(d => (
                                          <option key={d} value={d}>Div {d}</option>
                                        ))}
                                      </select>
                                      <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                                        <button
                                          onClick={commitEdit}
                                          style={S.miniBtn("#00C9A7")}>✓</button>
                                        <button
                                          onClick={() => setEditCell(null)}
                                          style={S.miniBtn("#e05c5c")}>✕</button>
                                      </div>
                                    </div>

                                  : isPinned
                                  ? /* ── Pinned display ── */
                                    <div>
                                      <div style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 2 }}>
                                        <span style={{ fontSize: 11 }}>📌</span>
                                        <span style={{ fontWeight: 700, fontSize: 11, color: "#92400e" }}>
                                          {cellData.subject}
                                        </span>
                                      </div>
                                      {cellData.room && (
                                        <div style={{ fontSize: 10, color: "#888" }}>🏫 {cellData.room}</div>
                                      )}
                                      <div style={{ fontSize: 9, color: "#aaa", marginTop: 2 }}>
                                        {cellData.ybKey} / Div {cellData.div}
                                      </div>
                                    </div>

                                  : /* ── Empty ── */
                                    <div style={{
                                      fontSize: 11, color: "#ccc", textAlign: "center",
                                      paddingTop: 10,
                                    }}>
                                      + pin
                                    </div>
                                }
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* ── Actions ── */}
                {error && (
                  <div style={{ marginTop: 10, color: "#e05c5c", fontSize: 12 }}>⚠️ {error}</div>
                )}
                <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                  <button
                    onClick={saveToAPI}
                    disabled={saving}
                    style={{
                      padding: "9px 22px", borderRadius: 8, border: "none", cursor: "pointer",
                      background: saveOk ? "#00C9A7" : "#5b8dee", color: "#fff",
                      fontWeight: 600, fontSize: 13,
                    }}>
                    {saving ? "Saving…" : saveOk ? "✅ Saved!" : "💾 Save Pinned Slots"}
                  </button>
                  {pinnedCount > 0 && (
                    <button
                      onClick={clearPins}
                      style={{
                        padding: "9px 18px", borderRadius: 8, border: "1.5px solid #e05c5c",
                        background: "#fff0f4", color: "#e05c5c", fontWeight: 600,
                        fontSize: 13, cursor: "pointer",
                      }}>
                      🗑 Clear All Pins
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* ── Tab navigation ── */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
        <button
          onClick={() => setActiveTab(activeTab - 1)}
          style={S.navBtn("#f0f4ff", "#667eea")}>
          ← Back
        </button>
        <button
          onClick={() => setActiveTab(activeTab + 1)}
          style={S.navBtn("#5b8dee", "#fff")}>
          Next: Details →
        </button>
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const S = {
  panel: {
    background: "#fff", borderRadius: 16, padding: "22px 26px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 20,
  },
  panelHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  panelTitle:  { fontSize: 16, fontWeight: 700, color: "#1a2b4a" },
  hint: { color: "#666", fontSize: 13, lineHeight: 1.75, marginBottom: 14 },
  label: { fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 4, display: "block" },
  emptyBox: {
    marginTop: 12, padding: "14px 18px", background: "#f8f9fb",
    borderRadius: 8, color: "#888", fontSize: 13, border: "1px dashed #d5dae3",
  },
  th: {
    padding: "8px 6px", textAlign: "center", fontWeight: 700, fontSize: 11,
    borderBottom: "2px solid #d0d9f0", whiteSpace: "nowrap",
  },
  miniInput: {
    width: "100%", padding: "4px 7px", borderRadius: 5, fontSize: 11,
    border: "1.5px solid #d0d5dd", outline: "none", background: "#fafafa",
    color: "#333", boxSizing: "border-box",
  },
  miniBtn: (bg) => ({
    padding: "3px 10px", borderRadius: 5, border: "none",
    background: bg, color: "#fff", cursor: "pointer",
    fontSize: 12, fontWeight: 600,
  }),
  navBtn: (bg, color) => ({
    padding: "10px 24px", borderRadius: 8, border: "none",
    background: bg, color, fontWeight: 600, fontSize: 14, cursor: "pointer",
  }),
};
