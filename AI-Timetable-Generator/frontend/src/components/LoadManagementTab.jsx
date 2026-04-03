import React, { useState } from "react";

const API_BASE = "https://ai-timetable-generator-j7qx.onrender.com";

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

// ─────────────────────────────────────────────────────────────────────────────
// LoadManagementTab
//
// Props:
//   teachers      — [{ id, code, name }]
//   teacherLoads  — { [teacherCode]: { maxTheory: number|null, maxPractical: number|null } }
//   setTeacherLoads — setter
//   activeTab     — current tab index (4)
//   setActiveTab  — tab setter
// ─────────────────────────────────────────────────────────────────────────────
export default function LoadManagementTab({
  teachers,
  teacherLoads,
  setTeacherLoads,
  activeTab,
  setActiveTab,
}) {
  const [saving,   setSaving]   = useState(false);
  const [saveOk,   setSaveOk]   = useState(false);
  const [error,    setError]    = useState("");
  const [filter,   setFilter]   = useState("");
  const [imported, setImported] = useState(false);

  // ── Derived ───────────────────────────────────────────────────────────────
  const filtered = teachers.filter(t =>
    `${t.code} ${t.name}`.toLowerCase().includes(filter.toLowerCase())
  );

  const getLoad = (code) => teacherLoads[code] || { maxTheory: null, maxPractical: null };

  const setField = (code, field, raw) => {
    const val = raw === "" ? null : parseInt(raw);
    setTeacherLoads(prev => ({
      ...prev,
      [code]: { ...getLoad(code), [field]: isNaN(val) ? null : val },
    }));
  };

  // ── Total load badge color ────────────────────────────────────────────────
  const totalColor = (total) => {
    if (!total) return "#aaa";
    if (total <= 12) return "#276749";
    if (total <= 18) return "#b45309";
    return "#c53030";
  };

  // ── Quick-fill: apply same limit to all teachers ──────────────────────────
  const [bulkTheory,    setBulkTheory]    = useState("");
  const [bulkPractical, setBulkPractical] = useState("");

  const applyBulk = () => {
    const th = bulkTheory    === "" ? null : parseInt(bulkTheory);
    const pr = bulkPractical === "" ? null : parseInt(bulkPractical);
    setTeacherLoads(prev => {
      const next = { ...prev };
      teachers.forEach(t => {
        next[t.code] = {
          maxTheory:    th ?? getLoad(t.code).maxTheory,
          maxPractical: pr ?? getLoad(t.code).maxPractical,
        };
      });
      return next;
    });
    setBulkTheory(""); setBulkPractical("");
  };

  const clearAll = () => {
    setTeacherLoads({});
  };

  // ── Save to API ───────────────────────────────────────────────────────────
  const saveToAPI = async () => {
    setSaving(true); setError(""); setSaveOk(false);
    try {
      const payload = teachers
        .filter(t => getLoad(t.code).maxTheory != null || getLoad(t.code).maxPractical != null)
        .map(t => ({
          teacher_code:  t.code,
          max_theory:    getLoad(t.code).maxTheory    ?? null,
          max_practical: getLoad(t.code).maxPractical ?? null,
        }));
      await apiPost("/teacher-loads/bulk", payload);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2500);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Import from Excel-like paste (TSV rows: Code\tTheory\tPractical) ──────
  const handleImportPaste = (e) => {
    const text = e.clipboardData.getData("text");
    const rows = text.trim().split("\n");
    let count = 0;
    rows.forEach(row => {
      const [code, th, pr] = row.split("\t").map(s => s.trim());
      const teacher = teachers.find(t => t.code.toUpperCase() === code.toUpperCase());
      if (!teacher) return;
      setTeacherLoads(prev => ({
        ...prev,
        [teacher.code]: {
          maxTheory:    th === "" || th == null ? null : parseInt(th),
          maxPractical: pr === "" || pr == null ? null : parseInt(pr),
        },
      }));
      count++;
    });
    if (count > 0) setImported(true);
    e.preventDefault();
  };

  // ── Stats row ─────────────────────────────────────────────────────────────
  const teachersWithLimits = teachers.filter(t =>
    getLoad(t.code).maxTheory != null || getLoad(t.code).maxPractical != null
  ).length;
  const totalTheoryCap    = teachers.reduce((s, t) => s + (getLoad(t.code).maxTheory    || 0), 0);
  const totalPracticalCap = teachers.reduce((s, t) => s + (getLoad(t.code).maxPractical || 0), 0);

  return (
    <div>
      {/* ── Header panel ── */}
      <div style={S.panel}>
        <div style={S.panelHeader}>
          <span style={S.panelTitle}>📊 Load Management</span>
        </div>

        <p style={S.hint}>
          Define how many <strong>theory</strong> and <strong>practical</strong> sessions each
          teacher can take per week. The AI will never assign more than these limits when generating
          the timetable — matching exactly how your college's load allocation sheet works.
        </p>

        {/* ── Legend ── */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
          <div style={S.legendChip("#e8f5e9", "#9ae6b4", "#276749")}>
            📚 Theory — classroom lectures
          </div>
          <div style={S.legendChip("#f0f5ff", "#c5d3f5", "#3451b2")}>
            🔬 Practical — lab sessions
          </div>
          <div style={S.legendChip("#fffbf0", "#fcd34d", "#92400e")}>
            ∑ Total = Theory + Practical
          </div>
        </div>

        {/* ── Summary stats ── */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
          {[
            { label: "Teachers with limits",      val: teachersWithLimits,        bg: "#f0f5ff", border: "#c5d3f5", color: "#3451b2" },
            { label: "Total theory cap / week",   val: totalTheoryCap    || "—",  bg: "#e8f5e9", border: "#9ae6b4", color: "#276749" },
            { label: "Total practical cap / week", val: totalPracticalCap || "—", bg: "#fff0f4", border: "#ffb3c6", color: "#c0003a" },
          ].map((s, i) => (
            <div key={i} style={{
              padding: "10px 18px", borderRadius: 10,
              background: s.bg, border: `1px solid ${s.border}`,
              fontSize: 13, minWidth: 160,
            }}>
              <span style={{ fontWeight: 700, color: s.color, fontSize: 20, marginRight: 6 }}>{s.val}</span>
              <span style={{ color: "#555" }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* ── Bulk apply ── */}
        <div style={{
          padding: "12px 16px", borderRadius: 10,
          background: "#f7f8ff", border: "1px dashed #c8d5ea", marginBottom: 18,
        }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "#445", marginBottom: 8 }}>
            ⚡ Quick-fill — apply same limit to ALL teachers
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <label style={S.label}>Max Theory / Week</label>
              <input
                type="number" min={0} max={40}
                value={bulkTheory}
                onChange={e => setBulkTheory(e.target.value)}
                placeholder="e.g. 14"
                style={{ ...S.input, width: 110, borderColor: "#9ae6b4", background: "#f0fff4" }}
              />
            </div>
            <div>
              <label style={S.label}>Max Practical / Week</label>
              <input
                type="number" min={0} max={40}
                value={bulkPractical}
                onChange={e => setBulkPractical(e.target.value)}
                placeholder="e.g. 4"
                style={{ ...S.input, width: 110, borderColor: "#c5d3f5", background: "#f0f5ff" }}
              />
            </div>
            <button
              onClick={applyBulk}
              style={{
                padding: "9px 20px", borderRadius: 8, border: "none",
                background: "#5b8dee", color: "#fff", fontWeight: 600,
                fontSize: 13, cursor: "pointer",
              }}>
              Apply to All
            </button>
            <button
              onClick={clearAll}
              style={{
                padding: "9px 16px", borderRadius: 8,
                border: "1.5px solid #e05c5c", background: "#fff0f4",
                color: "#e05c5c", fontWeight: 600, fontSize: 13, cursor: "pointer",
              }}>
              Clear All
            </button>
          </div>
        </div>

        {/* ── Search ── */}
        <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="🔍 Search teacher by name or code…"
            style={{ ...S.input, maxWidth: 340 }}
          />
        </div>

        {/* ── TSV paste hint ── */}
        <div
          onPaste={handleImportPaste}
          style={{
            marginBottom: 14, padding: "8px 14px",
            borderRadius: 8, background: "#fafbff",
            border: "1px dashed #c8d5ea", fontSize: 12, color: "#888",
          }}>
          {imported
            ? <span style={{ color: "#276749", fontWeight: 600 }}>✅ Data imported from clipboard!</span>
            : "💡 You can paste a copied Excel range here (columns: Code · Theory · Practical) to auto-fill the table."}
        </div>
      </div>

      {/* ── Main table ── */}
      {!teachers.length
        ? <div style={S.emptyBox}>Add teachers in the Teachers tab first.</div>
        : (
        <div style={S.panel}>
          <div style={{ overflowX: "auto" }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={{ ...S.th, textAlign: "left", width: 80 }}>Code</th>
                  <th style={{ ...S.th, textAlign: "left" }}>Teacher Name</th>
                  <th style={{ ...S.th, background: "#e8f5e9", color: "#276749", width: 160 }}>
                    📚 Max Theory / Week
                  </th>
                  <th style={{ ...S.th, background: "#f0f5ff", color: "#3451b2", width: 180 }}>
                    🔬 Max Practical / Week
                  </th>
                  <th style={{ ...S.th, background: "#fffbf0", color: "#92400e", width: 140 }}>
                    ∑ Total Max Load
                  </th>
                  <th style={{ ...S.th, width: 80 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => {
                  const load     = getLoad(t.code);
                  const theory   = load.maxTheory;
                  const prac     = load.maxPractical;
                  const total    = (theory || 0) + (prac || 0);
                  const hasLimit = theory != null || prac != null;

                  return (
                    <tr key={t.id} style={{ background: i % 2 === 0 ? "#fafbff" : "#fff" }}>
                      {/* Code */}
                      <td style={{
                        ...S.td, fontFamily: "monospace",
                        fontWeight: 700, color: "#667eea", fontSize: 13,
                      }}>
                        {t.code}
                      </td>

                      {/* Name */}
                      <td style={{ ...S.td, fontWeight: 500, color: "#334" }}>
                        {t.name}
                      </td>

                      {/* Theory input */}
                      <td style={{ ...S.td, background: "#f7fdf8" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                          <input
                            type="number" min={0} max={40}
                            value={theory ?? ""}
                            placeholder="No limit"
                            onChange={e => setField(t.code, "maxTheory", e.target.value)}
                            style={{
                              ...S.input, width: 90, textAlign: "center",
                              borderColor: theory != null ? "#9ae6b4" : "#e2e8f0",
                              background:  theory != null ? "#f0fff4" : "#fafafa",
                            }}
                          />
                          {theory != null && (
                            <span style={{ fontSize: 11, color: "#276749" }}>sessions</span>
                          )}
                        </div>
                      </td>

                      {/* Practical input */}
                      <td style={{ ...S.td, background: "#f7f9ff" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                          <input
                            type="number" min={0} max={40}
                            value={prac ?? ""}
                            placeholder="No limit"
                            onChange={e => setField(t.code, "maxPractical", e.target.value)}
                            style={{
                              ...S.input, width: 90, textAlign: "center",
                              borderColor: prac != null ? "#c5d3f5" : "#e2e8f0",
                              background:  prac != null ? "#f0f5ff" : "#fafafa",
                            }}
                          />
                          {prac != null && (
                            <span style={{ fontSize: 11, color: "#3451b2" }}>sessions</span>
                          )}
                        </div>
                      </td>

                      {/* Total */}
                      <td style={{ ...S.td, textAlign: "center", background: "#fffdf5" }}>
                        {hasLimit ? (
                          <span style={{ fontWeight: 700, fontSize: 16, color: totalColor(total) }}>
                            {total}
                            <span style={{ fontSize: 10, fontWeight: 400, color: "#999", marginLeft: 3 }}>
                              /wk
                            </span>
                          </span>
                        ) : (
                          <span style={{ color: "#ccc", fontSize: 12 }}>—</span>
                        )}
                      </td>

                      {/* Status badge */}
                      <td style={{ ...S.td, textAlign: "center" }}>
                        {hasLimit ? (
                          <span style={{
                            display: "inline-block",
                            padding: "3px 10px", borderRadius: 20,
                            fontSize: 11, fontWeight: 600,
                            background: "#e8f5e9", color: "#276749",
                            border: "1px solid #9ae6b4",
                          }}>
                            Set ✓
                          </span>
                        ) : (
                          <span style={{
                            display: "inline-block",
                            padding: "3px 10px", borderRadius: 20,
                            fontSize: 11, color: "#aaa",
                            background: "#f8f9fb",
                            border: "1px solid #e2e8f0",
                          }}>
                            Free
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Footer totals row */}
              {filtered.length > 1 && (
                <tfoot>
                  <tr style={{ background: "#f1f5ff", borderTop: "2px solid #d0d9f0" }}>
                    <td colSpan={2} style={{ ...S.td, fontWeight: 700, color: "#334", textAlign: "right" }}>
                      Department Total →
                    </td>
                    <td style={{ ...S.td, fontWeight: 700, color: "#276749", textAlign: "center", fontSize: 15 }}>
                      {totalTheoryCap || "—"}
                    </td>
                    <td style={{ ...S.td, fontWeight: 700, color: "#3451b2", textAlign: "center", fontSize: 15 }}>
                      {totalPracticalCap || "—"}
                    </td>
                    <td style={{ ...S.td, fontWeight: 700, fontSize: 16, textAlign: "center",
                      color: totalColor(totalTheoryCap + totalPracticalCap) }}>
                      {totalTheoryCap + totalPracticalCap || "—"}
                    </td>
                    <td style={S.td} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* ── Save / error ── */}
          {error && (
            <div style={{ marginTop: 12, color: "#e05c5c", fontSize: 12 }}>⚠️ {error}</div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <button
              onClick={saveToAPI}
              disabled={saving}
              style={{
                padding: "10px 24px", borderRadius: 8, border: "none",
                background: saveOk ? "#00C9A7" : "#5b8dee",
                color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer",
              }}>
              {saving ? "Saving…" : saveOk ? "✅ Saved!" : "💾 Save Load Limits"}
            </button>
          </div>

          <div style={{
            marginTop: 14, padding: "10px 14px", borderRadius: 8,
            background: "#fffbf0", border: "1px solid #fcd34d", fontSize: 12, color: "#92400e",
          }}>
            ⚠️ These limits apply during timetable generation. The AI will stop assigning sessions
            to a teacher once their theory or practical count reaches the limit you set here.
          </div>
        </div>
      )}

      {/* ── Navigation ── */}
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

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  panel: {
    background: "#fff", borderRadius: 16, padding: "22px 26px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 20,
  },
  panelHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18,
  },
  panelTitle: { fontSize: 16, fontWeight: 700, color: "#1a2b4a" },
  hint: { color: "#666", fontSize: 13, lineHeight: 1.75, marginBottom: 14 },
  label: { fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 4, display: "block" },
  input: {
    padding: "8px 12px", borderRadius: 8, border: "1.5px solid #d0d5dd",
    fontSize: 13, outline: "none", background: "#fafafa",
    color: "#333", width: "100%", boxSizing: "border-box",
  },
  emptyBox: {
    padding: "14px 18px", background: "#f8f9fb", borderRadius: 8,
    color: "#888", fontSize: 13, border: "1px dashed #d5dae3", marginBottom: 20,
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13, border: "1px solid #e2e8f0" },
  th: {
    background: "#f1f5ff", color: "#334", padding: "10px 12px",
    textAlign: "center", fontWeight: 700, fontSize: 12,
    borderBottom: "2px solid #d0d9f0", whiteSpace: "nowrap",
  },
  td: { padding: "10px 12px", border: "1px solid #e8ecf5", fontSize: 13, color: "#333" },
  legendChip: (bg, border, color) => ({
    padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500,
    background: bg, border: `1px solid ${border}`, color,
  }),
  navBtn: (bg, color) => ({
    padding: "10px 24px", borderRadius: 8, border: "none",
    background: bg, color, fontWeight: 600, fontSize: 14, cursor: "pointer",
  }),
};