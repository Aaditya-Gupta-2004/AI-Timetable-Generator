import React, { useState, useEffect } from "react";
import Layout from "./Layout";
import * as XLSX from "xlsx";

import {
  uid, norm, isCoreLab,
  apiGet, apiPost,
  generateAllTimetables,        // ✅ FIX: use generateAllTimetables instead of generateTimetable
  buildTeacherTTs, buildLabRoomTTs,
  DAYS, SLOTS, BREAK_SLOT, SLOT_LBL,
  S,
  generatePDF, generateLabRoomPDF, generateClassroomPDF,
} from "./timetableHelpers";

import Step1Setup             from "./steps/Step1Setup";
import Step2Subjects          from "./steps/Step2Subjects";
import Step3Rooms             from "./steps/Step3Rooms";
import Step4Teachers          from "./steps/Step4Teachers";
import Step5Details           from "./steps/Step5Details";
import Step6Generate          from "./steps/Step6Generate";
import LoadAllocationUploader from "./steps/Loadallocationuploader";
import { apiUrl } from "../config/api";
import {
  buildRunViews,
  deleteTimetableRun,
  fetchTimetableRun,
  fetchTimetableRuns,
  getStoredRunId,
  saveTimetableRun,
  setStoredRunId,
} from "../utils/timetableRuns";

const TABS = ["⬆️ Import", "① Setup", "② Subjects", "③ Rooms", "④ Teachers", "⑤ Details", "⑥ Generate"];

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
  const [classroomTTs,  setClassroomTTs]  = useState({});
  const [savedRuns,     setSavedRuns]     = useState([]);
  const [selectedRunId,   setSelectedRunId]   = useState(null);
  const [selectedRunMeta, setSelectedRunMeta] = useState(null);
  const [historyLoading,  setHistoryLoading]  = useState(false);
  const [apiError,   setApiError]   = useState(null);
  const [apiSuccess, setApiSuccess] = useState(null);
  const [activeTab,  setActiveTab]  = useState(0);

  // ── Run helpers ───────────────────────────────────────────────────────────
  const applyRunData = (runAllTimetables, runMeta, teacherList = teachers, roomList = rooms) => {
    const derived = buildRunViews(runAllTimetables, teacherList, roomList);
    setAllTimetables(runAllTimetables || {});
    setTeacherTTs(derived.teacherTTs);
    setLabRoomTTs(derived.labRoomTTs);
    setClassroomTTs(derived.classroomTTs);
    setGenerated(Boolean(runAllTimetables && Object.keys(runAllTimetables).length));
    setSelectedRunId(runMeta?.id || null);
    setSelectedRunMeta(runMeta || null);
    setStoredRunId(runMeta?.id || null);
  };

  const loadSavedRuns = async (preferredRunId = null, teacherList = teachers, roomList = rooms) => {
    setHistoryLoading(true);
    try {
      const runs = await fetchTimetableRuns();
      setSavedRuns(runs);
      if (!runs.length) {
        setSelectedRunId(null); setSelectedRunMeta(null); setStoredRunId(null);
        return;
      }
      const targetRun = runs.find(r => r.id === preferredRunId)
        || runs.find(r => r.id === getStoredRunId())
        || runs[0];
      const detail = await fetchTimetableRun(targetRun.id);
      applyRunData(detail.all_timetables, {
        id: detail.id, created_at: detail.created_at, ...(detail.summary || {}),
      }, teacherList, roomList);
    } catch (err) {
      console.error("Run history load failed:", err);
      setApiError(`Could not load saved timetable history: ${err.message}`);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleLoadRun  = async (runId) => { await loadSavedRuns(runId); setActiveTab(6); };

  const handleDeleteRun = async (runId) => {
    try {
      await deleteTimetableRun(runId);
      const remainingRuns = savedRuns.filter(r => r.id !== runId);
      setSavedRuns(remainingRuns);
      if (!remainingRuns.length) {
        setSelectedRunId(null); setSelectedRunMeta(null); setStoredRunId(null);
        setGenerated(false); setAllTimetables({}); setTeacherTTs({}); setLabRoomTTs({}); setClassroomTTs({});
        setApiSuccess("✅ Timetable run deleted."); return;
      }
      const nextRunId = selectedRunId === runId ? remainingRuns[0].id : selectedRunId;
      await loadSavedRuns(nextRunId);
      setApiSuccess("✅ Timetable run deleted.");
    } catch (err) {
      setApiError(`Delete failed: ${err.message}`);
    }
  };

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ybBatchCount");
      if (saved) setYbBatchCount(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    if (Object.keys(ybBatchCount).length > 0)
      localStorage.setItem("ybBatchCount", JSON.stringify(ybBatchCount));
  }, [ybBatchCount]);

  useEffect(() => {
    if (activeSubYbId) localStorage.setItem("lastActiveSubYbId", activeSubYbId);
  }, [activeSubYbId]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    Promise.all([
      apiGet("/teachers").catch(() => []),
      apiGet("/rooms").catch(() => []),
      apiGet("/year-branches").catch(() => []),
    ]).then(async ([teacherData, roomData, ybData]) => {
      if (teacherData.length) setTeachers(teacherData.map(t => ({ id: uid(), code: t.code, name: t.name })));
      if (roomData.length)    setRooms(roomData.map(rm => ({ id: uid(), number: rm.number, type: rm.type })));
      if (!ybData.length) return;

      const loadedYBs = ybData.map(yb => ({
        id: `${yb.year}-${yb.branch}`, year: yb.year, branch: yb.branch, divs: yb.divs,
      }));
      setYearBranches(loadedYBs);

      const lastActive = localStorage.getItem("lastActiveSubYbId");
      const validLast  = loadedYBs.find(yb => yb.id === lastActive);
      setActiveSubYbId(validLast ? lastActive : loadedYBs[0].id);

      const subMap = {};
      for (const yb of loadedYBs) {
        try {
          const subs    = await apiGet(`/subjects/${encodeURIComponent(yb.id)}`);
          subMap[yb.id] = subs.map(s => ({
            id: uid(), name: s.name, type: s.type,
            hours: s.hours || 0, labHours: s.lab_hours || 2, weeklyLabs: s.weekly_labs || 1,
          }));
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

  // ── Excel Import ──────────────────────────────────────────────────────────
  const handleExcelImport = (parsedData) => {
    // 1. Teachers
    const newTeachers = parsedData.teachers.map(t => ({ id: uid(), code: t.code, name: t.name }));
    setTeachers(newTeachers);

    // 2. Year-Branches
    const newYearBranches = parsedData.yearBranches.map(yb => ({
      id: `${yb.year}-${yb.branch}`, year: yb.year, branch: yb.branch, divs: yb.divs,
    }));
    setYearBranches(newYearBranches);

    // 3. Batch counts
    const newBatchCount = { ...ybBatchCount };
    newYearBranches.forEach(yb => {
      if (!newBatchCount[yb.id]) newBatchCount[yb.id] = 3;
    });
    setYbBatchCount(newBatchCount);

    // 4. Subjects — assign fresh local IDs and build oldParsedId → newLocalId map
    const newYbSubjects  = {};
    const oldIdMap = {};   // oldIdMap[ybKey][parsedSubId] = newLocalId

    Object.entries(parsedData.subjects).forEach(([ybKey, subs]) => {
      oldIdMap[ybKey] = {};
      newYbSubjects[ybKey] = subs.map(parsedSub => {
        const newId = uid();
        oldIdMap[ybKey][parsedSub.id] = newId;
        return {
          id:        newId,
          name:      parsedSub.name,
          type:      parsedSub.type,
          hours:     parsedSub.hours    || 0,
          labHours:  parsedSub.labHours || 2,
          weeklyLabs: parsedSub.weeklyLabs || 1,
        };
      });
    });
    setYbSubjects(newYbSubjects);

    if (newYearBranches.length > 0) setActiveSubYbId(newYearBranches[0].id);

    // 5. Assignments — translate parsedSubId → newLocalId
    const newAssignments = {};
    Object.entries(parsedData.assignments).forEach(([ybKey, divMap]) => {
      newAssignments[ybKey] = {};
      const idBridge = oldIdMap[ybKey] || {};
      Object.entries(divMap).forEach(([div, subAssignMap]) => {
        newAssignments[ybKey][div] = {};
        Object.entries(subAssignMap).forEach(([parsedSubId, assignVal]) => {
          const newLocalId = idBridge[parsedSubId];
          if (newLocalId && assignVal?.teacherCode) {
            newAssignments[ybKey][div][newLocalId] = { teacherCode: assignVal.teacherCode };
          }
        });
      });
    });
    setAssignments(newAssignments);

    // 6. Counsellors — init empty per div
    const newCounsellors = {};
    newYearBranches.forEach(yb => {
      newCounsellors[yb.id] = {};
      yb.divs.forEach(d => { newCounsellors[yb.id][d] = ""; });
    });
    setDivCounsellors(newCounsellors);

    setApiSuccess("✅ Data imported from Excel successfully! Teachers, subjects & assignments are pre-filled.");
    setTimeout(() => setApiSuccess(null), 4000);
    setActiveTab(1);
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getNumBatches = ybId => ybBatchCount[ybId] || 3;

  const getRoomPools = ybId => {
    const mode = roomAssignMode[ybId] || "auto";
    if (mode === "auto") return {
      theory:   rooms.filter(r => r.type === "classroom"),
      elective: rooms.filter(r => r.type === "classroom"),
      lab:      rooms.filter(r => r.type === "lab"),
    };
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

  // ── Year-Branch CRUD ──────────────────────────────────────────────────────
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
    setDivCounsellors(p => {
      const cur = { ...p }; cur[id] = {};
      divs.forEach(d => { cur[id][d] = ""; });
      return cur;
    });
    setBranchInput(""); setDivInput(""); setBatchInput("3");
  };

  const removeYB = async id => {
    const updated = yearBranches.filter(yb => yb.id !== id);
    try {
      await apiPost("/year-branches/bulk", updated.map(yb => ({ year: yb.year, branch: yb.branch, divs: yb.divs })));
    } catch (e) { setApiError(`Remove year-branch failed: ${e.message}`); return; }
    setYearBranches(updated);
    setAssignments(p    => { const n = { ...p }; delete n[id]; return n; });
    setYbSubjects(p     => { const n = { ...p }; delete n[id]; return n; });
    setYbBatchCount(p   => { const n = { ...p }; delete n[id]; return n; });
    setDivCounsellors(p => { const n = { ...p }; delete n[id]; return n; });
    setActiveSubYbId(p  => p === id ? (updated[0]?.id || "") : p);
  };

  // ── Subject CRUD ──────────────────────────────────────────────────────────
  const addSubject = async (ybId, newSub) => {
    const updated = [...getYbSubs(ybId), newSub];
    try {
      await apiPost("/subjects/bulk", {
        yb_key: ybId,
        subjects: updated.map(s => ({
          name: s.name, type: s.type, hours: s.hours,
          ...(isCoreLab(s.type) ? { lab_hours: s.labHours, weekly_labs: s.weeklyLabs } : {}),
        })),
      });
    } catch (e) { setApiError(`Save subject failed: ${e.message}`); return; }
    setYbSubjects(p => ({ ...p, [ybId]: updated }));
  };

  const updateSubject = async (ybId, subId, patch) => {
    const updated = getYbSubs(ybId).map(s => s.id === subId ? { ...s, ...patch } : s);
    try {
      await apiPost("/subjects/bulk", {
        yb_key: ybId,
        subjects: updated.map(s => ({
          name: s.name, type: s.type, hours: s.hours,
          ...(isCoreLab(s.type) ? { lab_hours: s.labHours, weekly_labs: s.weeklyLabs } : {}),
        })),
      });
    } catch (e) { setApiError(`Update subject failed: ${e.message}`); return; }
    setYbSubjects(p => ({ ...p, [ybId]: updated }));
  };

  const removeSubject = async (ybId, subId) => {
    const updated = getYbSubs(ybId).filter(s => s.id !== subId);
    try {
      await apiPost("/subjects/bulk", {
        yb_key: ybId,
        subjects: updated.map(s => ({
          name: s.name, type: s.type, hours: s.hours,
          ...(isCoreLab(s.type) ? { lab_hours: s.labHours, weekly_labs: s.weeklyLabs } : {}),
        })),
      });
    } catch (e) { setApiError(`Remove subject failed: ${e.message}`); return; }
    setYbSubjects(p => ({ ...p, [ybId]: updated }));
    setAssignments(p => {
      const copy = { ...p };
      if (copy[ybId]) {
        const divsCopy = { ...copy[ybId] };
        Object.keys(divsCopy).forEach(div => {
          const dc = { ...divsCopy[div] }; delete dc[subId]; divsCopy[div] = dc;
        });
        copy[ybId] = divsCopy;
      }
      return copy;
    });
  };

  // ── Room CRUD ─────────────────────────────────────────────────────────────
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
      await fetch(apiUrl(`/rooms/${encodeURIComponent(room.number)}`), {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
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

  // ── Teacher CRUD ──────────────────────────────────────────────────────────
  const addTeacher = async () => {
    setTError("");
    const code = tCode.trim().toUpperCase(), name = tName.trim();
    if (!code || !name) { setTError("Code and name required."); return; }
    if (teachers.find(t => t.code === code)) { setTError("Code already exists."); return; }
    try { await apiPost("/teachers", { code, name }); } catch (e) { setTError(`Save failed: ${e.message}`); return; }
    setTeachers(p => [...p, { id: uid(), code, name }]);
    setTCode(""); setTName("");
  };

  const updateTeacher = async (id, patch) => {
    const updated = teachers.map(t => t.id === id ? { ...t, ...patch } : t);
    const teacher = updated.find(t => t.id === id);
    try { await apiPost("/teachers", { code: teacher.code, name: teacher.name }); } catch (e) { setApiError(`Update teacher failed: ${e.message}`); return; }
    setTeachers(updated);
  };

  const removeTeacher = async id => {
    const teacher = teachers.find(t => t.id === id); if (!teacher) return;
    try {
      const token = localStorage.getItem("token");
      await fetch(apiUrl(`/teachers/${encodeURIComponent(teacher.code)}`), {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
    } catch (e) { setApiError(`Remove teacher failed: ${e.message}`); return; }
    setTeachers(p => p.filter(t => t.id !== id));
  };

  const setSubjectTeacher = (ybId, div, subId, teacherCode) =>
    setAssignments(p => ({
      ...p,
      [ybId]: {
        ...p[ybId],
        [div]: {
          ...(p[ybId]?.[div] || {}),
          [subId]: { ...(p[ybId]?.[div]?.[subId] || {}), teacherCode },
        },
      },
    }));

  const setDivCounsellor = (ybId, div, teacherCode) =>
    setDivCounsellors(p => ({ ...p, [ybId]: { ...(p[ybId] || {}), [div]: teacherCode } }));

  // ── Generate ──────────────────────────────────────────────────────────────
  /**
   * FIX: Use generateAllTimetables() instead of calling generateTimetable() directly.
   *
   * The old code called:
   *   generateTimetable(subs, divAssign, roomPools, numBatches, div, globalLabSlots)
   * which passed globalLabSlots as the globalTeacherSlots parameter (wrong name, missing
   * globalRoomSlots entirely). Also the new generateAllTimetables() runs normaliseAssignments()
   * internally so teacher codes stored as objects or strings both work correctly.
   */
  const handleGenerate = async () => {
    setApiError(null); setApiSuccess(null);
    if (!yearBranches.length)                                   { setApiError("Add at least one Year/Branch/Division."); return; }
    if (!yearBranches.some(yb => getYbSubs(yb.id).length > 0)) { setApiError("Add subjects for at least one Year-Branch."); return; }
    setGenerating(true);

    // Build roomPools map for all YBs
    const roomPoolsMap = {};
    yearBranches.forEach(yb => { roomPoolsMap[yb.id] = getRoomPools(yb.id); });

    // ✅ FIX: generateAllTimetables handles normalisation, both conflict maps, and correct param order
    const { allTimetables: newAllTT } = generateAllTimetables({
      yearBranches,
      ybSubjects,
      ybBatchCount,
      assignments,
      roomPools: roomPoolsMap,
    });

    setAllTimetables(newAllTT);
    setTeacherTTs(buildTeacherTTs(newAllTT, teachers));
    setLabRoomTTs(buildLabRoomTTs(newAllTT));
    setGenerated(true);
    setActiveTab(6);

    // Save to server
    try {
      await apiPost("/teachers/bulk", teachers.map(t => ({ code: t.code, name: t.name })));
      await apiPost("/rooms/bulk",    rooms.map(r => ({ number: r.number, type: r.type })));

      for (const yb of yearBranches) {
        const ybSubs = getYbSubs(yb.id); if (!ybSubs.length) continue;
        await apiPost("/subjects/bulk", {
          yb_key: yb.id,
          subjects: ybSubs.map(s => ({
            name: s.name, type: s.type, hours: s.hours,
            ...(isCoreLab(s.type) ? { lab_hours: s.labHours } : {}),
          })),
        });

        const divA = {};
        yb.divs.forEach(div => {
          divA[div] = {};
          ybSubs.forEach(sub => {
            const a = assignments?.[yb.id]?.[div]?.[sub.id];
            divA[div][sub.name] = { teacher_code: a?.teacherCode || "", room: "" };
          });
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
                batches: cell.batches
                  ? cell.batches.map(b => ({ batch: b.batch, teacher_code: b.teacherCode || "", room: b.room || "" }))
                  : null,
              };
            });
          });
        });

        await apiPost("/generate", {
          year: yb.year, branch: yb.branch, divisions: yb.divs,
          subjects: ybSubs.map(s => ({
            name: s.name, type: s.type, hours: s.hours,
            ...(isCoreLab(s.type) ? { lab_hours: s.labHours } : {}),
          })),
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

  // ── Excel Export ──────────────────────────────────────────────────────────
  const buildSheet = (grid, ybLabel, div, ybId) => {
    const activeFooterRoles = getFooterRolesForDiv(ybId, div);
    const aoa = [
      // Header section with institution details
      ["╔════════════════════════════════════════════════════════════════╗"],
      ["║                    TIMETABLE INFORMATION                       ║"],
      ["╚════════════════════════════════════════════════════════════════╝"],
      [],
      [dept],
      [semLabel],
      [`Year-Branch: ${ybLabel} | Division: ${div}`],
      [],
      // Main timetable header
      [null, null, "Day/Time", ...SLOTS.map(s => SLOT_LBL[s])],
      [],
    ];

    DAYS.forEach(day => {
      // ✅ FIX: use actual day name, not hardcoded "Mon"
      const sr = [null, null, day];
      const tc = [null, null, "Faculty"];
      const rm = [null, null, "Room"];

      SLOTS.forEach(slot => {
        const cell = grid[day]?.[slot];
        if (slot === BREAK_SLOT) {
          sr.push("BREAK"); tc.push(null); rm.push(null); return;
        }
        if (cell?.batches?.length) {
          sr.push(cell.batches.map(b => `${b.batch}:${b.subjectName}`).join(" | "));
          tc.push(cell.batches.map(b => `${b.batch}:${b.teacherCode || "—"}`).join(" | "));
          rm.push(cell.batches.map(b => `${b.batch}:${b.room || "—"}`).join(" | "));
        } else if (cell?.electives?.length) {
          sr.push(cell.subject);
          tc.push(cell.electives.map(e => `${e.name}:${e.teacherCode || "—"}`).join(" | "));
          rm.push(cell.electives.map(e => `${e.name}:${e.room || "—"}`).join(" | "));
        } else {
          sr.push(cell?.subject || "");
          tc.push(cell?.teacherCode || "");  // ✅ always a plain string from generateAllTimetables
          rm.push(cell?.room || "");
        }
      });

      aoa.push(sr, tc, rm, []);
    });

    // Subject-teacher legend
    aoa.push([]);
    aoa.push(["LEGEND: Subject, Faculty & Room Information"]);
    aoa.push([]);
    aoa.push([null, null, "Sr. No.", "Subject", "Faculty Code", "Faculty Name", "Room/Lab"]);
    const seen = new Set(); let n = 1;

    DAYS.forEach(day => SLOTS.forEach(slot => {
      const cell = grid[day]?.[slot];
      if (!cell?.subject || cell.subject === "BREAK" || cell.subject === "REMEDIAL" || seen.has(cell.subject)) return;
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
        cell.electives.forEach(e => {
          const tO = teachers.find(t => t.code === e.teacherCode);
          aoa.push([null, null, n++, e.name, e.teacherCode || "", tO?.name || "", e.room || ""]);
        });
      } else {
        const tO = teachers.find(t => t.code === cell.teacherCode);
        aoa.push([null, null, n++, cell.subject, cell.teacherCode || "", tO?.name || "", cell.room || ""]);
      }
    }));

    // Footer
    aoa.push([]);
    aoa.push(["Generated on:", new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })]);
    aoa.push([]);
    const activeRoles = activeFooterRoles.filter(r => r.role && r.name);
    if (activeRoles.length) {
      aoa.push(["AUTHORIZATION SIGNATURES:"]);
      aoa.push([]);
      const roleRow = [null, null], nameRow = [null, null];
      activeRoles.forEach((r, i) => {
        if (i > 0) { roleRow.push(null, null); nameRow.push(null, null); }
        roleRow.push(r.role); nameRow.push(r.name);
      });
      aoa.push(roleRow, [], nameRow);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Enhanced column widths for better appearance
    ws["!cols"] = [
      { wch: 2 },   // Margin
      { wch: 2 },   // Margin
      { wch: 16 },  // Day/Time column
      ...SLOTS.map(() => ({ wch: 26 }))  // Slot columns - wider for better readability
    ];
    
    // Set row heights for header rows
    ws["!rows"] = [
      { hpx: 20 }, // Row 1
      { hpx: 18 }, // Row 2
      { hpx: 20 }, // Row 3
      { hpx: 16 }  // Row 4
    ];
    
    return ws;
  };

  const downloadAll = () => {
    const wb = XLSX.utils.book_new();

    // Division sheets
    yearBranches.forEach(yb => yb.divs.forEach(div => {
      const grid = allTimetables[yb.id]?.[div];
      if (grid) XLSX.utils.book_append_sheet(wb, buildSheet(grid, yb.id, div, yb.id), `${yb.id}-${div}`.slice(0, 31));
    }));

    // Teacher sheets
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
          row.push(items.map(it =>
            `${it.subject}(${it.ybLabel}/Div${it.div}${it.batch ? `/${it.batch}` : ""}${it.room ? `[${it.room}]` : ""})`
          ).join(" | "));
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

  const downloadSinglePDF = (ybId, div) => {
    const grid = allTimetables[ybId]?.[div];
    if (!grid) return;
    const footerRoles = getFooterRolesForDiv(ybId, div);
    generatePDF(grid, `${ybId} — Division ${div}`, dept, semLabel, teachers, footerRoles);
  };

  const downloadAllPDF = () => {
    yearBranches.forEach(yb => {
      yb.divs.forEach(div => {
        const grid = allTimetables[yb.id]?.[div];
        if (!grid) return;
        setTimeout(() => downloadSinglePDF(yb.id, div), 500);
      });
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <h2 className="page-title" style={{ marginBottom: 4 }}>Generate Timetable</h2>
      {apiError   && <div className="banner banner-error" style={{ marginBottom: 14 }}>⚠️ {apiError}</div>}
      {apiSuccess && <div className="banner banner-info"  style={{ marginBottom: 14 }}>{apiSuccess}</div>}

      <div style={S.tabBar}>
        {TABS.map((t, i) => (
          <button
            key={i}
            onClick={() => setActiveTab(i)}
            style={{ ...S.tab, ...(activeTab === i ? S.tabActive : {}) }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* TAB 0 — IMPORT */}
      {activeTab === 0 && (
        <LoadAllocationUploader onDataParsed={handleExcelImport} />
      )}

      {/* TAB 1 — SETUP */}
      {activeTab === 1 && (
        <Step1Setup
          dept={dept} setDept={setDept}
          semLabel={semLabel} setSemLabel={setSemLabel}
          yearInput={yearInput} setYearInput={setYearInput}
          branchInput={branchInput} setBranchInput={setBranchInput}
          divInput={divInput} setDivInput={setDivInput}
          batchInput={batchInput} setBatchInput={setBatchInput}
          ybError={ybError} setYbError={setYbError}
          yearBranches={yearBranches} ybBatchCount={ybBatchCount}
          addYearBranch={addYearBranch} removeYB={removeYB}
          setActiveTab={setActiveTab}
        />
      )}

      {/* TAB 2 — SUBJECTS */}
      {activeTab === 2 && (
        <Step2Subjects
          yearBranches={yearBranches}
          ybSubjects={ybSubjects}
          ybBatchCount={ybBatchCount}
          addSubject={addSubject}
          updateSubject={updateSubject}
          removeSubject={removeSubject}
          setActiveTab={setActiveTab}
        />
      )}

      {/* TAB 3 — ROOMS */}
      {activeTab === 3 && (
        <Step3Rooms
          rooms={rooms} roomNum={roomNum} setRoomNum={setRoomNum}
          roomType={roomType} setRoomType={setRoomType}
          roomError={roomError} setRoomError={setRoomError}
          addRoom={addRoom} removeRoom={removeRoom}
          yearBranches={yearBranches}
          roomAssignMode={roomAssignMode} setRoomAssignMode={setRoomAssignMode}
          ybRoomConfig={ybRoomConfig} toggleRoomInPool={toggleRoomInPool}
          setActiveTab={setActiveTab}
        />
      )}

      {/* TAB 4 — TEACHERS */}
      {activeTab === 4 && (
        <Step4Teachers
          teachers={teachers}
          tCode={tCode} setTCode={setTCode}
          tName={tName} setTName={setTName}
          tError={tError} setTError={setTError}
          addTeacher={addTeacher}
          updateTeacher={updateTeacher}
          removeTeacher={removeTeacher}
          yearBranches={yearBranches}
          ybSubjects={ybSubjects}
          ybBatchCount={ybBatchCount}
          assignments={assignments}
          setSubjectTeacher={setSubjectTeacher}
          setActiveTab={setActiveTab}
        />
      )}

      {/* TAB 5 — DETAILS */}
      {activeTab === 5 && (
        <Step5Details
          yearBranches={yearBranches} teachers={teachers}
          divCounsellors={divCounsellors} setDivCounsellor={setDivCounsellor}
          footerRoles={footerRoles} setFooterRoles={setFooterRoles}
          cfRole={cfRole} setCfRole={setCfRole}
          cfName={cfName} setCfName={setCfName}
          setActiveTab={setActiveTab}
        />
      )}

      {/* TAB 6 — GENERATE */}
      {activeTab === 6 && (
        <Step6Generate
          dept={dept} semLabel={semLabel}
          rooms={rooms} yearBranches={yearBranches} teachers={teachers}
          allTimetables={allTimetables} teacherTTs={teacherTTs}
          labRoomTTs={labRoomTTs} classroomTTs={classroomTTs}
          generated={generated} generating={generating}
          handleGenerate={handleGenerate}
          downloadAll={downloadAll} downloadSingle={downloadSingle}
          downloadAllPDF={downloadAllPDF} downloadSinglePDF={downloadSinglePDF}
          getFooterRolesForDiv={getFooterRolesForDiv}
          setActiveTab={setActiveTab}
        />
      )}

      <button className="generate-fab" disabled={generating} onClick={handleGenerate}>
        {generating ? "⏳" : "⚡"}
      </button>
    </Layout>
  );
}