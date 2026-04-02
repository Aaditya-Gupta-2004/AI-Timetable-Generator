import React from "react";
import { S } from "../timetableHelpers";

export default function Step3Rooms({ rooms, roomNum, setRoomNum, roomType, setRoomType, roomError, setRoomError, addRoom, removeRoom, yearBranches, roomAssignMode, setRoomAssignMode, ybRoomConfig, toggleRoomInPool, setActiveTab }) {
  const classroomPool = rooms.filter(r => r.type === "classroom");
  const labPool       = rooms.filter(r => r.type === "lab");

  return (
    <>
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-header"><span className="panel-title">Define Rooms &amp; Labs</span></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 6 }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={S.label}>Room / Lab Number</label>
            <input type="text" value={roomNum} onChange={e => { setRoomNum(e.target.value); setRoomError(""); }} onKeyDown={e => e.key === "Enter" && addRoom()} placeholder="e.g. 604, 308A" style={{ ...S.input, borderColor: roomError ? "#e05c5c" : "#d0d5dd" }} />
          </div>
          <div style={{ flex: "0 0 220px" }}>
            <label style={S.label}>Room Type</label>
            <select value={roomType} onChange={e => setRoomType(e.target.value)} style={S.input}>
              <option value="classroom">Classroom (Theory / Elective)</option>
              <option value="lab">Lab (Core Lab Rotation)</option>
            </select>
          </div>
          <button className="card-btn btn-blue" style={{ ...S.addBtn, alignSelf: "flex-end" }} onClick={addRoom}>+ Add Room</button>
        </div>
        {roomError && <div style={S.ferr}>{roomError}</div>}
        {rooms.length > 0 && (
          <div style={{ display: "flex", gap: 24, marginTop: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ ...S.roomSecHdr, background: "#f0f4ff", borderColor: "#c5d3f5", color: "#3451b2" }}>🏫 Classrooms ({classroomPool.length})</div>
              {classroomPool.map(r => <div key={r.id} style={S.roomRow}><span style={{ fontWeight: 600, fontFamily: "monospace" }}>{r.number}</span><button onClick={() => removeRoom(r.id)} style={S.removeBtn}>✕</button></div>)}
              {!classroomPool.length && <div style={{ fontSize: 12, color: "#bbb" }}>None added</div>}
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ ...S.roomSecHdr, background: "#f0fff4", borderColor: "#9ae6b4", color: "#276749" }}>🔬 Labs ({labPool.length})</div>
              {labPool.map(r => <div key={r.id} style={S.roomRow}><span style={{ fontWeight: 600, fontFamily: "monospace" }}>{r.number}</span><button onClick={() => removeRoom(r.id)} style={S.removeBtn}>✕</button></div>)}
              {!labPool.length && <div style={{ fontSize: 12, color: "#bbb" }}>None added</div>}
            </div>
          </div>
        )}
        {!rooms.length && <div style={{ ...S.emptyBox, marginTop: 14 }}>No rooms added yet.</div>}
      </div>

      {yearBranches.length > 0 && rooms.length > 0 && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-header"><span className="panel-title">Room Assignment per Year-Branch (Optional)</span></div>
          {yearBranches.map(yb => {
            const mode   = roomAssignMode[yb.id] || "auto";
            const config = ybRoomConfig[yb.id]   || { theory: [], elective: [], lab: [] };
            return (
              <div key={yb.id} style={{ marginBottom: 16, border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", background: "#f7f8ff", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid #e2e8f0" }}>
                  <strong>{yb.year}-{yb.branch}</strong>
                  <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1.5px solid #c5d3f5" }}>
                    {["auto", "manual"].map(m => (
                      <button key={m} onClick={() => setRoomAssignMode(p => ({ ...p, [yb.id]: m }))}
                        style={{ padding: "5px 16px", fontSize: 12, border: "none", cursor: "pointer", fontWeight: mode === m ? 700 : 400, background: mode === m ? "#667eea" : "#fff", color: mode === m ? "#fff" : "#667eea" }}>
                        {m === "auto" ? "🤖 Auto" : "✏️ Manual"}
                      </button>
                    ))}
                  </div>
                </div>
                {mode === "manual" && (
                  <div style={{ padding: "14px 16px", display: "flex", gap: 16, flexWrap: "wrap" }}>
                    {[{ key: "theory", label: "📚 Theory", pool: classroomPool }, { key: "elective", label: "🎯 Elective", pool: classroomPool }, { key: "lab", label: "🔬 Lab", pool: labPool }].map(({ key, label, pool }) => (
                      <div key={key} style={{ flex: 1, minWidth: 160 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{label}</div>
                        {pool.map(r => (
                          <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 12, cursor: "pointer" }}>
                            <input type="checkbox" checked={(config[key] || []).includes(r.number)} onChange={() => toggleRoomInPool(yb.id, key, r.number)} />
                            <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{r.number}</span>
                          </label>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
                {mode === "auto" && <div style={{ padding: "10px 16px", fontSize: 12, color: "#888" }}>All {classroomPool.length} classroom(s) → theory & electives · All {labPool.length} lab(s) → core lab rotation</div>}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button className="card-btn btn-ghost" onClick={() => setActiveTab(1)}>← Back</button>
        <button className="card-btn btn-blue" style={{ padding: "10px 28px" }} onClick={() => setActiveTab(3)}>Next: Teachers →</button>
      </div>
    </>
  );
}