import React, { useState } from "react";
import { S, isCoreLab, isElectiveType, getBatches } from "../timetableHelpers";
import TeacherSelect from "../components/TeacherSelect";

export default function Step4Teachers({
  teachers,
  tCode, setTCode,
  tName, setTName,
  tError, setTError,
  addTeacher,
  updateTeacher,
  removeTeacher,
  yearBranches,
  ybSubjects,
  ybBatchCount,
  assignments,
  setSubjectTeacher,
  setLabBatchTeacher,
  setActiveTab,
}) {
  const [editId, setEditId] = useState(null);
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [editErr, setEditErr] = useState("");

  const getYbSubs = id => ybSubjects[id] || [];
  const getNumBatches = id => ybBatchCount[id] || 3;
  const getDivBatches = (div, ybId) => getBatches(div, getNumBatches(ybId));
  const getLabSubs = id => getYbSubs(id).filter(s => isCoreLab(s.type));
  const getOtherSubs = id => getYbSubs(id).filter(s => !isCoreLab(s.type));

  const startEdit = (teacher) => {
    setEditId(teacher.id);
    setEditCode(teacher.code);
    setEditName(teacher.name);
    setEditErr("");
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditCode("");
    setEditName("");
    setEditErr("");
  };

  const handleSave = (teacher) => {
    const code = editCode.trim().toUpperCase();
    const name = editName.trim();
    if (!code || !name) {
      setEditErr("Code and name are required.");
      return;
    }
    if (code !== teacher.code && teachers.some(t => t.code === code)) {
      setEditErr("That code is already in use.");
      return;
    }
    updateTeacher(teacher.id, { code, name });
    cancelEdit();
  };

  return (
    <>
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-header">
          <span className="panel-title">Teacher Directory</span>
        </div>

        {teachers.length > 0 && (
          <table style={{ ...S.table, marginBottom: 14 }}>
            <thead>
              <tr>
                <th style={S.th}>#</th>
                <th style={S.th}>Code</th>
                <th style={S.th}>Full Name</th>
                <th style={{ ...S.th, width: 160 }}></th>
              </tr>
            </thead>
            <tbody>
              {teachers.map((teacher, index) => {
                if (editId === teacher.id) {
                  return (
                    <tr key={teacher.id} style={{ background: "#f0f4ff" }}>
                      <td style={S.td}>{index + 1}</td>
                      <td style={S.td}>
                        <input
                          autoFocus
                          value={editCode}
                          onChange={e => { setEditCode(e.target.value.toUpperCase()); setEditErr(""); }}
                          onKeyDown={e => { if (e.key === "Enter") handleSave(teacher); if (e.key === "Escape") cancelEdit(); }}
                          style={{ ...S.input, marginBottom: 0, width: 90, fontFamily: "monospace", fontWeight: 700 }}
                        />
                      </td>
                      <td style={S.td}>
                        <input
                          value={editName}
                          onChange={e => { setEditName(e.target.value); setEditErr(""); }}
                          onKeyDown={e => { if (e.key === "Enter") handleSave(teacher); if (e.key === "Escape") cancelEdit(); }}
                          style={{ ...S.input, marginBottom: 0 }}
                        />
                        {editErr && <div style={{ ...S.ferr, marginTop: 4 }}>{editErr}</div>}
                      </td>
                      <td style={S.td}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="card-btn btn-blue" style={{ padding: "4px 12px", fontSize: 12 }} onClick={() => handleSave(teacher)}>
                            Save
                          </button>
                          <button className="card-btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={cancelEdit}>
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={teacher.id} style={{ background: index % 2 === 0 ? "#fafbff" : "#fff" }}>
                    <td style={S.td}>{index + 1}</td>
                    <td style={{ ...S.td, fontFamily: "monospace", fontWeight: 700, color: "#667eea" }}>{teacher.code}</td>
                    <td style={S.td}>{teacher.name}</td>
                    <td style={S.td}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="card-btn btn-ghost" style={{ padding: "3px 11px", fontSize: 12 }} onClick={() => startEdit(teacher)}>
                          Edit
                        </button>
                        <button
                          style={{
                            padding: "3px 9px",
                            fontSize: 12,
                            cursor: "pointer",
                            border: "1px solid #ffb3c6",
                            borderRadius: 6,
                            background: "#fff0f4",
                            color: "#c0003a",
                          }}
                          onClick={() => removeTeacher(teacher.id)}
                        >
                          x
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {!teachers.length && <div style={{ ...S.emptyBox, marginBottom: 14 }}>No teachers added yet.</div>}

        <div style={{ padding: "14px 16px", background: "#f7f8ff", borderRadius: 8, border: "1px dashed #c5d3f5" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#445", marginBottom: 10 }}>+ Add teacher</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "0 0 120px" }}>
              <label style={S.label}>Short Code</label>
              <input
                type="text"
                value={tCode}
                onChange={e => { setTCode(e.target.value.toUpperCase()); setTError(""); }}
                placeholder="YM"
                style={S.input}
                onKeyDown={e => e.key === "Enter" && addTeacher()}
              />
            </div>
            <div style={{ flex: 2, minWidth: 200 }}>
              <label style={S.label}>Full Name</label>
              <input
                type="text"
                value={tName}
                onChange={e => { setTName(e.target.value); setTError(""); }}
                placeholder="Dr. Yogita Mistry"
                style={S.input}
                onKeyDown={e => e.key === "Enter" && addTeacher()}
              />
            </div>
            <button className="card-btn btn-teal" style={{ ...S.addBtn, alignSelf: "flex-end" }} onClick={addTeacher}>
              + Add Teacher
            </button>
          </div>
          {tError && <div style={{ ...S.ferr, marginTop: 6 }}>{tError}</div>}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-header">
          <span className="panel-title">Assign Teachers to Subjects</span>
        </div>
        <p style={S.hint}>
          Core labs are assigned batch-wise so imported Excel practical loads can split one lab subject across A1, A2, and A3 correctly.
        </p>

        {!yearBranches.length && <div style={S.emptyBox}>Add Year-Branch-Divisions in Step 1 first.</div>}

        {yearBranches.map(yb => {
          const subs = getYbSubs(yb.id);
          if (!subs.length) return null;

          return (
            <div key={yb.id} style={{ marginBottom: 28 }}>
              <div style={S.ybHeader}>
                <strong>{yb.year}-{yb.branch}</strong>
                <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>
                  Divs: {yb.divs.join(", ")} &middot; {subs.length} subjects &middot; {getNumBatches(yb.id)} batches
                </span>
              </div>

              {getLabSubs(yb.id).length > 0 && (
                <div style={{ marginBottom: 16, border: "1.5px solid #9ae6b4", borderRadius: 8, overflow: "visible" }}>
                  <div style={{ background: "#e8f5e9", padding: "8px 14px", fontWeight: 700, fontSize: 12, color: "#276749" }}>
                    Core Lab Group - Teacher per Batch
                  </div>
                  <div style={{ padding: "12px 14px", overflow: "visible" }}>
                    {getLabSubs(yb.id).map(sub => (
                      <div key={sub.id} style={{ marginBottom: 14 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                          <span style={S.batchTag}>{sub.type}</span> {sub.name}
                          <span style={{ fontSize: 11, color: "#888", fontWeight: 400, marginLeft: 8 }}>
                            {sub.labHours}hr/session &middot; {sub.weeklyLabs}x/wk
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          {yb.divs.map(div => {
                            const batchAssigns = assignments?.[yb.id]?.[div]?.[sub.id]?.batchAssigns || [];
                            return (
                              <div
                                key={div}
                                style={{
                                  flex: 1,
                                  minWidth: 280,
                                  position: "relative",
                                  border: "1px solid #d9f0df",
                                  borderRadius: 8,
                                  padding: 10,
                                  background: "#f8fff9",
                                }}
                              >
                                <label style={{ ...S.label, marginBottom: 8 }}>Division {div}</label>
                                <div style={{ display: "grid", gap: 8 }}>
                                  {getDivBatches(div, yb.id).map(batch => {
                                    const current = batchAssigns.find(b => b.batch === batch)?.teacherCode || "";
                                    return (
                                      <div key={batch} style={{ display: "grid", gridTemplateColumns: "56px 1fr", gap: 8, alignItems: "center" }}>
                                        <span style={S.batchTag}>{batch}</span>
                                        <TeacherSelect
                                          value={current}
                                          onChange={value => setLabBatchTeacher(yb.id, div, sub.id, batch, value)}
                                          teachers={teachers}
                                          placeholder="Assign teacher"
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {getOtherSubs(yb.id).map(sub => (
                <div key={sub.id} style={{ marginBottom: 10, border: "1px solid #e2e8f0", borderRadius: 8, overflow: "visible" }}>
                  <div
                    style={{
                      padding: "8px 14px",
                      background: isElectiveType(sub.type) ? "#fffbf0" : "#f1f5ff",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      borderBottom: "1px solid #e2e8f0",
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{sub.name}</span>
                    <span className={isElectiveType(sub.type) ? "chip-blue" : "chip-pink"} style={{ fontSize: 10 }}>
                      {sub.type}
                    </span>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", overflow: "visible" }}>
                    <thead>
                      <tr>
                        {yb.divs.map(div => (
                          <th key={div} style={{ ...S.th, minWidth: 180 }}>Division {div}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {yb.divs.map(div => (
                          <td key={div} style={{ ...S.td, padding: 10, verticalAlign: "top", overflow: "visible", position: "relative" }}>
                            <TeacherSelect
                              value={assignments?.[yb.id]?.[div]?.[sub.id]?.teacherCode || ""}
                              onChange={value => setSubjectTeacher(yb.id, div, sub.id, value)}
                              teachers={teachers}
                            />
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button className="card-btn btn-ghost" onClick={() => setActiveTab(3)}>Back</button>
        <button className="card-btn btn-blue" style={{ padding: "10px 28px" }} onClick={() => setActiveTab(5)}>
          Next: Details
        </button>
      </div>
    </>
  );
}
