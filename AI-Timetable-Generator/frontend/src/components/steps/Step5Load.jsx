import React, { useState } from "react";

const API_BASE = "https://ai-timetable-generator-j7qx.onrender.com";

function authHeaders() {
  const token = localStorage.getItem("token");
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.detail || `${res.status}`);
  }
  return res.json();
}

export default function Step5Load({ teachers, teacherLoads, setTeacherLoads, setActiveTab }) {
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [error, setError] = useState("");

  const updateLoad = (code, field, value) => {
    setTeacherLoads(prev => ({
      ...prev,
      [code]: { ...(prev[code] || { maxTheory: 0, maxPractical: 0 }), [field]: parseInt(value) || 0 }
    }));
  };

  const saveLoads = async () => {
    setSaving(true);
    setError("");
    setSaveOk(false);
    try {
      const payload = Object.entries(teacherLoads).map(([code, load]) => ({
        teacher_code: code,
        max_theory: load.maxTheory || 0,
        max_practical: load.maxPractical || 0,
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

  return (
    <>
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-header">
          <span className="panel-title">⚖️ Teacher Load Management</span>
        </div>
        <p style={{ color: "#666", fontSize: 13, lineHeight: 1.75, marginBottom: 14 }}>
          Set the maximum number of theory and practical hours each teacher can handle per week.
          This helps the AI distribute workload fairly.
        </p>

        {!teachers.length ? (
          <div style={{
            marginTop: 12,
            padding: "14px 18px",
            background: "#f8f9fb",
            borderRadius: 8,
            color: "#888",
            fontSize: 13,
            border: "1px dashed #d5dae3",
          }}>
            Add teachers in Step ④ first.
          </div>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 500 }}>
                <thead>
                  <tr>
                    <th style={{
                      padding: "8px 12px",
                      textAlign: "left",
                      fontWeight: 700,
                      fontSize: 12,
                      background: "#1a2b4a",
                      color: "#fff",
                      borderRadius: "6px 0 0 0",
                    }}>
                      Teacher Code
                    </th>
                    <th style={{
                      padding: "8px 12px",
                      textAlign: "left",
                      fontWeight: 700,
                      fontSize: 12,
                      background: "#1a2b4a",
                      color: "#fff",
                    }}>
                      Name
                    </th>
                    <th style={{
                      padding: "8px 12px",
                      textAlign: "center",
                      fontWeight: 700,
                      fontSize: 12,
                      background: "#f1f5ff",
                      color: "#334",
                    }}>
                      Max Theory Hours/Week
                    </th>
                    <th style={{
                      padding: "8px 12px",
                      textAlign: "center",
                      fontWeight: 700,
                      fontSize: 12,
                      background: "#f1f5ff",
                      color: "#334",
                      borderRadius: "0 6px 0 0",
                    }}>
                      Max Practical Hours/Week
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map((t, i) => {
                    const load = teacherLoads[t.code] || { maxTheory: 0, maxPractical: 0 };
                    return (
                      <tr key={t.code} style={{ background: i % 2 === 0 ? "#fafbff" : "#fff" }}>
                        <td style={{
                          padding: "8px 12px",
                          fontWeight: 700,
                          fontSize: 12,
                          fontFamily: "monospace",
                          color: "#667eea",
                        }}>
                          {t.code}
                        </td>
                        <td style={{
                          padding: "8px 12px",
                          fontSize: 13,
                          color: "#445",
                        }}>
                          {t.name}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "center" }}>
                          <input
                            type="number"
                            min="0"
                            value={load.maxTheory}
                            onChange={e => updateLoad(t.code, "maxTheory", e.target.value)}
                            style={{
                              width: 80,
                              padding: "6px 10px",
                              borderRadius: 6,
                              border: "1.5px solid #d0d5dd",
                              fontSize: 13,
                              textAlign: "center",
                            }}
                          />
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "center" }}>
                          <input
                            type="number"
                            min="0"
                            value={load.maxPractical}
                            onChange={e => updateLoad(t.code, "maxPractical", e.target.value)}
                            style={{
                              width: 80,
                              padding: "6px 10px",
                              borderRadius: 6,
                              border: "1.5px solid #d0d5dd",
                              fontSize: 13,
                              textAlign: "center",
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {error && (
              <div style={{ marginTop: 10, color: "#e05c5c", fontSize: 12 }}>
                ⚠️ {error}
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              <button
                onClick={saveLoads}
                disabled={saving}
                style={{
                  padding: "9px 22px",
                  borderRadius: 8,
                  border: "none",
                  cursor: "pointer",
                  background: saveOk ? "#00C9A7" : "#5b8dee",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                {saving ? "Saving…" : saveOk ? "✅ Saved!" : "💾 Save Teacher Loads"}
              </button>
            </div>
          </>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button
          className="card-btn btn-ghost"
          onClick={() => setActiveTab(3)}
        >
          ← Back
        </button>
        <button
          className="card-btn btn-blue"
          style={{ padding: "10px 28px" }}
          onClick={() => setActiveTab(5)}
        >
          Next: Details →
        </button>
      </div>
    </>
  );
}