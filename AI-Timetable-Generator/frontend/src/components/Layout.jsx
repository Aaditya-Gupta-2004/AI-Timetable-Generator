import React, { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";

const API_BASE = "https://ai-timetable-generator-j7qx.onrender.com";

const NAV_ITEMS = [
  { label: "Dashboard",          path: "/dashboard", icon: "🏠" },
  { label: "Generate Timetable", path: "/generate",  icon: "📋" },
  { label: "Preview",            path: "/preview",   icon: "⭐" },
  { label: "Settings",           path: "/settings",  icon: "⚙️" },
];

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; }
  body { font-family: 'DM Sans', sans-serif; background: #e8edf5; }

  /* ── Root layout: full viewport, no overflow ─────────────────────────── */
  .layout-root {
    display: flex;
    height: 100vh;          /* exactly one viewport tall */
    overflow: hidden;       /* prevent the root from ever scrolling */
  }

  /* ── Sidebar: fixed height, never scrolls ────────────────────────────── */
  .sidebar {
    width: 220px;
    height: 100vh;          /* pin to viewport height */
    position: sticky;       /* stays in place as content scrolls */
    top: 0;
    background: #1a2b4a;
    padding: 20px 0;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    transition: width 0.2s ease;
    overflow: hidden;
    z-index: 200;
  }
  .sidebar.collapsed { width: 62px; }
  .sidebar.collapsed .sb-label    { display: none; }
  .sidebar.collapsed .sb-top-text { display: none; }

  .sb-top { display: flex; justify-content: space-between; align-items: center; padding: 0 18px 16px; }
  .sb-hamburger { cursor: pointer; color: #a0b0c8; background: none; border: none; font-size: 20px; width: 30px; height: 30px; border-radius: 6px; display: flex; align-items: center; justify-content: center; transition: background 0.15s; }
  .sb-hamburger:hover { background: rgba(255,255,255,0.1); color: white; }
  .sb-item { display: flex; align-items: center; gap: 12px; padding: 11px 20px; font-size: 14px; color: #a0b0c8; transition: background 0.15s; font-weight: 500; border: none; background: none; width: 100%; text-align: left; font-family: 'DM Sans', sans-serif; white-space: nowrap; text-decoration: none; }
  .sb-item:hover  { background: rgba(255,255,255,0.07); color: white; }
  .sb-item.active { background: #FF3B7A !important; color: white !important; }
  .sb-icon { font-size: 16px; width: 20px; text-align: center; flex-shrink: 0; }

  /* ── Right column: fills remaining width, stacks topnav + scrollable area */
  .layout-right {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: 100vh;          /* same viewport height */
    overflow: hidden;       /* children control their own scroll */
  }

  /* ── Topnav: sticky within layout-right ─────────────────────────────── */
  .topnav {
    background: white;
    display: flex;
    align-items: center;
    padding: 14px 28px;
    gap: 16px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    flex-shrink: 0;         /* never shrink — always visible */
    z-index: 100;
  }
  .brand  { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 18px; color: #1a2b4a; background: none; border: none; font-family: 'DM Sans', sans-serif; cursor: pointer; min-width: 130px; }
  .brand-icon { width: 36px; height: 36px; background: #00C9A7; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; font-size: 13px; flex-shrink: 0; }
  .search-wrap       { flex: 1; }
  .search-wrap-inner { position: relative; display: inline-block; width: 100%; max-width: 420px; }
  .search-input { width: 100%; padding: 9px 18px 9px 40px; border-radius: 50px; border: 2px solid #f0a040; font-size: 14px; font-family: 'DM Sans', sans-serif; outline: none; color: #1a2b4a; background: white; }
  .search-icon  { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #aaa; font-size: 15px; }
  .nav-right    { display: flex; align-items: center; gap: 20px; margin-left: auto; }
  .nav-link-btn { font-size: 14px; color: #555; cursor: pointer; font-weight: 500; background: none; border: none; font-family: 'DM Sans', sans-serif; }
  .nav-link-btn:hover { color: #FF3B7A; }

  /* ── Avatar dropdown ─────────────────────────────────────────────────── */
  .avatar-wrap { position: relative; }
  .nav-avatar  { width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg,#FF3B7A,#ff7eb3); display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 15px; cursor: pointer; user-select: none; transition: box-shadow 0.15s; overflow: hidden; }
  .nav-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .nav-avatar:hover { box-shadow: 0 0 0 3px rgba(255,59,122,0.25); }
  .avatar-dropdown { position: absolute; top: calc(100% + 10px); right: 0; background: white; border-radius: 12px; box-shadow: 0 8px 28px rgba(0,0,0,0.14); min-width: 170px; overflow: hidden; z-index: 300; animation: dropIn 0.15s ease; }
  @keyframes dropIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
  .avatar-dd-header { padding: 14px 16px 10px; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #888; }
  .avatar-dd-header strong { display: block; font-size: 14px; color: #1a2b4a; font-weight: 700; margin-bottom: 2px; }
  .avatar-dd-item { display: flex; align-items: center; gap: 10px; padding: 11px 16px; font-size: 14px; font-weight: 500; color: #333; cursor: pointer; border: none; background: none; width: 100%; text-align: left; font-family: 'DM Sans', sans-serif; transition: background 0.12s; }
  .avatar-dd-item:hover { background: #f7f7f7; }
  .avatar-dd-item.danger { color: #FF3B7A; }
  .avatar-dd-item.danger:hover { background: #fff0f4; }

  /* ── Page scroll area: THIS is the only thing that scrolls ───────────── */
  .page-scroll {
    flex: 1;
    padding: 28px;
    overflow-y: auto;       /* ← only this scrolls */
    display: flex;
    flex-direction: column;
    gap: 22px;
  }

  /* ── Shared page styles ──────────────────────────────────────────────── */
  .page-title  { font-size: 22px; font-weight: 700; color: #1a2b4a; }
  .panel       { background: white; border-radius: 16px; padding: 22px 26px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
  .panel-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
  .panel-title  { font-size: 16px; font-weight: 700; color: #1a2b4a; }
  .panel-dots   { color: #aaa; font-size: 20px; letter-spacing: 2px; }
  .top-cards    { display: grid; grid-template-columns: repeat(3,1fr); gap: 18px; }
  .card         { background: white; border-radius: 16px; padding: 22px 22px 18px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
  .card-title   { font-size: 15px; font-weight: 600; color: #1a2b4a; margin-bottom: 14px; }
  .card-btn     { padding: 10px 22px; border-radius: 8px; border: none; font-size: 14px; font-weight: 600; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: opacity 0.15s; color: white; }
  .card-btn:hover    { opacity: 0.87; }
  .card-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-pink   { background: #FF3B7A; }
  .btn-teal   { background: #00C9A7; }
  .btn-yellow { background: #F5A623; }
  .btn-blue   { background: #5b8dee; }
  .card-accent-pink   { border-top: 4px solid #FF3B7A; }
  .card-accent-teal   { border-top: 4px solid #00C9A7; }
  .card-accent-yellow { border-top: 4px solid #F5A623; }
  .status-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 40px; }
  .status-row  { display: flex; align-items: center; gap: 8px; font-size: 14px; color: #444; font-weight: 500; }
  .status-dot  { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .tt-controls   { display: flex; gap: 10px; align-items: center; margin-bottom: 14px; }
  .tt-badge      { background: #FF3B7A; color: white; border-radius: 6px; padding: 4px 10px; font-size: 12px; font-weight: 700; }
  .tt-select     { padding: 5px 10px; border-radius: 8px; border: 1.5px solid #e0e0e0; font-family: 'DM Sans',sans-serif; font-size: 13px; color: #444; background: white; cursor: pointer; outline: none; }
  .tt-table-wrap { overflow-x: auto; }
  .tt-table      { width: 100%; border-collapse: collapse; min-width: 480px; }
  .tt-table th   { font-size: 12px; font-weight: 600; color: #888; text-align: center; padding: 7px 10px; border-bottom: 1.5px solid #f0f0f0; }
  .tt-table th.slot-col { text-align: left; color: #aaa; font-size: 11px; }
  .tt-table td   { padding: 5px 8px; border: 1px solid #f4f4f4; min-width: 70px; height: 38px; text-align: center; vertical-align: middle; }
  .tt-table td.slot-label { font-size: 11px; color: #bbb; text-align: left; font-weight: 500; width: 48px; }
  .subject-pill  { display: inline-block; padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 700; color: white; white-space: nowrap; }
  .banner        { border-radius: 10px; padding: 12px 18px; font-size: 13px; font-weight: 500; }
  .banner-error  { background: #fff3f5; border: 1.5px solid #FF3B7A; color: #c0003a; }
  .banner-info   { background: #f0faf8; border: 1.5px solid #00C9A7; color: #007a63; }
  .section-label  { font-size: 13px; font-weight: 600; color: #1a2b4a; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 1px solid #f0f0f0; }
  .settings-field { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .settings-label { font-size: 13px; color: #666; width: 140px; flex-shrink: 0; }
  .settings-input { flex: 1; padding: 8px 12px; border-radius: 8px; border: 1.5px solid #e0e0e0; font-size: 13px; font-family: 'DM Sans',sans-serif; color: #1a2b4a; outline: none; }
  .settings-input:focus { border-color: #00C9A7; }
  .chip-box  { background: #f8fafc; border-radius: 10px; padding: 12px 16px; min-height: 72px; border: 1.5px solid #e8edf5; }
  .chip-pink { display: inline-block; background: #fff0f4; color: #c0003a; border-radius: 6px; padding: 4px 12px; font-size: 13px; font-weight: 600; margin: 3px 4px; }
  .chip-teal { display: inline-block; background: #e8fff8; color: #007a63; border-radius: 6px; padding: 4px 12px; font-size: 13px; font-weight: 600; margin: 3px 4px; }
  .chip-blue { display: inline-block; background: #e8f4ff; color: #1a2b4a;  border-radius: 6px; padding: 4px 12px; font-size: 13px; font-weight: 600; margin: 3px 4px; }
  .empty-state { text-align: center; padding: 48px 0; }
  .empty-icon  { font-size: 44px; margin-bottom: 12px; }
  .empty-title { font-size: 16px; font-weight: 600; color: #888; margin-bottom: 6px; }
  .empty-sub   { font-size: 13px; color: #aaa; }
  .link-btn    { background: none; border: none; color: #FF3B7A; font-weight: 600; cursor: pointer; font-size: 13px; font-family: 'DM Sans',sans-serif; padding: 0; text-decoration: underline; }
  .generate-fab { position: fixed; bottom: 32px; right: 32px; background: #FF3B7A; color: white; border: none; border-radius: 50px; padding: 14px 28px; font-size: 15px; font-weight: 700; font-family: 'DM Sans',sans-serif; cursor: pointer; box-shadow: 0 8px 28px rgba(255,59,122,0.4); transition: transform 0.15s, box-shadow 0.15s; z-index: 100; }
  .generate-fab:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(255,59,122,0.5); }
`;

export default function Layout({ children }) {
  const navigate = useNavigate();
  const [username,   setUsername]   = useState("");
  const [avatar,     setAvatarImg]  = useState("");   // base64 from profile
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [collapsed,  setCollapsed]  = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { navigate("/login"); return; }

    // Step 1: verify token — only THIS failure should redirect to login
    fetch(`${API_BASE}/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (!r.ok) {
          localStorage.removeItem("token");
          navigate("/login");
          return null;
        }
        return r.json();
      })
      .then(d => {
        if (!d) return;
        setUsername(d.username);

        // Step 2: load profile for avatar — silently ignore any failure
        fetch(`${API_BASE}/profile`, { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.ok ? r.json() : null)
          .then(p => { if (p && p.avatar) setAvatarImg(p.avatar); })
          .catch(() => {}); // profile not available yet — that's fine
      })
      .catch(() => {
        // Only remove token if /me itself fails (network down etc.)
        localStorage.removeItem("token");
        navigate("/login");
      });
  }, [navigate]);

  const logout = () => { localStorage.removeItem("token"); navigate("/login"); };

  const initials = username ? username[0].toUpperCase() : "U";

  return (
    <>
      <style>{styles}</style>
      <div className="layout-root">

        {/* ── SIDEBAR (fixed height, never scrolls) ────────────────────── */}
        <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
          <div className="sb-top">
            <button
              className="sb-hamburger"
              onClick={() => setCollapsed(c => !c)}
              title={collapsed ? "Expand" : "Collapse"}
            >
              ☰
            </button>
            {!collapsed && <span className="sb-top-text" style={{ fontSize:13, color:"#a0b0c8" }}>Menu</span>}
          </div>

          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `sb-item${isActive ? " active" : ""}`}
              title={collapsed ? item.label : ""}
            >
              <span className="sb-icon">{item.icon}</span>
              <span className="sb-label">{item.label}</span>
            </NavLink>
          ))}
        </aside>

        {/* ── RIGHT COLUMN ─────────────────────────────────────────────── */}
        <div className="layout-right">

          {/* TOPNAV — flex-shrink:0 so it never compresses */}
          <nav className="topnav">
            <button className="brand" onClick={() => navigate("/dashboard")}>
              <div className="brand-icon">Ai</div>
              {!collapsed && "AI Timetable"}
            </button>

            <div className="search-wrap">
              <div className="search-wrap-inner">
                <span className="search-icon">🔍</span>
                <input className="search-input" placeholder="Search…" />
              </div>
            </div>

            <div className="nav-right">
              <div className="avatar-wrap">
                <div className="nav-avatar" onClick={() => setAvatarOpen(o => !o)}>
                  {avatar
                    ? <img src={avatar} alt="avatar" />
                    : initials
                  }
                </div>

                {avatarOpen && (
                  <>
                    <div
                      style={{ position:"fixed", inset:0, zIndex:199 }}
                      onClick={() => setAvatarOpen(false)}
                    />
                    <div className="avatar-dropdown">
                      <div className="avatar-dd-header">
                        <strong>{username}</strong>
                        Logged in
                      </div>
                      <button className="avatar-dd-item" onClick={() => { setAvatarOpen(false); navigate("/settings"); }}>
                        ⚙️ Settings
                      </button>
                      <button className="avatar-dd-item danger" onClick={logout}>
                        🚪 Logout
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </nav>

          {/* PAGE CONTENT — the ONLY scrollable area */}
          <div className="page-scroll">
            {children}
          </div>

        </div>
      </div>
    </>
  );
}