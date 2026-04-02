import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { S } from "../timetableHelpers";

export default function TeacherSelect({ value, onChange, teachers, placeholder = "— select teacher —" }) {
  const [open, setOpen]       = useState(false);
  const [search, setSearch]   = useState("");
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 200 });
  const triggerRef = useRef();
  const dropRef    = useRef();

  const filtered = teachers.filter(t => `${t.code} ${t.name}`.toLowerCase().includes(search.toLowerCase()));
  const selected  = teachers.find(t => t.code === value);

  const openDropdown = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom + window.scrollY + 2, left: rect.left + window.scrollX, width: rect.width });
    }
    setOpen(o => !o);
    setSearch("");
  };

  useEffect(() => {
    if (!open) return;
    const h = e => {
      if (triggerRef.current && !triggerRef.current.contains(e.target) && dropRef.current && !dropRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const dropdown = open ? (
    <div ref={dropRef} style={{ position: "absolute", zIndex: 99999, top: dropPos.top, left: dropPos.left, width: dropPos.width, background: "#fff", border: "1.5px solid #667eea", borderRadius: 8, boxShadow: "0 8px 32px rgba(102,126,234,.25)", overflow: "hidden" }}>
      <div style={{ padding: "8px 10px", borderBottom: "1px solid #eee" }}>
        <input autoFocus type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search teacher..."
          style={{ ...S.input, padding: "6px 10px", fontSize: 12, border: "1px solid #d0d5dd" }} onClick={e => e.stopPropagation()} />
      </div>
      <div style={{ maxHeight: 200, overflowY: "auto" }}>
        <div onClick={() => { onChange(""); setOpen(false); }} style={{ padding: "8px 14px", cursor: "pointer", fontSize: 12, color: "#aaa", borderBottom: "1px solid #f5f5f5" }}>— none —</div>
        {filtered.map(t => (
          <div key={t.id} onClick={() => { onChange(t.code); setOpen(false); }}
            style={{ padding: "8px 14px", cursor: "pointer", fontSize: 12, background: value === t.code ? "#f0f2ff" : "transparent", borderTop: "1px solid #f5f5f5", display: "flex", gap: 8 }}
            onMouseEnter={e => e.currentTarget.style.background = "#f5f7ff"}
            onMouseLeave={e => e.currentTarget.style.background = value === t.code ? "#f0f2ff" : "transparent"}>
            <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#667eea", minWidth: 60 }}>{t.code}</span>
            <span>{t.name}</span>
          </div>
        ))}
        {!filtered.length && <div style={{ padding: "10px 14px", color: "#bbb", fontSize: 12 }}>No matches</div>}
      </div>
    </div>
  ) : null;

  return (
    <>
      <div ref={triggerRef} onClick={openDropdown}
        style={{ ...S.input, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", minHeight: 38, userSelect: "none" }}>
        {selected
          ? <span><strong style={{ color: "#667eea", fontFamily: "monospace" }}>{selected.code}</strong> – {selected.name}</span>
          : <span style={{ color: "#999" }}>{placeholder}</span>}
        <span style={{ fontSize: 10, color: "#aaa", marginLeft: 8 }}>{open ? "▲" : "▼"}</span>
      </div>
      {typeof document !== "undefined" && ReactDOM.createPortal(dropdown, document.body)}
    </>
  );
}