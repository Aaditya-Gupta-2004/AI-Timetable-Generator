import React from "react";
import { S, isCoreLab, isElectiveType } from "../timetableHelpers";
import TeacherSelect from "../components/TeacherSelect";

export default function Step4Teachers({ teachers, tCode, setTCode, tName, setTName, tError, setTError, addTeacher, removeTeacher, yearBranches, ybSubjects, ybBatchCount, assignments, setSubjectTeacher, setActiveTab }) {
  const getYbSubs     = id => ybSubjects[id] || [];
  const getNumBatches = ybId => ybBatchCount[ybId] || 3;
  const getLabSubs    = ybId => getYbSubs(ybId).filter(s => isCoreLab(s.type));
  const getOtherSubs  = ybId => getYbSubs(ybId).filter(s => !isCoreLab(s.type));

  return (
    <>
      {/* Teacher directory */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-header"><span className="panel-title">Teacher Directory</span></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
          <div style={{ flex: "0 0 120px" }}>
            <label style={S.label}>Short Code</label>
            <input type="text" value={tCode} onChange={e => { setTCode(e.target.value.toUpperCase()); setTError(""); }} placeholder="/YM" style={S.input} onKeyDown={e => e.key === "Enter" && addTeacher()} />
          </div>
          <div style={{ flex: 2, minWidth: 200 }}>
            <label style={S.label}>Full Name</label>
            <input type="text" value={tName} onChange={e => { setTName(e.target.value); setTError(""); }} placeholder="Dr. Yogita Mistry" style={S.input} onKeyDown={e => e.key === "Enter" && addTeacher()} />
          </div>
          <button className="card-btn btn-teal" style={{ ...S.addBtn, alignSelf: "flex-end" }} onClick={addTeacher}>+ Add Teacher</button>
        </div>
        {tError && <div style={S.ferr}>{tError}</div>}
        {teachers.length > 0 && (
          <table style={{ ...S.table, marginTop: 12 }}>
            <thead><tr>{["#", "Code", "Full Name", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>{teachers.map((t, i) => (
              <tr key={t.id} style={{ background: i % 2 === 0 ? "#fafbff" : "#fff" }}>
                <td style={S.td}>{i + 1}</td>
                <td style={{ ...S.td, fontFamily: "monospace", fontWeight: 700, color: "#667eea" }}>{t.code}</td>
                <td style={S.td}>{t.name}</td>
                <td style={S.td}><button onClick={() => removeTeacher(t.id)} style={S.removeBtn}>✕</button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {!teachers.length && <div style={S.emptyBox}>No teachers added yet.</div>}
      </div>

      {/* Assign teachers to subjects */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-header"><span className="panel-title">Assign Teachers to Subjects</span></div>
        <p style={S.hint}>For <strong>Core Lab subjects</strong>, assign the teacher per lab subject — the rotation handles batch assignment automatically.</p>
        {yearBranches.map(yb => {
          const subs = getYbSubs(yb.id);
          if (!subs.length) return null;
          return (
            <div key={yb.id} style={{ marginBottom: 28 }}>
              <div style={S.ybHeader}>
                <strong>{yb.year}-{yb.branch}</strong>
                <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>Divs: {yb.divs.join(", ")} · {subs.length} subjects · {getNumBatches(yb.id)} batches</span>
              </div>

              {getLabSubs(yb.id).length > 0 && (
                <div style={{ marginBottom: 16, border: "1.5px solid #9ae6b4", borderRadius: 8, overflow: "visible" }}>
                  <div style={{ background: "#e8f5e9", padding: "8px 14px", fontWeight: 700, fontSize: 12, color: "#276749" }}>🔬 Core Lab Group — Teacher per Lab Subject</div>
                  <div style={{ padding: "12px 14px", overflow: "visible" }}>
                    {getLabSubs(yb.id).map(sub => (
                      <div key={sub.id} style={{ marginBottom: 14 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                          <span style={S.batchTag}>{sub.type}</span> {sub.name}
                          <span style={{ fontSize: 11, color: "#888", fontWeight: 400, marginLeft: 8 }}>{sub.labHours}hr/session · {sub.weeklyLabs}×/wk</span>
                        </div>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          {yb.divs.map(div => (
                            <div key={div} style={{ flex: 1, minWidth: 200, position: "relative" }}>
                              <label style={{ ...S.label, marginBottom: 4 }}>Division {div}</label>
                              <TeacherSelect value={assignments?.[yb.id]?.[div]?.[sub.id]?.teacherCode || ""} onChange={v => setSubjectTeacher(yb.id, div, sub.id, v)} teachers={teachers} placeholder="— assign teacher —" />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {getOtherSubs(yb.id).map(sub => (
                <div key={sub.id} style={{ marginBottom: 10, border: "1px solid #e2e8f0", borderRadius: 8, overflow: "visible" }}>
                  <div style={{ padding: "8px 14px", background: isElectiveType(sub.type) ? "#fffbf0" : "#f1f5ff", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #e2e8f0" }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{sub.name}</span>
                    <span className={isElectiveType(sub.type) ? "chip-blue" : "chip-pink"} style={{ fontSize: 10 }}>{sub.type}</span>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", overflow: "visible" }}>
                    <thead><tr>{yb.divs.map(div => <th key={div} style={{ ...S.th, minWidth: 180 }}>Division {div}</th>)}</tr></thead>
                    <tbody><tr>{yb.divs.map(div => (
                      <td key={div} style={{ ...S.td, padding: 10, verticalAlign: "top", overflow: "visible", position: "relative" }}>
                        <TeacherSelect value={assignments?.[yb.id]?.[div]?.[sub.id]?.teacherCode || ""} onChange={v => setSubjectTeacher(yb.id, div, sub.id, v)} teachers={teachers} />
                      </td>
                    ))}</tr></tbody>
                  </table>
                </div>
              ))}
            </div>
          );
        })}
        {!yearBranches.length && <div style={S.emptyBox}>Add Year-Branch-Divisions in Step ① first.</div>}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button className="card-btn btn-ghost" onClick={() => setActiveTab(2)}>← Back</button>
        <button className="card-btn btn-blue" style={{ padding: "10px 28px" }} onClick={() => setActiveTab(4)}>Next: Load →</button>
      </div>
    </>
  );
}