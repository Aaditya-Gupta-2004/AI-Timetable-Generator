import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "./Layout";

const API_BASE = "http://localhost:8000";

const AVATAR_COLORS = [
  ["#FF3B7A","#ff7eb3"],["#667eea","#764ba2"],["#00C9A7","#00a387"],
  ["#f5a623","#f7c56b"],["#e55353","#f5a0a0"],["#5b8dee","#a8c7fa"],
];

function getInitials(name, username) {
  const n = (name || username || "U").trim();
  const parts = n.split(" ").filter(Boolean);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : n[0].toUpperCase();
}

function colorForUser(username) {
  const code = (username || "A").charCodeAt(0);
  const i = (isNaN(code) ? 0 : code) % AVATAR_COLORS.length;
  return AVATAR_COLORS[i] || AVATAR_COLORS[0];
}

// Field must be defined OUTSIDE Settings to prevent re-mount on every keystroke
function Field({ label, field, placeholder, editMode, form, profile, onFormChange }) {
  return (
    <div style={S.fieldWrap}>
      <label style={S.label}>{label}</label>
      {editMode ? (
        <input
          style={S.input}
          value={form[field] || ""}
          placeholder={placeholder || ""}
          onChange={e => onFormChange(field, e.target.value)}
        />
      ) : (
        <div style={S.valueDisplay}>
          {profile[field] || <span style={{ color: "#bbb" }}>Not set</span>}
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const fileRef  = useRef();

  // ── Profile state ─────────────────────────────────────────────────────────
  const [profile, setProfile] = useState({
    username: "", full_name: "", branch: "", job_role: "", qualification: "", avatar: "",
  });
  const [editMode,     setEditMode]     = useState(false);
  const [form,         setForm]         = useState({});
  const [pwForm,       setPwForm]       = useState({ current: "", newPw: "", confirm: "" });
  const [showPwForm,   setShowPwForm]   = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [saveMsg,      setSaveMsg]      = useState(null);   // {type:"ok"|"err", text}
  const [avatarPreview,setAvatarPreview]= useState("");     // data-URL for preview

  // ── Load profile ──────────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { navigate("/login"); return; }
    fetch(`${API_BASE}/profile`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        setProfile(d);
        setForm(d);
        setAvatarPreview(d.avatar || "");
      })
      .catch(() => {});
  }, [navigate]);

  // ── Avatar upload ─────────────────────────────────────────────────────────
  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setSaveMsg({ type: "err", text: "Image must be under 2 MB." }); return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setAvatarPreview(ev.target.result);
      setForm(f => ({ ...f, avatar: ev.target.result }));
    };
    reader.readAsDataURL(file);
  };

  const removeAvatar = () => {
    setAvatarPreview("");
    setForm(f => ({ ...f, avatar: "" }));
  };

  // ── Save profile ──────────────────────────────────────────────────────────
  const saveProfile = async () => {
    setSaving(true); setSaveMsg(null);
    const token = localStorage.getItem("token");

    const payload = {
      full_name:     form.full_name     ?? "",
      branch:        form.branch        ?? "",
      job_role:      form.job_role      ?? "",
      qualification: form.qualification ?? "",
      avatar:        form.avatar        ?? "",
    };
    if (form.username !== profile.username) payload.new_username = form.username;

    try {
      const res  = await fetch(`${API_BASE}/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Save failed");

      // If username changed, store new token
      if (data.access_token) localStorage.setItem("token", data.access_token);
      setProfile({ ...form, username: data.username });
      setAvatarPreview(form.avatar || "");
      setEditMode(false);
      setSaveMsg({ type: "ok", text: "Profile saved successfully!" });
    } catch (err) {
      setSaveMsg({ type: "err", text: err.message });
    } finally {
      setSaving(false);
    }
  };

  // ── Change password ───────────────────────────────────────────────────────
  const changePassword = async () => {
    if (!pwForm.newPw) { setSaveMsg({ type: "err", text: "New password is required." }); return; }
    if (pwForm.newPw !== pwForm.confirm) { setSaveMsg({ type: "err", text: "Passwords do not match." }); return; }
    setSaving(true); setSaveMsg(null);
    const token = localStorage.getItem("token");
    try {
      const res  = await fetch(`${API_BASE}/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ new_password: pwForm.newPw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Password change failed");
      if (data.access_token) localStorage.setItem("token", data.access_token);
      setPwForm({ current: "", newPw: "", confirm: "" });
      setShowPwForm(false);
      setSaveMsg({ type: "ok", text: "Password changed successfully!" });
    } catch (err) {
      setSaveMsg({ type: "err", text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const logout = () => { localStorage.removeItem("token"); navigate("/login"); };
  const avatarColors = colorForUser(profile.username || 'A');
  const grad0 = avatarColors[0];
  const grad1 = avatarColors[1];

  return (
    <Layout>
      <h2 className="page-title" style={{ marginBottom: 4 }}>Settings</h2>

      {/* ── Save / error banner ─────────────────────────────────────────── */}
      {saveMsg && (
        <div className={saveMsg.type === "ok" ? "banner banner-info" : "banner banner-error"}
             style={{ marginBottom: 16 }}>
          {saveMsg.type === "ok" ? "✅" : "⚠️"} {saveMsg.text}
        </div>
      )}

      {/* ══════ PROFILE CARD ══════════════════════════════════════════════ */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-header" style={{ justifyContent: "space-between" }}>
          <span className="panel-title">👤 Profile</span>
          {!editMode
            ? <button style={S.editBtn} onClick={() => { setEditMode(true); setForm({ ...profile }); setSaveMsg(null); }}>✏️ Edit</button>
            : <div style={{ display: "flex", gap: 8 }}>
                <button style={S.cancelBtn} onClick={() => { setEditMode(false); setForm({ ...profile }); setAvatarPreview(profile.avatar||""); }}>Cancel</button>
                <button style={S.saveBtn} onClick={saveProfile} disabled={saving}>{saving ? "Saving…" : "💾 Save"}</button>
              </div>
          }
        </div>

        {/* Avatar + name row */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 24, marginBottom: 24, flexWrap: "wrap" }}>
          {/* Avatar */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div style={{ position: "relative", width: 88, height: 88 }}>
              {avatarPreview ? (
                <img src={avatarPreview} alt="avatar"
                     style={{ width: 88, height: 88, borderRadius: "50%", objectFit: "cover", border: "3px solid #e8ecf5" }} />
              ) : (
                <div style={{ width: 88, height: 88, borderRadius: "50%",
                              background: `linear-gradient(135deg,${grad0},${grad1})`,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              color: "#fff", fontWeight: 700, fontSize: 30, border: "3px solid #e8ecf5" }}>
                  {getInitials(profile.full_name, profile.username)}
                </div>
              )}
            </div>
            {editMode && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
                <button style={S.avatarBtn} onClick={() => fileRef.current.click()}>📷 Upload</button>
                {avatarPreview && <button style={{ ...S.avatarBtn, color: "#e05c5c", borderColor: "#e05c5c" }} onClick={removeAvatar}>✕ Remove</button>}
                <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarChange} />
                <span style={{ fontSize: 10, color: "#aaa" }}>Max 2 MB</span>
              </div>
            )}
          </div>

          {/* Name + role summary */}
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontWeight: 700, fontSize: 20, color: "#1a2b4a", marginBottom: 4 }}>
              {profile.full_name || profile.username || "—"}
            </div>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 3 }}>@{profile.username}</div>
            {profile.job_role && <div style={{ fontSize: 13, color: "#667eea", fontWeight: 600 }}>{profile.job_role}</div>}
            {profile.branch   && <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>{profile.branch}</div>}
            {profile.qualification && <div style={{ fontSize: 12, color: "#999" }}>{profile.qualification}</div>}
          </div>
        </div>

        {/* Fields grid */}
        <div style={S.grid}>
          <Field label="Full Name"     field="full_name"     placeholder="e.g. Aadit Sharma"              editMode={editMode} form={form} profile={profile} onFormChange={(f,v)=>setForm(p=>({...p,[f]:v}))} />
          <Field label="Username"      field="username"      placeholder="e.g. aadit123"                  editMode={editMode} form={form} profile={profile} onFormChange={(f,v)=>setForm(p=>({...p,[f]:v}))} />
          <Field label="Branch"        field="branch"        placeholder="e.g. Information Technology"    editMode={editMode} form={form} profile={profile} onFormChange={(f,v)=>setForm(p=>({...p,[f]:v}))} />
          <Field label="Job Role"      field="job_role"      placeholder="e.g. Timetable Admin"           editMode={editMode} form={form} profile={profile} onFormChange={(f,v)=>setForm(p=>({...p,[f]:v}))} />
          <Field label="Qualification" field="qualification" placeholder="e.g. B.E. Computer Engineering" editMode={editMode} form={form} profile={profile} onFormChange={(f,v)=>setForm(p=>({...p,[f]:v}))} />
        </div>
      </div>

      {/* ══════ PASSWORD ══════════════════════════════════════════════════ */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-header" style={{ justifyContent: "space-between" }}>
          <span className="panel-title">🔒 Password</span>
          {!showPwForm && (
            <button style={S.editBtn} onClick={() => { setShowPwForm(true); setSaveMsg(null); }}>Change Password</button>
          )}
        </div>
        {showPwForm ? (
          <div>
            <div style={S.fieldWrap}>
              <label style={S.label}>New Password</label>
              <input style={S.input} type="password" placeholder="New password"
                     value={pwForm.newPw} onChange={e => setPwForm(f => ({ ...f, newPw: e.target.value }))} />
            </div>
            <div style={S.fieldWrap}>
              <label style={S.label}>Confirm New Password</label>
              <input style={S.input} type="password" placeholder="Repeat new password"
                     value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button style={S.cancelBtn} onClick={() => { setShowPwForm(false); setPwForm({ current:"", newPw:"", confirm:"" }); }}>Cancel</button>
              <button style={S.saveBtn} onClick={changePassword} disabled={saving}>{saving ? "Saving…" : "Update Password"}</button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "#aaa" }}>••••••••••••</div>
        )}
      </div>

      {/* ══════ APP CONFIG (read-only info) ═══════════════════════════════ */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-header"><span className="panel-title">🔧 App Configuration</span></div>
        <div style={S.grid}>
          <div style={S.fieldWrap}>
            <label style={S.label}>Backend URL</label>
            <div style={S.valueDisplay}>{API_BASE}</div>
          </div>
          <div style={S.fieldWrap}>
            <label style={S.label}>Working Days</label>
            <div style={S.valueDisplay}>Monday – Friday</div>
          </div>
          <div style={S.fieldWrap}>
            <label style={S.label}>Break Time</label>
            <div style={S.valueDisplay}>1:00 PM – 2:00 PM (daily)</div>
          </div>
          <div style={S.fieldWrap}>
            <label style={S.label}>Time Slots</label>
            <div style={S.valueDisplay}>9–10, 10–11, 11–12, 12–1, 2–3, 3–4, 4–5</div>
          </div>
        </div>
      </div>

      {/* ══════ DANGER ZONE ═══════════════════════════════════════════════ */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title" style={{ color: "#e05c5c" }}>⚠️ Danger Zone</span>
        </div>
        <button
          style={{ background: "#fff0f4", color: "#e05c5c", border: "1.5px solid #e05c5c",
                   borderRadius: 8, padding: "10px 24px", fontSize: 14, cursor: "pointer",
                   fontWeight: 600 }}
          onClick={logout}
        >
          🚪 Logout
        </button>
      </div>
    </Layout>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  grid:       { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "12px 24px" },
  fieldWrap:  { display: "flex", flexDirection: "column", gap: 4 },
  label:      { fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 0.5 },
  input:      { padding: "9px 12px", borderRadius: 8, border: "1.5px solid #d0d5dd",
                fontSize: 14, outline: "none", background: "#fafafa", color: "#333",
                width: "100%", boxSizing: "border-box" },
  valueDisplay: { fontSize: 14, color: "#1a2b4a", padding: "8px 0", borderBottom: "1px solid #f0f0f0", minHeight: 36 },
  editBtn:    { padding: "7px 16px", fontSize: 13, borderRadius: 8, border: "1.5px solid #667eea",
                background: "#f0f4ff", color: "#667eea", cursor: "pointer", fontWeight: 600 },
  saveBtn:    { padding: "7px 18px", fontSize: 13, borderRadius: 8, border: "none",
                background: "linear-gradient(90deg,#667eea,#764ba2)", color: "#fff",
                cursor: "pointer", fontWeight: 600 },
  cancelBtn:  { padding: "7px 16px", fontSize: 13, borderRadius: 8, border: "1.5px solid #ccc",
                background: "#fff", color: "#666", cursor: "pointer" },
  avatarBtn:  { padding: "5px 14px", fontSize: 12, borderRadius: 6, border: "1.5px solid #667eea",
                background: "#f0f4ff", color: "#667eea", cursor: "pointer", fontWeight: 500 },
};