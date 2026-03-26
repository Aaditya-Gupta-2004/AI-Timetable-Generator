import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { useNavigate } from "react-router-dom";
import Layout from "./Layout";
import * as XLSX from "xlsx";

const API_BASE = "https://ai-timetable-generator-j7qx.onrender.com";
// ... rest of your code

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const DAY_SHORT = { Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu", Friday: "Fri" };
const SLOTS = ["9-10", "10-11", "11-12", "12-1", "1-2", "2-3", "3-4", "4-5"];
const BREAK_SLOT = "1-2";
const ALLOC = SLOTS.filter(s => s !== BREAK_SLOT);
const SLOT_LBL = {
  "9-10": "9:00–10:00", "10-11": "10:00–11:00", "11-12": "11:00–12:00", "12-1": "12:00–1:00",
  "1-2": "1:00–2:00 (BREAK)", "2-3": "2:00–3:00", "3-4": "3:00–4:00", "4-5": "4:00–5:00",
};

const CORE_LAB_TYPES = ["Core Lab 1", "Core Lab 2", "Core Lab 3"];
const isCoreLab = t => CORE_LAB_TYPES.includes(t);

const ELECTIVE_GROUPS = ["Elective 1", "Elective 2", "Elective 3", "Elective 4", "Elective 5"];
const isElectiveType = t => ELECTIVE_GROUPS.includes(t);

const uid = () => Math.random().toString(36).slice(2, 8);
const norm = s => s.trim().toUpperCase();

const getBatches = (div, numBatches) =>
  Array.from({ length: numBatches }, (_, i) => `${div}${i + 1}`);

// ── Auth helpers ──────────────────────────────────────────────────────────────
function authHeaders() {
  const token = localStorage.getItem("token");
  if (!token) throw new Error("Not logged in");
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}
async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || `${res.status}`); }
  return res.json();
}
async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || `${res.status}`); }
  return res.json();
}

// ── Consecutive slot runs ─────────────────────────────────────────────────────
function getConsecRuns() {
  const runs = []; let cur = [0];
  for (let i = 1; i < ALLOC.length; i++) {
    const p = SLOTS.indexOf(ALLOC[i - 1]), c = SLOTS.indexOf(ALLOC[i]);
    if (c - p === 1) cur.push(i); else { runs.push(cur); cur = [i]; }
  }
  runs.push(cur); return runs;
}
const CONSEC_RUNS = getConsecRuns();

function validLabStarts(sz) {
  const s = [];
  for (const run of CONSEC_RUNS) for (let i = 0; i <= run.length - sz; i++) s.push(run[i]);
  return s;
}

function pickRoom(pool, usedCount) {
  if (!pool.length) return "";
  const sorted = [...pool].sort((a, b) => (usedCount[a.number] || 0) - (usedCount[b.number] || 0));
  const chosen = sorted[0];
  usedCount[chosen.number] = (usedCount[chosen.number] || 0) + 1;
  return chosen.number;
}

function buildEmptyGrid() {
  const g = {};
  DAYS.forEach(d => {
    g[d] = {};
    SLOTS.forEach(s => {
      g[d][s] = s === BREAK_SLOT
        ? { subject: "BREAK", teacherCode: "", room: "", batches: null, electives: null }
        : { subject: "", teacherCode: "", room: "", batches: null, electives: null };
    });
  });
  return g;
}

function tryPlaceLabBlock(grid, day, cellData, labSz) {
  for (const si of validLabStarts(labSz)) {
    const cands = ALLOC.slice(si, si + labSz);
    if (cands.every(s => grid[day][s].subject === "")) {
      cands.forEach(s => { grid[day][s] = { ...cellData }; });
      return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX 1: CORE LAB ROTATION ENGINE — properly handles weeklyLabs sessions
//
// For N lab subjects and M batches, each "session" places ALL batches simultaneously
// on the same time slot, with rotation so each batch does a different subject.
// weeklyLabs = how many times per week this entire rotation repeats.
// ─────────────────────────────────────────────────────────────────────────────
function placeLabRotations(grid, labSubjects, div, numBatches, assignments, labPool) {
  if (!labSubjects.length) return;
  const batches = getBatches(div, numBatches);
  const labSz = parseInt(labSubjects[0]?.labHours) || 2;

  // weeklyLabs is per-subject — use the value from first lab subject
  // This is how many rotation sessions happen per week
  const weeklyLabSessions = parseInt(labSubjects[0]?.weeklyLabs) || 1;

  const lUsed = {};
  // Shuffle days so sessions are spread across the week
  const shuffledDays = [...DAYS].sort(() => Math.random() - 0.5);

  for (let sessionIdx = 0; sessionIdx < weeklyLabSessions; sessionIdx++) {
    // Build batch assignments for this session (rotation shifts by sessionIdx)
    const batchAssigns = batches.map((batch, bi) => {
      const subIdx = (bi + sessionIdx) % labSubjects.length;
      const sub = labSubjects[subIdx];
      const a = assignments?.[sub.id] || {};
      return {
        batch,
        teacherCode: a.teacherCode || "",
        room: pickRoom(labPool.length ? labPool : [], lUsed),
        subjectName: sub.name,
        subType: sub.type,
      };
    });

    const cellData = {
      subject: `LAB SESSION ${sessionIdx + 1}`,
      teacherCode: batchAssigns.map(b => b.teacherCode).filter(Boolean).join(", "),
      room: batchAssigns.map(b => b.room).filter(Boolean).join(", "),
      batches: batchAssigns,
      electives: null,
      isLabRotation: true,
    };

    // Try to place on each day (prefer different days per session)
    let placed = false;
    for (const day of shuffledDays) {
      if (tryPlaceLabBlock(grid, day, cellData, labSz)) { placed = true; break; }
    }
    // Fallback: try all days in order
    if (!placed) {
      for (const day of DAYS) {
        if (tryPlaceLabBlock(grid, day, cellData, labSz)) { placed = true; break; }
      }
    }
    // Last resort: try to fit in any available consecutive slot
    if (!placed) {
      for (const day of DAYS) {
        // Try smaller lab size if needed
        for (let sz = labSz; sz >= 1; sz--) {
          if (tryPlaceLabBlock(grid, day, cellData, sz)) { placed = true; break; }
        }
        if (placed) break;
      }
    }
  }
}

// ── Main timetable generator ──────────────────────────────────────────────────
function generateTimetable(subjects, assignments, roomPools, numBatches, div) {
  const grid = buildEmptyGrid();
  const labSubjects = subjects.filter(s => isCoreLab(s.type));
  const theorySubjects = subjects.filter(s => s.type === "theory");
  const electiveSubjects = subjects.filter(s => isElectiveType(s.type));
  const classroomPool = roomPools.theory || [];
  const electivePool = roomPools.elective || [];
  const labPool = roomPools.lab || [];
  const cUsed = {}, eUsed = {};

  // 1. Place lab rotations first (they need consecutive slots)
  placeLabRotations(grid, labSubjects, div, numBatches, assignments, labPool);

  // 2. Place electives (grouped)
  const placedGroups = new Set();
  const electiveGroups = {};
  electiveSubjects.forEach(sub => {
    if (!electiveGroups[sub.type]) electiveGroups[sub.type] = [];
    electiveGroups[sub.type].push(sub);
  });
  electiveSubjects.forEach(sub => {
    if (placedGroups.has(sub.type)) return;
    placedGroups.add(sub.type);
    const groupSubs = electiveGroups[sub.type] || [];
    const sessions = parseInt(groupSubs[0]?.hours) || 1;
    const days = [...DAYS].sort(() => Math.random() - 0.5);
    let rem = sessions;
    for (let p = 0; p < Math.ceil(sessions / DAYS.length) && rem > 0; p++) {
      for (const day of days) {
        if (!rem) break;
        for (const slot of ALLOC) {
          if (grid[day][slot].subject === "") {
            const eRoom = pickRoom(electivePool.length ? electivePool : classroomPool, eUsed);
            const electives = groupSubs.map(gs => {
              const ga = assignments?.[gs.id] || {};
              return { name: gs.name, teacherCode: ga.teacherCode || "", room: eRoom };
            });
            grid[day][slot] = { subject: sub.type, teacherCode: electives.map(e => e.teacherCode).filter(Boolean).join(", "), room: eRoom, batches: null, electives };
            rem--; break;
          }
        }
      }
    }
    let att = 0;
    while (rem > 0 && att < 300) {
      att++;
      const d = DAYS[Math.floor(Math.random() * DAYS.length)], sl = ALLOC[Math.floor(Math.random() * ALLOC.length)];
      if (grid[d][sl].subject === "") {
        const eRoom = pickRoom(electivePool.length ? electivePool : classroomPool, eUsed);
        const electives = groupSubs.map(gs => { const ga = assignments?.[gs.id] || {}; return { name: gs.name, teacherCode: ga.teacherCode || "", room: eRoom }; });
        grid[d][sl] = { subject: sub.type, teacherCode: electives.map(e => e.teacherCode).filter(Boolean).join(", "), room: eRoom, batches: null, electives };
        rem--;
      }
    }
  });

  // 3. Place theory subjects
  theorySubjects.forEach(({ id, name, hours }) => {
    const a = assignments?.[id] || {};
    const tCode = a.teacherCode || "";
    const room = pickRoom(classroomPool, cUsed);
    const sessions = parseInt(hours) || 1;
    const days = [...DAYS].sort(() => Math.random() - 0.5);
    let rem = sessions;
    for (let p = 0; p < Math.ceil(sessions / DAYS.length) && rem > 0; p++) {
      for (const day of days) {
        if (!rem) break;
        for (const slot of ALLOC) {
          if (grid[day][slot].subject === "") { grid[day][slot] = { subject: name, teacherCode: tCode, room, batches: null, electives: null }; rem--; break; }
        }
      }
    }
    let att = 0;
    while (rem > 0 && att < 300) {
      att++;
      const d = DAYS[Math.floor(Math.random() * DAYS.length)], sl = ALLOC[Math.floor(Math.random() * ALLOC.length)];
      if (grid[d][sl].subject === "") { grid[d][sl] = { subject: name, teacherCode: tCode, room, batches: null, electives: null }; rem--; }
    }
  });

  return grid;
}

function buildTeacherTTs(allTimetables, teachers) {
  const res = {};
  teachers.forEach(t => { res[t.code] = {}; DAYS.forEach(d => { res[t.code][d] = {}; SLOTS.forEach(s => { res[t.code][d][s] = []; }); }); });
  Object.entries(allTimetables).forEach(([ybKey, divGrids]) => {
    Object.entries(divGrids).forEach(([div, grid]) => {
      DAYS.forEach(day => {
        SLOTS.forEach(slot => {
          const cell = grid[day][slot];
          if (!cell || cell.subject === "BREAK" || !cell.subject) return;
          if (cell.batches?.length) {
            cell.batches.forEach(b => {
              if (b.teacherCode && res[b.teacherCode])
                res[b.teacherCode][day][slot].push({ subject: b.subjectName || cell.subject, ybLabel: ybKey, div, room: b.room || "", batch: b.batch });
            });
          } else if (cell.electives?.length) {
            cell.electives.forEach(e => {
              if (e.teacherCode && res[e.teacherCode])
                res[e.teacherCode][day][slot].push({ subject: e.name, ybLabel: ybKey, div, room: e.room || "", batch: "" });
            });
          } else {
            (cell.teacherCode || "").split(/[,;]/).map(s => s.trim()).filter(Boolean).forEach(code => {
              if (res[code]) res[code][day][slot].push({ subject: cell.subject, ybLabel: ybKey, div, room: cell.room || "", batch: "" });
            });
          }
        });
      });
    });
  });
  return res;
}

// ── FIX 3: Searchable Teacher Dropdown — renders portal to document.body to avoid overflow:hidden clipping ──
function TeacherSelect({ value, onChange, teachers, placeholder = "— select teacher —" }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 200 });
  const triggerRef = useRef();
  const dropRef = useRef();
  const filtered = teachers.filter(t => `${t.code} ${t.name}`.toLowerCase().includes(search.toLowerCase()));
  const selected = teachers.find(t => t.code === value);

  // Position dropdown relative to trigger button
  const openDropdown = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropPos({
        top: rect.bottom + window.scrollY + 2,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
    setOpen(o => !o);
    setSearch("");
  };

  useEffect(() => {
    if (!open) return;
    const h = e => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        dropRef.current && !dropRef.current.contains(e.target)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  // Render dropdown as portal to avoid table overflow clipping
  const dropdown = open ? (
    <div
      ref={dropRef}
      style={{
        position: "absolute",
        zIndex: 99999,
        top: dropPos.top,
        left: dropPos.left,
        width: dropPos.width,
        background: "#fff",
        border: "1.5px solid #667eea",
        borderRadius: 8,
        boxShadow: "0 8px 32px rgba(102,126,234,.25)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "8px 10px", borderBottom: "1px solid #eee" }}>
        <input
          autoFocus
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search teacher..."
          style={{ ...S.input, padding: "6px 10px", fontSize: 12, border: "1px solid #d0d5dd" }}
          onClick={e => e.stopPropagation()}
        />
      </div>
      <div style={{ maxHeight: 200, overflowY: "auto" }}>
        <div
          onClick={() => { onChange(""); setOpen(false); }}
          style={{ padding: "8px 14px", cursor: "pointer", fontSize: 12, color: "#aaa", borderBottom: "1px solid #f5f5f5" }}
        >
          — none —
        </div>
        {filtered.map(t => (
          <div
            key={t.id}
            onClick={() => { onChange(t.code); setOpen(false); }}
            style={{
              padding: "8px 14px",
              cursor: "pointer",
              fontSize: 12,
              background: value === t.code ? "#f0f2ff" : "transparent",
              borderTop: "1px solid #f5f5f5",
              display: "flex",
              gap: 8,
            }}
            onMouseEnter={e => e.currentTarget.style.background = "#f5f7ff"}
            onMouseLeave={e => e.currentTarget.style.background = value === t.code ? "#f0f2ff" : "transparent"}
          >
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
      <div
        ref={triggerRef}
        onClick={openDropdown}
        style={{
          ...S.input,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          minHeight: 38,
          userSelect: "none",
        }}
      >
        {selected
          ? <span><strong style={{ color: "#667eea", fontFamily: "monospace" }}>{selected.code}</strong> – {selected.name}</span>
          : <span style={{ color: "#999" }}>{placeholder}</span>}
        <span style={{ fontSize: 10, color: "#aaa", marginLeft: 8 }}>{open ? "▲" : "▼"}</span>
      </div>
      {/* Portal: render to body so table overflow doesn't clip */}
      {typeof document !== "undefined" &&
        ReactDOM.createPortal(dropdown, document.body)}
    </>
  );
}

// Since we need ReactDOM for portal, import it at top
// Add this import at the very top of the file: import ReactDOM from "react-dom";

// ── PDF Generator ─────────────────────────────────────────────────────────────
function generatePDF(grid, caption, dept, semLabel, teachers, footerRoles) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) { alert("Please allow popups."); return; }

  const seen = new Set();
  let subjectRows = "";
  let srNo = 1;
  DAYS.forEach(day => SLOTS.forEach(slot => {
    const cell = grid[day]?.[slot];
    if (!cell?.subject || cell.subject === "BREAK") return;
    const key = cell.subject;
    if (seen.has(key)) return;
    seen.add(key);
    if (cell.batches?.length) {
      const shownSubs = new Set();
      cell.batches.forEach(b => {
        if (shownSubs.has(b.subjectName)) return;
        shownSubs.add(b.subjectName);
        const tO = teachers.find(t => t.code === b.teacherCode);
        subjectRows += `<tr><td>${srNo++}</td><td>${b.subjectName}</td><td>${b.batch}</td><td>${b.teacherCode || "—"}</td><td>${tO?.name || "—"}</td><td>${b.room || "—"}</td></tr>`;
      });
    } else if (cell.electives?.length) {
      cell.electives.forEach(e => {
        const tO = teachers.find(t => t.code === e.teacherCode);
        subjectRows += `<tr><td>${srNo++}</td><td>${e.name}</td><td>${cell.subject}</td><td>${e.teacherCode || "—"}</td><td>${tO?.name || "—"}</td><td>${e.room || "—"}</td></tr>`;
      });
    } else {
      const tO = teachers.find(t => t.code === cell.teacherCode);
      subjectRows += `<tr><td>${srNo++}</td><td>${cell.subject}</td><td>—</td><td>${cell.teacherCode || "—"}</td><td>${tO?.name || "—"}</td><td>${cell.room || "—"}</td></tr>`;
    }
  }));

  let gridHTML = "";
  DAYS.forEach(day => {
    let cells = SLOTS.map(slot => {
      const cell = grid[day]?.[slot];
      if (slot === BREAK_SLOT) return `<td class="break-cell">BREAK</td>`;
      if (!cell?.subject) return `<td>—</td>`;
      if (cell.batches?.length) {
        const batchLines = cell.batches.map(b =>
          `<div class="batch-line"><span class="batch-tag">${b.batch}</span> <strong>${b.subjectName}</strong>${b.room ? ` <span class="room-tag">${b.room}</span>` : ""}</div>`
        ).join("");
        return `<td class="lab-cell">${batchLines}</td>`;
      }
      if (cell.electives?.length) {
        return `<td class="elective-cell"><strong>${cell.subject}</strong><br/><small>(${cell.electives.length} opts)</small></td>`;
      }
      return `<td><strong>${cell.subject}</strong>${cell.teacherCode ? `<br/><small class="tc">${cell.teacherCode}</small>` : ""}${cell.room ? `<br/><span class="room-tag">${cell.room}</span>` : ""}</td>`;
    }).join("");
    gridHTML += `<tr><td class="day-cell">${DAY_SHORT[day]}</td>${cells}</tr>`;
  });

  const signBlocks = footerRoles.filter(r => r.role && r.name).map(r =>
    `<div class="sign-block"><div class="sign-label">${r.role}</div><div class="sign-name">${r.name}</div></div>`
  ).join("");

  printWindow.document.write(`
    <!DOCTYPE html><html><head><title>${caption}</title><style>
      @page { size: A3 landscape; margin: 15mm; }
      body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #222; }
      .header { text-align: center; margin-bottom: 12px; }
      .header h2 { margin: 0; font-size: 16px; } .header h3 { margin: 4px 0; font-size: 13px; color: #667eea; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      th, td { border: 1px solid #d0d5dd; padding: 6px 7px; text-align: center; font-size: 10px; vertical-align: top; }
      th { background: #667eea; color: #fff; font-weight: 700; }
      .day-cell { background: #f1f5ff; font-weight: 700; }
      .break-cell { background: #fff3e0; color: #e65100; font-weight: 700; font-style: italic; }
      .lab-cell { background: #e8f5e9; color: #2e7d32; }
      .elective-cell { background: #fffbf0; color: #92400e; }
      .batch-line { margin-bottom: 2px; font-size: 9px; }
      .batch-tag { background: #e9d8fd; color: #553c9a; padding: 1px 4px; border-radius: 3px; font-size: 8px; font-weight: 700; }
      .room-tag { background: #ebf4ff; color: #2c5282; padding: 1px 4px; border-radius: 3px; font-size: 8px; font-weight: 700; }
      .tc { color: #888; font-family: monospace; }
      .footer-signs { display: flex; justify-content: space-between; margin-top: 18px; padding-top: 8px; }
      .sign-block { text-align: center; min-width: 160px; }
      .sign-label { font-size: 10px; font-weight: 700; color: #334; border-top: 1.5px solid #666; padding-top: 4px; margin-top: 32px; }
      .sign-name { font-size: 10px; color: #555; margin-top: 3px; }
      .subject-table th { background: #334; }
    </style></head><body>
      <div class="header"><h2>${dept}</h2><h3>${semLabel}</h3><p>${caption}</p></div>
      <table><thead><tr><th>Day</th>${SLOTS.map(s => `<th>${SLOT_LBL[s]}</th>`).join("")}</tr></thead><tbody>${gridHTML}</tbody></table>
      <table class="subject-table">
        <thead><tr><th>#</th><th>Subject</th><th>Batch/Elective</th><th>Faculty Code</th><th>Faculty Name</th><th>Room/Lab</th></tr></thead>
        <tbody>${subjectRows}</tbody>
      </table>
      <div class="footer-signs">${signBlocks}</div>
    </body></html>
  `);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 500);
}

// ── Timetable display ─────────────────────────────────────────────────────────
function TimetableTable({ grid, caption }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ ...S.table, tableLayout: "fixed" }}>
        <thead>
          <tr><th colSpan={SLOTS.length + 1} style={S.caption}>{caption}</th></tr>
          <tr>
            <th style={{ ...S.th, width: 60 }}>Day / Time</th>
            {SLOTS.map(s => <th key={s} style={{ ...S.th, ...(s === BREAK_SLOT ? S.breakTh : {}), width: 130 }}>{SLOT_LBL[s]}</th>)}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day, di) => (
            <tr key={day} style={{ background: di % 2 === 0 ? "#fafbff" : "#fff" }}>
              <td style={S.dayCell}>{DAY_SHORT[day]}</td>
              {SLOTS.map(slot => {
                const cell = grid[day]?.[slot];
                const val = cell?.subject || "";
                const isLab = cell?.isLabRotation || cell?.batches?.length > 0;
                const isElective = !isLab && cell?.electives?.length > 0;
                const isBreak = slot === BREAK_SLOT;
                return (
                  <td key={slot} style={{ ...S.td, ...(isBreak ? S.breakCell : {}), ...(isLab && !isBreak ? S.labCell : {}), ...(isElective ? S.electiveCell : {}), overflow: "visible" }}>
                    {isBreak ? "BREAK" : (
                      <>
                        {!isLab && !isElective && (
                          <>
                            <div style={{ fontWeight: 600, fontSize: 12 }}>{val || "—"}</div>
                            {cell?.teacherCode && <div style={{ fontSize: 10, color: "#666", marginTop: 2, fontFamily: "monospace" }}>{cell.teacherCode}</div>}
                            {cell?.room && <span style={S.roomBadge}>{cell.room}</span>}
                          </>
                        )}
                        {isElective && (
                          <>
                            <div style={{ fontWeight: 600, fontSize: 12 }}>{val} ({cell.electives.length} opts)</div>
                            {cell.electives.map((e, ei) => (
                              <div key={ei} style={{ marginBottom: 3, padding: "2px 5px", background: "#fffbf0", borderRadius: 4, border: "1px solid #fcd34d", fontSize: 10, marginTop: 3 }}>
                                <div style={{ fontWeight: 700, color: "#92400e" }}>{e.name}</div>
                                {e.teacherCode && <div style={{ fontSize: 9, color: "#666", fontFamily: "monospace" }}>{e.teacherCode}</div>}
                                {e.room && <span style={S.roomBadge}>{e.room}</span>}
                              </div>
                            ))}
                          </>
                        )}
                        {isLab && cell?.batches?.length > 0 && (
                          <div>
                            {cell.batches.map((b, bi) => (
                              <div key={bi} style={{ background: "#f0fff4", padding: "2px 4px", borderRadius: 4, marginBottom: 3, border: "1px solid #c6f6d5" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <span style={S.batchTag}>{b.batch}</span>
                                  <span style={{ fontWeight: 700, fontSize: 10, color: "#276749" }}>{b.subjectName}</span>
                                </div>
                                <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                                  {b.teacherCode && <span style={{ fontSize: 9, color: "#555", fontFamily: "monospace" }}>{b.teacherCode}</span>}
                                  {b.room && <span style={S.roomBadge}>{b.room}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeacherTTTable({ teacherGrid, caption }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={S.table}>
        <thead>
          <tr><th colSpan={SLOTS.length + 1} style={{ ...S.caption, background: "linear-gradient(90deg,#2d6a4f,#40916c)" }}>{caption}</th></tr>
          <tr>
            <th style={S.th}>Day / Time</th>
            {SLOTS.map(s => <th key={s} style={{ ...S.th, ...(s === BREAK_SLOT ? S.breakTh : {}) }}>{SLOT_LBL[s]}</th>)}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day, di) => (
            <tr key={day} style={{ background: di % 2 === 0 ? "#fafbff" : "#fff" }}>
              <td style={S.dayCell}>{DAY_SHORT[day]}</td>
              {SLOTS.map(slot => {
                if (slot === BREAK_SLOT) return <td key={slot} style={{ ...S.td, ...S.breakCell }}>BREAK</td>;
                const items = teacherGrid?.[day]?.[slot] || [];
                return (
                  <td key={slot} style={S.td}>
                    {items.map((it, i) => (
                      <div key={i} style={{ marginBottom: i < items.length - 1 ? 5 : 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 11 }}>{it.subject}</div>
                        <div style={{ fontSize: 10, color: "#888", fontFamily: "monospace" }}>{it.ybLabel}·Div{it.div}{it.batch ? `·${it.batch}` : ""}</div>
                        {it.room && <span style={S.roomBadge}>{it.room}</span>}
                      </div>
                    ))}
                    {!items.length && <span style={{ color: "#ccc" }}>—</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function GenerateTimetable() {
  const navigate = useNavigate();

  // ── Institution info ──────────────────────────────────────────────────────
  const [dept, setDept] = useState("Department of Information Technology");
  const [semLabel, setSemLabel] = useState("EVEN Semester (IV) 2025-2026");

  // ── Year/Branch/Div setup ─────────────────────────────────────────────────
  const [yearInput, setYearInput] = useState("SE");
  const [branchInput, setBranchInput] = useState("");
  const [divInput, setDivInput] = useState("");
  const [batchInput, setBatchInput] = useState("3");
  const [ybError, setYbError] = useState("");
  const [yearBranches, setYearBranches] = useState([]);
  const [ybBatchCount, setYbBatchCount] = useState({});

  // ── Subjects ──────────────────────────────────────────────────────────────
  const [ybSubjects, setYbSubjects] = useState({});
  const [activeSubYbId, setActiveSubYbId] = useState("");
  const [subName, setSubName] = useState("");
  const [subType, setSubType] = useState("theory");
  const [subHours, setSubHours] = useState("");
  const [subLabHours, setSubLabHours] = useState("2");
  const [subWeeklyLabs, setSubWeeklyLabs] = useState("1");
  const [subError, setSubError] = useState("");
  const subNameRef = useRef();
  const getYbSubs = id => ybSubjects[id] || [];

  // ── Rooms ─────────────────────────────────────────────────────────────────
  const [rooms, setRooms] = useState([]);
  const [roomNum, setRoomNum] = useState("");
  const [roomType, setRoomType] = useState("classroom");
  const [roomError, setRoomError] = useState("");
  const [roomAssignMode, setRoomAssignMode] = useState({});
  const [ybRoomConfig, setYbRoomConfig] = useState({});

  // ── Teachers ──────────────────────────────────────────────────────────────
  const [teachers, setTeachers] = useState([]);
  const [tCode, setTCode] = useState("");
  const [tName, setTName] = useState("");
  const [tError, setTError] = useState("");
  const [assignments, setAssignments] = useState({});

  // ── FIX 4: Class Counsellor per Division ─────────────────────────────────
  // divCounsellors: { [ybId]: { [div]: string } }
  const [divCounsellors, setDivCounsellors] = useState({});

  // ── Details / Footer ──────────────────────────────────────────────────────
  // footerRoles: HOD, Principal (+ custom). Class Counsellor is handled per-div separately.
  const [footerRoles, setFooterRoles] = useState([
    { id: "hod", role: "HOD", name: "", locked: true },
    { id: "principal", role: "Principal", name: "", locked: true },
  ]);
  const [cfRole, setCfRole] = useState("");
  const [cfName, setCfName] = useState("");

  // ── Generate / View ───────────────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [allTimetables, setAllTimetables] = useState({});
  const [teacherTTs, setTeacherTTs] = useState({});
  const [viewMode, setViewMode] = useState("division");
  const [activeYbId, setActiveYbId] = useState(null);
  const [activeDiv, setActiveDiv] = useState(null);
  const [activeTeacher, setActiveTeacher] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [apiSuccess, setApiSuccess] = useState(null);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    if (!isCoreLab(subType)) { setSubLabHours("2"); setSubWeeklyLabs("1"); }
  }, [subType]);

  // ── FIX 2: Load saved data including teacher assignments ──────────────────
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    Promise.all([
      apiGet("/teachers").catch(() => []),
      apiGet("/rooms").catch(() => []),
      apiGet("/year-branches").catch(() => []),
    ]).then(async ([teacherData, roomData, ybData]) => {
      if (teacherData.length) setTeachers(teacherData.map(t => ({ id: uid(), code: t.code, name: t.name })));
      if (roomData.length) setRooms(roomData.map(rm => ({ id: uid(), number: rm.number, type: rm.type })));

      if (!ybData.length) return;

      const loadedYBs = ybData.map(yb => ({ id: `${yb.year}-${yb.branch}`, year: yb.year, branch: yb.branch, divs: yb.divs }));
      setYearBranches(loadedYBs);
      setActiveSubYbId(loadedYBs[0].id);

      // Load subjects for each YB
      const subMap = {};
      for (const yb of loadedYBs) {
        try {
          const subs = await apiGet(`/subjects/${encodeURIComponent(yb.id)}`);
          subMap[yb.id] = subs.map(s => ({
            id: uid(), name: s.name, type: s.type,
            hours: s.hours || 0, labHours: s.lab_hours || 2, weeklyLabs: s.weekly_labs || 1
          }));
        } catch { subMap[yb.id] = []; }
      }
      setYbSubjects(subMap);

      // FIX 2: Load saved teacher assignments from backend
      const newAssignments = {};
      const newCounsellors = {};

      for (const yb of loadedYBs) {
        newAssignments[yb.id] = {};
        newCounsellors[yb.id] = {};
        yb.divs.forEach(d => {
          newAssignments[yb.id][d] = {};
          newCounsellors[yb.id][d] = "";
        });

        try {
          const savedAssignments = await apiGet(`/assignments/${encodeURIComponent(yb.id)}`);
          const ybSubs = subMap[yb.id] || [];

          // Map saved assignments back to subject IDs
          Object.entries(savedAssignments).forEach(([div, subMap2]) => {
            if (!newAssignments[yb.id][div]) newAssignments[yb.id][div] = {};
            Object.entries(subMap2).forEach(([subName, assignVal]) => {
              const subObj = ybSubs.find(s => s.name === subName);
              if (subObj) {
                newAssignments[yb.id][div][subObj.id] = {
                  teacherCode: assignVal.teacher_code || ""
                };
              }
            });
          });
        } catch (e) {
          // assignments not available, keep empty
        }
      }

      setAssignments(newAssignments);
      setDivCounsellors(newCounsellors);
    });
  }, []);

  useEffect(() => {
    if (yearBranches.length > 0) {
      const last = yearBranches[yearBranches.length - 1];
      if (!ybSubjects[last.id]) setYbSubjects(p => ({ ...p, [last.id]: [] }));
      if (!activeSubYbId) setActiveSubYbId(last.id);
    }
  }, [yearBranches]);

  const getNumBatches = ybId => ybBatchCount[ybId] || 3;

  const getRoomPools = ybId => {
    const mode = roomAssignMode[ybId] || "auto";
    if (mode === "auto") {
      return {
        theory: rooms.filter(r => r.type === "classroom"),
        elective: rooms.filter(r => r.type === "classroom"),
        lab: rooms.filter(r => r.type === "lab"),
      };
    }
    const config = ybRoomConfig[ybId] || { theory: [], elective: [], lab: [] };
    return {
      theory: rooms.filter(r => (config.theory || []).includes(r.number)),
      elective: rooms.filter(r => (config.elective || []).includes(r.number)),
      lab: rooms.filter(r => (config.lab || []).includes(r.number)),
    };
  };

  // ── ① Setup handlers ──────────────────────────────────────────────────────
  const addYearBranch = async () => {
    setYbError("");
    const year = yearInput.trim().toUpperCase(), branch = branchInput.trim().toUpperCase();
    if (!year || !branch) { setYbError("Year and branch required."); return; }
    const divs = divInput.split(/[\s,]+/).map(norm).filter(Boolean);
    if (!divs.length) { setYbError("Enter at least one division."); return; }
    const numBatches = parseInt(batchInput) || 3;
    if (numBatches < 1 || numBatches > 10) { setYbError("Batch count must be 1–10."); return; }
    const id = `${year}-${branch}`;
    if (yearBranches.find(yb => yb.id === id)) { setYbError(`${id} already added.`); return; }
    try { await apiPost("/year-branches/bulk", [{ year, branch, divs }]); } catch (e) { setYbError(`Save failed: ${e.message}`); return; }
    setYearBranches(p => [...p, { id, year, branch, divs }]);
    setYbBatchCount(p => ({ ...p, [id]: numBatches }));
    const na = {}; divs.forEach(d => { na[d] = {}; });
    setAssignments(p => ({ ...p, [id]: na }));
    // FIX 4: Initialize counsellors for each division
    setDivCounsellors(p => {
      const cur = { ...p };
      cur[id] = {};
      divs.forEach(d => { cur[id][d] = ""; });
      return cur;
    });
    setBranchInput(""); setDivInput(""); setBatchInput("3");
  };

  const removeYB = id => {
    setYearBranches(p => p.filter(yb => yb.id !== id));
    setAssignments(p => { const n = { ...p }; delete n[id]; return n; });
    setYbSubjects(p => { const n = { ...p }; delete n[id]; return n; });
    setYbBatchCount(p => { const n = { ...p }; delete n[id]; return n; });
    setDivCounsellors(p => { const n = { ...p }; delete n[id]; return n; });
    setActiveSubYbId(p => p === id ? "" : p);
  };

  // ── ② Subject handlers ────────────────────────────────────────────────────
  const addSubject = async () => {
    setSubError("");
    if (!activeSubYbId) { setSubError("Select a Year-Branch first."); return; }
    if (!subName.trim()) { setSubError("Enter subject name."); return; }
    const coreLab = isCoreLab(subType);
    if (!coreLab && (!subHours || parseInt(subHours) < 1)) { setSubError("Enter hours/week."); return; }
    if (coreLab && (!subLabHours || !subWeeklyLabs)) { setSubError("Enter lab hours/session and sessions/week."); return; }

    const newSub = {
      id: uid(), name: subName.trim(), type: subType,
      hours: coreLab ? 0 : parseInt(subHours),
      labHours: coreLab ? parseInt(subLabHours) : 0,
      weeklyLabs: coreLab ? parseInt(subWeeklyLabs) : 0,
    };
    const updated = [...getYbSubs(activeSubYbId), newSub];
    try {
      await apiPost("/subjects/bulk", {
        yb_key: activeSubYbId,
        subjects: updated.map(s => ({ name: s.name, type: s.type, hours: s.hours, ...(isCoreLab(s.type) ? { lab_hours: s.labHours } : {}) })),
      });
    } catch (e) { setApiError(`Save subject failed: ${e.message}`); }
    setYbSubjects(p => ({ ...p, [activeSubYbId]: updated }));
    setSubName(""); setSubHours(""); setSubLabHours("2"); setSubWeeklyLabs("1");
    subNameRef.current?.focus();
  };

  const removeSubject = async (ybId, id) => {
    const updated = getYbSubs(ybId).filter(s => s.id !== id);
    try { await apiPost("/subjects/bulk", { yb_key: ybId, subjects: updated.map(s => ({ name: s.name, type: s.type, hours: s.hours, ...(isCoreLab(s.type) ? { lab_hours: s.labHours } : {}) })) }); }
    catch (e) { setApiError(`Remove failed: ${e.message}`); return; }
    setYbSubjects(p => ({ ...p, [ybId]: updated }));
  };

  // ── ③ Room handlers ───────────────────────────────────────────────────────
  const addRoom = async () => {
    setRoomError("");
    const num = roomNum.trim();
    if (!num) { setRoomError("Room number required."); return; }
    if (rooms.find(r => r.number.toLowerCase() === num.toLowerCase())) { setRoomError("Already added."); return; }
    try { await apiPost("/rooms", { number: num, type: roomType }); } catch (e) { setRoomError(`Save failed: ${e.message}`); return; }
    setRooms(p => [...p, { id: uid(), number: num, type: roomType }]);
    setRoomNum("");
  };

  const removeRoom = async id => {
    const room = rooms.find(r => r.id === id);
    if (!room) return;
    try { const token = localStorage.getItem("token"); await fetch(`${API_BASE}/rooms/${encodeURIComponent(room.number)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }); }
    catch (e) { setApiError(`Remove room failed: ${e.message}`); return; }
    setRooms(p => p.filter(r => r.id !== id));
  };

  const toggleRoomInPool = (ybId, poolKey, roomNumber) => {
    setYbRoomConfig(p => {
      const cur = p[ybId] || { theory: [], elective: [], lab: [] };
      const pool = cur[poolKey] || [];
      const updated = pool.includes(roomNumber) ? pool.filter(r => r !== roomNumber) : [...pool, roomNumber];
      return { ...p, [ybId]: { ...cur, [poolKey]: updated } };
    });
  };

  // ── ④ Teacher handlers ────────────────────────────────────────────────────
  const addTeacher = async () => {
    setTError("");
    const code = tCode.trim().toUpperCase(), name = tName.trim();
    if (!code || !name) { setTError("Code and name required."); return; }
    if (teachers.find(t => t.code === code)) { setTError("Code exists."); return; }
    try { await apiPost("/teachers", { code, name }); } catch (e) { setTError(`Save failed: ${e.message}`); return; }
    setTeachers(p => [...p, { id: uid(), code, name }]);
    setTCode(""); setTName("");
  };

  const removeTeacher = async id => {
    const teacher = teachers.find(t => t.id === id);
    if (!teacher) return;
    try { const token = localStorage.getItem("token"); await fetch(`${API_BASE}/teachers/${encodeURIComponent(teacher.code)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }); }
    catch (e) { setApiError(`Remove teacher failed: ${e.message}`); return; }
    setTeachers(p => p.filter(t => t.id !== id));
  };

  const setSubjectTeacher = (ybId, div, subId, teacherCode) =>
    setAssignments(p => ({
      ...p, [ybId]: { ...p[ybId], [div]: { ...p[ybId]?.[div], [subId]: { ...(p[ybId]?.[div]?.[subId] || {}), teacherCode } } }
    }));

  // FIX 4: Set counsellor per division
  const setDivCounsellor = (ybId, div, teacherCode) => {
    setDivCounsellors(p => ({
      ...p,
      [ybId]: { ...(p[ybId] || {}), [div]: teacherCode }
    }));
  };

  // ── ⑤ Footer / Details handlers ───────────────────────────────────────────
  const updateFooterRole = (id, field, value) =>
    setFooterRoles(p => p.map(r => r.id === id ? { ...r, [field]: value } : r));

  const addCustomFooterRole = () => {
    if (!cfRole.trim() || !cfName.trim()) return;
    setFooterRoles(p => [...p, { id: uid(), role: cfRole.trim(), name: cfName.trim() }]);
    setCfRole(""); setCfName("");
  };

  const removeFooterRole = id => setFooterRoles(p => p.filter(r => r.id !== id));

  // Build footer roles for a specific division (includes per-div counsellor)
  const getFooterRolesForDiv = (ybId, div) => {
    const counsellorCode = divCounsellors?.[ybId]?.[div] || "";
    const counsellorTeacher = teachers.find(t => t.code === counsellorCode);
    const counsellorName = counsellorTeacher?.name || counsellorCode || "";

    const roles = [];
    if (counsellorName) {
      roles.push({ id: `cc-${div}`, role: `Class Counsellor (Div ${div})`, name: counsellorName });
    }
    roles.push(...footerRoles);
    return roles;
  };

  // ── Generate ──────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    setApiError(null); setApiSuccess(null);
    if (!yearBranches.length) { setApiError("Add at least one Year/Branch/Division."); return; }
    if (!yearBranches.some(yb => getYbSubs(yb.id).length > 0)) { setApiError("Add subjects for at least one Year-Branch."); return; }
    setGenerating(true);

    const newAllTT = {};
    yearBranches.forEach(yb => {
      const subs = getYbSubs(yb.id);
      if (!subs.length) return;
      newAllTT[yb.id] = {};
      const numBatches = getNumBatches(yb.id);
      const roomPools = getRoomPools(yb.id);
      yb.divs.forEach(div => {
        const divAssign = {};
        subs.forEach(sub => {
          const a = assignments?.[yb.id]?.[div]?.[sub.id] || {};
          divAssign[sub.id] = { teacherCode: a.teacherCode || "" };
        });
        newAllTT[yb.id][div] = generateTimetable(subs, divAssign, roomPools, numBatches, div);
      });
    });

    setAllTimetables(newAllTT);
    setTeacherTTs(buildTeacherTTs(newAllTT, teachers));
    if (yearBranches.length) { setActiveYbId(yearBranches[0].id); setActiveDiv(yearBranches[0].divs[0]); }
    if (teachers.length) setActiveTeacher(teachers[0].code);
    setGenerated(true); setActiveTab(5);

    try {
      await apiPost("/teachers/bulk", teachers.map(t => ({ code: t.code, name: t.name })));
      await apiPost("/rooms/bulk", rooms.map(r => ({ number: r.number, type: r.type })));
      for (const yb of yearBranches) {
        const ybSubs = getYbSubs(yb.id);
        if (!ybSubs.length) continue;
        await apiPost("/subjects/bulk", { yb_key: yb.id, subjects: ybSubs.map(s => ({ name: s.name, type: s.type, hours: s.hours, ...(isCoreLab(s.type) ? { lab_hours: s.labHours } : {}) })) });
        const divA = {};
        yb.divs.forEach(div => {
          divA[div] = {};
          ybSubs.forEach(sub => { const a = assignments?.[yb.id]?.[div]?.[sub.id]; divA[div][sub.name] = { teacher_code: a?.teacherCode || "", room: "" }; });
        });
        const ybTT = {};
        Object.entries(newAllTT[yb.id] || {}).forEach(([div, grid]) => {
          ybTT[div] = {};
          DAYS.forEach(day => {
            ybTT[div][day] = {};
            SLOTS.forEach(slot => {
              const cell = grid[day]?.[slot];
              if (!cell) { ybTT[div][day][slot] = cell; return; }
              ybTT[div][day][slot] = { subject: cell.subject, teacher_code: cell.teacherCode || "", room: cell.room || "", batches: cell.batches ? cell.batches.map(b => ({ batch: b.batch, teacher_code: b.teacherCode || "", room: b.room || "" })) : null };
            });
          });
        });
        await apiPost("/generate", { year: yb.year, branch: yb.branch, divisions: yb.divs, subjects: ybSubs.map(s => ({ name: s.name, type: s.type, hours: s.hours, ...(isCoreLab(s.type) ? { lab_hours: s.labHours } : {}) })), teacher_assignments: divA, timetables: ybTT });
      }
      setApiSuccess("✅ All data saved successfully!");
    } catch (e) { setApiError(`⚠️ Server save failed: ${e.message}`); }
    finally { setGenerating(false); }
  };

  // ── Excel export ──────────────────────────────────────────────────────────
  const buildSheet = (grid, ybLabel, div, ybId) => {
    const activeFooterRoles = getFooterRolesForDiv(ybId, div);
    const aoa = [];
    for (let i = 0; i < 2; i++) aoa.push([]);
    aoa.push([null, null, dept]);
    aoa.push([null, null, `  Time Table ${semLabel}`]);
    aoa.push([null, null, null, null, null, null, null, null, null, null, `${ybLabel}-${div}`]);
    aoa.push([null, null, "Day/Time", ...SLOTS.map(s => SLOT_LBL[s])]);
    aoa.push([]);
    DAYS.forEach(day => {
      const sr = [null, null, DAY_SHORT[day]], tc = [null, null, "Faculty"], rm = [null, null, "Room"];
      SLOTS.forEach(slot => {
        const cell = grid[day]?.[slot];
        if (slot === BREAK_SLOT) { sr.push("BREAK"); tc.push(null); rm.push(null); return; }
        if (cell?.batches?.length) {
          sr.push(cell.batches.map(b => `${b.batch}:${b.subjectName}`).join(" | "));
          tc.push(cell.batches.map(b => `${b.batch}:${b.teacherCode || "—"}`).join(" | "));
          rm.push(cell.batches.map(b => `${b.batch}:${b.room || "—"}`).join(" | "));
        } else if (cell?.electives?.length) {
          sr.push(cell.subject);
          tc.push(cell.electives.map(e => `${e.name}:${e.teacherCode || "—"}`).join(" | "));
          rm.push(cell.electives.map(e => e.room || "—").join(" | "));
        } else {
          sr.push(cell?.subject || "");
          tc.push(cell?.teacherCode || "");
          rm.push(cell?.room || "");
        }
      });
      aoa.push(sr); aoa.push(tc); aoa.push(rm); aoa.push([]);
    });
    aoa.push([]);

    const seen = new Set(); let n = 1;
    aoa.push([null, null, "Sr. No.", "Subject", "Faculty Code", "Faculty Name", "Room/Lab"]);
    DAYS.forEach(day => SLOTS.forEach(slot => {
      const cell = grid[day]?.[slot];
      if (!cell?.subject || cell.subject === "BREAK" || seen.has(cell.subject)) return;
      seen.add(cell.subject);
      if (cell.batches?.length) {
        const shownSubs = new Set();
        cell.batches.forEach(b => {
          if (shownSubs.has(b.subjectName)) return;
          shownSubs.add(b.subjectName);
          const tO = teachers.find(t => t.code === b.teacherCode);
          aoa.push([null, null, n++, b.subjectName, b.teacherCode || "", tO?.name || "", b.room || ""]);
        });
      } else if (cell.electives?.length) {
        cell.electives.forEach(e => { const tO = teachers.find(t => t.code === e.teacherCode); aoa.push([null, null, n++, e.name, e.teacherCode || "", tO?.name || "", e.room || ""]); });
      } else {
        const tO = teachers.find(t => t.code === cell.teacherCode);
        aoa.push([null, null, n++, cell.subject, cell.teacherCode || "", tO?.name || "", cell.room || ""]);
      }
    }));

    aoa.push([]);

    // Footer with per-div counsellor
    const activeRoles = activeFooterRoles.filter(r => r.role && r.name);
    const roleRow = [null, null];
    const nameRow = [null, null];
    activeRoles.forEach((r, i) => {
      if (i > 0) { roleRow.push(null, null); nameRow.push(null, null); }
      roleRow.push(r.role);
      nameRow.push(r.name);
    });
    aoa.push(roleRow);
    aoa.push(nameRow);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 2 }, { wch: 2 }, { wch: 14 }, ...SLOTS.map(() => ({ wch: 24 }))];
    return ws;
  };

  const buildTeacherSheet = code => {
    const tO = teachers.find(t => t.code === code), ttG = teacherTTs[code];
    if (!ttG) return null;
    const aoa = [];
    aoa.push([null, null, dept]);
    aoa.push([null, null, `Teacher Timetable – ${tO?.name || code} (${code})`]);
    aoa.push([null, null, "Day/Time", ...SLOTS.map(s => SLOT_LBL[s])]);
    aoa.push([]);
    DAYS.forEach(day => {
      const row = [null, null, DAY_SHORT[day]];
      SLOTS.forEach(slot => {
        if (slot === BREAK_SLOT) { row.push("BREAK"); return; }
        const items = ttG[day]?.[slot] || [];
        row.push(items.map(it => `${it.subject}(${it.ybLabel}/Div${it.div}${it.batch ? `/${it.batch}` : ""}${it.room ? `[${it.room}]` : ""})`).join(" | "));
      });
      aoa.push(row); aoa.push([]);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 2 }, { wch: 2 }, { wch: 14 }, ...SLOTS.map(() => ({ wch: 26 }))];
    return ws;
  };

  const downloadAll = () => {
    const wb = XLSX.utils.book_new();
    yearBranches.forEach(yb => yb.divs.forEach(div => {
      const grid = allTimetables[yb.id]?.[div];
      if (grid) XLSX.utils.book_append_sheet(wb, buildSheet(grid, yb.id, div, yb.id), `${yb.id}-${div}`.slice(0, 31));
    }));
    teachers.forEach(t => { const ws = buildTeacherSheet(t.code); if (ws) XLSX.utils.book_append_sheet(wb, ws, `T-${t.code.replace(/[/\s]+/g, "_")}`.slice(0, 31)); });
    XLSX.writeFile(wb, `Timetables_${dept.replace(/\s+/g, "_")}.xlsx`);
  };

  const downloadSingle = (ybId, div) => {
    const grid = allTimetables[ybId]?.[div]; if (!grid) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, buildSheet(grid, ybId, div, ybId), `${ybId}-${div}`);
    XLSX.writeFile(wb, `TT_${ybId}_Div${div}.xlsx`);
  };

  // ── Render helpers ────────────────────────────────────────────────────────
  const TABS = ["① Setup", "② Subjects", "③ Rooms", "④ Teachers", "⑤ Details", "⑥ Generate"];
  const currentYB = yearBranches.find(yb => yb.id === activeYbId);
  const classroomPool = rooms.filter(r => r.type === "classroom");
  const labPool = rooms.filter(r => r.type === "lab");

  const getLabSubs = ybId => getYbSubs(ybId).filter(s => isCoreLab(s.type));
  const getTheoryAndElective = ybId => getYbSubs(ybId).filter(s => !isCoreLab(s.type));

  return (
    <Layout>
      <h2 className="page-title" style={{ marginBottom: 4 }}>Generate Timetable</h2>
      {apiError && <div className="banner banner-error" style={{ marginBottom: 14 }}>⚠️ {apiError}</div>}
      {apiSuccess && <div className="banner banner-info" style={{ marginBottom: 14 }}>{apiSuccess}</div>}

      <div style={S.tabBar}>
        {TABS.map((t, i) => (
          <button key={i} onClick={() => setActiveTab(i)} style={{ ...S.tab, ...(activeTab === i ? S.tabActive : {}) }}>{t}</button>
        ))}
      </div>

      {/* ════ TAB 0 — SETUP ════════════════════════════════════════════════ */}
      {activeTab === 0 && (
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
              {!yearBranches.length ? <span style={S.empty}>No Year-Branch added yet</span>
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
      )}

      {/* ════ TAB 1 — SUBJECTS ══════════════════════════════════════════════ */}
      {activeTab === 1 && (
        <>
          {!yearBranches.length && <div style={S.emptyBox}>Add Year-Branch-Divisions in Step ① first.</div>}
          {yearBranches.length > 0 && (
            <>
              <p style={S.hint}>
                <strong>Core Lab 1, 2, 3</strong> are grouped into a rotation schedule — each session, every batch does a different lab. All three share the same time slot.
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

                  {getLabSubs(activeSubYbId).length > 0 && (() => {
                    const labSubs = getLabSubs(activeSubYbId);
                    const nb = getNumBatches(activeSubYbId);
                    const batches = getBatches("A", nb);
                    const maxSessions = Math.max(...labSubs.map(s => s.weeklyLabs || 1));
                    return (
                      <div style={{ marginBottom: 16, padding: "12px 14px", background: "#f0fff4", borderRadius: 8, border: "1px solid #9ae6b4" }}>
                        <div style={{ fontWeight: 700, fontSize: 12, color: "#276749", marginBottom: 8 }}>🔄 Core Lab Rotation Preview (Div A)</div>
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ fontSize: 11, borderCollapse: "collapse" }}>
                            <thead>
                              <tr>
                                <th style={{ padding: "4px 10px", background: "#276749", color: "#fff" }}>Lab Session</th>
                                {batches.map(b => <th key={b} style={{ padding: "4px 10px", background: "#276749", color: "#fff" }}>{b}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {Array.from({ length: maxSessions }, (_, si) => (
                                <tr key={si} style={{ background: si % 2 === 0 ? "#f0fff4" : "#fff" }}>
                                  <td style={{ padding: "4px 10px", fontWeight: 700 }}>Session {si + 1}</td>
                                  {batches.map((b, bi) => {
                                    const subIdx = (bi + si) % labSubs.length;
                                    return <td key={b} style={{ padding: "4px 10px" }}>{labSubs[subIdx]?.name || "—"}</td>;
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div style={{ fontSize: 11, color: "#555", marginTop: 8 }}>
                          {labSubs.map(s => <span key={s.id} style={{ marginRight: 12 }}><strong>{s.name}</strong>: {s.weeklyLabs}×/wk · {s.labHours}hr/session</span>)}
                        </div>
                      </div>
                    );
                  })()}

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 6 }}>
                    <div style={{ flex: 2, minWidth: 160 }}>
                      <label style={S.label}>Subject Name</label>
                      <input ref={subNameRef} type="text" value={subName}
                        onChange={e => { setSubName(e.target.value); setSubError(""); }}
                        onKeyDown={e => e.key === "Enter" && addSubject()} placeholder="e.g. OS, DBMS, SBL-PY"
                        style={{ ...S.input, borderColor: subError ? "#e05c5c" : "#d0d5dd" }} />
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
                        <input type="number" min={1} max={10} value={subHours}
                          onChange={e => { setSubHours(e.target.value); setSubError(""); }}
                          onKeyDown={e => e.key === "Enter" && addSubject()} placeholder="3"
                          style={{ ...S.input, borderColor: subError ? "#e05c5c" : "#d0d5dd" }} />
                      </div>
                    )}
                    {isCoreLab(subType) && (
                      <>
                        <div style={{ flex: "0 0 130px" }}>
                          <label style={S.label}>Lab Hrs / Session</label>
                          <input type="number" min={1} max={6} value={subLabHours}
                            onChange={e => { setSubLabHours(e.target.value); setSubError(""); }}
                            onKeyDown={e => e.key === "Enter" && addSubject()} placeholder="2"
                            style={{ ...S.input, borderColor: "#6c8ebf", background: "#f0f5ff" }} />
                        </div>
                        <div style={{ flex: "0 0 130px" }}>
                          <label style={S.label}>Sessions / Week</label>
                          <input type="number" min={1} max={5} value={subWeeklyLabs}
                            onChange={e => { setSubWeeklyLabs(e.target.value); setSubError(""); }}
                            onKeyDown={e => e.key === "Enter" && addSubject()} placeholder="3"
                            style={{ ...S.input, borderColor: "#6c8ebf", background: "#f0f5ff" }} />
                        </div>
                      </>
                    )}
                    <button className="card-btn btn-teal" style={{ ...S.addBtn, alignSelf: "flex-end" }} onClick={addSubject}>+ Add</button>
                  </div>
                  {subError && <div style={S.ferr}>{subError}</div>}

                  {getYbSubs(activeSubYbId).length > 0 ? (
                    <>
                      {getLabSubs(activeSubYbId).length > 0 && (
                        <div style={{ marginTop: 14, border: "1.5px solid #9ae6b4", borderRadius: 8, overflow: "hidden" }}>
                          <div style={{ background: "#e8f5e9", padding: "8px 14px", fontWeight: 700, fontSize: 12, color: "#276749", display: "flex", alignItems: "center", gap: 8 }}>
                            🔬 Core Lab Group (Rotation)
                            <span style={{ fontSize: 11, fontWeight: 400, color: "#555" }}>— scheduled together with batch rotation</span>
                          </div>
                          <table style={{ ...S.table, border: "none" }}>
                            <thead><tr>{["#", "Subject", "Type", "Lab Hrs/Session", "Sessions/Week", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                            <tbody>
                              {getLabSubs(activeSubYbId).map((s, i) => (
                                <tr key={s.id} style={{ background: i % 2 === 0 ? "#f0fff4" : "#fff" }}>
                                  <td style={S.td}>{i + 1}</td>
                                  <td style={{ ...S.td, fontWeight: 600 }}>{s.name}</td>
                                  <td style={S.td}><span className="chip-teal" style={{ fontSize: 11 }}>{s.type}</span></td>
                                  <td style={S.td}>{s.labHours}</td>
                                  <td style={S.td}>{s.weeklyLabs}</td>
                                  <td style={S.td}><button onClick={() => removeSubject(activeSubYbId, s.id)} style={S.removeBtn}>✕</button></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {getTheoryAndElective(activeSubYbId).length > 0 && (
                        <table style={{ ...S.table, marginTop: 14 }}>
                          <thead><tr>{["#", "Subject", "Type", "Hrs/Week", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                          <tbody>
                            {getTheoryAndElective(activeSubYbId).map((s, i) => (
                              <tr key={s.id} style={{ background: i % 2 === 0 ? "#fafbff" : "#fff" }}>
                                <td style={S.td}>{i + 1}</td>
                                <td style={{ ...S.td, fontWeight: 600 }}>{s.name}</td>
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
      )}

      {/* ════ TAB 2 — ROOMS ════════════════════════════════════════════════ */}
      {activeTab === 2 && (
        <>
          <div className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-header"><span className="panel-title">Define Rooms &amp; Labs</span></div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 6 }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label style={S.label}>Room / Lab Number</label>
                <input type="text" value={roomNum} onChange={e => { setRoomNum(e.target.value); setRoomError(""); }}
                  onKeyDown={e => e.key === "Enter" && addRoom()} placeholder="e.g. 604, 308A"
                  style={{ ...S.input, borderColor: roomError ? "#e05c5c" : "#d0d5dd" }} />
              </div>
              <div style={{ flex: "0 0 220px" }}>
                <label style={S.label}>Room Type</label>
                <select value={roomType} onChange={e => setRoomType(e.target.value)} style={S.input}>
                  <option value="classroom">Classroom (Theory / Elective)</option>
                  <option value="lab">Lab (Core Lab Rotation)</option>
                </select>
              </div>
              <button className="card-btn btn-blue" style={{ ...S.addBtn, alignSelf: "flex-end" }} onClick={addRoom}>+ Add Room</button>
            </div>
            {roomError && <div style={S.ferr}>{roomError}</div>}
            {rooms.length > 0 && (
              <div style={{ display: "flex", gap: 24, marginTop: 16, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ ...S.roomSecHdr, background: "#f0f4ff", borderColor: "#c5d3f5", color: "#3451b2" }}>🏫 Classrooms ({classroomPool.length})</div>
                  {classroomPool.map(r => <div key={r.id} style={S.roomRow}><span style={{ fontWeight: 600, fontFamily: "monospace" }}>{r.number}</span><button onClick={() => removeRoom(r.id)} style={S.removeBtn}>✕</button></div>)}
                  {!classroomPool.length && <div style={{ fontSize: 12, color: "#bbb" }}>None added</div>}
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ ...S.roomSecHdr, background: "#f0fff4", borderColor: "#9ae6b4", color: "#276749" }}>🔬 Labs ({labPool.length})</div>
                  {labPool.map(r => <div key={r.id} style={S.roomRow}><span style={{ fontWeight: 600, fontFamily: "monospace" }}>{r.number}</span><button onClick={() => removeRoom(r.id)} style={S.removeBtn}>✕</button></div>)}
                  {!labPool.length && <div style={{ fontSize: 12, color: "#bbb" }}>None added</div>}
                </div>
              </div>
            )}
            {!rooms.length && <div style={{ ...S.emptyBox, marginTop: 14 }}>No rooms added yet.</div>}
          </div>

          {yearBranches.length > 0 && rooms.length > 0 && (
            <div className="panel" style={{ marginBottom: 20 }}>
              <div className="panel-header"><span className="panel-title">Room Assignment per Year-Branch (Optional)</span></div>
              {yearBranches.map(yb => {
                const mode = roomAssignMode[yb.id] || "auto";
                const config = ybRoomConfig[yb.id] || { theory: [], elective: [], lab: [] };
                return (
                  <div key={yb.id} style={{ marginBottom: 16, border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
                    <div style={{ padding: "10px 14px", background: "#f7f8ff", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid #e2e8f0" }}>
                      <strong>{yb.year}-{yb.branch}</strong>
                      <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1.5px solid #c5d3f5" }}>
                        {["auto", "manual"].map(m => (
                          <button key={m} onClick={() => setRoomAssignMode(p => ({ ...p, [yb.id]: m }))}
                            style={{ padding: "5px 16px", fontSize: 12, border: "none", cursor: "pointer", fontWeight: mode === m ? 700 : 400, background: mode === m ? "#667eea" : "#fff", color: mode === m ? "#fff" : "#667eea" }}>
                            {m === "auto" ? "🤖 Auto" : "✏️ Manual"}
                          </button>
                        ))}
                      </div>
                    </div>
                    {mode === "manual" && (
                      <div style={{ padding: "14px 16px", display: "flex", gap: 16, flexWrap: "wrap" }}>
                        {[{ key: "theory", label: "📚 Theory", pool: classroomPool }, { key: "elective", label: "🎯 Elective", pool: classroomPool }, { key: "lab", label: "🔬 Lab", pool: labPool }].map(({ key, label, pool }) => (
                          <div key={key} style={{ flex: 1, minWidth: 160 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{label}</div>
                            {pool.map(r => (
                              <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 12, cursor: "pointer" }}>
                                <input type="checkbox" checked={(config[key] || []).includes(r.number)} onChange={() => toggleRoomInPool(yb.id, key, r.number)} />
                                <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{r.number}</span>
                              </label>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                    {mode === "auto" && <div style={{ padding: "10px 16px", fontSize: 12, color: "#888" }}>All {classroomPool.length} classroom(s) → theory & electives · All {labPool.length} lab(s) → core lab rotation</div>}
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button className="card-btn btn-ghost" onClick={() => setActiveTab(1)}>← Back</button>
            <button className="card-btn btn-blue" style={{ padding: "10px 28px" }} onClick={() => setActiveTab(3)}>Next: Teachers →</button>
          </div>
        </>
      )}

      {/* ════ TAB 3 — TEACHERS ══════════════════════════════════════════════ */}
      {activeTab === 3 && (
        <>
          <div className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-header"><span className="panel-title">Teacher Directory</span></div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
              <div style={{ flex: "0 0 120px" }}>
                <label style={S.label}>Short Code</label>
                <input type="text" value={tCode} onChange={e => { setTCode(e.target.value.toUpperCase()); setTError(""); }} placeholder="/YM" style={S.input} onKeyDown={e => e.key === "Enter" && addTeacher()} />
              </div>
              <div style={{ flex: 2, minWidth: 200 }}>
                <label style={S.label}>Full Name</label>
                <input type="text" value={tName} onChange={e => { setTName(e.target.value); setTError(""); }} placeholder="Dr. Yogita Mistry" style={S.input} onKeyDown={e => e.key === "Enter" && addTeacher()} />
              </div>
              <button className="card-btn btn-teal" style={{ ...S.addBtn, alignSelf: "flex-end" }} onClick={addTeacher}>+ Add Teacher</button>
            </div>
            {tError && <div style={S.ferr}>{tError}</div>}
            {teachers.length > 0 && (
              <table style={{ ...S.table, marginTop: 12 }}>
                <thead><tr>{["#", "Code", "Full Name", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>{teachers.map((t, i) => (
                  <tr key={t.id} style={{ background: i % 2 === 0 ? "#fafbff" : "#fff" }}>
                    <td style={S.td}>{i + 1}</td>
                    <td style={{ ...S.td, fontFamily: "monospace", fontWeight: 700, color: "#667eea" }}>{t.code}</td>
                    <td style={S.td}>{t.name}</td>
                    <td style={S.td}><button onClick={() => removeTeacher(t.id)} style={S.removeBtn}>✕</button></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            {!teachers.length && <div style={S.emptyBox}>No teachers added yet.</div>}
          </div>

          <div className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-header"><span className="panel-title">Assign Teachers to Subjects</span></div>
            <p style={S.hint}>
              For <strong>Core Lab subjects</strong>, assign the teacher who teaches that lab subject — the rotation ensures each batch gets the right teacher automatically.
            </p>

            {yearBranches.map(yb => {
              const subs = getYbSubs(yb.id);
              if (!subs.length) return null;
              const labSubs = getLabSubs(yb.id);
              const otherSubs = getTheoryAndElective(yb.id);
              return (
                <div key={yb.id} style={{ marginBottom: 28 }}>
                  <div style={S.ybHeader}>
                    <strong>{yb.year}-{yb.branch}</strong>
                    <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>Divs: {yb.divs.join(", ")} · {subs.length} subjects · {getNumBatches(yb.id)} batches</span>
                  </div>

                  {/* Core Lab group */}
                  {labSubs.length > 0 && (
                    <div style={{ marginBottom: 16, border: "1.5px solid #9ae6b4", borderRadius: 8, overflow: "visible" }}>
                      <div style={{ background: "#e8f5e9", padding: "8px 14px", fontWeight: 700, fontSize: 12, color: "#276749" }}>
                        🔬 Core Lab Group — Teacher per Lab Subject
                      </div>
                      <div style={{ padding: "12px 14px", overflow: "visible" }}>
                        {labSubs.map(sub => (
                          <div key={sub.id} style={{ marginBottom: 14 }}>
                            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                              <span style={S.batchTag}>{sub.type}</span> {sub.name}
                              <span style={{ fontSize: 11, color: "#888", fontWeight: 400, marginLeft: 8 }}>{sub.labHours}hr/session · {sub.weeklyLabs}×/wk</span>
                            </div>
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                              {yb.divs.map(div => (
                                <div key={div} style={{ flex: 1, minWidth: 200, position: "relative" }}>
                                  <label style={{ ...S.label, marginBottom: 4 }}>Division {div}</label>
                                  <TeacherSelect
                                    value={assignments?.[yb.id]?.[div]?.[sub.id]?.teacherCode || ""}
                                    onChange={v => setSubjectTeacher(yb.id, div, sub.id, v)}
                                    teachers={teachers}
                                    placeholder="— assign teacher —"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Theory & Electives */}
                  {otherSubs.map(sub => (
                    <div key={sub.id} style={{ marginBottom: 10, border: "1px solid #e2e8f0", borderRadius: 8, overflow: "visible" }}>
                      <div style={{ padding: "8px 14px", background: isElectiveType(sub.type) ? "#fffbf0" : "#f1f5ff", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #e2e8f0" }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{sub.name}</span>
                        <span className={isElectiveType(sub.type) ? "chip-blue" : "chip-pink"} style={{ fontSize: 10 }}>{sub.type}</span>
                      </div>
                      <div style={{ overflow: "visible" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", overflow: "visible" }}>
                          <thead><tr>{yb.divs.map(div => <th key={div} style={{ ...S.th, minWidth: 180 }}>Division {div}</th>)}</tr></thead>
                          <tbody><tr>{yb.divs.map(div => (
                            <td key={div} style={{ ...S.td, padding: 10, verticalAlign: "top", overflow: "visible", position: "relative" }}>
                              <TeacherSelect value={assignments?.[yb.id]?.[div]?.[sub.id]?.teacherCode || ""}
                                onChange={v => setSubjectTeacher(yb.id, div, sub.id, v)} teachers={teachers} />
                            </td>
                          ))}</tr></tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
            {!yearBranches.length && <div style={S.emptyBox}>Add Year-Branch-Divisions in Step ① first.</div>}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button className="card-btn btn-ghost" onClick={() => setActiveTab(2)}>← Back</button>
            <button className="card-btn btn-blue" style={{ padding: "10px 28px" }} onClick={() => setActiveTab(4)}>Next: Details →</button>
          </div>
        </>
      )}

      {/* ════ TAB 4 — DETAILS (Footer Roles + Per-Division Counsellor) ═════ */}
      {activeTab === 4 && (
        <>
          {/* FIX 4: Class Counsellor per Division */}
          {yearBranches.length > 0 && (
            <div className="panel" style={{ marginBottom: 20 }}>
              <div className="panel-header"><span className="panel-title">🎓 Class Counsellors — Per Division</span></div>
              <p style={S.hint}>
                Each division has its own Class Counsellor. Select the assigned teacher for each division below.
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
              {!teachers.length && (
                <div style={S.emptyBox}>Add teachers in Step ④ first to assign counsellors.</div>
              )}
            </div>
          )}

          <div className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-header"><span className="panel-title">Timetable Footer — Signature Roles (Common to All Divisions)</span></div>
            <p style={S.hint}>
              These roles (HOD, Principal, and any custom roles) appear on <strong>all</strong> timetable footers.
              The Class Counsellor above is division-specific and will be added automatically per division.
            </p>

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
              {footerRoles.map(r => (
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
                  <input type="text" value={cfRole} onChange={e => setCfRole(e.target.value)} style={S.input} placeholder="e.g. Lab In-charge, Time Table Incharge" />
                </div>
                <div style={{ flex: 2, minWidth: 200 }}>
                  <label style={S.label}>Name</label>
                  <input type="text" value={cfName} onChange={e => setCfName(e.target.value)} style={S.input} placeholder="e.g. Prof. Rajan Mehta" onKeyDown={e => e.key === "Enter" && addCustomFooterRole()} />
                </div>
                <button className="card-btn btn-teal" style={{ ...S.addBtn, alignSelf: "flex-end" }} onClick={addCustomFooterRole}>+ Add</button>
              </div>
            </div>

            {/* Preview */}
            {(footerRoles.some(r => r.name) || yearBranches.some(yb => yb.divs.some(d => divCounsellors?.[yb.id]?.[d]))) && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#445", marginBottom: 8 }}>
                  Preview (e.g. Division {yearBranches[0]?.divs[0] || "A"}):
                </div>
                <div style={{ display: "flex", gap: 40, padding: "12px 0", borderTop: "2px solid #e2e8f0", flexWrap: "wrap" }}>
                  {yearBranches[0] && (() => {
                    const previewDiv = yearBranches[0].divs[0];
                    const previewRoles = getFooterRolesForDiv(yearBranches[0].id, previewDiv);
                    return previewRoles.filter(r => r.name).map(r => (
                      <div key={r.id} style={{ textAlign: "center", minWidth: 120 }}>
                        <div style={{ height: 28 }}></div>
                        <div style={{ borderTop: "1.5px solid #888", paddingTop: 4 }}>
                          <div style={{ fontWeight: 700, fontSize: 11, color: "#334" }}>{r.role}</div>
                          <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{r.name}</div>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button className="card-btn btn-ghost" onClick={() => setActiveTab(3)}>← Back</button>
            <button className="card-btn btn-blue" style={{ padding: "10px 28px" }} onClick={() => setActiveTab(5)}>Next: Generate →</button>
          </div>
        </>
      )}

      {/* ════ TAB 5 — GENERATE & VIEW ══════════════════════════════════════ */}
      {activeTab === 5 && (
        <>
          {rooms.length > 0 && (
            <div style={{ marginBottom: 16, padding: "10px 14px", background: "#f8f9fb", borderRadius: 8, border: "1px dashed #d5dae3", fontSize: 12, color: "#555" }}>
              <strong>Room pool:</strong> {classroomPool.length} classrooms ({classroomPool.map(r => r.number).join(", ") || "none"}) · {labPool.length} labs ({labPool.map(r => r.number).join(", ") || "none"})
            </div>
          )}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            <button className="card-btn btn-pink" style={{ fontSize: 15, padding: "12px 36px" }} disabled={generating} onClick={handleGenerate}>
              {generating ? "⏳ Generating…" : "⚡ Generate All Timetables"}
            </button>
            {generated && (
              <>
                <button className="card-btn btn-blue" style={{ fontSize: 14, padding: "12px 24px" }} onClick={downloadAll}>⬇ Download All (Excel)</button>
                {activeYbId && activeDiv && allTimetables[activeYbId]?.[activeDiv] && (
                  <button className="card-btn btn-teal" style={{ fontSize: 14, padding: "12px 24px" }}
                    onClick={() => generatePDF(allTimetables[activeYbId][activeDiv], `${activeYbId} / Division ${activeDiv}`, dept, semLabel, teachers, getFooterRolesForDiv(activeYbId, activeDiv))}>
                    📄 Download PDF
                  </button>
                )}
              </>
            )}
          </div>

          {generated && Object.keys(allTimetables).length > 0 && (
            <div className="panel" style={{ marginBottom: 40 }}>
              <div className="panel-header"><span className="panel-title">📋 Generated Timetables</span></div>
              <div style={{ display: "flex", gap: 8, margin: "14px 0 20px", flexWrap: "wrap" }}>
                {["division", "teacher"].map(mode => (
                  <button key={mode} onClick={() => setViewMode(mode)} style={{ ...S.tabBtn, ...(viewMode === mode ? S.tabActive : {}) }}>
                    {mode === "division" ? "📅 Division View" : "👤 Teacher View"}
                  </button>
                ))}
              </div>

              {viewMode === "division" && (
                <>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                    {yearBranches.map(yb => (
                      <button key={yb.id} onClick={() => { setActiveYbId(yb.id); setActiveDiv(yb.divs[0]); }}
                        style={{ ...S.tabBtn, ...(activeYbId === yb.id ? S.tabYBActive : {}) }}>{yb.year}-{yb.branch}</button>
                    ))}
                  </div>
                  {currentYB && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
                      {currentYB.divs.map(div => (
                        <button key={div} onClick={() => setActiveDiv(div)} style={{ ...S.tabBtn, ...(activeDiv === div ? S.tabActive : {}) }}>Division {div}</button>
                      ))}
                    </div>
                  )}
                  {activeYbId && activeDiv && allTimetables[activeYbId]?.[activeDiv] && (
                    <>
                      <TimetableTable grid={allTimetables[activeYbId][activeDiv]}
                        caption={`${dept}  ·  ${semLabel}  ·  ${activeYbId} / Division ${activeDiv}`} />
                      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button className="card-btn btn-teal" style={{ fontSize: 13, padding: "8px 20px" }} onClick={() => downloadSingle(activeYbId, activeDiv)}>
                          ⬇ Excel: {activeYbId} / Div {activeDiv}
                        </button>
                        <button className="card-btn btn-blue" style={{ fontSize: 13, padding: "8px 20px" }}
                          onClick={() => generatePDF(allTimetables[activeYbId][activeDiv], `${activeYbId} / Division ${activeDiv}`, dept, semLabel, teachers, getFooterRolesForDiv(activeYbId, activeDiv))}>
                          📄 PDF: {activeYbId} / Div {activeDiv}
                        </button>
                      </div>
                      {/* Footer preview with per-div counsellor */}
                      {(() => {
                        const previewRoles = getFooterRolesForDiv(activeYbId, activeDiv);
                        return previewRoles.some(r => r.name) ? (
                          <div style={{ marginTop: 16, padding: "12px 14px", background: "#fafbff", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                            <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>Footer for Division {activeDiv}:</div>
                            <div style={{ display: "flex", gap: 40, justifyContent: "flex-start", flexWrap: "wrap" }}>
                              {previewRoles.filter(r => r.name).map(r => (
                                <div key={r.id} style={{ textAlign: "center", minWidth: 100 }}>
                                  <div style={{ height: 20 }}></div>
                                  <div style={{ borderTop: "1.5px solid #888", paddingTop: 3 }}>
                                    <div style={{ fontWeight: 700, fontSize: 10, color: "#334" }}>{r.role}</div>
                                    <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>{r.name}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null;
                      })()}
                    </>
                  )}
                </>
              )}

              {viewMode === "teacher" && (
                <>
                  {!teachers.length ? <div style={S.emptyBox}>No teachers added.</div> : (
                    <>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
                        {teachers.map(t => (
                          <button key={t.id} onClick={() => setActiveTeacher(t.code)}
                            style={{ ...S.tabBtn, ...(activeTeacher === t.code ? S.tabTeacherActive : {}) }}>{t.code}</button>
                        ))}
                      </div>
                      {activeTeacher && teacherTTs[activeTeacher] && (
                        <TeacherTTTable teacherGrid={teacherTTs[activeTeacher]}
                          caption={`Teacher: ${teachers.find(t => t.code === activeTeacher)?.name || activeTeacher} (${activeTeacher})`} />
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}

      <button className="generate-fab" disabled={generating} onClick={handleGenerate}>{generating ? "⏳" : "⚡"}</button>
    </Layout>
  );
}

const S = {
  hint: { color: "#666", fontSize: 13, lineHeight: 1.75, marginBottom: 14 },
  eg: { color: "#999", fontSize: 12 },
  label: { fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 4, display: "block" },
  input: { padding: "9px 12px", borderRadius: 8, border: "1.5px solid #d0d5dd", fontSize: 14, outline: "none", background: "#fafafa", color: "#333", width: "100%", boxSizing: "border-box" },
  addBtn: { padding: "9px 20px", fontSize: 14, whiteSpace: "nowrap" },
  chip: { display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px 4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500, border: "1px solid #d0d5dd", color: "#555" },
  chipX: { background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "inherit", fontSize: 12, opacity: 0.65 },
  empty: { color: "#aaa", fontSize: 13 },
  emptyBox: { marginTop: 12, padding: "14px 18px", background: "#f8f9fb", borderRadius: 8, color: "#888", fontSize: 13, border: "1px dashed #d5dae3" },
  ferr: { color: "#e05c5c", fontSize: 12, marginTop: 5 },
  removeBtn: { background: "none", border: "none", cursor: "pointer", color: "#e05c5c", fontSize: 14, padding: "2px 6px" },
  electiveCell: { background: "#fffbf0", color: "#92400e" },
  roomBadge: { display: "inline-block", marginTop: 2, background: "#ebf4ff", color: "#2c5282", borderRadius: 4, padding: "1px 5px", fontSize: 10, fontWeight: 700, border: "1px solid #bee3f8" },
  roomSecHdr: { padding: "6px 10px", borderRadius: 6, border: "1px solid", fontSize: 12, fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 },
  roomRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 8px", borderBottom: "1px solid #f0f0f0" },
  batchTag: { display: "inline-block", background: "#e9d8fd", color: "#553c9a", borderRadius: 4, padding: "1px 5px", fontSize: 10, fontWeight: 700, border: "1px solid #d6bcfa" },
  ybHeader: { fontSize: 13, fontWeight: 700, color: "#445", background: "#f1f5ff", padding: "8px 14px", borderRadius: 8, marginBottom: 10, display: "flex", alignItems: "center" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13, border: "1px solid #e2e8f0" },
  caption: { background: "linear-gradient(90deg,#667eea,#764ba2)", color: "#fff", padding: "10px 16px", fontSize: 14, fontWeight: 700, textAlign: "left", letterSpacing: 0.3 },
  th: { background: "#f1f5ff", color: "#334", padding: "9px 10px", textAlign: "center", fontWeight: 700, fontSize: 11, borderBottom: "2px solid #d0d9f0", whiteSpace: "nowrap" },
  breakTh: { background: "#fff3e0", color: "#e65100" },
  td: { padding: "8px 10px", textAlign: "center", border: "1px solid #e8ecf5", fontSize: 12, color: "#333", minWidth: 110 },
  dayCell: { padding: "8px 14px", fontWeight: 700, color: "#445", background: "#f7f8ff", borderRight: "2px solid #d0d9f0", fontSize: 12, whiteSpace: "nowrap" },
  breakCell: { background: "#fff3e0", color: "#e65100", fontWeight: 700, fontStyle: "italic" },
  labCell: { background: "#e8f5e9", color: "#2e7d32", fontWeight: 600 },
  tabBar: { display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 20, borderBottom: "2px solid #e8ecf5", paddingBottom: 0 },
  tab: { padding: "9px 18px", fontSize: 13, border: "none", background: "none", cursor: "pointer", color: "#888", fontWeight: 500, borderBottom: "2px solid transparent", marginBottom: -2 },
  tabActive: { color: "#667eea", borderBottomColor: "#667eea", fontWeight: 700 },
  tabBtn: { padding: "7px 16px", fontSize: 13, borderRadius: 20, border: "1.5px solid #c8d5ea", background: "#f0f4ff", color: "#4a6fa5", cursor: "pointer", fontWeight: 500 },
  tabYBActive: { background: "linear-gradient(90deg,#667eea,#764ba2)", color: "#fff", border: "1.5px solid transparent", fontWeight: 700 },
  tabTeacherActive: { background: "linear-gradient(90deg,#2d6a4f,#40916c)", color: "#fff", border: "1.5px solid transparent", fontWeight: 700 },
};