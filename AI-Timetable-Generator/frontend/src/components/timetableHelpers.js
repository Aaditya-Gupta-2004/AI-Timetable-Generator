// ─────────────────────────────────────────────────────────────────────────────
// timetableHelpers.js
// Pure functions, constants, API helpers, PDF generators.
// No React here — safe to import anywhere.
// ─────────────────────────────────────────────────────────────────────────────

export const API_BASE = "https://ai-timetable-generator-j7qx.onrender.com";

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
export const DAY_SHORT = { Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu", Friday: "Fri" };
export const SLOTS = ["9-10", "10-11", "11-12", "12-1", "1-2", "2-3", "3-4", "4-5"];
export const BREAK_SLOT = "1-2";
export const ALLOC = SLOTS.filter(s => s !== BREAK_SLOT);
export const SLOT_LBL = {
  "9-10": "9:00–10:00", "10-11": "10:00–11:00", "11-12": "11:00–12:00", "12-1": "12:00–1:00",
  "1-2": "1:00–2:00 (BREAK)", "2-3": "2:00–3:00", "3-4": "3:00–4:00", "4-5": "4:00–5:00",
};

export const CORE_LAB_TYPES = ["Core Lab 1", "Core Lab 2", "Core Lab 3"];
export const isCoreLab = t => CORE_LAB_TYPES.includes(t);
export const ELECTIVE_GROUPS = ["Elective 1", "Elective 2", "Elective 3", "Elective 4", "Elective 5"];
export const isElectiveType = t => ELECTIVE_GROUPS.includes(t);

export const uid  = () => Math.random().toString(36).slice(2, 8);
export const norm = s  => s.trim().toUpperCase();
export const getBatches = (div, numBatches) =>
  Array.from({ length: numBatches }, (_, i) => `${div}${i + 1}`);

// ── Auth / API ────────────────────────────────────────────────────────────────
export function authHeaders() {
  const token = localStorage.getItem("token");
  if (!token) throw new Error("Not logged in");
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}
export async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || `${res.status}`); }
  return res.json();
}
export async function apiGet(path) {
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
export const CONSEC_RUNS = getConsecRuns();

export function validLabStarts(sz) {
  const s = [];
  for (const run of CONSEC_RUNS) for (let i = 0; i <= run.length - sz; i++) s.push(run[i]);
  return s;
}

export function pickRoom(pool, usedCount) {
  if (!pool.length) return "";
  const sorted = [...pool].sort((a, b) => (usedCount[a.number] || 0) - (usedCount[b.number] || 0));
  const chosen = sorted[0];
  usedCount[chosen.number] = (usedCount[chosen.number] || 0) + 1;
  return chosen.number;
}

export function buildEmptyGrid() {
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

export function tryPlaceLabBlock(grid, day, cellData, labSz, globalLabSlots) {
  for (const si of validLabStarts(labSz)) {
    const cands = ALLOC.slice(si, si + labSz);
    if (!cands.every(s => grid[day][s].subject === "")) continue;
    const slotKey = `${si}_${labSz}`;
    if (globalLabSlots && globalLabSlots[day]?.[slotKey]) continue;
    cands.forEach(s => { grid[day][s] = { ...cellData }; });
    if (globalLabSlots) {
      if (!globalLabSlots[day]) globalLabSlots[day] = {};
      globalLabSlots[day][slotKey] = true;
    }
    return true;
  }
  return false;
}

export function labSessionsOnDay(grid, day, labSz) {
  let count = 0;
  for (const si of validLabStarts(labSz)) {
    const cands = ALLOC.slice(si, si + labSz);
    if (cands.every(s => grid[day][s]?.isLabRotation)) count++;
  }
  return count;
}

export function placeLabRotations(grid, labSubjects, div, numBatches, assignments, labPool, globalLabSlots) {
  if (!labSubjects.length) return;
  const batches = getBatches(div, numBatches);
  const labSz = parseInt(labSubjects[0]?.labHours) || 2;
  const weeklyLabSessions = parseInt(labSubjects[0]?.weeklyLabs) || 1;
  const lUsed = {};
  const shuffledDays = [...DAYS].sort(() => Math.random() - 0.5);

  for (let sessionIdx = 0; sessionIdx < weeklyLabSessions; sessionIdx++) {
    const batchAssigns = batches.map((batch, bi) => {
      const subIdx = (bi + sessionIdx) % labSubjects.length;
      const sub = labSubjects[subIdx];
      const a = assignments?.[sub.id] || {};
      return { batch, teacherCode: a.teacherCode || "", room: pickRoom(labPool.length ? labPool : [], lUsed), subjectName: sub.name, subType: sub.type };
    });
    const cellData = {
      subject: `LAB SESSION ${sessionIdx + 1}`,
      teacherCode: batchAssigns.map(b => b.teacherCode).filter(Boolean).join(", "),
      room: batchAssigns.map(b => b.room).filter(Boolean).join(", "),
      batches: batchAssigns, electives: null, isLabRotation: true,
    };
    let placed = false;
    const daysByLabLoad = [...shuffledDays].sort((a, b) => labSessionsOnDay(grid, a, labSz) - labSessionsOnDay(grid, b, labSz));
    for (const day of daysByLabLoad) {
      if (labSessionsOnDay(grid, day, labSz) >= 2) continue;
      if (tryPlaceLabBlock(grid, day, cellData, labSz, globalLabSlots)) { placed = true; break; }
    }
    if (!placed) for (const day of DAYS) if (tryPlaceLabBlock(grid, day, cellData, labSz, globalLabSlots)) { placed = true; break; }
    if (!placed) for (const day of DAYS) if (tryPlaceLabBlock(grid, day, cellData, labSz, null))          { placed = true; break; }
  }
}

export function generateTimetable(subjects, assignments, roomPools, numBatches, div, globalLabSlots) {
  const grid = buildEmptyGrid();
  const labSubjects     = subjects.filter(s => isCoreLab(s.type));
  const theorySubjects  = subjects.filter(s => s.type === "theory");
  const electiveSubjects= subjects.filter(s => isElectiveType(s.type));
  const classroomPool   = roomPools.theory   || [];
  const electivePool    = roomPools.elective || [];
  const labPool         = roomPools.lab      || [];
  const cUsed = {}, eUsed = {};

  placeLabRotations(grid, labSubjects, div, numBatches, assignments, labPool, globalLabSlots);

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
    const sessions  = parseInt(groupSubs[0]?.hours) || 1;
    const days      = [...DAYS].sort(() => Math.random() - 0.5);
    let rem = sessions;
    for (let p = 0; p < Math.ceil(sessions / DAYS.length) && rem > 0; p++) {
      for (const day of days) {
        if (!rem) break;
        for (const slot of ALLOC) {
          if (grid[day][slot].subject === "") {
            const eRoom    = pickRoom(electivePool.length ? electivePool : classroomPool, eUsed);
            const electives= groupSubs.map(gs => { const ga = assignments?.[gs.id] || {}; return { name: gs.name, teacherCode: ga.teacherCode || "", room: eRoom }; });
            grid[day][slot]= { subject: sub.type, teacherCode: electives.map(e => e.teacherCode).filter(Boolean).join(", "), room: eRoom, batches: null, electives };
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
        const eRoom    = pickRoom(electivePool.length ? electivePool : classroomPool, eUsed);
        const electives= groupSubs.map(gs => { const ga = assignments?.[gs.id] || {}; return { name: gs.name, teacherCode: ga.teacherCode || "", room: eRoom }; });
        grid[d][sl]    = { subject: sub.type, teacherCode: electives.map(e => e.teacherCode).filter(Boolean).join(", "), room: eRoom, batches: null, electives };
        rem--;
      }
    }
  });

  theorySubjects.forEach(({ id, name, hours }) => {
    const a       = assignments?.[id] || {};
    const tCode   = a.teacherCode || "";
    const room    = pickRoom(classroomPool, cUsed);
    const sessions= parseInt(hours) || 1;
    const days    = [...DAYS].sort(() => Math.random() - 0.5);
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

export function buildTeacherTTs(allTimetables, teachers) {
  const res = {};
  teachers.forEach(t => { res[t.code] = {}; DAYS.forEach(d => { res[t.code][d] = {}; SLOTS.forEach(s => { res[t.code][d][s] = []; }); }); });
  Object.entries(allTimetables).forEach(([ybKey, divGrids]) => {
    Object.entries(divGrids).forEach(([div, grid]) => {
      DAYS.forEach(day => {
        SLOTS.forEach(slot => {
          const cell = grid[day][slot];
          if (!cell || cell.subject === "BREAK" || !cell.subject) return;
          if (cell.batches?.length) {
            cell.batches.forEach(b => { if (b.teacherCode && res[b.teacherCode]) res[b.teacherCode][day][slot].push({ subject: b.subjectName || cell.subject, ybLabel: ybKey, div, room: b.room || "", batch: b.batch }); });
          } else if (cell.electives?.length) {
            cell.electives.forEach(e => { if (e.teacherCode && res[e.teacherCode]) res[e.teacherCode][day][slot].push({ subject: e.name, ybLabel: ybKey, div, room: e.room || "", batch: "" }); });
          } else {
            (cell.teacherCode || "").split(/[,;]/).map(s => s.trim()).filter(Boolean).forEach(code => { if (res[code]) res[code][day][slot].push({ subject: cell.subject, ybLabel: ybKey, div, room: cell.room || "", batch: "" }); });
          }
        });
      });
    });
  });
  return res;
}

export function buildLabRoomTTs(allTimetables) {
  const roomTTs = {};
  Object.entries(allTimetables).forEach(([ybKey, divGrids]) => {
    Object.entries(divGrids).forEach(([div, grid]) => {
      DAYS.forEach(day => {
        SLOTS.forEach(slot => {
          const cell = grid[day]?.[slot];
          if (!cell || cell.subject === "BREAK" || !cell.isLabRotation || !cell.batches?.length) return;
          cell.batches.forEach(b => {
            if (!b.room) return;
            if (!roomTTs[b.room]) { roomTTs[b.room] = {}; DAYS.forEach(d => { roomTTs[b.room][d] = {}; SLOTS.forEach(s => { roomTTs[b.room][d][s] = null; }); }); }
            roomTTs[b.room][day][slot] = { batch: b.batch, subjectName: b.subjectName, teacherCode: b.teacherCode, ybLabel: ybKey, div };
          });
        });
      });
    });
  });
  return roomTTs;
}

// ── PDF Generators ────────────────────────────────────────────────────────────
export function generatePDF(grid, caption, dept, semLabel, teachers, footerRoles) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) { alert("Please allow popups."); return; }
  const seen = new Set(); let subjectRows = "", srNo = 1;
  DAYS.forEach(day => SLOTS.forEach(slot => {
    const cell = grid[day]?.[slot];
    if (!cell?.subject || cell.subject === "BREAK" || seen.has(cell.subject)) return;
    seen.add(cell.subject);
    if (cell.batches?.length) {
      const shownSubs = new Set();
      cell.batches.forEach(b => {
        if (shownSubs.has(b.subjectName)) return; shownSubs.add(b.subjectName);
        const tO = teachers.find(t => t.code === b.teacherCode);
        subjectRows += `<tr><td>${srNo++}</td><td>${b.subjectName}</td><td>${b.batch}</td><td>${b.teacherCode||"—"}</td><td>${tO?.name||"—"}</td><td>${b.room||"—"}</td></tr>`;
      });
    } else if (cell.electives?.length) {
      cell.electives.forEach(e => { const tO = teachers.find(t => t.code === e.teacherCode); subjectRows += `<tr><td>${srNo++}</td><td>${e.name}</td><td style="font-style:italic;color:#7c5c00;">${cell.subject}</td><td>${e.teacherCode||"—"}</td><td>${tO?.name||"—"}</td><td>${e.room||"—"}</td></tr>`; });
    } else {
      const tO = teachers.find(t => t.code === cell.teacherCode);
      subjectRows += `<tr><td>${srNo++}</td><td>${cell.subject}</td><td>—</td><td>${cell.teacherCode||"—"}</td><td>${tO?.name||"—"}</td><td>${cell.room||"—"}</td></tr>`;
    }
  }));
  let gridHTML = "";
  DAYS.forEach(day => {
    const cells = SLOTS.map(slot => {
      const cell = grid[day]?.[slot];
      if (slot === BREAK_SLOT) return `<td class="break-cell">BREAK</td>`;
      if (!cell?.subject) return `<td>—</td>`;
      if (cell.batches?.length) {
        return `<td class="lab-cell">${cell.batches.map(b => { const tO = teachers.find(t => t.code === b.teacherCode); return `<div class="batch-line"><span class="batch-tag">${b.batch}</span><strong>${b.subjectName}</strong>${tO?`<span class="tc">${tO.name}</span>`:(b.teacherCode?`<span class="tc">${b.teacherCode}</span>`:"" )}${b.room?`<span class="room-tag">${b.room}</span>`:""}</div>`; }).join("")}</td>`;
      }
      if (cell.electives?.length) {
        return `<td class="elective-cell"><div class="elective-group-label">${cell.subject}</div>${cell.electives.map(e=>`<div class="elective-opt-line"><strong>${e.name}</strong>${e.teacherCode?`<span class="tc">${e.teacherCode}</span>`:""}${e.room?`<span class="room-tag">${e.room}</span>`:""}</div>`).join("")}</td>`;
      }
      return `<td><strong>${cell.subject}</strong>${cell.teacherCode?`<br/><small class="tc">${cell.teacherCode}</small>`:""}${cell.room?`<br/><span class="room-tag">${cell.room}</span>`:""}</td>`;
    }).join("");
    gridHTML += `<tr><td class="day-cell">${DAY_SHORT[day]}</td>${cells}</tr>`;
  });
  const signBlocks = footerRoles.filter(r=>r.role&&r.name).map(r=>`<div class="sign-block"><div class="sign-label">${r.role}</div><div class="sign-name">${r.name}</div></div>`).join("");
  printWindow.document.write(`<!DOCTYPE html><html><head><title>${caption}</title><style>
    @page{size:A3 landscape;margin:15mm;}body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#222;}
    .header{text-align:center;margin-bottom:12px;}.header h2{margin:0;font-size:16px;}.header h3{margin:4px 0;font-size:13px;color:#667eea;}
    table{width:100%;border-collapse:collapse;margin-bottom:16px;}th,td{border:1px solid #d0d5dd;padding:6px 7px;text-align:center;font-size:10px;vertical-align:top;}
    th{background:#667eea;color:#fff;font-weight:700;}.day-cell{background:#f1f5ff;font-weight:700;}.break-cell{background:#fff3e0;color:#e65100;font-weight:700;font-style:italic;}
    .lab-cell{background:#e8f5e9;color:#2e7d32;text-align:left;}.elective-cell{background:#fffbf0;color:#92400e;text-align:left;}
    .elective-group-label{font-weight:700;font-size:9px;color:#b45309;border-bottom:1px solid #fcd34d;padding-bottom:2px;margin-bottom:3px;text-transform:uppercase;}
    .elective-opt-line{margin-bottom:3px;padding:2px 4px;background:rgba(252,211,77,0.15);border-radius:3px;font-size:9px;}
    .batch-line{margin-bottom:4px;font-size:9px;display:flex;align-items:flex-start;flex-wrap:wrap;gap:3px;}
    .batch-tag{background:#e9d8fd;color:#553c9a;padding:1px 4px;border-radius:3px;font-size:8px;font-weight:700;}
    .room-tag{background:#ebf4ff;color:#2c5282;padding:1px 4px;border-radius:3px;font-size:8px;font-weight:700;}.tc{color:#666;font-family:monospace;font-size:8px;}
    .footer-signs{display:flex;justify-content:space-between;margin-top:18px;padding-top:8px;}.sign-block{text-align:center;min-width:160px;}
    .sign-label{font-size:10px;font-weight:700;color:#334;border-top:1.5px solid #666;padding-top:4px;margin-top:32px;}.sign-name{font-size:10px;color:#555;margin-top:3px;}
    .subject-table th{background:#334;}
  </style></head><body>
    <div class="header"><h2>${dept}</h2><h3>${semLabel}</h3><p>${caption}</p></div>
    <table><thead><tr><th>Day</th>${SLOTS.map(s=>`<th>${SLOT_LBL[s]}</th>`).join("")}</tr></thead><tbody>${gridHTML}</tbody></table>
    <table class="subject-table"><thead><tr><th>#</th><th>Subject</th><th>Batch/Elective Group</th><th>Faculty Code</th><th>Faculty Name</th><th>Room/Lab</th></tr></thead><tbody>${subjectRows}</tbody></table>
    <div class="footer-signs">${signBlocks}</div>
  </body></html>`);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 500);
}

export function generateLabRoomPDF(roomNumber, roomGrid, dept, semLabel, teachers) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) { alert("Please allow popups."); return; }
  let gridHTML = "";
  DAYS.forEach(day => {
    const cells = SLOTS.map(slot => {
      if (slot === BREAK_SLOT) return `<td class="break-cell">BREAK</td>`;
      const entry = roomGrid[day]?.[slot];
      if (!entry) return `<td style="color:#ccc;">—</td>`;
      const tO = teachers.find(t => t.code === entry.teacherCode);
      return `<td class="lab-cell"><span class="batch-tag">${entry.batch}</span><strong style="display:block;margin-top:3px;">${entry.subjectName}</strong>${tO?`<span class="tc">${tO.name}</span>`:(entry.teacherCode?`<span class="tc">${entry.teacherCode}</span>`:""  )}<br/><span style="font-size:8px;color:#888;">${entry.ybLabel} / Div ${entry.div}</span></td>`;
    }).join("");
    gridHTML += `<tr><td class="day-cell">${DAY_SHORT[day]}</td>${cells}</tr>`;
  });
  printWindow.document.write(`<!DOCTYPE html><html><head><title>Lab Room ${roomNumber}</title><style>
    @page{size:A3 landscape;margin:15mm;}body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#222;}
    .header{text-align:center;margin-bottom:12px;}.header h2{margin:0;font-size:16px;}.header h3{margin:4px 0;font-size:13px;color:#276749;}
    table{width:100%;border-collapse:collapse;margin-bottom:16px;}th,td{border:1px solid #d0d5dd;padding:7px 8px;text-align:center;font-size:10px;vertical-align:top;}
    th{background:#276749;color:#fff;font-weight:700;}.day-cell{background:#f0fff4;font-weight:700;color:#276749;}
    .break-cell{background:#fff3e0;color:#e65100;font-weight:700;font-style:italic;}.lab-cell{background:#f0fff4;color:#276749;text-align:left;padding:6px 8px;}
    .batch-tag{background:#e9d8fd;color:#553c9a;padding:1px 5px;border-radius:3px;font-size:9px;font-weight:700;}.tc{color:#555;font-family:monospace;font-size:9px;}
  </style></head><body>
    <div class="header"><h2>${dept}</h2><h3>Lab Room Timetable — ${roomNumber}</h3><p>${semLabel}</p></div>
    <table><thead><tr><th>Day</th>${SLOTS.map(s=>`<th>${SLOT_LBL[s]}</th>`).join("")}</tr></thead><tbody>${gridHTML}</tbody></table>
  </body></html>`);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 500);
}

// ── Shared styles ─────────────────────────────────────────────────────────────
export const S = {
  hint:        { color: "#666", fontSize: 13, lineHeight: 1.75, marginBottom: 14 },
  eg:          { color: "#999", fontSize: 12 },
  label:       { fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 4, display: "block" },
  input:       { padding: "9px 12px", borderRadius: 8, border: "1.5px solid #d0d5dd", fontSize: 14, outline: "none", background: "#fafafa", color: "#333", width: "100%", boxSizing: "border-box" },
  addBtn:      { padding: "9px 20px", fontSize: 14, whiteSpace: "nowrap" },
  chip:        { display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px 4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500, border: "1px solid #d0d5dd", color: "#555" },
  chipX:       { background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "inherit", fontSize: 12, opacity: 0.65 },
  empty:       { color: "#aaa", fontSize: 13 },
  emptyBox:    { marginTop: 12, padding: "14px 18px", background: "#f8f9fb", borderRadius: 8, color: "#888", fontSize: 13, border: "1px dashed #d5dae3" },
  ferr:        { color: "#e05c5c", fontSize: 12, marginTop: 5 },
  removeBtn:   { background: "none", border: "none", cursor: "pointer", color: "#e05c5c", fontSize: 14, padding: "2px 6px" },
  electiveCell:{ background: "#fffbf0", color: "#92400e" },
  roomBadge:   { display: "inline-block", marginTop: 2, background: "#ebf4ff", color: "#2c5282", borderRadius: 4, padding: "1px 5px", fontSize: 10, fontWeight: 700, border: "1px solid #bee3f8" },
  roomSecHdr:  { padding: "6px 10px", borderRadius: 6, border: "1px solid", fontSize: 12, fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 },
  roomRow:     { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 8px", borderBottom: "1px solid #f0f0f0" },
  batchTag:    { display: "inline-block", background: "#e9d8fd", color: "#553c9a", borderRadius: 4, padding: "1px 5px", fontSize: 10, fontWeight: 700, border: "1px solid #d6bcfa" },
  ybHeader:    { fontSize: 13, fontWeight: 700, color: "#445", background: "#f1f5ff", padding: "8px 14px", borderRadius: 8, marginBottom: 10, display: "flex", alignItems: "center" },
  table:       { width: "100%", borderCollapse: "collapse", fontSize: 13, border: "1px solid #e2e8f0" },
  caption:     { background: "linear-gradient(90deg,#667eea,#764ba2)", color: "#fff", padding: "10px 16px", fontSize: 14, fontWeight: 700, textAlign: "left", letterSpacing: 0.3 },
  th:          { background: "#f1f5ff", color: "#334", padding: "9px 10px", textAlign: "center", fontWeight: 700, fontSize: 11, borderBottom: "2px solid #d0d9f0", whiteSpace: "nowrap" },
  breakTh:     { background: "#fff3e0", color: "#e65100" },
  td:          { padding: "8px 10px", textAlign: "center", border: "1px solid #e8ecf5", fontSize: 12, color: "#333", minWidth: 110 },
  dayCell:     { padding: "8px 14px", fontWeight: 700, color: "#445", background: "#f7f8ff", borderRight: "2px solid #d0d9f0", fontSize: 12, whiteSpace: "nowrap" },
  breakCell:   { background: "#fff3e0", color: "#e65100", fontWeight: 700, fontStyle: "italic" },
  labCell:     { background: "#e8f5e9", color: "#2e7d32", fontWeight: 600 },
  tabBar:      { display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 20, borderBottom: "2px solid #e8ecf5", paddingBottom: 0 },
  tab:         { padding: "9px 18px", fontSize: 13, border: "none", background: "none", cursor: "pointer", color: "#888", fontWeight: 500, borderBottom: "2px solid transparent", marginBottom: -2 },
  tabActive:   { color: "#667eea", borderBottomColor: "#667eea", fontWeight: 700 },
  tabBtn:      { padding: "7px 16px", fontSize: 13, borderRadius: 20, border: "1.5px solid #c8d5ea", background: "#f0f4ff", color: "#4a6fa5", cursor: "pointer", fontWeight: 500 },
  tabYBActive: { background: "linear-gradient(90deg,#667eea,#764ba2)", color: "#fff", border: "1.5px solid transparent", fontWeight: 700 },
  tabTeacherActive: { background: "linear-gradient(90deg,#2d6a4f,#40916c)", color: "#fff", border: "1.5px solid transparent", fontWeight: 700 },
  tabLabActive:     { background: "linear-gradient(90deg,#276749,#38a169)", color: "#fff", border: "1.5px solid transparent", fontWeight: 700 },
  tabLabRoomActive: { background: "linear-gradient(90deg,#276749,#38a169)", color: "#fff", border: "1.5px solid transparent", fontWeight: 700 },
};