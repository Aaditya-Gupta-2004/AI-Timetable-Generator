import React from "react";
import { S } from "../timetableHelpers";

export default function Step1Setup({ dept, setDept, semLabel, setSemLabel, yearInput, setYearInput, branchInput, setBranchInput, divInput, setDivInput, batchInput, setBatchInput, ybError, setYbError, yearBranches, ybBatchCount, addYearBranch, removeYB, setActiveTab }) {
  const getNumBatches = ybId => ybBatchCount[ybId] || 3;
  return (
    <>
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-header"><span className="panel-title">Institution &amp; Semester</span></div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 2, minWidth: 220 }}>
            <label style={S.label}>Department Name</label>
            <input type="text" value={dept} onChange={e => setDept(e.target.value)} style={S.input} />
          </div>
          <div style={{ flex: 2, minWidth: 220 }}>
            <label style={S.label}>Semester Label</label>
            <input type="text" value={semLabel} onChange={e => setSemLabel(e.target.value)} style={S.input} placeholder="e.g. EVEN Semester (IV) 2025-2026" />
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-header"><span className="panel-title">Year · Branch · Divisions · Batches</span></div>
        <p style={S.hint}>
          Batches are used for <strong>Core Lab rotation</strong> — each batch does a different lab subject each session.
          <br /><span style={S.eg}>e.g. SE · IT · Divs A,B · 3 batches → A1,A2,A3 / B1,B2,B3</span>
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6, alignItems: "flex-end" }}>
          <div style={{ flex: "0 0 80px" }}>
            <label style={S.label}>Year</label>
            <select value={yearInput} onChange={e => setYearInput(e.target.value)} style={S.input}>
              {["FE", "SE", "TE", "BE"].map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label style={S.label}>Branch</label>
            <input type="text" value={branchInput} onChange={e => { setBranchInput(e.target.value); setYbError(""); }} placeholder="IT, COMP…" style={S.input} />
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={S.label}>Divisions</label>
            <input type="text" value={divInput} onChange={e => { setDivInput(e.target.value); setYbError(""); }} placeholder="A, B, C" style={S.input} onKeyDown={e => e.key === "Enter" && addYearBranch()} />
          </div>
          <div style={{ flex: "0 0 110px" }}>
            <label style={S.label}>Batches / Div</label>
            <input type="number" min={1} max={10} value={batchInput} onChange={e => setBatchInput(e.target.value)} style={{ ...S.input, borderColor: "#6c8ebf", background: "#f0f5ff" }} />
          </div>
          <button className="card-btn btn-blue" style={{ ...S.addBtn, alignSelf: "flex-end" }} onClick={addYearBranch}>+ Add</button>
        </div>
        {ybError && <div style={S.ferr}>{ybError}</div>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {!yearBranches.length
            ? <span style={S.empty}>No Year-Branch added yet</span>
            : yearBranches.map(yb => (
              <span key={yb.id} style={{ ...S.chip, borderColor: "#667eea", color: "#667eea", background: "#f0f2ff" }}>
                <strong>{yb.year}</strong>-{yb.branch}
                <span style={{ fontSize: 10, color: "#999", marginLeft: 4 }}>[{yb.divs.join(",")}]</span>
                <span style={{ fontSize: 10, marginLeft: 4, background: "#e0e7ff", borderRadius: 8, padding: "0 6px", color: "#4c51bf" }}>{getNumBatches(yb.id)} batches</span>
                <button onClick={() => removeYB(yb.id)} style={S.chipX}>✕</button>
              </span>
            ))}
        </div>
      </div>

      <div style={{ textAlign: "right" }}>
        <button className="card-btn btn-blue" style={{ padding: "10px 28px" }} onClick={() => setActiveTab(1)}>Next: Subjects →</button>
      </div>
    </>
  );
}