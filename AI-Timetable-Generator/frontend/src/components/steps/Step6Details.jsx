import React from "react";
import { S, uid } from "../timetableHelpers";
import TeacherSelect from "../components/TeacherSelect";

export default function Step6Details({
  yearBranches,
  teachers,
  divCounsellors,
  setDivCounsellor,
  footerRoles = [],
  setFooterRoles,
  cfRole,
  setCfRole,
  cfName,
  setCfName,
  setActiveTab,
}) {

  const updateFooterRole = (id, field, value) =>
    setFooterRoles(p => p.map(r => r.id === id ? { ...r, [field]: value } : r));

  const removeFooterRole = id =>
    setFooterRoles(p => p.filter(r => r.id !== id));

  const addCustomFooterRole = () => {
    if (!cfRole.trim() || !cfName.trim()) return;
    setFooterRoles(p => [...p, { id: uid(), role: cfRole.trim(), name: cfName.trim() }]);
    setCfRole(""); setCfName("");
  };

  return (
    <>
      {yearBranches.length > 0 && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-header">
            <span className="panel-title">🎓 Class Counsellors — Per Division</span>
          </div>
          <p style={S.hint}>
            Each division has its own Class Counsellor. Their name appears on that division's timetable footer.
          </p>
          {yearBranches.map(yb => (
            <div key={yb.id} style={{ marginBottom: 20 }}>
              <div style={S.ybHeader}><strong>{yb.year}-{yb.branch}</strong></div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {yb.divs.map(div => (
                  <div key={div} style={{ flex: 1, minWidth: 200, padding: "12px 14px", border: "1px solid #e2e8f0", borderRadius: 8, background: "#fafbff" }}>
                    <div style={{ textAlign: "center", marginBottom: 10, padding: "10px 0 6px", borderTop: "2px solid #667eea" }}>
                      <div style={{ fontWeight: 700, fontSize: 12, color: "#334" }}>Class Counsellor</div>
                      <div style={{ fontSize: 11, color: "#667eea", marginTop: 2 }}>Division {div}</div>
                    </div>
                    <TeacherSelect
                      value={divCounsellors?.[yb.id]?.[div] || ""}
                      onChange={v => setDivCounsellor(yb.id, div, v)}
                      teachers={teachers}
                      placeholder="— select counsellor —"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!teachers.length && <div style={S.emptyBox}>Add teachers in Step ④ first.</div>}
        </div>
      )}

      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-header">
          <span className="panel-title">Timetable Footer — Signature Roles</span>
        </div>
        <p style={S.hint}>
          These roles appear on <strong>all</strong> timetable footers. The Class Counsellor above is division-specific.
        </p>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
          {(footerRoles || []).map(r => (
            <div key={r.id} style={{ flex: 1, minWidth: 200, padding: "12px 14px", border: "1px solid #e2e8f0", borderRadius: 8, background: "#fafbff" }}>
              <div style={{ textAlign: "center", marginBottom: 10, padding: "10px 0 6px", borderTop: "2px solid #667eea" }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: "#334" }}>{r.role || "Role"}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {!r.locked && (
                  <div>
                    <label style={S.label}>Role / Title</label>
                    <input type="text" value={r.role} onChange={e => updateFooterRole(r.id, "role", e.target.value)} style={S.input} placeholder="e.g. Lab In-charge" />
                  </div>
                )}
                <div>
                  <label style={S.label}>Name</label>
                  <input type="text" value={r.name} onChange={e => updateFooterRole(r.id, "name", e.target.value)} style={S.input} placeholder="e.g. Dr. Priya Sharma" />
                </div>
                {!r.locked && (
                  <button onClick={() => removeFooterRole(r.id)} style={{ ...S.removeBtn, fontSize: 12, textAlign: "left" }}>✕ Remove</button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: "14px 16px", border: "1px dashed #c8d5ea", borderRadius: 8, background: "#f7f8ff" }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "#445", marginBottom: 10 }}>+ Add Custom Role</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={S.label}>Role / Title</label>
              <input type="text" value={cfRole} onChange={e => setCfRole(e.target.value)} style={S.input} placeholder="e.g. Lab In-charge" />
            </div>
            <div style={{ flex: 2, minWidth: 200 }}>
              <label style={S.label}>Name</label>
              <input
                type="text" value={cfName}
                onChange={e => setCfName(e.target.value)}
                style={S.input}
                placeholder="e.g. Prof. Rajan Mehta"
                onKeyDown={e => e.key === "Enter" && addCustomFooterRole()}
              />
            </div>
            <button
              className="card-btn btn-teal"
              style={{ ...S.addBtn, alignSelf: "flex-end" }}
              onClick={addCustomFooterRole}>
              + Add
            </button>
          </div>
        </div>
      </div>

      {/* Back → LoadManagementTab (tab 4) | Next → Step7Generate (tab 6) */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button className="card-btn btn-ghost" onClick={() => setActiveTab(4)}>← Back</button>
        <button className="card-btn btn-blue" style={{ padding: "10px 28px" }} onClick={() => setActiveTab(6)}>Next: Generate →</button>
      </div>
    </>
  );
}