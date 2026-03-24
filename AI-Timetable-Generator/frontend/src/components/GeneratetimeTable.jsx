import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "./Layout";
import * as XLSX from "xlsx";

const API_BASE = "https://ai-timetable-generator-j7qx.onrender.com";

const DAYS       = ["Monday","Tuesday","Wednesday","Thursday","Friday"];
const DAY_SHORT  = { Monday:"Mon",Tuesday:"Tue",Wednesday:"Wed",Thursday:"Thu",Friday:"Fri" };
const SLOTS      = ["9-10","10-11","11-12","12-1","1-2","2-3","3-4","4-5"];
const BREAK_SLOT = "1-2";
const ALLOC      = SLOTS.filter(s => s !== BREAK_SLOT);
const SLOT_LBL   = {
  "9-10":"9:00–10:00","10-11":"10:00–11:00","11-12":"11:00–12:00","12-1":"12:00–1:00",
  "1-2":"1:00–2:00 (BREAK)","2-3":"2:00–3:00","3-4":"3:00–4:00","4-5":"4:00–5:00",
};

const NUM_BATCHES    = 3;
const ELECTIVE_GROUPS = ["Elective 1","Elective 2","Elective 3","Elective 4","Elective 5"];
const isElectiveType  = (t) => ELECTIVE_GROUPS.includes(t);

const uid      = () => Math.random().toString(36).slice(2, 8);
const norm     = s  => s.trim().toUpperCase();
const getBatches = (div) => Array.from({ length:NUM_BATCHES }, (_,i) => `${div}${i+1}`);

// ── Auth header helper ────────────────────────────────────────────────────────
function authHeaders() {
  const token = localStorage.getItem("token");
  if (!token) throw new Error("Not logged in");
  return { "Content-Type":"application/json", Authorization:`Bearer ${token}` };
}

// ── API helpers (throws on non-ok so callers can catch and show the error) ───
async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method:"POST", headers:authHeaders(), body:JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers:authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

// ── Consecutive-run helpers ───────────────────────────────────────────────────
function getConsecRuns() {
  const runs = []; let cur = [0];
  for (let i = 1; i < ALLOC.length; i++) {
    const p = SLOTS.indexOf(ALLOC[i-1]), c = SLOTS.indexOf(ALLOC[i]);
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
  const sorted = [...pool].sort((a,b) => (usedCount[a.number]||0) - (usedCount[b.number]||0));
  const chosen = sorted[0];
  usedCount[chosen.number] = (usedCount[chosen.number]||0) + 1;
  return chosen.number;
}

function buildEmptyGrid() {
  const g = {};
  DAYS.forEach(d => {
    g[d] = {};
    SLOTS.forEach(s => {
      g[d][s] = s === BREAK_SLOT
        ? { subject:"BREAK", teacherCode:"", room:"", batches:null, electives:null }
        : { subject:"",      teacherCode:"", room:"", batches:null, electives:null };
    });
  });
  return g;
}

function tryPlaceLabOnDay(grid, day, name, labSz, batchAssigns) {
  for (const si of validLabStarts(labSz)) {
    const cands = ALLOC.slice(si, si + labSz);
    if (cands.every(s => grid[day][s].subject === "")) {
      cands.forEach(s => {
        grid[day][s] = {
          subject:     `${name} LAB`,
          teacherCode: batchAssigns.map(b=>b.teacherCode).filter(Boolean).join(", "),
          room:        batchAssigns.map(b=>b.room).filter(Boolean).join(", "),
          batches:     batchAssigns,
          electives:   null,
        };
      });
      return true;
    }
  }
  return false;
}

function generateClientTimetable(subjects, assignments) {
  const grid = buildEmptyGrid();
  const sorted = [...subjects].sort((a,b) => {
    const rank = t => t==="core_lab"?0:isElectiveType(t)?1:2;
    return rank(a.type) - rank(b.type);
  });
  const electiveGroups = {};
  sorted.forEach(sub => {
    if (isElectiveType(sub.type)) {
      if (!electiveGroups[sub.type]) electiveGroups[sub.type] = [];
      electiveGroups[sub.type].push(sub);
    }
  });
  const placedGroups = new Set();

  sorted.forEach(({ id, name, type, hours, labHours }) => {
    const assign       = assignments?.[id] || {};
    const tCode        = assign.teacherCode || "";
    const room         = assign.room || "";
    const batchAssigns = assign.batchAssigns || [];
    const labSz        = parseInt(labHours) || 2;
    const sessions     = parseInt(hours) || 1;

    if (type === "core_lab") {
      const days = [...DAYS].sort(() => Math.random() - .5);
      let placed = 0;
      for (const day of days) {
        if (placed >= sessions) break;
        if (tryPlaceLabOnDay(grid, day, name, labSz, batchAssigns)) placed++;
      }
      let att = 0;
      while (placed < sessions && att < 200) {
        att++;
        if (tryPlaceLabOnDay(grid, DAYS[Math.floor(Math.random()*DAYS.length)], name, labSz, batchAssigns)) placed++;
      }
    } else if (isElectiveType(type)) {
      if (placedGroups.has(type)) return;
      placedGroups.add(type);
      const groupSubs     = electiveGroups[type] || [];
      const groupSessions = parseInt(groupSubs[0]?.hours) || 1;
      const days = [...DAYS].sort(() => Math.random() - .5);
      let rem = groupSessions;
      for (let p = 0; p < Math.ceil(groupSessions/DAYS.length) && rem > 0; p++) {
        for (const day of days) {
          if (!rem) break;
          for (const slot of ALLOC) {
            if (grid[day][slot].subject === "") {
              const electives = groupSubs.map(gs => {
                const ga = assignments?.[gs.id] || {};
                return { name:gs.name, teacherCode:ga.teacherCode||"", room:ga.room||"" };
              });
              grid[day][slot] = {
                subject:     type,
                teacherCode: electives.map(e=>e.teacherCode).filter(Boolean).join(", "),
                room:        electives.map(e=>e.room).filter(Boolean).join(", "),
                batches:     null,
                electives,
              };
              rem--; break;
            }
          }
        }
      }
      let att = 0;
      while (rem > 0 && att < 300) {
        att++;
        const d = DAYS[Math.floor(Math.random()*DAYS.length)], sl = ALLOC[Math.floor(Math.random()*ALLOC.length)];
        if (grid[d][sl].subject === "") {
          const electives = groupSubs.map(gs => {
            const ga = assignments?.[gs.id] || {};
            return { name:gs.name, teacherCode:ga.teacherCode||"", room:ga.room||"" };
          });
          grid[d][sl] = { subject:type, teacherCode:electives.map(e=>e.teacherCode).filter(Boolean).join(", "), room:electives.map(e=>e.room).filter(Boolean).join(", "), batches:null, electives };
          rem--;
        }
      }
    } else {
      const days = [...DAYS].sort(() => Math.random() - .5);
      let rem = sessions;
      for (let p = 0; p < Math.ceil(sessions/DAYS.length) && rem > 0; p++) {
        for (const day of days) {
          if (!rem) break;
          for (const slot of ALLOC) {
            if (grid[day][slot].subject === "") {
              grid[day][slot] = { subject:name, teacherCode:tCode, room, batches:null, electives:null };
              rem--; break;
            }
          }
        }
      }
      let att = 0;
      while (rem > 0 && att < 300) {
        att++;
        const d = DAYS[Math.floor(Math.random()*DAYS.length)], sl = ALLOC[Math.floor(Math.random()*ALLOC.length)];
        if (grid[d][sl].subject === "") {
          grid[d][sl] = { subject:name, teacherCode:tCode, room, batches:null, electives:null };
          rem--;
        }
      }
    }
  });
  return grid;
}

function buildTeacherTTs(allTimetables, teachers) {
  const res = {};
  teachers.forEach(t => { res[t.code]={}; DAYS.forEach(d=>{ res[t.code][d]={}; SLOTS.forEach(s=>{ res[t.code][d][s]=[]; }); }); });
  Object.entries(allTimetables).forEach(([ybKey, divGrids]) => {
    Object.entries(divGrids).forEach(([div, grid]) => {
      DAYS.forEach(day => {
        SLOTS.forEach(slot => {
          const cell = grid[day][slot];
          if (!cell || cell.subject==="BREAK" || !cell.subject) return;
          if (cell.batches?.length) {
            cell.batches.forEach(b => {
              if (b.teacherCode && res[b.teacherCode])
                res[b.teacherCode][day][slot].push({ subject:cell.subject, ybLabel:ybKey, div, room:b.room||"", batch:b.batch });
            });
          } else if (cell.electives?.length) {
            cell.electives.forEach(e => {
              if (e.teacherCode && res[e.teacherCode])
                res[e.teacherCode][day][slot].push({ subject:e.name, ybLabel:ybKey, div, room:e.room||"", batch:"" });
            });
          } else {
            (cell.teacherCode||"").split(/[,;]/).map(s=>s.trim()).filter(Boolean).forEach(code => {
              if (res[code]) res[code][day][slot].push({ subject:cell.subject, ybLabel:ybKey, div, room:cell.room||"", batch:"" });
            });
          }
        });
      });
    });
  });
  return res;
}

// ─────────────────────────────────────────────────────────────────────────────
// Display components
// ─────────────────────────────────────────────────────────────────────────────
function TimetableTable({ grid, caption }) {
  return (
    <div style={{ overflowX:"auto" }}>
      <table style={S.table}>
        <thead>
          <tr><th colSpan={SLOTS.length+1} style={S.caption}>{caption}</th></tr>
          <tr>
            <th style={S.th}>Day / Time</th>
            {SLOTS.map(s => <th key={s} style={{...S.th,...(s===BREAK_SLOT?S.breakTh:{})}}>{SLOT_LBL[s]}</th>)}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day, di) => (
            <tr key={day} style={{ background:di%2===0?"#fafbff":"#fff" }}>
              <td style={S.dayCell}>{DAY_SHORT[day]}</td>
              {SLOTS.map(slot => {
                const cell = grid[day]?.[slot];
                const val  = cell?.subject || "";
                const isLab      = val.includes("LAB");
                const isElective = !isLab && cell?.electives?.length > 0;
                const isBreak    = slot === BREAK_SLOT;
                return (
                  <td key={slot} style={{...S.td,...(isBreak?S.breakCell:{}),...(isLab&&!isBreak?S.labCell:{}),...(isElective?S.electiveCell:{})}}>
                    {isBreak ? "BREAK" : (
                      <>
                        <div style={{ fontWeight:600, fontSize:12 }}>
                          {cell?.electives?.length > 0 ? `${val} (${cell.electives.length} options)` : val || "—"}
                        </div>
                        {!isLab && !cell?.electives?.length && cell?.teacherCode && (
                          <div style={{ fontSize:10, color:"#666", marginTop:2, fontFamily:"monospace" }}>{cell.teacherCode}</div>
                        )}
                        {!isLab && !cell?.electives?.length && cell?.room && <span style={S.roomBadge}>{cell.room}</span>}
                        {!isLab && cell?.electives?.length > 0 && (
                          <div style={{ marginTop:3 }}>
                            {cell.electives.map((e, ei) => (
                              <div key={ei} style={{ marginBottom:ei<cell.electives.length-1?5:0, padding:"3px 5px", background:"#fffbf0", borderRadius:4, border:"1px solid #fcd34d", fontSize:11 }}>
                                <div style={{ fontWeight:700, color:"#92400e" }}>{e.name}</div>
                                {e.teacherCode && <div style={{ fontSize:10, color:"#666", fontFamily:"monospace" }}>{e.teacherCode}</div>}
                                {e.room && <span style={S.roomBadge}>{e.room}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        {isLab && cell?.batches?.length > 0 && (
                          <div style={{ marginTop:4 }}>
                            {cell.batches.map((b, bi) => (
                              <div key={bi} style={S.batchRow}>
                                <span style={S.batchTag}>{b.batch}</span>
                                {b.teacherCode && <span style={{ fontSize:10, color:"#555", fontFamily:"monospace" }}>{b.teacherCode}</span>}
                                {b.room && <span style={S.roomBadge}>{b.room}</span>}
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
    <div style={{ overflowX:"auto" }}>
      <table style={S.table}>
        <thead>
          <tr><th colSpan={SLOTS.length+1} style={{...S.caption,background:"linear-gradient(90deg,#2d6a4f,#40916c)"}}>{caption}</th></tr>
          <tr>
            <th style={S.th}>Day / Time</th>
            {SLOTS.map(s => <th key={s} style={{...S.th,...(s===BREAK_SLOT?S.breakTh:{})}}>{SLOT_LBL[s]}</th>)}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day, di) => (
            <tr key={day} style={{ background:di%2===0?"#fafbff":"#fff" }}>
              <td style={S.dayCell}>{DAY_SHORT[day]}</td>
              {SLOTS.map(slot => {
                if (slot === BREAK_SLOT) return <td key={slot} style={{...S.td,...S.breakCell}}>BREAK</td>;
                const items = teacherGrid?.[day]?.[slot] || [];
                return (
                  <td key={slot} style={S.td}>
                    {items.map((it, i) => (
                      <div key={i} style={{ marginBottom:i<items.length-1?5:0 }}>
                        <div style={{ fontWeight:600, fontSize:11 }}>{it.subject}</div>
                        <div style={{ fontSize:10, color:"#888", fontFamily:"monospace" }}>
                          {it.ybLabel}·Div{it.div}{it.batch?`·${it.batch}`:""}
                        </div>
                        {it.room && <span style={S.roomBadge}>{it.room}</span>}
                      </div>
                    ))}
                    {!items.length && <span style={{ color:"#ccc" }}>—</span>}
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

  const [dept,        setDept]        = useState("Department of Information Technology");
  const [semLabel,    setSemLabel]    = useState("EVEN Semester (IV) 2025-2026");
  const [yearInput,   setYearInput]   = useState("SE");
  const [branchInput, setBranchInput] = useState("");
  const [divInput,    setDivInput]    = useState("");
  const [ybError,     setYbError]     = useState("");
  const [yearBranches,setYearBranches]= useState([]);

  const [ybSubjects,    setYbSubjects]    = useState({});
  const [activeSubYbId, setActiveSubYbId] = useState("");
  const [subName,       setSubName]       = useState("");
  const [subType,       setSubType]       = useState("theory");
  const [subHours,      setSubHours]      = useState("");
  const [subLabHours,   setSubLabHours]   = useState("");
  const [subWeeklyLabs, setSubWeeklyLabs] = useState("");
  const [subError,      setSubError]      = useState("");
  const subNameRef = useRef();
  const getYbSubs  = (id) => ybSubjects[id] || [];

  const [rooms,     setRooms]     = useState([]);
  const [roomNum,   setRoomNum]   = useState("");
  const [roomType,  setRoomType]  = useState("classroom");
  const [roomError, setRoomError] = useState("");

  const [teachers,    setTeachers]    = useState([]);
  const [tCode,       setTCode]       = useState("");
  const [tName,       setTName]       = useState("");
  const [tError,      setTError]      = useState("");

  const [assignments, setAssignments] = useState({});

  const [generating,    setGenerating]    = useState(false);
  const [generated,     setGenerated]     = useState(false);
  const [allTimetables, setAllTimetables] = useState({});
  const [teacherTTs,    setTeacherTTs]    = useState({});

  const [viewMode,      setViewMode]      = useState("division");
  const [activeYbId,    setActiveYbId]    = useState(null);
  const [activeDiv,     setActiveDiv]     = useState(null);
  const [activeTeacher, setActiveTeacher] = useState(null);

  const [apiError,  setApiError]  = useState(null);
  const [apiSuccess,setApiSuccess]= useState(null);
  const [activeTab, setActiveTab] = useState(0);

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (subType !== "core_lab") { setSubLabHours(""); setSubWeeklyLabs(""); }
  }, [subType]);

  const isElectiveSubType = (t) => ELECTIVE_GROUPS.includes(t);

  // ── Load all saved data on mount ─────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    // Load teachers
    apiGet("/teachers")
      .then(a => { if (a.length) setTeachers(a.map(t=>({id:uid(),code:t.code,name:t.name}))); })
      .catch(() => {});

    // Load rooms
    apiGet("/rooms")
      .then(r => { if (r.length) setRooms(r.map(rm=>({id:uid(),number:rm.number,type:rm.type}))); })
      .catch(() => {});

    // Load year-branches + their subjects
    apiGet("/year-branches").then(async ybs => {
      if (!ybs.length) return;
      const loadedYBs = ybs.map(yb => ({
        id: `${yb.year}-${yb.branch}`,
        year: yb.year,
        branch: yb.branch,
        divs: yb.divs,
      }));
      setYearBranches(loadedYBs);
      const na = {};
      loadedYBs.forEach(yb => { na[yb.id] = {}; yb.divs.forEach(d => { na[yb.id][d] = {}; }); });
      setAssignments(na);
      setActiveSubYbId(loadedYBs[0].id);

      // Load subjects per YB
      const subMap = {};
      for (const yb of loadedYBs) {
        try {
          const subs = await apiGet(`/subjects/${encodeURIComponent(yb.id)}`);
          subMap[yb.id] = subs.map(s => ({
            id: uid(), name: s.name, type: s.type, hours: s.hours, labHours: s.lab_hours
          }));
        } catch { subMap[yb.id] = []; }
      }
      setYbSubjects(subMap);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (yearBranches.length > 0) {
      const last = yearBranches[yearBranches.length-1];
      if (!ybSubjects[last.id]) setYbSubjects(p=>({...p,[last.id]:[]}));
      if (!activeSubYbId) setActiveSubYbId(last.id);
    }
  }, [yearBranches]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const defaultBatchAssigns = (div) =>
    getBatches(div).map(batch => ({ batch, teacherCode:"" }));

  const getBatchAssigns = (ybId, div, subId) => {
    const cur = assignments?.[ybId]?.[div]?.[subId];
    return cur?.batchAssigns || defaultBatchAssigns(div);
  };

  // ── ① Setup handlers ─────────────────────────────────────────────────────
  const addYearBranch = async () => {
    setYbError("");
    const year = yearInput.trim().toUpperCase(), branch = branchInput.trim().toUpperCase();
    if (!year || !branch) { setYbError("Year and branch required."); return; }
    const divs = divInput.split(/[\s,]+/).map(norm).filter(Boolean);
    if (!divs.length) { setYbError("Enter at least one division."); return; }
    const id = `${year}-${branch}`;
    if (yearBranches.find(yb => yb.id === id)) { setYbError(`${id} already added.`); return; }

    // ── persist immediately ──
    try {
      await apiPost("/year-branches/bulk", [{ year, branch, divs }]);
    } catch (e) { setYbError(`Save failed: ${e.message}`); return; }

    setYearBranches(p => [...p, { id, year, branch, divs }]);
    const na = {}; divs.forEach(d => { na[d] = {}; });
    setAssignments(p => ({ ...p, [id]:na }));
    setBranchInput(""); setDivInput("");
  };

  const removeYB = id => {
    setYearBranches(p => p.filter(yb => yb.id !== id));
    setAssignments(p => { const n={...p}; delete n[id]; return n; });
    setYbSubjects(p => { const n={...p}; delete n[id]; return n; });
    setActiveSubYbId(p => p === id ? "" : p);
  };

  // ── ② Subject handlers ────────────────────────────────────────────────────
  const addSubject = async () => {
    setSubError("");
    if (!activeSubYbId) { setSubError("Select a Year-Branch first."); return; }
    if (!subName.trim()) { setSubError("Subject name required."); return; }
    if (getYbSubs(activeSubYbId).find(s => s.name.toLowerCase() === subName.trim().toLowerCase())) {
      setSubError("Already added for this year-branch."); return;
    }
    let hours, labHours = null;
    if (subType === "core_lab") {
      if (!subLabHours || +subLabHours < 1) { setSubError("Enter lab hrs/session."); return; }
      if (!subWeeklyLabs || +subWeeklyLabs < 1) { setSubError("Enter sessions/week."); return; }
      if (+subWeeklyLabs > 5) { setSubError("Max 5 sessions/week."); return; }
      hours = +subWeeklyLabs; labHours = +subLabHours;
    } else {
      if (!subHours || +subHours < 1) { setSubError("Enter hours/week."); return; }
      hours = +subHours;
    }

    const newSub = { id:uid(), name:subName.trim(), type:subType, hours, labHours };
    const updatedSubs = [...getYbSubs(activeSubYbId), newSub];

    // ── persist the full updated list for this YB immediately ──
    try {
      await apiPost("/subjects/bulk", {
        yb_key: activeSubYbId,
        subjects: updatedSubs.map(s => ({
          name:s.name, type:s.type, hours:s.hours,
          ...(s.type==="core_lab" ? {lab_hours:s.labHours} : {})
        })),
      });
    } catch (e) { setSubError(`Save failed: ${e.message}`); return; }

    setYbSubjects(p => ({ ...p, [activeSubYbId]: updatedSubs }));
    setSubName(""); setSubHours(""); setSubLabHours(""); setSubWeeklyLabs("");
    subNameRef.current?.focus();
  };

  const removeSubject = async (ybId, id) => {
    const updatedSubs = (ybSubjects[ybId]||[]).filter(s => s.id !== id);
    try {
      await apiPost("/subjects/bulk", {
        yb_key: ybId,
        subjects: updatedSubs.map(s => ({
          name:s.name, type:s.type, hours:s.hours,
          ...(s.type==="core_lab" ? {lab_hours:s.labHours} : {})
        })),
      });
    } catch (e) { setApiError(`Remove subject failed: ${e.message}`); return; }
    setYbSubjects(p => ({ ...p, [ybId]: updatedSubs }));
  };

  const handleSubKey = e => { if (e.key === "Enter") { e.preventDefault(); addSubject(); } };

  // ── ③ Room handlers ───────────────────────────────────────────────────────
  const addRoom = async () => {
    setRoomError("");
    const num = roomNum.trim();
    if (!num) { setRoomError("Room number required."); return; }
    if (rooms.find(r => r.number.toLowerCase() === num.toLowerCase())) { setRoomError("Already added."); return; }

    // ── persist immediately ──
    try {
      await apiPost("/rooms", { number: num, type: roomType });
    } catch (e) { setRoomError(`Save failed: ${e.message}`); return; }

    setRooms(p => [...p, { id:uid(), number:num, type:roomType }]);
    setRoomNum("");
  };

  const removeRoom = async (id) => {
    const room = rooms.find(r => r.id === id);
    if (!room) return;
    try {
      const token = localStorage.getItem("token");
      await fetch(`${API_BASE}/rooms/${encodeURIComponent(room.number)}`, {
        method:"DELETE", headers:{ Authorization:`Bearer ${token}` }
      });
    } catch (e) { setApiError(`Remove room failed: ${e.message}`); return; }
    setRooms(p => p.filter(r => r.id !== id));
  };

  // ── ④ Teacher handlers ────────────────────────────────────────────────────
  const addTeacher = async () => {
    setTError("");
    const code = tCode.trim().toUpperCase(), name = tName.trim();
    if (!code || !name) { setTError("Code and name required."); return; }
    if (teachers.find(t => t.code === code)) { setTError("Code already exists."); return; }

    // ── persist immediately ──
    try {
      await apiPost("/teachers", { code, name });
    } catch (e) { setTError(`Save failed: ${e.message}`); return; }

    setTeachers(p => [...p, { id:uid(), code, name }]);
    setTCode(""); setTName("");
  };

  const removeTeacher = async (id) => {
    const teacher = teachers.find(t => t.id === id);
    if (!teacher) return;
    try {
      const token = localStorage.getItem("token");
      await fetch(`${API_BASE}/teachers/${encodeURIComponent(teacher.code)}`, {
        method:"DELETE", headers:{ Authorization:`Bearer ${token}` }
      });
    } catch (e) { setApiError(`Remove teacher failed: ${e.message}`); return; }
    setTeachers(p => p.filter(t => t.id !== id));
  };

  const setTheoryTeacher = (ybId, div, subId, teacherCode) =>
    setAssignments(p => {
      const cur = p?.[ybId]?.[div]?.[subId] || { teacherCode:"", batchAssigns:null };
      return { ...p, [ybId]:{ ...p[ybId], [div]:{ ...p[ybId]?.[div], [subId]:{ ...cur, teacherCode } } } };
    });

  const setBatchTeacher = (ybId, div, subId, batchIdx, teacherCode) =>
    setAssignments(p => {
      const cur     = p?.[ybId]?.[div]?.[subId] || { teacherCode:"", batchAssigns:defaultBatchAssigns(div) };
      const batches = [...(cur.batchAssigns || defaultBatchAssigns(div))];
      batches[batchIdx] = { ...batches[batchIdx], teacherCode };
      return { ...p, [ybId]:{ ...p[ybId], [div]:{ ...p[ybId]?.[div], [subId]:{ ...cur, batchAssigns:batches } } } };
    });

  // ── Generate ──────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    setApiError(null); setApiSuccess(null);
    if (!yearBranches.length) { setApiError("Add at least one Year/Branch/Division."); return; }
    if (!yearBranches.some(yb => getYbSubs(yb.id).length > 0)) {
      setApiError("Add subjects for at least one Year-Branch in Step ②."); return;
    }
    setGenerating(true);

    const classroomPool = rooms.filter(r => r.type === "classroom");
    const labPool       = rooms.filter(r => r.type === "lab");

    const newAllTT = {};
    yearBranches.forEach(yb => {
      const subs = getYbSubs(yb.id);
      if (!subs.length) return;
      newAllTT[yb.id] = {};
      const cUsed = {}, lUsed = {};

      yb.divs.forEach(div => {
        const divAssign = {};
        subs.forEach(sub => {
          const a = assignments?.[yb.id]?.[div]?.[sub.id];
          if (sub.type === "core_lab") {
            const rawBatches       = a?.batchAssigns || defaultBatchAssigns(div);
            const batchesWithRooms = rawBatches.map(b => ({ ...b, room: pickRoom(labPool, lUsed) }));
            divAssign[sub.id] = { teacherCode:"", room:"", batchAssigns:batchesWithRooms };
          } else if (isElectiveType(sub.type)) {
            divAssign[sub.id] = { teacherCode: a?.teacherCode||"", room: pickRoom(classroomPool, cUsed), batchAssigns:null };
          } else {
            divAssign[sub.id] = { teacherCode: a?.teacherCode||"", room: pickRoom(classroomPool, cUsed), batchAssigns:null };
          }
        });
        newAllTT[yb.id][div] = generateClientTimetable(subs, divAssign);
      });
    });

    setAllTimetables(newAllTT);
    setTeacherTTs(buildTeacherTTs(newAllTT, teachers));
    if (yearBranches.length) { setActiveYbId(yearBranches[0].id); setActiveDiv(yearBranches[0].divs[0]); }
    if (teachers.length) setActiveTeacher(teachers[0].code);
    setGenerated(true); setActiveTab(4);

    // ── Backend persist (with real error reporting) ──────────────────────
    try {
      // Save teachers (bulk sync)
      await apiPost("/teachers/bulk", teachers.map(t => ({ code:t.code, name:t.name })));

      // Save rooms (bulk sync)
      await apiPost("/rooms/bulk", rooms.map(r => ({ number:r.number, type:r.type })));

      for (const yb of yearBranches) {
        const ybSubs = getYbSubs(yb.id);
        if (!ybSubs.length) continue;

        // Save subjects for this YB
        await apiPost("/subjects/bulk", {
          yb_key: yb.id,
          subjects: ybSubs.map(s => ({
            name:s.name, type:s.type, hours:s.hours,
            ...(s.type==="core_lab" ? {lab_hours:s.labHours} : {})
          })),
        });

        // Build per-division assignments (snake_case for backend)
        const divA = {};
        yb.divs.forEach(div => {
          divA[div] = {};
          ybSubs.forEach(sub => {
            const a = assignments?.[yb.id]?.[div]?.[sub.id];
            if (sub.type === "core_lab") {
              divA[div][sub.name] = {
                teacher_code: "", room: "",
                batch_assigns: (a?.batchAssigns || defaultBatchAssigns(div)).map(b => ({
                  batch: b.batch, teacher_code: b.teacherCode||"", room: b.room||""
                })),
              };
            } else {
              divA[div][sub.name] = { teacher_code: a?.teacherCode||"", room: a?.room||"" };
            }
          });
        });

        // Convert timetable cells to snake_case for backend
        const ybTT = {};
        Object.entries(newAllTT[yb.id] || {}).forEach(([div, grid]) => {
          ybTT[div] = {};
          DAYS.forEach(day => {
            ybTT[div][day] = {};
            SLOTS.forEach(slot => {
              const cell = grid[day]?.[slot];
              if (!cell) { ybTT[div][day][slot] = cell; return; }
              const converted = {
                subject:      cell.subject,
                teacher_code: cell.teacherCode || "",
                room:         cell.room || "",
                batches: cell.batches ? cell.batches.map(b => ({
                  batch:        b.batch,
                  teacher_code: b.teacherCode || "",
                  room:         b.room || "",
                })) : null,
              };
              ybTT[div][day][slot] = converted;
            });
          });
        });

        await apiPost("/generate", {
          year: yb.year, branch: yb.branch, divisions: yb.divs,
          subjects: ybSubs.map(s => ({
            name:s.name, type:s.type, hours:s.hours,
            ...(s.type==="core_lab" ? {lab_hours:s.labHours} : {})
          })),
          teacher_assignments: divA,
          timetables: ybTT,
        });
      }

      setApiSuccess("✅ All data saved to server successfully!");
    } catch (e) {
      // Now we surface the actual error instead of swallowing it
      setApiError(`⚠️ Server save failed: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  // ── Excel export ──────────────────────────────────────────────────────────
  const buildSheet = (grid, ybLabel, div) => {
    const aoa = [];
    for (let i = 0; i < 5; i++) aoa.push([]);
    aoa.push([null, null, dept]);
    aoa.push([null, null, `  Time Table ${semLabel}`]);
    aoa.push([null, null, null, null, null, null, null, null, null, null, `${ybLabel}-${div}`]);
    aoa.push([null, null, "Day/Time", ...SLOTS.map(s=>SLOT_LBL[s])]);
    aoa.push([]);
    DAYS.forEach(day => {
      const sr=[null,null,DAY_SHORT[day]], tc=[null,null,"Faculty"], rm=[null,null,"Room"];
      SLOTS.forEach(slot => {
        const cell = grid[day]?.[slot];
        if (slot===BREAK_SLOT) { sr.push("BREAK"); tc.push(null); rm.push(null); return; }
        sr.push(cell?.subject||"");
        if (cell?.batches?.length) {
          tc.push(cell.batches.map(b=>`${b.batch}:${b.teacherCode||"—"}`).join(" | "));
          rm.push(cell.batches.map(b=>`${b.batch}:${b.room||"—"}`).join(" | "));
        } else if (cell?.electives?.length) {
          tc.push(cell.electives.map(e=>`${e.name}:${e.teacherCode||"—"}`).join(" | "));
          rm.push(cell.electives.map(e=>`${e.name}:${e.room||"—"}`).join(" | "));
        } else { tc.push(cell?.teacherCode||""); rm.push(cell?.room||""); }
      });
      aoa.push(sr); aoa.push(tc); aoa.push(rm); aoa.push([]);
    });
    aoa.push([]);
    aoa.push([null,null,"Sr. No.","Subject","Batch","Faculty Code","Faculty Name","Room/Lab","Class Counsellor : —"]);
    const seen=new Set(); let n=1;
    DAYS.forEach(day=>SLOTS.forEach(slot=>{
      const cell=grid[day]?.[slot];
      if (!cell?.subject||cell.subject==="BREAK"||seen.has(cell.subject)) return;
      seen.add(cell.subject);
      if (cell.batches?.length) {
        cell.batches.forEach(b=>{const tO=teachers.find(t=>t.code===b.teacherCode); aoa.push([null,null,n++,cell.subject,b.batch,b.teacherCode||"",tO?.name||"",b.room||""]);});
      } else if (cell.electives?.length) {
        cell.electives.forEach(e=>{const tO=teachers.find(t=>t.code===e.teacherCode); aoa.push([null,null,n++,e.name,cell.subject,e.teacherCode||"",tO?.name||"",e.room||""]);});
      } else {
        const tO=teachers.find(t=>t.code===cell.teacherCode);
        aoa.push([null,null,n++,cell.subject,"",cell.teacherCode||"",tO?.name||"",cell.room||""]);
      }
    }));
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"]=[{wch:2},{wch:2},{wch:14},...SLOTS.map(()=>({wch:24}))];
    return ws;
  };

  const buildTeacherSheet = (code) => {
    const tO=teachers.find(t=>t.code===code), ttG=teacherTTs[code];
    if (!ttG) return null;
    const aoa=[];
    for(let i=0;i<5;i++) aoa.push([]);
    aoa.push([null,null,dept]);
    aoa.push([null,null,`Teacher Timetable – ${tO?.name||code} (${code})`]);
    aoa.push([null,null,"Day/Time",...SLOTS.map(s=>SLOT_LBL[s])]);
    aoa.push([]);
    DAYS.forEach(day=>{
      const row=[null,null,DAY_SHORT[day]];
      SLOTS.forEach(slot=>{
        if(slot===BREAK_SLOT){row.push("BREAK");return;}
        const items=ttG[day]?.[slot]||[];
        row.push(items.map(it=>`${it.subject}(${it.ybLabel}/Div${it.div}${it.batch?`/${it.batch}`:""}${it.room?`[${it.room}]`:""})`).join(" | "));
      });
      aoa.push(row); aoa.push([]);
    });
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"]=[{wch:2},{wch:2},{wch:14},...SLOTS.map(()=>({wch:26}))];
    return ws;
  };

  const downloadAll = () => {
    const wb=XLSX.utils.book_new();
    yearBranches.forEach(yb=>yb.divs.forEach(div=>{
      const grid=allTimetables[yb.id]?.[div];
      if(grid) XLSX.utils.book_append_sheet(wb,buildSheet(grid,yb.id,div),`${yb.id}-${div}`.slice(0,31));
    }));
    teachers.forEach(t=>{const ws=buildTeacherSheet(t.code);if(ws) XLSX.utils.book_append_sheet(wb,ws,`T-${t.code.replace(/\//g,"").replace(/\s+/g,"_")}`.slice(0,31));});
    XLSX.writeFile(wb,`Timetables_${dept.replace(/\s+/g,"_")}.xlsx`);
  };
  const downloadSingle = (ybId, div) => {
    const grid=allTimetables[ybId]?.[div]; if(!grid) return;
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,buildSheet(grid,ybId,div),`${ybId}-${div}`);
    XLSX.writeFile(wb,`TT_${ybId}_Div${div}.xlsx`);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const TABS      = ["① Setup","② Subjects","③ Rooms","④ Teachers","⑤ Generate"];
  const currentYB = yearBranches.find(yb => yb.id === activeYbId);
  const classroomPool = rooms.filter(r => r.type==="classroom");
  const labPool       = rooms.filter(r => r.type==="lab");

  return (
    <Layout>
      <h2 className="page-title" style={{ marginBottom:4 }}>Generate Timetable</h2>

      {/* Global error/success banners */}
      {apiError   && <div className="banner banner-error" style={{ marginBottom:14 }}>⚠️ {apiError}</div>}
      {apiSuccess && <div className="banner banner-info"  style={{ marginBottom:14 }}>{apiSuccess}</div>}

      {/* Step tabs */}
      <div style={S.tabBar}>
        {TABS.map((t, i) => (
          <button key={i} onClick={() => setActiveTab(i)}
            style={{ ...S.tab, ...(activeTab===i ? S.tabActive : {}) }}>
            {t}
          </button>
        ))}
      </div>

      {/* ════ TAB 0 — SETUP ════════════════════════════════════════════════ */}
      {activeTab === 0 && (
        <>
          <div className="panel" style={{ marginBottom:20 }}>
            <div className="panel-header"><span className="panel-title">Institution &amp; Semester</span></div>
            <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
              <div style={{ flex:2, minWidth:220 }}>
                <label style={S.label}>Department Name</label>
                <input type="text" value={dept} onChange={e=>setDept(e.target.value)} style={S.input}/>
              </div>
              <div style={{ flex:2, minWidth:220 }}>
                <label style={S.label}>Semester Label</label>
                <input type="text" value={semLabel} onChange={e=>setSemLabel(e.target.value)} style={S.input}
                  placeholder="e.g. EVEN Semester (IV) 2025-2026"/>
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginBottom:20 }}>
            <div className="panel-header"><span className="panel-title">Year · Branch · Divisions</span></div>
            <p style={S.hint}>
              Each division automatically gets <strong>{NUM_BATCHES} lab batches</strong>
              &nbsp;(Div A → A1, A2, A3 &nbsp;|&nbsp; Div B → B1, B2, B3).
              <br/><span style={S.eg}>e.g. Year <code>SE</code> · Branch <code>IT</code> · Divs <code>A, B</code></span>
            </p>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:6 }}>
              <div style={{ display:"flex", flexDirection:"column", flex:"0 0 80px" }}>
                <label style={S.label}>Year</label>
                <select value={yearInput} onChange={e=>setYearInput(e.target.value)} style={S.input}>
                  {["FE","SE","TE","BE"].map(y=><option key={y}>{y}</option>)}
                </select>
              </div>
              <div style={{ display:"flex", flexDirection:"column", flex:1, minWidth:120 }}>
                <label style={S.label}>Branch</label>
                <input type="text" value={branchInput}
                  onChange={e=>{setBranchInput(e.target.value);setYbError("");}}
                  placeholder="IT, COMP, MECH…" style={S.input}/>
              </div>
              <div style={{ display:"flex", flexDirection:"column", flex:1, minWidth:140 }}>
                <label style={S.label}>Divisions (comma / space)</label>
                <input type="text" value={divInput}
                  onChange={e=>{setDivInput(e.target.value);setYbError("");}}
                  placeholder="A, B, C" style={S.input}
                  onKeyDown={e=>e.key==="Enter"&&addYearBranch()}/>
              </div>
              <button className="card-btn btn-blue" style={{ ...S.addBtn, alignSelf:"flex-end" }} onClick={addYearBranch}>
                + Add
              </button>
            </div>
            {ybError && <div style={S.ferr}>{ybError}</div>}
            <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:8 }}>
              {yearBranches.length === 0
                ? <span style={S.empty}>No Year-Branch added yet</span>
                : yearBranches.map(yb => (
                  <span key={yb.id} style={{ ...S.chip, borderColor:"#667eea", color:"#667eea", background:"#f0f2ff" }}>
                    <strong>{yb.year}</strong>-{yb.branch}
                    <span style={{ fontSize:10, color:"#999", marginLeft:4 }}>[{yb.divs.join(",")}]</span>
                    <button onClick={()=>removeYB(yb.id)} style={S.chipX}>✕</button>
                  </span>
                ))
              }
            </div>
          </div>

          <div style={{ textAlign:"right" }}>
            <button className="card-btn btn-blue" style={{ padding:"10px 28px" }} onClick={()=>setActiveTab(1)}>
              Next: Subjects →
            </button>
          </div>
        </>
      )}

      {/* ════ TAB 1 — SUBJECTS ══════════════════════════════════════════════ */}
      {activeTab === 1 && (
        <>
          {yearBranches.length === 0 && (
            <div style={S.emptyBox}>Add Year-Branch-Divisions in Step ① first.</div>
          )}
          {yearBranches.length > 0 && (
            <>
              <p style={S.hint}>
                Define subjects <strong>per semester</strong> (Year-Branch). Each entry is saved to the database immediately.
              </p>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:18 }}>
                {yearBranches.map(yb => (
                  <button key={yb.id} onClick={() => { setActiveSubYbId(yb.id); setSubError(""); }}
                    style={{ ...S.tabBtn, ...(activeSubYbId===yb.id ? S.tabYBActive : {}) }}>
                    {yb.year}-{yb.branch}
                    <span style={{ marginLeft:6, fontSize:10, opacity:.8, background:"rgba(255,255,255,.25)", borderRadius:8, padding:"0 5px" }}>
                      {getYbSubs(yb.id).length} subj
                    </span>
                  </button>
                ))}
              </div>

              {activeSubYbId && (
                <div className="panel" style={{ marginBottom:20 }}>
                  <div className="panel-header">
                    <span className="panel-title">
                      Subjects for <span style={{ color:"#667eea" }}>
                        {yearBranches.find(yb=>yb.id===activeSubYbId)?.year}-{yearBranches.find(yb=>yb.id===activeSubYbId)?.branch}
                      </span>
                    </span>
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"flex-end", marginBottom:6 }}>
                    <div style={{ display:"flex", flexDirection:"column", flex:2, minWidth:160 }}>
                      <label style={S.label}>Subject Name</label>
                      <input ref={subNameRef} type="text" value={subName}
                        onChange={e=>{setSubName(e.target.value);setSubError("");}}
                        onKeyDown={handleSubKey} placeholder="e.g. OS, SBL-PYTHON, TCS"
                        style={{ ...S.input, borderColor:subError?"#e05c5c":"#d0d5dd" }}/>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", flex:1, minWidth:160 }}>
                      <label style={S.label}>Type</label>
                      <select value={subType} onChange={e=>setSubType(e.target.value)} style={S.input}>
                        <option value="theory">Theory</option>
                        <option value="core_lab">Core Lab</option>
                        {ELECTIVE_GROUPS.map(eg=><option key={eg} value={eg}>{eg}</option>)}
                      </select>
                    </div>
                    {subType !== "core_lab" && (
                      <div style={{ display:"flex", flexDirection:"column", flex:1, minWidth:90 }}>
                        <label style={S.label}>Hrs / Week</label>
                        <input type="number" min={1} max={10} value={subHours}
                          onChange={e=>{setSubHours(e.target.value);setSubError("");}}
                          onKeyDown={handleSubKey} placeholder="3"
                          style={{ ...S.input, borderColor:subError?"#e05c5c":"#d0d5dd" }}/>
                      </div>
                    )}
                    {subType === "core_lab" && (
                      <>
                        <div style={{ display:"flex", flexDirection:"column", flex:1, minWidth:110 }}>
                          <label style={S.label}>Lab Hrs / Session</label>
                          <input type="number" min={1} max={ALLOC.length} value={subLabHours}
                            onChange={e=>{setSubLabHours(e.target.value);setSubError("");}}
                            onKeyDown={handleSubKey} placeholder="2"
                            style={{ ...S.input, borderColor:subError?"#e05c5c":"#6c8ebf", background:"#f0f5ff" }}/>
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", flex:1, minWidth:100 }}>
                          <label style={S.label}>Sessions / Week</label>
                          <input type="number" min={1} max={5} value={subWeeklyLabs}
                            onChange={e=>{setSubWeeklyLabs(e.target.value);setSubError("");}}
                            onKeyDown={handleSubKey} placeholder="3"
                            style={{ ...S.input, borderColor:subError?"#e05c5c":"#6c8ebf", background:"#f0f5ff" }}/>
                        </div>
                      </>
                    )}
                    <button className="card-btn btn-teal" style={{ ...S.addBtn, alignSelf:"flex-end" }} onClick={addSubject}>
                      + Add
                    </button>
                  </div>
                  {subError && <div style={S.ferr}>{subError}</div>}

                  {getYbSubs(activeSubYbId).length > 0 ? (
                    <table style={{ ...S.table, marginTop:14 }}>
                      <thead>
                        <tr>{["#","Subject","Type","Schedule",""].map(h=><th key={h} style={S.th}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {getYbSubs(activeSubYbId).map((s, i) => (
                          <tr key={s.id} style={{ background:i%2===0?"#fafbff":"#fff" }}>
                            <td style={S.td}>{i+1}</td>
                            <td style={{ ...S.td, fontWeight:600 }}>{s.name}</td>
                            <td style={S.td}>
                              <span className={s.type==="core_lab"?"chip-teal":isElectiveSubType(s.type)?"chip-blue":"chip-pink"} style={{ fontSize:11 }}>
                                {s.type==="core_lab"?"Core Lab":s.type}
                              </span>
                            </td>
                            <td style={S.td}>
                              {s.type==="core_lab"
                                ? <span style={S.labBadge}>{s.hours}×/wk · {s.labHours}hr/session · {NUM_BATCHES} batches</span>
                                : `${s.hours} hrs/wk`}
                            </td>
                            <td style={S.td}>
                              <button onClick={() => removeSubject(activeSubYbId, s.id)} style={S.removeBtn}>✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div style={S.emptyBox}>No subjects added for {activeSubYbId} yet.</div>
                  )}
                </div>
              )}
            </>
          )}
          <div style={{ display:"flex", justifyContent:"space-between" }}>
            <button className="card-btn btn-ghost" onClick={() => setActiveTab(0)}>← Back</button>
            <button className="card-btn btn-blue" style={{ padding:"10px 28px" }} onClick={() => setActiveTab(2)}>Next: Rooms →</button>
          </div>
        </>
      )}

      {/* ════ TAB 2 — ROOMS ════════════════════════════════════════════════ */}
      {activeTab === 2 && (
        <>
          <div className="panel" style={{ marginBottom:20 }}>
            <div className="panel-header"><span className="panel-title">Define Rooms &amp; Labs</span></div>
            <p style={S.hint}>
              Each room is saved to the database immediately when you click <strong>+ Add Room</strong>.
              <br/>
              <span style={S.eg}>e.g. Add <code>604</code> as Classroom, <code>308A</code> as Lab</span>
            </p>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"flex-end", marginBottom:6 }}>
              <div style={{ display:"flex", flexDirection:"column", flex:1, minWidth:140 }}>
                <label style={S.label}>Room / Lab Number</label>
                <input type="text" value={roomNum}
                  onChange={e=>{setRoomNum(e.target.value);setRoomError("");}}
                  onKeyDown={e=>e.key==="Enter"&&addRoom()}
                  placeholder="e.g. 604, 308A, 616B"
                  style={{ ...S.input, borderColor:roomError?"#e05c5c":"#d0d5dd" }}/>
              </div>
              <div style={{ display:"flex", flexDirection:"column", flex:"0 0 200px" }}>
                <label style={S.label}>Room Type</label>
                <select value={roomType} onChange={e=>setRoomType(e.target.value)} style={S.input}>
                  <option value="classroom">Classroom (Theory / Elective)</option>
                  <option value="lab">Lab (Core Lab)</option>
                </select>
              </div>
              <button className="card-btn btn-blue" style={{ ...S.addBtn, alignSelf:"flex-end" }} onClick={addRoom}>
                + Add Room
              </button>
            </div>
            {roomError && <div style={S.ferr}>{roomError}</div>}

            {rooms.length > 0 && (
              <div style={{ display:"flex", gap:24, marginTop:16, flexWrap:"wrap" }}>
                <div style={{ flex:1, minWidth:200 }}>
                  <div style={{ ...S.roomSecHdr, background:"#f0f4ff", borderColor:"#c5d3f5", color:"#3451b2" }}>
                    🏫 Classrooms ({classroomPool.length})
                  </div>
                  {classroomPool.map(r => (
                    <div key={r.id} style={S.roomRow}>
                      <span style={{ fontWeight:600, fontFamily:"monospace", fontSize:14 }}>{r.number}</span>
                      <button onClick={() => removeRoom(r.id)} style={S.removeBtn}>✕</button>
                    </div>
                  ))}
                  {!classroomPool.length && <div style={{ fontSize:12, color:"#bbb" }}>None added</div>}
                </div>
                <div style={{ flex:1, minWidth:200 }}>
                  <div style={{ ...S.roomSecHdr, background:"#f0fff4", borderColor:"#9ae6b4", color:"#276749" }}>
                    🔬 Labs ({labPool.length})
                  </div>
                  {labPool.map(r => (
                    <div key={r.id} style={S.roomRow}>
                      <span style={{ fontWeight:600, fontFamily:"monospace", fontSize:14 }}>{r.number}</span>
                      <button onClick={() => removeRoom(r.id)} style={S.removeBtn}>✕</button>
                    </div>
                  ))}
                  {!labPool.length && <div style={{ fontSize:12, color:"#bbb" }}>None added</div>}
                </div>
              </div>
            )}
            {!rooms.length && <div style={{ ...S.emptyBox, marginTop:14 }}>No rooms added yet.</div>}
          </div>
          <div style={{ display:"flex", justifyContent:"space-between" }}>
            <button className="card-btn btn-ghost" onClick={() => setActiveTab(1)}>← Back</button>
            <button className="card-btn btn-blue" style={{ padding:"10px 28px" }} onClick={() => setActiveTab(3)}>Next: Teachers →</button>
          </div>
        </>
      )}

      {/* ════ TAB 3 — TEACHERS ══════════════════════════════════════════════ */}
      {activeTab === 3 && (
        <>
          <div className="panel" style={{ marginBottom:20 }}>
            <div className="panel-header"><span className="panel-title">Teacher Directory</span></div>
            <p style={S.hint}>
              Each teacher is saved to the database immediately when you click <strong>+ Add Teacher</strong>.
              <br/><span style={S.eg}>e.g. Code <code>/YM</code> · Full name <code>Dr. Yogita Mistry</code></span>
            </p>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:6 }}>
              <div style={{ display:"flex", flexDirection:"column", flex:"0 0 120px" }}>
                <label style={S.label}>Short Code</label>
                <input type="text" value={tCode}
                  onChange={e=>{setTCode(e.target.value.toUpperCase());setTError("");}}
                  placeholder="/YM" style={S.input}
                  onKeyDown={e=>e.key==="Enter"&&addTeacher()}/>
              </div>
              <div style={{ display:"flex", flexDirection:"column", flex:2, minWidth:200 }}>
                <label style={S.label}>Full Name</label>
                <input type="text" value={tName}
                  onChange={e=>{setTName(e.target.value);setTError("");}}
                  placeholder="Dr. Yogita Mistry" style={S.input}
                  onKeyDown={e=>e.key==="Enter"&&addTeacher()}/>
              </div>
              <button className="card-btn btn-teal" style={{ ...S.addBtn, alignSelf:"flex-end" }} onClick={addTeacher}>
                + Add Teacher
              </button>
            </div>
            {tError && <div style={S.ferr}>{tError}</div>}
            {teachers.length > 0 && (
              <table style={{ ...S.table, marginTop:12 }}>
                <thead><tr>{["#","Code","Full Name",""].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {teachers.map((t, i) => (
                    <tr key={t.id} style={{ background:i%2===0?"#fafbff":"#fff" }}>
                      <td style={S.td}>{i+1}</td>
                      <td style={{ ...S.td, fontFamily:"monospace", fontWeight:700, color:"#667eea" }}>{t.code}</td>
                      <td style={S.td}>{t.name}</td>
                      <td style={S.td}><button onClick={()=>removeTeacher(t.id)} style={S.removeBtn}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!teachers.length && <div style={S.emptyBox}>No teachers added yet.</div>}
          </div>

          <div className="panel" style={{ marginBottom:20 }}>
            <div className="panel-header"><span className="panel-title">Assign Subjects to Teachers</span></div>
            {yearBranches.length === 0 && <div style={S.emptyBox}>Add Year-Branch-Divisions in Step ① first.</div>}
            {yearBranches.map(yb => {
              const subs = getYbSubs(yb.id);
              if (!subs.length) return null;
              return (
                <div key={yb.id} style={{ marginBottom:28 }}>
                  <div style={S.ybHeader}>
                    <strong>{yb.year}-{yb.branch}</strong>
                    <span style={{ fontSize:11, color:"#888", marginLeft:8 }}>Divs: {yb.divs.join(", ")} · {subs.length} subjects</span>
                  </div>
                  {subs.map(sub => (
                    <div key={sub.id} style={{ marginBottom:10, border:"1px solid #e2e8f0", borderRadius:8, overflow:"hidden" }}>
                      <div style={{ padding:"8px 14px", background:sub.type==="core_lab"?"#e8f5e9":"#f1f5ff", display:"flex", alignItems:"center", gap:8, borderBottom:"1px solid #e2e8f0" }}>
                        <span style={{ fontWeight:700, fontSize:13 }}>{sub.name}</span>
                        <span className={sub.type==="core_lab"?"chip-teal":isElectiveSubType(sub.type)?"chip-blue":"chip-pink"} style={{ fontSize:10 }}>
                          {sub.type==="core_lab"?"Core Lab":sub.type}
                        </span>
                        <span style={{ fontSize:11, color:"#555", marginLeft:4 }}>
                          {sub.type==="core_lab" ? `${NUM_BATCHES} batches · ${sub.labHours}hr · ${sub.hours}×/wk` : `${sub.hours} hrs/wk`}
                        </span>
                      </div>
                      <div style={{ overflowX:"auto" }}>
                        <table style={{ width:"100%", borderCollapse:"collapse" }}>
                          <thead>
                            <tr>
                              {yb.divs.map(div => (
                                <th key={div} style={{ ...S.th, width:`${100/yb.divs.length}%`, minWidth:sub.type==="core_lab"?210:160 }}>
                                  Division {div}
                                  {sub.type==="core_lab" && <div style={{ fontSize:9, fontWeight:400, color:"#888", marginTop:2 }}>{getBatches(div).join(" · ")}</div>}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              {yb.divs.map(div => {
                                if (sub.type === "core_lab") {
                                  const batches = getBatchAssigns(yb.id, div, sub.id);
                                  return (
                                    <td key={div} style={{ ...S.td, verticalAlign:"top", padding:10 }}>
                                      {batches.map((b, bi) => (
                                        <div key={bi} style={{ marginBottom:bi<batches.length-1?8:0, padding:"6px 8px", background:"#f0fff4", borderRadius:6, border:"1px solid #c6f6d5" }}>
                                          <div style={{ fontSize:11, fontWeight:700, color:"#276749", marginBottom:4 }}>
                                            <span style={S.batchTag}>{b.batch}</span> Batch
                                          </div>
                                          <select value={b.teacherCode||""} onChange={e=>setBatchTeacher(yb.id,div,sub.id,bi,e.target.value)}
                                            style={{ ...S.input, fontSize:11, padding:"4px 7px" }}>
                                            <option value="">— teacher —</option>
                                            {teachers.map(t=><option key={t.id} value={t.code}>{t.code} – {t.name}</option>)}
                                          </select>
                                        </div>
                                      ))}
                                    </td>
                                  );
                                } else {
                                  const cur = assignments?.[yb.id]?.[div]?.[sub.id]?.teacherCode || "";
                                  return (
                                    <td key={div} style={{ ...S.td, verticalAlign:"top", padding:10 }}>
                                      <select value={cur} onChange={e=>setTheoryTeacher(yb.id,div,sub.id,e.target.value)}
                                        style={{ ...S.input, fontSize:11, padding:"5px 8px" }}>
                                        <option value="">— teacher —</option>
                                        {teachers.map(t=><option key={t.id} value={t.code}>{t.code} – {t.name}</option>)}
                                      </select>
                                    </td>
                                  );
                                }
                              })}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <div style={{ display:"flex", justifyContent:"space-between" }}>
            <button className="card-btn btn-ghost" onClick={() => setActiveTab(2)}>← Back</button>
            <button className="card-btn btn-blue" style={{ padding:"10px 28px" }} onClick={() => setActiveTab(4)}>Next: Generate →</button>
          </div>
        </>
      )}

      {/* ════ TAB 4 — GENERATE & VIEW ══════════════════════════════════════ */}
      {activeTab === 4 && (
        <>
          {rooms.length > 0 && (
            <div style={{ marginBottom:16, padding:"10px 14px", background:"#f8f9fb", borderRadius:8, border:"1px dashed #d5dae3", fontSize:12, color:"#555" }}>
              <strong>Room pool:</strong>&nbsp;
              {classroomPool.length} classrooms ({classroomPool.map(r=>r.number).join(", ")||"none"})
              &nbsp;·&nbsp;
              {labPool.length} labs ({labPool.map(r=>r.number).join(", ")||"none"})
            </div>
          )}
          <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:20 }}>
            <button className="card-btn btn-pink" style={{ fontSize:15, padding:"12px 36px" }}
              disabled={generating} onClick={handleGenerate}>
              {generating ? "⏳ Generating…" : "⚡ Generate All Timetables"}
            </button>
            {generated && (
              <button className="card-btn btn-blue" style={{ fontSize:14, padding:"12px 24px" }} onClick={downloadAll}>
                ⬇ Download All (Excel)
              </button>
            )}
          </div>

          {generated && Object.keys(allTimetables).length > 0 && (
            <div className="panel" style={{ marginBottom:40 }}>
              <div className="panel-header"><span className="panel-title">📋 Generated Timetables</span></div>
              <div style={{ display:"flex", gap:8, margin:"14px 0 20px", flexWrap:"wrap" }}>
                {["division","teacher"].map(mode => (
                  <button key={mode} onClick={()=>setViewMode(mode)}
                    style={{ ...S.tabBtn, ...(viewMode===mode?S.tabActive:{}) }}>
                    {mode==="division"?"📅 Division View":"👤 Teacher View"}
                  </button>
                ))}
              </div>

              {viewMode === "division" && (
                <>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:10 }}>
                    {yearBranches.map(yb => (
                      <button key={yb.id} onClick={()=>{setActiveYbId(yb.id);setActiveDiv(yb.divs[0]);}}
                        style={{ ...S.tabBtn, ...(activeYbId===yb.id?S.tabYBActive:{}) }}>
                        {yb.year}-{yb.branch}
                      </button>
                    ))}
                  </div>
                  {currentYB && (
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:18 }}>
                      {currentYB.divs.map(div => (
                        <button key={div} onClick={()=>setActiveDiv(div)}
                          style={{ ...S.tabBtn, ...(activeDiv===div?S.tabActive:{}) }}>
                          Division {div}
                        </button>
                      ))}
                    </div>
                  )}
                  {activeYbId && activeDiv && allTimetables[activeYbId]?.[activeDiv] && (
                    <>
                      <TimetableTable
                        grid={allTimetables[activeYbId][activeDiv]}
                        caption={`${dept}  ·  ${semLabel}  ·  ${activeYbId} / Division ${activeDiv}`}
                      />
                      <div style={{ marginTop:14 }}>
                        <button className="card-btn btn-teal" style={{ fontSize:13, padding:"8px 20px" }}
                          onClick={()=>downloadSingle(activeYbId,activeDiv)}>
                          ⬇ Download {activeYbId} / Div {activeDiv}
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}

              {viewMode === "teacher" && (
                <>
                  {!teachers.length
                    ? <div style={S.emptyBox}>No teachers added.</div>
                    : (
                      <>
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:18 }}>
                          {teachers.map(t => (
                            <button key={t.id} onClick={()=>setActiveTeacher(t.code)}
                              style={{ ...S.tabBtn, ...(activeTeacher===t.code?S.tabTeacherActive:{}) }}>
                              {t.code}
                            </button>
                          ))}
                        </div>
                        {activeTeacher && teacherTTs[activeTeacher] && (
                          <TeacherTTTable
                            teacherGrid={teacherTTs[activeTeacher]}
                            caption={`Teacher: ${teachers.find(t=>t.code===activeTeacher)?.name||activeTeacher} (${activeTeacher})`}
                          />
                        )}
                      </>
                    )
                  }
                </>
              )}
            </div>
          )}
        </>
      )}

      <button className="generate-fab" disabled={generating} onClick={handleGenerate}>
        {generating ? "⏳" : "⚡"}
      </button>
    </Layout>
  );
}

const S = {
  hint:      { color:"#666", fontSize:13, lineHeight:1.75, marginBottom:14 },
  eg:        { color:"#999", fontSize:12 },
  label:     { fontSize:12, fontWeight:600, color:"#555", marginBottom:4, display:"block" },
  input:     { padding:"9px 12px", borderRadius:8, border:"1.5px solid #d0d5dd", fontSize:14, outline:"none", background:"#fafafa", color:"#333", width:"100%", boxSizing:"border-box" },
  addBtn:    { padding:"9px 20px", fontSize:14, whiteSpace:"nowrap" },
  chip:      { display:"inline-flex", alignItems:"center", gap:6, padding:"4px 10px 4px 12px", borderRadius:20, fontSize:12, fontWeight:500, border:"1px solid #d0d5dd", color:"#555" },
  chipX:     { background:"none", border:"none", cursor:"pointer", padding:0, lineHeight:1, color:"inherit", fontSize:12, opacity:0.65 },
  empty:     { color:"#aaa", fontSize:13 },
  emptyBox:  { marginTop:12, padding:"14px 18px", background:"#f8f9fb", borderRadius:8, color:"#888", fontSize:13, border:"1px dashed #d5dae3" },
  ferr:      { color:"#e05c5c", fontSize:12, marginTop:5 },
  removeBtn: { background:"none", border:"none", cursor:"pointer", color:"#e05c5c", fontSize:14, padding:"2px 6px" },
  labBadge:  { display:"inline-block", background:"#e8f5e9", color:"#2e7d32", borderRadius:10, padding:"2px 10px", fontSize:11, fontWeight:700 },
  electiveCell: { background:"#fffbf0", color:"#92400e" },
  roomBadge: { display:"inline-block", marginTop:2, background:"#ebf4ff", color:"#2c5282", borderRadius:4, padding:"1px 5px", fontSize:10, fontWeight:700, border:"1px solid #bee3f8" },
  roomSecHdr:{ padding:"6px 10px", borderRadius:6, border:"1px solid", fontSize:12, fontWeight:700, marginBottom:8, display:"flex", alignItems:"center", flexWrap:"wrap", gap:4 },
  roomRow:   { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"5px 8px", borderBottom:"1px solid #f0f0f0" },
  batchRow:  { display:"flex", alignItems:"center", gap:4, marginBottom:2, flexWrap:"wrap" },
  batchTag:  { display:"inline-block", background:"#e9d8fd", color:"#553c9a", borderRadius:4, padding:"1px 5px", fontSize:10, fontWeight:700, border:"1px solid #d6bcfa" },
  ybHeader:  { fontSize:13, fontWeight:700, color:"#445", background:"#f1f5ff", padding:"8px 14px", borderRadius:8, marginBottom:10, display:"flex", alignItems:"center" },
  table:     { width:"100%", borderCollapse:"collapse", fontSize:13, border:"1px solid #e2e8f0" },
  caption:   { background:"linear-gradient(90deg,#667eea,#764ba2)", color:"#fff", padding:"10px 16px", fontSize:14, fontWeight:700, textAlign:"left", letterSpacing:0.3 },
  th:        { background:"#f1f5ff", color:"#334", padding:"9px 10px", textAlign:"center", fontWeight:700, fontSize:11, borderBottom:"2px solid #d0d9f0", whiteSpace:"nowrap" },
  breakTh:   { background:"#fff3e0", color:"#e65100" },
  td:        { padding:"8px 10px", textAlign:"center", border:"1px solid #e8ecf5", fontSize:12, color:"#333", minWidth:110 },
  dayCell:   { padding:"8px 14px", fontWeight:700, color:"#445", background:"#f7f8ff", borderRight:"2px solid #d0d9f0", fontSize:12, whiteSpace:"nowrap" },
  breakCell: { background:"#fff3e0", color:"#e65100", fontWeight:700, fontStyle:"italic" },
  labCell:   { background:"#e8f5e9", color:"#2e7d32", fontWeight:600 },
  tabBar:    { display:"flex", gap:4, flexWrap:"wrap", marginBottom:20, borderBottom:"2px solid #e8ecf5", paddingBottom:0 },
  tab:       { padding:"9px 18px", fontSize:13, border:"none", background:"none", cursor:"pointer", color:"#888", fontWeight:500, borderBottom:"2px solid transparent", marginBottom:-2 },
  tabActive: { color:"#667eea", borderBottomColor:"#667eea", fontWeight:700 },
  tabBtn:    { padding:"7px 16px", fontSize:13, borderRadius:20, border:"1.5px solid #c8d5ea", background:"#f0f4ff", color:"#4a6fa5", cursor:"pointer", fontWeight:500 },
  tabYBActive:      { background:"linear-gradient(90deg,#667eea,#764ba2)", color:"#fff", border:"1.5px solid transparent", fontWeight:700 },
  tabTeacherActive: { background:"linear-gradient(90deg,#2d6a4f,#40916c)", color:"#fff", border:"1.5px solid transparent", fontWeight:700 },
};