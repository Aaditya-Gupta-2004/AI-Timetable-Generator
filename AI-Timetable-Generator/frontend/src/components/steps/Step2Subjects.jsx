import React, { useRef } from "react";
import { S, isCoreLab, isElectiveType, ELECTIVE_GROUPS, getBatches } from "../timetableHelpers";

export default function Step2Subjects({ yearBranches, ybSubjects, activeSubYbId, setActiveSubYbId, subName, setSubName, subType, setSubType, subHours, setSubHours, subLabHours, setSubLabHours, subWeeklyLabs, setSubWeeklyLabs, subError, setSubError, addSubject, removeSubject, ybBatchCount, setActiveTab }) {
  const subNameRef    = useRef();
  const getYbSubs     = id => ybSubjects[id] || [];
  const getNumBatches = ybId => ybBatchCount[ybId] || 3;
  const getLabSubs    = ybId => getYbSubs(ybId).filter(s => isCoreLab(s.type));
  const getOtherSubs  = ybId => getYbSubs(ybId).filter(s => !isCoreLab(s.type));

  return (
    <>
      {!yearBranches.length && <div style={S.emptyBox}>Add Year-Branch-Divisions in Step ① first.</div>}
      {yearBranches.length > 0 && (
        <>
          <p style={S.hint}>
            <strong>Core Lab 1, 2, 3</strong> are grouped into a rotation — each session, every batch does a different lab. Labs spread across different days (max 1/day, 2 only as last resort).
          </p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
            {yearBranches.map(yb => (
              <button key={yb.id} onClick={() => { setActiveSubYbId(yb.id); setSubError(""); }}
                style={{ ...S.tabBtn, ...(activeSubYbId === yb.id ? S.tabYBActive : {}) }}>
                {yb.year}-{yb.branch}
                <span style={{ marginLeft: 6, fontSize: 10, opacity: .8, background: "rgba(255,255,255,.25)", borderRadius: 8, padding: "0 5px" }}>{getYbSubs(yb.id).length} subj</span>
              </button>
            ))}
          </div>

          {activeSubYbId && (
            <div className="panel" style={{ marginBottom: 20 }}>
              <div className="panel-header"><span className="panel-title">Subjects for <span style={{ color: "#667eea" }}>{activeSubYbId}</span></span></div>

              {/* Lab rotation preview */}
              {getLabSubs(activeSubYbId).length > 0 && (() => {
                const labSubs    = getLabSubs(activeSubYbId);
                const batches    = getBatches("A", getNumBatches(activeSubYbId));
                const maxSessions= Math.max(...labSubs.map(s => s.weeklyLabs || 1));
                return (
                  <div style={{ marginBottom: 16, padding: "12px 14px", background: "#f0fff4", borderRadius: 8, border: "1px solid #9ae6b4" }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: "#276749", marginBottom: 8 }}>🔄 Core Lab Rotation Preview (Div A)</div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ fontSize: 11, borderCollapse: "collapse" }}>
                        <thead><tr><th style={{ padding: "4px 10px", background: "#276749", color: "#fff" }}>Lab Session</th>{batches.map(b => <th key={b} style={{ padding: "4px 10px", background: "#276749", color: "#fff" }}>{b}</th>)}</tr></thead>
                        <tbody>{Array.from({ length: maxSessions }, (_, si) => (
                          <tr key={si} style={{ background: si % 2 === 0 ? "#f0fff4" : "#fff" }}>
                            <td style={{ padding: "4px 10px", fontWeight: 700 }}>Session {si + 1}</td>
                            {batches.map((b, bi) => { const subIdx = (bi + si) % labSubs.length; return <td key={b} style={{ padding: "4px 10px" }}>{labSubs[subIdx]?.name || "—"}</td>; })}
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                    <div style={{ fontSize: 11, color: "#555", marginTop: 8 }}>
                      {labSubs.map(s => <span key={s.id} style={{ marginRight: 12 }}><strong>{s.name}</strong>: {s.weeklyLabs}×/wk · {s.labHours}hr/session</span>)}
                    </div>
                  </div>
                );
              })()}

              {/* Add subject form */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 6 }}>
                <div style={{ flex: 2, minWidth: 160 }}>
                  <label style={S.label}>Subject Name</label>
                  <input ref={subNameRef} type="text" value={subName} onChange={e => { setSubName(e.target.value); setSubError(""); }} onKeyDown={e => e.key === "Enter" && addSubject(subNameRef)} placeholder="e.g. OS, DBMS" style={{ ...S.input, borderColor: subError ? "#e05c5c" : "#d0d5dd" }} />
                </div>
                <div style={{ flex: 1, minWidth: 170 }}>
                  <label style={S.label}>Type</label>
                  <select value={subType} onChange={e => setSubType(e.target.value)} style={S.input}>
                    <option value="theory">Theory</option>
                    <optgroup label="── Core Lab Group (rotation) ──">
                      <option value="Core Lab 1">Core Lab 1</option>
                      <option value="Core Lab 2">Core Lab 2</option>
                      <option value="Core Lab 3">Core Lab 3</option>
                    </optgroup>
                    <optgroup label="── Elective Groups ──">
                      {ELECTIVE_GROUPS.map(eg => <option key={eg} value={eg}>{eg}</option>)}
                    </optgroup>
                  </select>
                </div>
                {!isCoreLab(subType) && (
                  <div style={{ flex: "0 0 100px" }}>
                    <label style={S.label}>Hrs / Week</label>
                    <input type="number" min={1} max={10} value={subHours} onChange={e => { setSubHours(e.target.value); setSubError(""); }} onKeyDown={e => e.key === "Enter" && addSubject(subNameRef)} placeholder="3" style={{ ...S.input, borderColor: subError ? "#e05c5c" : "#d0d5dd" }} />
                  </div>
                )}
                {isCoreLab(subType) && (
                  <>
                    <div style={{ flex: "0 0 130px" }}>
                      <label style={S.label}>Lab Hrs / Session</label>
                      <input type="number" min={1} max={6} value={subLabHours} onChange={e => { setSubLabHours(e.target.value); setSubError(""); }} placeholder="2" style={{ ...S.input, borderColor: "#6c8ebf", background: "#f0f5ff" }} />
                    </div>
                    <div style={{ flex: "0 0 130px" }}>
                      <label style={S.label}>Sessions / Week</label>
                      <input type="number" min={1} max={5} value={subWeeklyLabs} onChange={e => { setSubWeeklyLabs(e.target.value); setSubError(""); }} placeholder="1" style={{ ...S.input, borderColor: "#6c8ebf", background: "#f0f5ff" }} />
                    </div>
                  </>
                )}
                <button className="card-btn btn-teal" style={{ ...S.addBtn, alignSelf: "flex-end" }} onClick={() => addSubject(subNameRef)}>+ Add</button>
              </div>
              {subError && <div style={S.ferr}>{subError}</div>}

              {getYbSubs(activeSubYbId).length > 0 ? (
                <>
                  {getLabSubs(activeSubYbId).length > 0 && (
                    <div style={{ marginTop: 14, border: "1.5px solid #9ae6b4", borderRadius: 8, overflow: "hidden" }}>
                      <div style={{ background: "#e8f5e9", padding: "8px 14px", fontWeight: 700, fontSize: 12, color: "#276749", display: "flex", alignItems: "center", gap: 8 }}>
                        🔬 Core Lab Group (Rotation) <span style={{ fontSize: 11, fontWeight: 400, color: "#555" }}>— scheduled together with batch rotation</span>
                      </div>
                      <table style={{ ...S.table, border: "none" }}>
                        <thead><tr>{["#", "Subject", "Type", "Lab Hrs/Session", "Sessions/Week", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                        <tbody>
                          {getLabSubs(activeSubYbId).map((s, i) => (
                            <tr key={s.id} style={{ background: i % 2 === 0 ? "#f0fff4" : "#fff" }}>
                              <td style={S.td}>{i + 1}</td><td style={{ ...S.td, fontWeight: 600 }}>{s.name}</td>
                              <td style={S.td}><span className="chip-teal" style={{ fontSize: 11 }}>{s.type}</span></td>
                              <td style={S.td}>{s.labHours}</td><td style={S.td}>{s.weeklyLabs}</td>
                              <td style={S.td}><button onClick={() => removeSubject(activeSubYbId, s.id)} style={S.removeBtn}>✕</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {getOtherSubs(activeSubYbId).length > 0 && (
                    <table style={{ ...S.table, marginTop: 14 }}>
                      <thead><tr>{["#", "Subject", "Type", "Hrs/Week", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                      <tbody>
                        {getOtherSubs(activeSubYbId).map((s, i) => (
                          <tr key={s.id} style={{ background: i % 2 === 0 ? "#fafbff" : "#fff" }}>
                            <td style={S.td}>{i + 1}</td><td style={{ ...S.td, fontWeight: 600 }}>{s.name}</td>
                            <td style={S.td}><span className={isElectiveType(s.type) ? "chip-blue" : "chip-pink"} style={{ fontSize: 11 }}>{s.type}</span></td>
                            <td style={S.td}>{s.hours}</td>
                            <td style={S.td}><button onClick={() => removeSubject(activeSubYbId, s.id)} style={S.removeBtn}>✕</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              ) : <div style={S.emptyBox}>No subjects added for {activeSubYbId} yet.</div>}
            </div>
          )}
        </>
      )}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button className="card-btn btn-ghost" onClick={() => setActiveTab(0)}>← Back</button>
        <button className="card-btn btn-blue" style={{ padding: "10px 28px" }} onClick={() => setActiveTab(2)}>Next: Rooms →</button>
      </div>
    </>
  );
}