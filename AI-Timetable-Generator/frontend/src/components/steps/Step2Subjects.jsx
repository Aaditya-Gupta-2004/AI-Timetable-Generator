import React, { useState } from "react";
import { S, uid, isCoreLab, CORE_LAB_TYPES, ELECTIVE_GROUPS } from "../timetableHelpers";

const TYPE_OPTIONS = [
  { value: "theory",      label: "Theory" },
  { value: "Core Lab 1",  label: "Core Lab 1" },
  { value: "Core Lab 2",  label: "Core Lab 2" },
  { value: "Core Lab 3",  label: "Core Lab 3" },
  { value: "Elective 1",  label: "Elective 1" },
  { value: "Elective 2",  label: "Elective 2" },
  { value: "Elective 3",  label: "Elective 3" },
  { value: "Elective 4",  label: "Elective 4" },
  { value: "Elective 5",  label: "Elective 5" },
];

const typeChip = type => {
  if (isCoreLab(type)) return { background: "#f0fff4", color: "#276749", border: "1px solid #9ae6b4" };
  if (ELECTIVE_GROUPS.includes(type)) return { background: "#fffbf0", color: "#b45309", border: "1px solid #fcd34d" };
  return { background: "#f1f5ff", color: "#3451b2", border: "1px solid #c5d3f5" };
};

const emptyDraft = () => ({ name: "", type: "theory", hours: "3", labHours: "2" });

export default function Step2Subjects({
  yearBranches,
  ybSubjects,
  ybBatchCount,
  addSubject,
  updateSubject,
  removeSubject,
  setActiveTab,
}) {
  const [newDrafts,  setNewDrafts]  = useState({});
  const [editDrafts, setEditDrafts] = useState({});
  const [errors,     setErrors]     = useState({});

  const getYbSubs     = id => ybSubjects[id] || [];
  const getNew        = id => newDrafts[id] || emptyDraft();
  const setNew        = (id, patch) => setNewDrafts(p => ({ ...p, [id]: { ...getNew(id), ...patch } }));
  const getNumBatches = id => ybBatchCount[id] || 3;

  // ── Add ───────────────────────────────────────────────────────────────────
  const handleAdd = (ybId) => {
    const d = getNew(ybId);
    if (!d.name.trim()) {
      setErrors(p => ({ ...p, [ybId]: "Subject name is required." }));
      return;
    }
    const subs = getYbSubs(ybId);
    if (subs.some(s => s.name.toLowerCase() === d.name.trim().toLowerCase())) {
      setErrors(p => ({ ...p, [ybId]: `"${d.name.trim()}" already exists.` }));
      return;
    }
    const lab = isCoreLab(d.type);
    addSubject(ybId, {
      id:       uid(),
      name:     d.name.trim(),
      type:     d.type,
      hours:    lab ? 0 : (parseInt(d.hours) || 0),
      labHours: lab ? (parseInt(d.labHours) || 2) : 0,
    });
    setNewDrafts(p => ({ ...p, [ybId]: emptyDraft() }));
    setErrors(p    => ({ ...p, [ybId]: "" }));
  };

  // ── Edit ──────────────────────────────────────────────────────────────────
  const startEdit = (sub) =>
    setEditDrafts(p => ({
      ...p,
      [sub.id]: {
        name:     sub.name,
        type:     sub.type,
        hours:    String(sub.hours || 0),
        labHours: String(sub.labHours || 2),
      },
    }));

  const cancelEdit = (subId) =>
    setEditDrafts(p => { const n = { ...p }; delete n[subId]; return n; });

  const setEditField = (subId, patch) =>
    setEditDrafts(p => ({ ...p, [subId]: { ...p[subId], ...patch } }));

  const handleSave = (ybId, subId) => {
    const d = editDrafts[subId];
    if (!d || !d.name.trim()) return;
    const lab = isCoreLab(d.type);
    updateSubject(ybId, subId, {
      name:     d.name.trim(),
      type:     d.type,
      hours:    lab ? 0 : (parseInt(d.hours) || 0),
      labHours: lab ? (parseInt(d.labHours) || 2) : 0,
    });
    cancelEdit(subId);
  };

  // ─────────────────────────────────────────────────────────────────────────

  if (!yearBranches.length) {
    return (
      <>
        <div style={S.emptyBox}>Add Year-Branch-Divisions in Step ① first.</div>
        <div style={{ marginTop: 12 }}>
          <button className="card-btn btn-ghost" onClick={() => setActiveTab(1)}>← Go to Setup</button>
        </div>
      </>
    );
  }

  return (
    <>
      {yearBranches.map(yb => {
        const subs      = getYbSubs(yb.id);
        const draft     = getNew(yb.id);
        const addIsLab  = isCoreLab(draft.type);

        return (
          <div key={yb.id} className="panel" style={{ marginBottom: 20 }}>

            {/* Header */}
            <div className="panel-header">
              <span className="panel-title">
                {yb.year}-{yb.branch}
                <span style={{ fontSize: 11, fontWeight: 400, color: "#888", marginLeft: 8 }}>
                  Divs: {yb.divs.join(", ")} &middot; {getNumBatches(yb.id)} batches &middot; {subs.length} subject{subs.length !== 1 ? "s" : ""}
                </span>
              </span>
            </div>

            {/* Subject table */}
            {subs.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ ...S.table, marginTop: 0, marginBottom: 14 }}>
                  <thead>
                    <tr>
                      <th style={S.th}>Subject name</th>
                      <th style={S.th}>Type</th>
                      <th style={S.th}>Sessions/week</th>
                      <th style={S.th}>Lab hours/session</th>
                      <th style={{ ...S.th, width: 150 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subs.map((sub, i) => {
                      const ed      = editDrafts[sub.id];
                      const rowBg   = i % 2 === 0 ? "#fafbff" : "#fff";
                      const edIsLab = ed ? isCoreLab(ed.type) : false;

                      if (ed) {
                        return (
                          <tr key={sub.id} style={{ background: "#f0f4ff" }}>
                            <td style={S.td}>
                              <input
                                autoFocus
                                value={ed.name}
                                onChange={e => setEditField(sub.id, { name: e.target.value })}
                                onKeyDown={e => {
                                  if (e.key === "Enter")  handleSave(yb.id, sub.id);
                                  if (e.key === "Escape") cancelEdit(sub.id);
                                }}
                                style={{ ...S.input, marginBottom: 0 }}
                              />
                            </td>
                            <td style={S.td}>
                              <select
                                value={ed.type}
                                onChange={e => setEditField(sub.id, { type: e.target.value })}
                                style={{ ...S.input, marginBottom: 0 }}
                              >
                                {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                            </td>
                            <td style={S.td}>
                              <input
                                type="number" min={0}
                                value={edIsLab ? "" : ed.hours}
                                disabled={edIsLab}
                                onChange={e => setEditField(sub.id, { hours: e.target.value })}
                                style={{ ...S.input, marginBottom: 0, width: 70, opacity: edIsLab ? 0.35 : 1 }}
                              />
                            </td>
                            <td style={S.td}>
                              <input
                                type="number" min={1}
                                value={edIsLab ? ed.labHours : ""}
                                disabled={!edIsLab}
                                onChange={e => setEditField(sub.id, { labHours: e.target.value })}
                                style={{ ...S.input, marginBottom: 0, width: 70, opacity: edIsLab ? 1 : 0.35 }}
                              />
                            </td>
                            <td style={S.td}>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button
                                  className="card-btn btn-blue"
                                  style={{ padding: "4px 12px", fontSize: 12 }}
                                  onClick={() => handleSave(yb.id, sub.id)}
                                >
                                  ✓ Save
                                </button>
                                <button
                                  className="card-btn btn-ghost"
                                  style={{ padding: "4px 10px", fontSize: 12 }}
                                  onClick={() => cancelEdit(sub.id)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      // Display row
                      return (
                        <tr key={sub.id} style={{ background: rowBg }}>
                          <td style={{ ...S.td, fontWeight: 600 }}>{sub.name}</td>
                          <td style={S.td}>
                            <span style={{ ...typeChip(sub.type), padding: "2px 9px", borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                              {sub.type}
                            </span>
                          </td>
                          <td style={{ ...S.td, textAlign: "center" }}>
                            {isCoreLab(sub.type) ? <span style={{ color: "#ccc" }}>—</span> : sub.hours}
                          </td>
                          <td style={{ ...S.td, textAlign: "center" }}>
                            {isCoreLab(sub.type) ? sub.labHours : <span style={{ color: "#ccc" }}>—</span>}
                          </td>
                          <td style={S.td}>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                className="card-btn btn-ghost"
                                style={{ padding: "3px 11px", fontSize: 12 }}
                                onClick={() => startEdit(sub)}
                              >
                                ✎ Edit
                              </button>
                              <button
                                style={{
                                  padding: "3px 9px", fontSize: 12, cursor: "pointer",
                                  border: "1px solid #ffb3c6", borderRadius: 6,
                                  background: "#fff0f4", color: "#c0003a",
                                }}
                                onClick={() => removeSubject(yb.id, sub.id)}
                              >
                                ✕
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!subs.length && (
              <div style={{ ...S.emptyBox, marginBottom: 14 }}>No subjects yet — add one below.</div>
            )}

            {/* Add form */}
            <div style={{ padding: "14px 16px", background: "#f7f8ff", borderRadius: 8, border: "1px dashed #c5d3f5" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#445", marginBottom: 10 }}>+ Add subject</div>

              {errors[yb.id] && (
                <div style={{ ...S.ferr, marginBottom: 8 }}>{errors[yb.id]}</div>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ flex: 3, minWidth: 180 }}>
                  <label style={S.label}>Subject name</label>
                  <input
                    type="text"
                    value={draft.name}
                    placeholder="e.g. Data Structures"
                    onChange={e => { setNew(yb.id, { name: e.target.value }); setErrors(p => ({ ...p, [yb.id]: "" })); }}
                    onKeyDown={e => e.key === "Enter" && handleAdd(yb.id)}
                    style={S.input}
                  />
                </div>

                <div style={{ flex: 1, minWidth: 140 }}>
                  <label style={S.label}>Type</label>
                  <select
                    value={draft.type}
                    onChange={e => setNew(yb.id, { type: e.target.value })}
                    style={S.input}
                  >
                    {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>

                {!addIsLab && (
                  <div style={{ flex: "0 0 110px" }}>
                    <label style={S.label}>Sessions/week</label>
                    <input
                      type="number" min={1}
                      value={draft.hours}
                      onChange={e => setNew(yb.id, { hours: e.target.value })}
                      style={S.input}
                    />
                  </div>
                )}

                {addIsLab && (
                  <div style={{ flex: "0 0 120px" }}>
                    <label style={S.label}>Lab hrs/session</label>
                    <input
                      type="number" min={1}
                      value={draft.labHours}
                      onChange={e => setNew(yb.id, { labHours: e.target.value })}
                      style={S.input}
                    />
                  </div>
                )}

                <button
                  className="card-btn btn-blue"
                  style={{ ...S.addBtn, alignSelf: "flex-end" }}
                  onClick={() => handleAdd(yb.id)}
                >
                  + Add
                </button>
              </div>
            </div>

          </div>
        );
      })}

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button className="card-btn btn-ghost" onClick={() => setActiveTab(1)}>← Back</button>
        <button className="card-btn btn-blue" style={{ padding: "10px 28px" }} onClick={() => setActiveTab(3)}>Next: Rooms →</button>
      </div>
    </>
  );
}