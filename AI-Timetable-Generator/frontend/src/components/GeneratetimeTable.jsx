import React, { useState, useEffect } from "react";
import Layout from "./Layout";
import * as XLSX from "xlsx";

// ── Helpers & constants ───────────────────────────────────────────────────────
import {
  uid, norm, isCoreLab,
  apiGet, apiPost,
  generateTimetable, buildTeacherTTs, buildLabRoomTTs,
  DAYS, SLOTS, BREAK_SLOT, SLOT_LBL,
  S,
} from "./timetableHelpers";

// ── Step components ───────────────────────────────────────────────────────────
import Step1Setup        from "./steps/Step1Setup";
import Step2Subjects     from "./steps/Step2Subjects";
import Step3Rooms        from "./steps/Step3Rooms";
import Step4Teachers     from "./steps/Step4Teachers";
import Step5Load         from "./steps/Step5Load";
import Step6PersonalTT   from "./steps/Step6PersonalTT";
import Step7Details      from "./steps/Step7Details";
import Step8Generate     from "./steps/Step8Generate";

const TABS = ["① Setup", "② Subjects", "③ Rooms", "④ Teachers", "⑤ Load", "⑥ Personal TT", "⑦ Details", "⑧ Generate"];

// ─────────────────────────────────────────────────────────────────────────────
export default function GenerateTimetable() {

  // ── Institution ───────────────────────────────────────────────────────────
  const [dept,     setDept]     = useState("Department of Information Technology");
  const [semLabel, setSemLabel] = useState("EVEN Semester (IV) 2025-2026");

  // ── Year-Branch ───────────────────────────────────────────────────────────
  const [yearInput,    setYearInput]    = useState("SE");
  const [branchInput,  setBranchInput]  = useState("");
  const [divInput,     setDivInput]     = useState("");
  const [batchInput,   setBatchInput]   = useState("3");
  const [ybError,      setYbError]      = useState("");
  const [yearBranches, setYearBranches] = useState([]);
  const [ybBatchCount, setYbBatchCount] = useState({});

  // ── Subjects ──────────────────────────────────────────────────────────────
  const [ybSubjects,    setYbSubjects]    = useState({});
  const [activeSubYbId, setActiveSubYbId] = useState("");
  const [subName,       setSubName]       = useState("");
  const [subType,       setSubType]       = useState("theory");
  const [subHours,      setSubHours]      = useState("");
  const [subLabHours,   setSubLabHours]   = useState("2");
  const [subWeeklyLabs, setSubWeeklyLabs] = useState("1");
  const [subError,      setSubError]      = useState("");
  const getYbSubs = id => ybSubjects[id] || [];

  // ── Rooms ─────────────────────────────────────────────────────────────────
  const [rooms,          setRooms]          = useState([]);
  const [roomNum,        setRoomNum]        = useState("");
  const [roomType,       setRoomType]       = useState("classroom");
  const [roomError,      setRoomError]      = useState("");
  const [roomAssignMode, setRoomAssignMode] = useState({});
  const [ybRoomConfig,   setYbRoomConfig]   = useState({});

  // ── Teachers ──────────────────────────────────────────────────────────────
  const [teachers,    setTeachers]    = useState([]);
  const [tCode,       setTCode]       = useState("");
  const [tName,       setTName]       = useState("");
  const [tError,      setTError]      = useState("");
  const [assignments, setAssignments] = useState({});

  // ── Load Management ───────────────────────────────────────────────────────
  const [teacherLoads, setTeacherLoads] = useState({});

  // ── Personal Timetables ───────────────────────────────────────────────────
  const [personalTimetables, setPersonalTimetables] = useState({});

  // ── Details ───────────────────────────────────────────────────────────────
  const [divCounsellors, setDivCounsellors] = useState({});
  const [footerRoles,    setFooterRoles]    = useState([
    { id: "hod",       role: "HOD",       name: "", locked: true },
    { id: "principal", role: "Principal", name: "", locked: true },
  ]);
  const [cfRole, setCfRole] = useState("");
  const [cfName, setCfName] = useState("");

  // ── Generate / output ─────────────────────────────────────────────────────
  const [generating,    setGenerating]    = useState(false);
  const [generated,     setGenerated]     = useState(false);
  const [allTimetables, setAllTimetables] = useState({});
  const [teacherTTs,    setTeacherTTs]    = useState({});
  const [labRoomTTs,    setLabRoomTTs]    = useState({});
  const [apiError,      setApiError]      = useState(null);
  const [apiSuccess,    setApiSuccess]    = useState(null);
  const [activeTab,     setActiveTab]     = useState(0);

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isCoreLab(subType)) { setSubLabHours("2"); setSubWeeklyLabs("1"); }
  }, [subType]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    Promise.all([
      apiGet("/teachers").catch(() => []),
      apiGet("/rooms").catch(() => []),
      apiGet("/year-branches").catch(() => []),
      apiGet("/teacher-loads").catch(() => []),
      apiGet("/personal-timetables").catch(() => ({})),
    ]).then(async ([teacherData, roomData, ybData, loadsData, ptsData]) => {
      if (teacherData.length) setTeachers(teacherData.map(t => ({ id: uid(), code: t.code, name: t.name })));
      if (roomData.length)    setRooms(roomData.map(rm => ({ id: uid(), number: rm.number, type: rm.type })));

      const lm = {};
      (loadsData || []).forEach(r => { lm[r.teacher_code] = { maxTheory: r.max_theory, maxPractical: r.max_practical }; });
      setTeacherLoads(lm);
      setPersonalTimetables(ptsData || {});

      if (!ybData.length) return;
      const loadedYBs = ybData.map(yb => ({ id: `${yb.year}-${yb.branch}`, year: yb.year, branch: yb.branch, divs: yb.divs }));
      setYearBranches(loadedYBs);
      setActiveSubYbId(loadedYBs[0].id);

      const subMap = {};
      for (const yb of loadedYBs) {
        try {
          const subs    = await apiGet(`/subjects/${encodeURIComponent(yb.id)}`);
          subMap[yb.id] = subs.map(s => ({ id: uid(), name: s.name, type: s.type, hours: s.hours || 0, labHours: s.lab_hours || 2, weeklyLabs: s.weekly_labs || 1 }));
        } catch { subMap[yb.id] = []; }
      }
      setYbSubjects(subMap);

      const newAssignments = {}, newCounsellors = {};
      for (const yb of loadedYBs) {
        newAssignments[yb.id] = {}; newCounsellors[yb.id] = {};
        yb.divs.forEach(d => { newAssignments[yb.id][d] = {}; newCounsellors[yb.id][d] = ""; });
        try {
          const saved  = await apiGet(`/assignments/${encodeURIComponent(yb.id)}`);
          const ybSubs = subMap[yb.id] || [];
          Object.entries(saved).forEach(([div, subMap2]) => {
            if (!newAssignments[yb.id][div]) newAssignments[yb.id][div] = {};
            Object.entries(subMap2).forEach(([subName, assignVal]) => {
              const subObj = ybSubs.find(s => s.name === subName);
              if (subObj) newAssignments[yb.id][div][subObj.id] = { teacherCode: assignVal.teacher_code || "" };
            });
          });
        } catch {}
      }
      setAssignments(newAssignments);
      setDivCounsellors(newCounsellors);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (yearBranches.length > 0) {
      const last = yearBranches[yearBranches.length - 1];
      if (!ybSubjects[last.id]) setYbSubjects(p => ({ ...p, [last.id]: [] }));
      if (!activeSubYbId)       setActiveSubYbId(last.id);
    }
  }, [yearBranches, activeSubYbId, ybSubjects]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getNumBatches = ybId => ybBatchCount[ybId] || 3;

  const getRoomPools = ybId => {
    const mode = roomAssignMode[ybId] || "auto";
    if (mode === "auto") return { theory: rooms.filter(r => r.type === "classroom"), elective: rooms.filter(r => r.type === "classroom"), lab: rooms.filter(r => r.type === "lab") };
    const config = ybRoomConfig[ybId] || { theory: [], elective: [], lab: [] };
    return {
      theory:   rooms.filter(r => (config.theory   || []).includes(r.number)),
      elective: rooms.filter(r => (config.elective || []).includes(r.number)),
      lab:      rooms.filter(r => (config.lab      || []).includes(r.number)),
    };
  };

  const getFooterRolesForDiv = (ybId, div) => {
    const counsellorCode    = divCounsellors?.[ybId]?.[div] || "";
    const counsellorTeacher = teachers.find(t => t.code === counsellorCode);
    const counsellorName    = counsellorTeacher?.name || counsellorCode || "";
    const roles = [];
    if (counsellorName) roles.push({ id: `cc-${div}`, role: `Class Counsellor (Div ${div})`, name: counsellorName });
    roles.push(...footerRoles);
    return roles;
  };

  // ── CRUD actions ──────────────────────────────────────────────────────────
  const addYearBranch = async () => {
    setYbError("");
    const year = yearInput.trim().toUpperCase(), branch = branchInput.trim().toUpperCase();
    if (!year || !branch) { setYbError("Year and branch required."); return; }
    const divs       = divInput.split(/[\s,]+/).map(norm).filter(Boolean);
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
    setDivCounsellors(p => { const cur = { ...p }; cur[id] = {}; divs.forEach(d => { cur[id][d] = ""; }); return cur; });
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

  const addSubject = async (subNameRef) => {
    setSubError("");
    if (!activeSubYbId)  { setSubError("Select a Year-Branch first."); return; }
    if (!subName.trim()) { setSubError("Enter subject name."); return; }
    const coreLab = isCoreLab(subType);
    if (!coreLab && (!subHours || parseInt(subHours) < 1))   { setSubError("Enter hours/week."); return; }
    if (coreLab  && (!subLabHours || !subWeeklyLabs))         { setSubError("Enter lab hours/session and sessions/week."); return; }
    const newSub  = { id: uid(), name: subName.trim(), type: subType, hours: coreLab ? 0 : parseInt(subHours), labHours: coreLab ? parseInt(subLabHours) : 0, weeklyLabs: coreLab ? parseInt(subWeeklyLabs) : 0 };
    const updated = [...getYbSubs(activeSubYbId), newSub];
    try { await apiPost("/subjects/bulk", { yb_key: activeSubYbId, subjects: updated.map(s => ({ name: s.name, type: s.type, hours: s.hours, ...(isCoreLab(s.type) ? { lab_hours: s.labHours } : {}) })) }); } catch (e) { setApiError(`Save subject failed: ${e.message}`); }
    setYbSubjects(p => ({ ...p, [activeSubYbId]: updated }));
    setSubName(""); setSubHours(""); setSubLabHours("2"); setSubWeeklyLabs("1");
    subNameRef?.current?.focus();
  };

  const removeSubject = async (ybId, id) => {
    const updated = getYbSubs(ybId).filter(s => s.id !== id);
    try { await apiPost("/subjects/bulk", { yb_key: ybId, subjects: updated.map(s => ({ name: s.name, type: s.type, hours: s.hours, ...(isCoreLab(s.type) ? { lab_hours: s.labHours } : {}) })) }); } catch (e) { setApiError(`Remove failed: ${e.message}`); return; }
    setYbSubjects(p => ({ ...p, [ybId]: updated }));
  };

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
    const room = rooms.find(r => r.id === id); if (!room) return;
    try {
      const token = localStorage.getItem("token");
      await fetch(`https://ai-timetable-generator-j7qx.onrender.com/rooms/${encodeURIComponent(room.number)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    } catch (e) { setApiError(`Remove room failed: ${e.message}`); return; }
    setRooms(p => p.filter(r => r.id !== id));
  };

  const toggleRoomInPool = (ybId, poolKey, roomNumber) => {
    setYbRoomConfig(p => {
      const cur     = p[ybId] || { theory: [], elective: [], lab: [] };
      const pool    = cur[poolKey] || [];
      const updated = pool.includes(roomNumber) ? pool.filter(r => r !== roomNumber) : [...pool, roomNumber];
      return { ...p, [ybId]: { ...cur, [poolKey]: updated } };
    });
  };

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
    const teacher = teachers.find(t => t.id === id); if (!teacher) return;
    try {
      const token = localStorage.getItem("token");
      await fetch(`https://ai-timetable-generator-j7qx.onrender.com/teachers/${encodeURIComponent(teacher.code)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    } catch (e) { setApiError(`Remove teacher failed: ${e.message}`); return; }
    setTeachers(p => p.filter(t => t.id !== id));
  };

  const setSubjectTeacher = (ybId, div, subId, teacherCode) =>
    setAssignments(p => ({ ...p, [ybId]: { ...p[ybId], [div]: { ...p[ybId]?.[div], [subId]: { ...(p[ybId]?.[div]?.[subId] || {}), teacherCode } } } }));

  const setDivCounsellor = (ybId, div, teacherCode) =>
    setDivCounsellors(p => ({ ...p, [ybId]: { ...(p[ybId] || {}), [div]: teacherCode } }));

  // ── Generate ──────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    setApiError(null); setApiSuccess(null);
    if (!yearBranches.length)                                             { setApiError("Add at least one Year/Branch/Division."); return; }
    if (!yearBranches.some(yb => getYbSubs(yb.id).length > 0))           { setApiError("Add subjects for at least one Year-Branch."); return; }
    setGenerating(true);

    const newAllTT = {}, globalLabSlots = {};
    yearBranches.forEach(yb => {
      const subs = getYbSubs(yb.id); if (!subs.length) return;
      newAllTT[yb.id] = {};
      const numBatches = getNumBatches(yb.id), roomPools = getRoomPools(yb.id);
      yb.divs.forEach(div => {
        const divAssign = {};
        subs.forEach(sub => { const a = assignments?.[yb.id]?.[div]?.[sub.id] || {}; divAssign[sub.id] = { teacherCode: a.teacherCode || "" }; });
        newAllTT[yb.id][div] = generateTimetable(subs, divAssign, roomPools, numBatches, div, globalLabSlots);
      });
    });

    setAllTimetables(newAllTT);
    setTeacherTTs(buildTeacherTTs(newAllTT, teachers));
    setLabRoomTTs(buildLabRoomTTs(newAllTT));
    setGenerated(true);
    setActiveTab(7);

    try {
      await apiPost("/teachers/bulk", teachers.map(t => ({ code: t.code, name: t.name })));
      await apiPost("/rooms/bulk",    rooms.map(r => ({ number: r.number, type: r.type })));
      for (const yb of yearBranches) {
        const ybSubs = getYbSubs(yb.id); if (!ybSubs.length) continue;
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
              ybTT[div][day][slot] = {
                subject:      cell.subject,
                teacher_code: cell.teacherCode || "",
                room:         cell.room || "",
                batches:      cell.batches ? cell.batches.map(b => ({ batch: b.batch, teacher_code: b.teacherCode || "", room: b.room || "" })) : null,
              };
            });
          });
        });
        await apiPost("/generate", {
          year: yb.year, branch: yb.branch, divisions: yb.divs,
          subjects: ybSubs.map(s => ({ name: s.name, type: s.type, hours: s.hours, ...(isCoreLab(s.type) ? { lab_hours: s.labHours } : {}) })),
          teacher_assignments: divA,
          timetables: ybTT,
        });
      }
      setApiSuccess("✅ All data saved successfully!");
    } catch (e) {
      setApiError(`⚠️ Server save failed: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  // ── Excel export ──────────────────────────────────────────────────────────
  const buildSheet = (grid, ybLabel, div, ybId) => {
    const activeFooterRoles = getFooterRolesForDiv(ybId, div);
    const aoa = [
      [], [],
      [null, null, dept],
      [null, null, `  Time Table ${semLabel}`],
      [null, null, null, null, null, null, null, null, null, null, `${ybLabel}-${div}`],
      [null, null, "Day/Time", ...SLOTS.map(s => SLOT_LBL[s])],
      [],
    ];
    DAYS.forEach(day => {
      const sr = [null, null, "Mon"], tc = [null, null, "Faculty"], rm = [null, null, "Room"];
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
          rm.push(cell.electives.map(e => `${e.name}:${e.room || "—"}`).join(" | "));
        } else {
          sr.push(cell?.subject || ""); tc.push(cell?.teacherCode || ""); rm.push(cell?.room || "");
        }
      });
      aoa.push(sr, tc, rm, []);
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
          if (shownSubs.has(b.subjectName)) return; shownSubs.add(b.subjectName);
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
    const activeRoles = activeFooterRoles.filter(r => r.role && r.name);
    const roleRow = [null, null], nameRow = [null, null];
    activeRoles.forEach((r, i) => { if (i > 0) { roleRow.push(null, null); nameRow.push(null, null); } roleRow.push(r.role); nameRow.push(r.name); });
    aoa.push(roleRow, nameRow);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 2 }, { wch: 2 }, { wch: 14 }, ...SLOTS.map(() => ({ wch: 24 }))];
    return ws;
  };

  const downloadAll = () => {
    const wb = XLSX.utils.book_new();
    yearBranches.forEach(yb => yb.divs.forEach(div => {
      const grid = allTimetables[yb.id]?.[div];
      if (grid) XLSX.utils.book_append_sheet(wb, buildSheet(grid, yb.id, div, yb.id), `${yb.id}-${div}`.slice(0, 31));
    }));
    teachers.forEach(t => {
      const ttG = teacherTTs[t.code]; if (!ttG) return;
      const aoa = [
        [null, null, dept],
        [null, null, `Teacher TT – ${t.name} (${t.code})`],
        [null, null, "Day/Time", ...SLOTS.map(s => SLOT_LBL[s])],
        [],
      ];
      DAYS.forEach(day => {
        const row = [null, null, day];
        SLOTS.forEach(slot => {
          if (slot === BREAK_SLOT) { row.push("BREAK"); return; }
          const items = ttG[day]?.[slot] || [];
          row.push(items.map(it => `${it.subject}(${it.ybLabel}/Div${it.div}${it.batch ? `/${it.batch}` : ""}${it.room ? `[${it.room}]` : ""})`).join(" | "));
        });
        aoa.push(row, []);
      });
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = [{ wch: 2 }, { wch: 2 }, { wch: 14 }, ...SLOTS.map(() => ({ wch: 26 }))];
      XLSX.utils.book_append_sheet(wb, ws, `T-${t.code.replace(/[/\s]+/g, "_")}`.slice(0, 31));
    });
    XLSX.writeFile(wb, `Timetables_${dept.replace(/\s+/g, "_")}.xlsx`);
  };

  const downloadSingle = (ybId, div) => {
    const grid = allTimetables[ybId]?.[div]; if (!grid) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, buildSheet(grid, ybId, div, ybId), `${ybId}-${div}`);
    XLSX.writeFile(wb, `TT_${ybId}_Div${div}.xlsx`);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <h2 className="page-title" style={{ marginBottom: 4 }}>Generate Timetable</h2>
      {apiError   && <div className="banner banner-error" style={{ marginBottom: 14 }}>⚠️ {apiError}</div>}
      {apiSuccess && <div className="banner banner-info"  style={{ marginBottom: 14 }}>{apiSuccess}</div>}

      {/* Tab bar */}
      <div style={S.tabBar}>
        {TABS.map((t, i) => (
          <button key={i} onClick={() => setActiveTab(i)} style={{ ...S.tab, ...(activeTab === i ? S.tabActive : {}) }}>{t}</button>
        ))}
      </div>

      {activeTab === 0 && <Step1Setup dept={dept} setDept={setDept} semLabel={semLabel} setSemLabel={setSemLabel} yearInput={yearInput} setYearInput={setYearInput} branchInput={branchInput} setBranchInput={setBranchInput} divInput={divInput} setDivInput={setDivInput} batchInput={batchInput} setBatchInput={setBatchInput} ybError={ybError} setYbError={setYbError} yearBranches={yearBranches} ybBatchCount={ybBatchCount} addYearBranch={addYearBranch} removeYB={removeYB} setActiveTab={setActiveTab} />}

      {activeTab === 1 && <Step2Subjects yearBranches={yearBranches} ybSubjects={ybSubjects} activeSubYbId={activeSubYbId} setActiveSubYbId={setActiveSubYbId} subName={subName} setSubName={setSubName} subType={subType} setSubType={setSubType} subHours={subHours} setSubHours={setSubHours} subLabHours={subLabHours} setSubLabHours={setSubLabHours} subWeeklyLabs={subWeeklyLabs} setSubWeeklyLabs={setSubWeeklyLabs} subError={subError} setSubError={setSubError} addSubject={addSubject} removeSubject={removeSubject} ybBatchCount={ybBatchCount} setActiveTab={setActiveTab} />}

      {activeTab === 2 && <Step3Rooms rooms={rooms} roomNum={roomNum} setRoomNum={setRoomNum} roomType={roomType} setRoomType={setRoomType} roomError={roomError} setRoomError={setRoomError} addRoom={addRoom} removeRoom={removeRoom} yearBranches={yearBranches} roomAssignMode={roomAssignMode} setRoomAssignMode={setRoomAssignMode} ybRoomConfig={ybRoomConfig} toggleRoomInPool={toggleRoomInPool} setActiveTab={setActiveTab} />}

      {activeTab === 3 && <Step4Teachers teachers={teachers} tCode={tCode} setTCode={setTCode} tName={tName} setTName={setTName} tError={tError} setTError={setTError} addTeacher={addTeacher} removeTeacher={removeTeacher} yearBranches={yearBranches} ybSubjects={ybSubjects} ybBatchCount={ybBatchCount} assignments={assignments} setSubjectTeacher={setSubjectTeacher} setActiveTab={setActiveTab} />}

      {activeTab === 4 && <Step5Load teachers={teachers} teacherLoads={teacherLoads} setTeacherLoads={setTeacherLoads} setActiveTab={setActiveTab} />}

      {activeTab === 5 && <Step6PersonalTT teachers={teachers} yearBranches={yearBranches} personalTimetables={personalTimetables} setPersonalTimetables={setPersonalTimetables} activeTab={activeTab} setActiveTab={setActiveTab} />}

      {activeTab === 6 && <Step7Details yearBranches={yearBranches} teachers={teachers} divCounsellors={divCounsellors} setDivCounsellor={setDivCounsellor} footerRoles={footerRoles} setFooterRoles={setFooterRoles} cfRole={cfRole} setCfRole={setCfRole} cfName={cfName} setCfName={setCfName} setActiveTab={setActiveTab} />}

      {activeTab === 7 && <Step8Generate dept={dept} semLabel={semLabel} rooms={rooms} yearBranches={yearBranches} teachers={teachers} allTimetables={allTimetables} teacherTTs={teacherTTs} labRoomTTs={labRoomTTs} generated={generated} generating={generating} handleGenerate={handleGenerate} downloadAll={downloadAll} downloadSingle={downloadSingle} getFooterRolesForDiv={getFooterRolesForDiv} setActiveTab={setActiveTab} />}

      <button className="generate-fab" disabled={generating} onClick={handleGenerate}>{generating ? "⏳" : "⚡"}</button>
    </Layout>
  );
}