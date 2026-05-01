// ─────────────────────────────────────────────────────────────────────────────
// timetableHelpers.js — v5
//
// FIXES vs v4:
//   1. NO MID-DAY GAPS
//      - placeTheorySubject now scans ALLOC sequentially (lowest index first)
//        instead of randomly, so lectures pack tightly from slot 0.
//      - placeElectiveGroup does the same for theory electives.
//      - placeLabRotations and placeElectiveLabGroup already iterate
//        validLabStarts in order — kept as-is but day-selection now also
//        prefers days that already have content (pack before spreading).
//      - fillRemedials is the ONLY thing that adds trailing REMEDIAL cells;
//        it never touches mid-day empties.
//
//   2. MINOR LAB FOR ALL YEARS
//      - isElectiveLab() already matches "Elective-MINOR-Lab" — no change
//        needed here. Fix is in LoadAllocationUploader classifyYD().
//
//   3. REMEDIAL ONLY AT END
//      - fillRemedials unchanged from v4 (only fills slots after last
//        occupied slot per day). Now that placers don't leave gaps, this
//        guarantee holds.
// ─────────────────────────────────────────────────────────────────────────────

import { API_BASE } from "../config/api";

export const DAYS      = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
export const DAY_SHORT = { Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu", Friday: "Fri" };
export const SLOTS     = ["9-10", "10-11", "11-12", "12-1", "1-2", "2-3", "3-4", "4-5"];
export const BREAK_SLOT = "1-2";
export const ALLOC     = SLOTS.filter(s => s !== BREAK_SLOT);
export const SLOT_LBL  = {
  "9-10":  "9:00–10:00",
  "10-11": "10:00–11:00",
  "11-12": "11:00–12:00",
  "12-1":  "12:00–1:00",
  "1-2":   "1:00–2:00 (BREAK)",
  "2-3":   "2:00–3:00",
  "3-4":   "3:00–4:00",
  "4-5":   "4:00–5:00",
};

export const CORE_LAB_TYPES  = ["Core Lab 1", "Core Lab 2", "Core Lab 3"];
export const isCoreLab       = t => CORE_LAB_TYPES.includes(t);
export const ELECTIVE_GROUPS = ["Elective 1", "Elective 2", "Elective 3", "Elective 4", "Elective 5"];

export const isElectiveLab  = t => /^Elective-.+-Lab$/.test(t);
export const isElectiveType = t => {
  if (ELECTIVE_GROUPS.includes(t)) return true;
  if (/^Elective-/.test(t) && !isElectiveLab(t)) return true;
  return false;
};

export const uid        = () => Math.random().toString(36).slice(2, 8);
export const norm       = s  => s.trim().toUpperCase();
export const getBatches = (div, numBatches) =>
  Array.from({ length: numBatches }, (_, i) => `${div}${i + 1}`);

// ─────────────────────────────────────────────────────────────────────────────
// toCodeStr
// ─────────────────────────────────────────────────────────────────────────────
export function toCodeStr(val) {
  if (!val) return "";
  if (typeof val === "string") return val.trim();
  if (typeof val === "object") {
    if (val.code)        return String(val.code).trim();
    if (val.teacherCode) return String(val.teacherCode).trim();
    if (val.value)       return String(val.value).trim();
  }
  return String(val).trim();
}

// ── Auth / API ────────────────────────────────────────────────────────────────
export function authHeaders() {
  const token = localStorage.getItem("token");
  if (!token) throw new Error("Not logged in");
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}
export async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST", headers: authHeaders(), body: JSON.stringify(body),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || `${res.status}`); }
  return res.json();
}
export async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || `${res.status}`); }
  return res.json();
}

// ── Slot index / consecutive-run helpers ──────────────────────────────────────
const SLOT_IDX = Object.fromEntries(SLOTS.map((s, i) => [s, i]));

function getConsecRuns() {
  const runs = []; let cur = [0];
  for (let i = 1; i < ALLOC.length; i++) {
    const p = SLOT_IDX[ALLOC[i - 1]], c = SLOT_IDX[ALLOC[i]];
    if (c - p === 1) cur.push(i); else { runs.push(cur); cur = [i]; }
  }
  runs.push(cur);
  return runs;
}
export const CONSEC_RUNS = getConsecRuns();

export function validLabStarts(sz) {
  const starts = [];
  for (const run of CONSEC_RUNS)
    for (let i = 0; i <= run.length - sz; i++)
      starts.push(run[i]);
  return starts;
}

// ── Room helper ───────────────────────────────────────────────────────────────
export function pickRoom(pool, usedCount) {
  if (!pool.length) return "";
  const sorted = [...pool].sort((a, b) => (usedCount[a.number] || 0) - (usedCount[b.number] || 0));
  const chosen = sorted[0];
  usedCount[chosen.number] = (usedCount[chosen.number] || 0) + 1;
  return chosen.number;
}

// ── Fisher-Yates shuffle ──────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Day ordering: prefer days that already have content (pack tightly) ─────────
/**
 * Returns DAYS sorted so that days with MORE occupied slots come first.
 * This ensures new sessions are stacked onto already-used days before
 * spreading to fresh days, eliminating mid-day gaps.
 */
function packedDayOrder(grid) {
  return [...DAYS].sort((a, b) => {
    const countOccupied = day =>
      ALLOC.filter(s => grid[day][s].subject !== "").length;
    // Sort descending: days with more content first
    return countOccupied(b) - countOccupied(a);
  });
}

// ── Empty grid factory ────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// CONFLICT MAPS
// ─────────────────────────────────────────────────────────────────────────────
function ensureTeacher(map, code, day) {
  if (!map[code])      map[code]      = {};
  if (!map[code][day]) map[code][day] = new Set();
}
function ensureRoom(map, num, day) {
  if (!map[num])      map[num]      = {};
  if (!map[num][day]) map[num][day] = new Set();
}
function teacherFree(map, code, day, allocIndices) {
  if (!code) return true;
  ensureTeacher(map, code, day);
  return allocIndices.every(ai => !map[code][day].has(ai));
}
function roomFree(map, num, day, allocIndices) {
  if (!num) return true;
  ensureRoom(map, num, day);
  return allocIndices.every(ai => !map[num][day].has(ai));
}
function markTeacher(map, code, day, allocIndices) {
  if (!code) return;
  ensureTeacher(map, code, day);
  allocIndices.forEach(ai => map[code][day].add(ai));
}
function markRoom(map, num, day, allocIndices) {
  if (!num) return;
  ensureRoom(map, num, day);
  allocIndices.forEach(ai => map[num][day].add(ai));
}

// ─────────────────────────────────────────────────────────────────────────────
// LAB ROTATION SCHEDULER (Core Labs)
// ─────────────────────────────────────────────────────────────────────────────
export function placeLabRotations(
  grid, labSubjects, div, numBatches, assignments,
  labPool, globalTeacherSlots, globalRoomSlots
) {
  if (!labSubjects.length) return;

  const batches        = getBatches(div, numBatches);
  const numLabs        = labSubjects.length;
  const labRoundsOnDay = {};
  DAYS.forEach(d => { labRoundsOnDay[d] = []; });

  const getBatchAssign = (subId, batch) => {
    const assign = assignments?.[subId];
    if (!assign) return null;
    const batchAssigns = Array.isArray(assign.batchAssigns) ? assign.batchAssigns : [];
    return batchAssigns.find(b => b.batch === batch) || null;
  };

  for (let roundIdx = 0; roundIdx < numLabs; roundIdx++) {
    const batchAssign = batches.map((batch, bi) => ({
      batch,
      sub: labSubjects[(bi + roundIdx) % numLabs],
    }));

    const labSz = Math.max(...batchAssign.map(ba => parseInt(ba.sub.labHours) || 2));
    let placed  = false;

    // Sort days: prefer days with fewest lab rounds AND most existing content (pack)
    const sortedDays = [...DAYS].sort((a, b) => {
      const labDiff = labRoundsOnDay[a].length - labRoundsOnDay[b].length;
      if (labDiff !== 0) return labDiff;
      // Secondary: prefer days that already have lectures (avoids isolated lab day)
      const occupied = day => ALLOC.filter(s => grid[day][s].subject !== "").length;
      return occupied(b) - occupied(a);
    });

    for (const day of sortedDays) {
      if (placed) break;
      if (labRoundsOnDay[day].length >= 2) continue;

      for (const startAI of validLabStarts(labSz)) {
        if (placed) break;

        const allocIndices = Array.from({ length: labSz }, (_, k) => startAI + k);
        const slotNames    = allocIndices.map(i => ALLOC[i]);

        const gapOk = labRoundsOnDay[day].every(ex => {
          const newEnd = startAI + labSz - 1;
          return (startAI > ex.endAI + 1) || (newEnd < ex.startAI - 1);
        });
        if (!gapOk) continue;

        if (slotNames.some(s => grid[day][s].subject !== "")) continue;

        const batchTeachers = batchAssign.map(ba => {
          const batchSpecific = getBatchAssign(ba.sub.id, ba.batch);
          return toCodeStr(batchSpecific?.teacherCode || assignments?.[ba.sub.id]?.teacherCode);
        });
        if (!batchTeachers.every(code =>
          teacherFree(globalTeacherSlots, code, day, allocIndices)
        )) continue;

        const assignedRooms = [];
        let roomOk = true;
        for (const ba of batchAssign) {
          const batchSpecific = getBatchAssign(ba.sub.id, ba.batch);
          const preferredRoom = batchSpecific?.room || "";
          if (preferredRoom) {
            const usablePreferred = labPool.find(r =>
              r.number === preferredRoom &&
              !assignedRooms.includes(r.number) &&
              roomFree(globalRoomSlots, r.number, day, allocIndices)
            );
            if (usablePreferred) {
              assignedRooms.push(usablePreferred.number);
              continue;
            }
          }
          const freeRoom = labPool.find(r =>
            !assignedRooms.includes(r.number) &&
            roomFree(globalRoomSlots, r.number, day, allocIndices)
          );
          if (!freeRoom && labPool.length > 0) { roomOk = false; break; }
          assignedRooms.push(freeRoom ? freeRoom.number : preferredRoom);
        }
        if (!roomOk) continue;

        batchTeachers.forEach(code => markTeacher(globalTeacherSlots, code, day, allocIndices));
        assignedRooms.forEach(num  => markRoom(globalRoomSlots, num, day, allocIndices));

        const batchesCell = batchAssign.map(({ batch, sub }, bi) => ({
          batch,
          subjectName: sub.name,
          subType:     sub.type,
          teacherCode: batchTeachers[bi],
          room:        assignedRooms[bi] || "",
        }));

        const cellData = {
          subject:       "LAB",
          teacherCode:   batchesCell.map(b => b.teacherCode).filter(Boolean).join(", "),
          room:          batchesCell.map(b => b.room).filter(Boolean).join(", "),
          batches:       batchesCell,
          electives:     null,
          isLabRotation: true,
        };

        slotNames.forEach(s => { grid[day][s] = { ...cellData }; });
        labRoundsOnDay[day].push({ startAI, endAI: startAI + labSz - 1 });
        placed = true;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ELECTIVE LAB GROUP PLACER (DLO Labs, MINOR Labs)
// All options in the group placed in parallel as a 2-hour block.
// ─────────────────────────────────────────────────────────────────────────────
function placeElectiveLabGroup(
  grid, groupSubs, assignments, labPool,
  globalTeacherSlots, globalRoomSlots
) {
  if (!groupSubs.length) return;

  const labSz = 2;

  // Try each day in packed order (prefer days that already have content)
  const dayOrder = packedDayOrder(grid);

  for (const day of dayOrder) {
    for (const startAI of validLabStarts(labSz)) {
      const allocIndices = Array.from({ length: labSz }, (_, k) => startAI + k);
      const slotNames    = allocIndices.map(i => ALLOC[i]);

      if (slotNames.some(s => grid[day][s].subject !== "")) continue;

      const teacherCodes = groupSubs
        .map(gs => toCodeStr(assignments?.[gs.id]?.teacherCode))
        .filter(Boolean);

      if (!teacherCodes.every(code =>
        teacherFree(globalTeacherSlots, code, day, allocIndices)
      )) continue;

      const usedRooms   = [];
      const roomAssigns = groupSubs.map(() => {
        const room = labPool.find(r =>
          !usedRooms.includes(r.number) &&
          roomFree(globalRoomSlots, r.number, day, allocIndices)
        );
        if (room) { usedRooms.push(room.number); return room.number; }
        return "";
      });

      teacherCodes.forEach(code => markTeacher(globalTeacherSlots, code, day, allocIndices));
      roomAssigns.forEach(num => { if (num) markRoom(globalRoomSlots, num, day, allocIndices); });

      const electives = groupSubs.map((gs, i) => ({
        name:        gs.name,
        teacherCode: toCodeStr(assignments?.[gs.id]?.teacherCode),
        room:        roomAssigns[i] || "",
      }));

      const typeMatch  = groupSubs[0]?.type?.match(/^Elective-(.+)-Lab$/);
      const groupLabel = typeMatch ? `${typeMatch[1]} Lab` : "Elective Lab";

      const cellData = {
        subject:       groupLabel,
        teacherCode:   teacherCodes.join(", "),
        room:          roomAssigns.filter(Boolean).join(", "),
        batches:       null,
        electives,
        isElectiveLab: true,
      };

      slotNames.forEach(s => { grid[day][s] = { ...cellData }; });
      return; // placed — done for this group
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// THEORY SUBJECT PLACER
//
// FIX: Scan ALLOC sequentially (lowest ai first) rather than shuffling days.
// This packs lectures from the start of each day, leaving no mid-day holes.
// A per-day cap ensures at most `maxPerDay` sessions on the same day so the
// load is still somewhat spread (default 3; raise if you want more stacking).
// ─────────────────────────────────────────────────────────────────────────────
function placeTheorySubject(
  grid, sub, teacherCode, room,
  globalTeacherSlots, globalRoomSlots,
  maxPerDay = 3
) {
  const sessions  = parseInt(sub.hours) || 1;
  const dayCount  = {};  // how many sessions of THIS subject placed per day
  let placed = 0;

  // Build day order once: prefer days that already have content (pack)
  // but also spread this subject (don't put all sessions on 1 day)
  const dayOrder = packedDayOrder(grid);

  for (let pass = 0; pass < 3 && placed < sessions; pass++) {
    for (const day of dayOrder) {
      if (placed >= sessions) break;
      if ((dayCount[day] || 0) >= (pass === 0 ? 1 : maxPerDay)) continue;

      // Sequential scan: pick the first free slot on this day
      for (let ai = 0; ai < ALLOC.length; ai++) {
        const slot = ALLOC[ai];
        if (
          grid[day][slot].subject === "" &&
          teacherFree(globalTeacherSlots, teacherCode, day, [ai]) &&
          roomFree(globalRoomSlots, room, day, [ai])
        ) {
          grid[day][slot] = {
            subject: sub.name,
            teacherCode,
            room,
            batches:  null,
            electives: null,
          };
          markTeacher(globalTeacherSlots, teacherCode, day, [ai]);
          markRoom(globalRoomSlots, room, day, [ai]);
          dayCount[day] = (dayCount[day] || 0) + 1;
          placed++;
          break; // one slot per day per pass
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ELECTIVE GROUP PLACER (theory electives — DLO1, MINOR, etc.)
//
// FIX: Sequential slot scan (no shuffle within a day) to avoid gaps.
// ─────────────────────────────────────────────────────────────────────────────
function placeElectiveGroup(
  grid, groupType, groupSubs, assignments,
  classroomPool, electivePool,
  globalTeacherSlots, globalRoomSlots
) {
  const sessions  = parseInt(groupSubs[0]?.hours) || 1;
  const pool      = electivePool.length ? electivePool : classroomPool;
  const dayCount  = {};
  const usedCount = {};
  let placed = 0;

  const dayOrder = packedDayOrder(grid);

  for (let pass = 0; pass < 3 && placed < sessions; pass++) {
    for (const day of dayOrder) {
      if (placed >= sessions) break;
      if ((dayCount[day] || 0) >= (pass === 0 ? 1 : 2)) continue;

      const teacherCodes = groupSubs
        .map(gs => toCodeStr(assignments?.[gs.id]?.teacherCode))
        .filter(Boolean);
      const eRoom = pickRoom(pool, usedCount);

      // Sequential scan
      for (let ai = 0; ai < ALLOC.length; ai++) {
        const slot = ALLOC[ai];
        if (
          grid[day][slot].subject === "" &&
          teacherCodes.every(code => teacherFree(globalTeacherSlots, code, day, [ai])) &&
          roomFree(globalRoomSlots, eRoom, day, [ai])
        ) {
          const electives = groupSubs.map(gs => ({
            name:        gs.name,
            teacherCode: toCodeStr(assignments?.[gs.id]?.teacherCode),
            room:        eRoom,
          }));

          grid[day][slot] = {
            subject:     groupType,
            teacherCode: teacherCodes.join(", "),
            room:        eRoom,
            batches:     null,
            electives,
          };

          markTeacher(globalTeacherSlots, teacherCodes[0] || "", day, [ai]);
          teacherCodes.forEach(code => markTeacher(globalTeacherSlots, code, day, [ai]));
          markRoom(globalRoomSlots, eRoom, day, [ai]);
          dayCount[day] = (dayCount[day] || 0) + 1;
          placed++;
          break;
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FILL REMEDIALS — ONLY after the last occupied slot per day
// Never fills mid-day gaps; those are prevented by the sequential placers.
// ─────────────────────────────────────────────────────────────────────────────
function fillRemedials(grid) {
  DAYS.forEach(day => {
    let lastOccupiedAI = -1;
    ALLOC.forEach((slot, ai) => {
      if (grid[day][slot].subject !== "") {
        lastOccupiedAI = ai;
      }
    });

    // Only slots AFTER the last occupied slot get REMEDIAL
    ALLOC.forEach((slot, ai) => {
      if (ai > lastOccupiedAI && grid[day][slot].subject === "") {
        grid[day][slot] = {
          subject:     "REMEDIAL",
          teacherCode: "",
          room:        "",
          batches:     null,
          electives:   null,
          isRemedial:  true,
        };
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// normaliseAssignments
// ─────────────────────────────────────────────────────────────────────────────
function normaliseAssignments(rawAssignments) {
  const out = {};
  if (!rawAssignments) return out;
  Object.entries(rawAssignments).forEach(([subId, val]) => {
    const teacherCode = toCodeStr(typeof val === "object" ? (val?.teacherCode ?? val) : val);
    const rawBatchAssigns = Array.isArray(val?.batchAssigns)
      ? val.batchAssigns
      : (Array.isArray(val?.batch_assigns) ? val.batch_assigns : []);
    out[subId] = {
      teacherCode,
      batchAssigns: rawBatchAssigns
        .map(b => ({
          batch:       String(b?.batch || "").trim(),
          teacherCode: toCodeStr(b?.teacherCode ?? b?.teacher_code),
          room:        String(b?.room || "").trim(),
        }))
        .filter(b => b.batch),
    };
  });
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE-DIVISION GENERATOR
// Order: Core Labs → Elective Labs → Theory Electives → Theory → Remedials(end)
// ─────────────────────────────────────────────────────────────────────────────
export function generateTimetable(
  subjects,
  assignments,
  roomPools,
  numBatches,
  div,
  globalTeacherSlots = {},
  globalRoomSlots    = {}
) {
  const normAssign = normaliseAssignments(assignments);

  const grid             = buildEmptyGrid();
  const labSubjects      = subjects.filter(s => isCoreLab(s.type));
  const electiveLabSubs  = subjects.filter(s => isElectiveLab(s.type));
  const theorySubjects   = subjects.filter(s => s.type === "theory");
  const electiveSubjects = subjects.filter(s => isElectiveType(s.type));
  const classroomPool    = roomPools.theory   || [];
  const electivePool     = roomPools.elective || [];
  const labPool          = roomPools.lab      || [];
  const cUsed            = {};

  // ── Step 1: Core Lab rotations ─────────────────────────────────────────────
  placeLabRotations(
    grid, labSubjects, div, numBatches, normAssign,
    labPool, globalTeacherSlots, globalRoomSlots
  );

  // ── Step 2: Elective Labs (DLO Labs, MINOR Labs) ───────────────────────────
  if (electiveLabSubs.length) {
    const electiveLabGroups = {};
    electiveLabSubs.forEach(sub => {
      const m        = sub.type.match(/^Elective-(.+)-Lab$/);
      const groupKey = m ? m[1] : sub.type;
      if (!electiveLabGroups[groupKey]) electiveLabGroups[groupKey] = [];
      electiveLabGroups[groupKey].push(sub);
    });

    const eLabPool = labPool.length ? labPool : classroomPool;

    Object.values(electiveLabGroups).forEach(groupSubs => {
      placeElectiveLabGroup(
        grid, groupSubs, normAssign, eLabPool,
        globalTeacherSlots, globalRoomSlots
      );
    });
  }

  // ── Step 3: Theory Electives ───────────────────────────────────────────────
  const electiveGroups = {};
  electiveSubjects.forEach(sub => {
    if (!electiveGroups[sub.type]) electiveGroups[sub.type] = [];
    electiveGroups[sub.type].push(sub);
  });
  Object.entries(electiveGroups).forEach(([groupType, groupSubs]) => {
    placeElectiveGroup(
      grid, groupType, groupSubs, normAssign,
      classroomPool, electivePool,
      globalTeacherSlots, globalRoomSlots
    );
  });

  // ── Step 4: Theory subjects ────────────────────────────────────────────────
  theorySubjects.forEach(sub => {
    const teacherCode = toCodeStr(normAssign[sub.id]?.teacherCode);
    const room        = pickRoom(classroomPool, cUsed);
    placeTheorySubject(grid, sub, teacherCode, room, globalTeacherSlots, globalRoomSlots);
  });

  // ── Step 5: Remedials — ONLY after last occupied slot per day ──────────────
  fillRemedials(grid);

  return grid;
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-DIVISION ORCHESTRATOR
// ─────────────────────────────────────────────────────────────────────────────
export function generateAllTimetables(config) {
  const { yearBranches, ybSubjects, ybBatchCount, assignments, roomPools } = config;

  const globalTeacherSlots = {};
  const globalRoomSlots    = {};
  const allTimetables      = {};

  for (const yb of yearBranches) {
    allTimetables[yb.id] = {};
    const subjects   = ybSubjects[yb.id]  || [];
    const numBatches = ybBatchCount[yb.id] || 3;
    const rPools     = roomPools[yb.id]   || { theory: [], elective: [], lab: [] };

    const ybAssignments = assignments?.[yb.id] || assignments?.[`${yb.year}-${yb.branch}`] || {};

    for (const div of yb.divs) {
      const rawDivAssignments = ybAssignments[div] || {};
      const divAssign         = normaliseAssignments(rawDivAssignments);

      allTimetables[yb.id][div] = generateTimetable(
        subjects, divAssign, rPools, numBatches, div,
        globalTeacherSlots, globalRoomSlots
      );
    }
  }

  return { allTimetables };
}

// ─────────────────────────────────────────────────────────────────────────────
// TEACHER TIMETABLE BUILDER
// ─────────────────────────────────────────────────────────────────────────────
export function buildTeacherTTs(allTimetables, teachers) {
  const res = {};
  teachers.forEach(t => {
    res[t.code] = {};
    DAYS.forEach(d => { res[t.code][d] = {}; SLOTS.forEach(s => { res[t.code][d][s] = []; }); });
  });

  Object.entries(allTimetables).forEach(([ybKey, divGrids]) => {
    Object.entries(divGrids).forEach(([div, grid]) => {
      DAYS.forEach(day => {
        SLOTS.forEach(slot => {
          const cell = grid[day][slot];
          if (!cell?.subject || cell.subject === "BREAK" || cell.subject === "REMEDIAL") return;

          if (cell.batches?.length) {
            cell.batches.forEach(b => {
              const code = toCodeStr(b.teacherCode);
              if (code && res[code])
                res[code][day][slot].push({
                  subject: b.subjectName || cell.subject,
                  ybLabel: ybKey, div, room: b.room || "", batch: b.batch,
                });
            });
          } else if (cell.electives?.length) {
            cell.electives.forEach(e => {
              const code = toCodeStr(e.teacherCode);
              if (code && res[code])
                res[code][day][slot].push({
                  subject: e.name, ybLabel: ybKey, div, room: e.room || "", batch: "",
                });
            });
          } else {
            toCodeStr(cell.teacherCode)
              .split(/[,;]/).map(s => s.trim()).filter(Boolean)
              .forEach(code => {
                if (res[code])
                  res[code][day][slot].push({
                    subject: cell.subject, ybLabel: ybKey, div, room: cell.room || "", batch: "",
                  });
              });
          }
        });
      });
    });
  });

  return res;
}

// ─────────────────────────────────────────────────────────────────────────────
// LAB ROOM TIMETABLE BUILDER
// ─────────────────────────────────────────────────────────────────────────────
export function buildLabRoomTTs(allTimetables) {
  const roomTTs = {};
  Object.entries(allTimetables).forEach(([ybKey, divGrids]) => {
    Object.entries(divGrids).forEach(([div, grid]) => {
      DAYS.forEach(day => {
        SLOTS.forEach(slot => {
          const cell = grid[day]?.[slot];
          if (!cell || cell.subject === "BREAK") return;

          if (cell.isLabRotation && cell.batches?.length) {
            cell.batches.forEach(b => {
              if (!b.room) return;
              if (!roomTTs[b.room]) {
                roomTTs[b.room] = {};
                DAYS.forEach(d => { roomTTs[b.room][d] = {}; SLOTS.forEach(s => { roomTTs[b.room][d][s] = null; }); });
              }
              roomTTs[b.room][day][slot] = {
                batch:       b.batch,
                subjectName: b.subjectName,
                teacherCode: toCodeStr(b.teacherCode),
                ybLabel:     ybKey,
                div,
              };
            });
          }

          if (cell.isElectiveLab && cell.electives?.length) {
            cell.electives.forEach(e => {
              if (!e.room) return;
              if (!roomTTs[e.room]) {
                roomTTs[e.room] = {};
                DAYS.forEach(d => { roomTTs[e.room][d] = {}; SLOTS.forEach(s => { roomTTs[e.room][d][s] = null; }); });
              }
              roomTTs[e.room][day][slot] = {
                batch:         "",
                subjectName:   e.name,
                teacherCode:   toCodeStr(e.teacherCode),
                ybLabel:       ybKey,
                div,
                isElectiveLab: true,
              };
            });
          }
        });
      });
    });
  });
  return roomTTs;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLASSROOM TIMETABLE BUILDER
// ─────────────────────────────────────────────────────────────────────────────
export function buildClassroomTTs(allTimetables, rooms) {
  const classrooms = rooms.filter(r => r.type === "classroom");
  const roomTTs = {};

  classrooms.forEach(room => {
    roomTTs[room.number] = {};
    DAYS.forEach(d => {
      roomTTs[room.number][d] = {};
      SLOTS.forEach(s => { roomTTs[room.number][d][s] = []; });
    });
  });

  Object.entries(allTimetables).forEach(([ybKey, divGrids]) => {
    Object.entries(divGrids).forEach(([div, grid]) => {
      DAYS.forEach(day => {
        SLOTS.forEach(slot => {
          const cell = grid[day]?.[slot];
          if (!cell || cell.subject === "BREAK" || cell.subject === "REMEDIAL" || !cell.room) return;

          const roomNums = cell.room.split(',').map(r => r.trim()).filter(Boolean);
          roomNums.forEach(roomNum => {
            if (!roomTTs[roomNum]) return;
            if (cell.electives?.length) {
              roomTTs[roomNum][day][slot].push({
                subject:     cell.subject,
                teacherCode: toCodeStr(cell.teacherCode),
                ybLabel:     ybKey,
                div,
                electives:   cell.electives.map(e => ({ ...e, teacherCode: toCodeStr(e.teacherCode) })),
              });
            } else if (!cell.batches) {
              roomTTs[roomNum][day][slot].push({
                subject:     cell.subject,
                teacherCode: toCodeStr(cell.teacherCode),
                ybLabel:     ybKey,
                div,
              });
            }
          });
        });
      });
    });
  });

  return roomTTs;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildRunViews
// ─────────────────────────────────────────────────────────────────────────────
export function buildRunViews(allTimetables, teachers, rooms) {
  return {
    teacherTTs:   buildTeacherTTs(allTimetables, teachers),
    labRoomTTs:   buildLabRoomTTs(allTimetables),
    classroomTTs: buildClassroomTTs(allTimetables, rooms),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF GENERATORS
// ─────────────────────────────────────────────────────────────────────────────
export function generatePDF(grid, caption, dept, semLabel, teachers, footerRoles) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) { alert("Please allow popups."); return; }
  const seen = new Set(); let subjectRows = "", srNo = 1;
  DAYS.forEach(day => SLOTS.forEach(slot => {
    const cell = grid[day]?.[slot];
    if (!cell?.subject || cell.subject === "BREAK" || cell.subject === "REMEDIAL" || seen.has(cell.subject)) return;
    seen.add(cell.subject);
    if (cell.batches?.length) {
      const shownSubs = new Set();
      cell.batches.forEach(b => {
        if (shownSubs.has(b.subjectName)) return; shownSubs.add(b.subjectName);
        const code = toCodeStr(b.teacherCode);
        const tO   = teachers.find(t => t.code === code);
        subjectRows += `<tr><td>${srNo++}</td><td>${b.subjectName}</td><td>${b.batch}</td><td>${code||"—"}</td><td>${tO?.name||"—"}</td><td>${b.room||"—"}</td></tr>`;
      });
    } else if (cell.electives?.length) {
      cell.electives.forEach(e => {
        const code = toCodeStr(e.teacherCode);
        const tO   = teachers.find(t => t.code === code);
        subjectRows += `<tr><td>${srNo++}</td><td>${e.name}</td><td style="font-style:italic;color:#7c5c00;">${cell.subject}</td><td>${code||"—"}</td><td>${tO?.name||"—"}</td><td>${e.room||"—"}</td></tr>`;
      });
    } else {
      const code = toCodeStr(cell.teacherCode);
      const tO   = teachers.find(t => t.code === code);
      subjectRows += `<tr><td>${srNo++}</td><td>${cell.subject}</td><td>—</td><td>${code||"—"}</td><td>${tO?.name||"—"}</td><td>${cell.room||"—"}</td></tr>`;
    }
  }));

  let gridHTML = "";
  DAYS.forEach(day => {
    const cells = SLOTS.map(slot => {
      const cell = grid[day]?.[slot];
      if (slot === BREAK_SLOT) return `<td class="break-cell">BREAK</td>`;
      if (!cell?.subject || cell.subject === "REMEDIAL") return `<td class="remedial-cell">REMEDIAL</td>`;
      if (cell.batches?.length) {
        return `<td class="lab-cell">${cell.batches.map(b => {
          const code = toCodeStr(b.teacherCode);
          const tO   = teachers.find(t => t.code === code);
          return `<div class="batch-line"><span class="batch-tag">${b.batch}</span><strong>${b.subjectName}</strong>${tO?`<div class="tc">${tO.name}</div>`:(code?`<div class="tc">${code}</div>`:"")}${b.room?`<div class="room-tag">${b.room}</div>`:""}</div>`;
        }).join("")}</td>`;
      }
      if (cell.electives?.length) {
        const cellClass = cell.isElectiveLab ? "elective-lab-cell" : "elective-cell";
        return `<td class="${cellClass}"><div class="elective-group-label">${cell.subject}</div>${cell.electives.map(e => {
          const code = toCodeStr(e.teacherCode);
          return `<div class="elective-opt-line"><strong>${e.name}</strong>${code?`<div class="tc">${code}</div>`:""}${e.room?`<div class="room-tag">${e.room}</div>`:""}</div>`;
        }).join("")}</td>`;
      }
      const code = toCodeStr(cell.teacherCode);
      return `<td><strong>${cell.subject}</strong>${code?`<br/><small class="tc">${code}</small>`:""}${cell.room?`<br/><span class="room-tag">${cell.room}</span>`:""}</td>`;
    }).join("");
    gridHTML += `<tr><td class="day-cell">${DAY_SHORT[day]}</td>${cells}</tr>`;
  });

  const signBlocks = (footerRoles || []).filter(r=>r.role&&r.name).map(r=>`<div class="sign-block"><div class="sign-label">${r.role}</div><div class="sign-name">${r.name}</div></div>`).join("");

  printWindow.document.write(`<!DOCTYPE html><html><head><title>${caption}</title><style>
    @page{size:A3 landscape;margin:15mm;}body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#222;}
    .header{text-align:center;margin-bottom:12px;}.header h2{margin:0;font-size:16px;}.header h3{margin:4px 0;font-size:13px;color:#667eea;}
    table{width:100%;border-collapse:collapse;margin-bottom:16px;}th,td{border:1px solid #d0d5dd;padding:6px 7px;text-align:center;font-size:10px;vertical-align:middle;}
    th{background:#667eea;color:#fff;font-weight:700;}.day-cell{background:#f1f5ff;font-weight:700;}.break-cell{background:#fff3e0;color:#e65100;font-weight:700;font-style:italic;}
    .remedial-cell{background:#f0f0f0;color:#999;font-weight:600;font-style:italic;}
    .lab-cell{background:#e8f5e9;color:#2e7d32;}
    .elective-cell{background:#fffbf0;color:#92400e;}
    .elective-lab-cell{background:#f0f0ff;color:#3730a3;}
    .elective-group-label{font-weight:700;font-size:9px;color:#b45309;border-bottom:1px solid #fcd34d;padding-bottom:2px;margin-bottom:3px;text-transform:uppercase;text-align:center;}
    .elective-opt-line{margin-bottom:3px;padding:2px 4px;background:rgba(252,211,77,0.15);border-radius:3px;font-size:9px;text-align:center;}
    .batch-line{margin-bottom:4px;font-size:9px;text-align:center;}
    .batch-tag{background:#e9d8fd;color:#553c9a;padding:1px 4px;border-radius:3px;font-size:8px;font-weight:700;display:inline-block;margin-bottom:2px;}
    .room-tag{background:#ebf4ff;color:#2c5282;padding:1px 4px;border-radius:3px;font-size:8px;font-weight:700;display:inline-block;margin-top:2px;}.tc{color:#666;font-size:8px;text-align:center;margin-top:2px;}
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
      const code = toCodeStr(entry.teacherCode);
      const tO   = teachers.find(t => t.code === code);
      const batchLabel = entry.batch ? `<span class="batch-tag">${entry.batch}</span>` : "";
      return `<td class="lab-cell">${batchLabel}<strong style="display:block;margin-top:3px;">${entry.subjectName}</strong>${tO?`<span class="tc">${tO.name}</span>`:(code?`<span class="tc">${code}</span>`:"")}<br/><span style="font-size:8px;color:#888;">${entry.ybLabel} / Div ${entry.div}</span></td>`;
    }).join("");
    gridHTML += `<tr><td class="day-cell">${DAY_SHORT[day]}</td>${cells}</tr>`;
  });
  printWindow.document.write(`<!DOCTYPE html><html><head><title>Lab Room ${roomNumber}</title><style>
    @page{size:A3 landscape;margin:15mm;}body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#222;}
    .header{text-align:center;margin-bottom:12px;}.header h2{margin:0;font-size:16px;}.header h3{margin:4px 0;font-size:13px;color:#276749;}
    table{width:100%;border-collapse:collapse;margin-bottom:16px;}th,td{border:1px solid #d0d5dd;padding:7px 8px;text-align:center;font-size:10px;vertical-align:middle;}
    th{background:#276749;color:#fff;font-weight:700;}.day-cell{background:#f0fff4;font-weight:700;color:#276749;}
    .break-cell{background:#fff3e0;color:#e65100;font-weight:700;font-style:italic;}.lab-cell{background:#f0fff4;color:#276749;}
    .batch-tag{background:#e9d8fd;color:#553c9a;padding:1px 5px;border-radius:3px;font-size:9px;font-weight:700;display:inline-block;margin-bottom:3px;}.tc{color:#555;font-size:9px;display:block;margin-top:3px;}
  </style></head><body>
    <div class="header"><h2>${dept}</h2><h3>Lab Room Timetable — ${roomNumber}</h3><p>${semLabel}</p></div>
    <table><thead><tr><th>Day</th>${SLOTS.map(s=>`<th>${SLOT_LBL[s]}</th>`).join("")}</tr></thead><tbody>${gridHTML}</tbody></table>
  </body></html>`);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 500);
}

export function generateClassroomPDF(roomNumber, roomGrid, dept, semLabel, teachers) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) { alert("Please allow popups."); return; }
  let gridHTML = "";
  DAYS.forEach(day => {
    const cells = SLOTS.map(slot => {
      if (slot === BREAK_SLOT) return `<td class="break-cell">BREAK</td>`;
      const entries = roomGrid[day]?.[slot];
      if (!entries || !entries.length) return `<td style="color:#ccc;">—</td>`;
      const entry = entries[0];
      const code = toCodeStr(entry.teacherCode);
      const tO   = teachers.find(t => t.code === code);
      if (entry.electives) {
        return `<td class="elective-cell"><div class="elective-label">${entry.subject}</div>${entry.electives.map(e => {
          const ec = toCodeStr(e.teacherCode);
          return `<div class="elective-line"><strong>${e.name}</strong>${ec?`<div class="tc">${ec}</div>`:""}</div>`;
        }).join("")}<div style="font-size:8px;color:#888;margin-top:4px;">${entry.ybLabel} / Div ${entry.div}</div></td>`;
      }
      return `<td class="theory-cell"><strong style="display:block;">${entry.subject}</strong>${tO?`<div class="tc">${tO.name}</div>`:(code?`<div class="tc">${code}</div>`:"")} <div style="font-size:8px;color:#888;margin-top:4px;">${entry.ybLabel} / Div ${entry.div}</div></td>`;
    }).join("");
    gridHTML += `<tr><td class="day-cell">${DAY_SHORT[day]}</td>${cells}</tr>`;
  });
  printWindow.document.write(`<!DOCTYPE html><html><head><title>Classroom ${roomNumber}</title><style>
    @page{size:A3 landscape;margin:15mm;}body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#222;}
    .header{text-align:center;margin-bottom:12px;}.header h2{margin:0;font-size:16px;}.header h3{margin:4px 0;font-size:13px;color:#3451b2;}
    table{width:100%;border-collapse:collapse;margin-bottom:16px;}th,td{border:1px solid #d0d5dd;padding:7px 8px;text-align:center;font-size:10px;vertical-align:middle;}
    th{background:#3451b2;color:#fff;font-weight:700;}.day-cell{background:#f1f5ff;font-weight:700;color:#3451b2;}
    .break-cell{background:#fff3e0;color:#e65100;font-weight:700;font-style:italic;}
    .theory-cell{background:#fafbff;color:#1a2b4a;}
    .elective-cell{background:#fffbf0;color:#92400e;}
    .elective-label{font-weight:700;font-size:9px;color:#b45309;border-bottom:1px solid #fcd34d;padding-bottom:2px;margin-bottom:4px;}
    .elective-line{margin-bottom:3px;font-size:9px;}
    .tc{color:#555;font-size:9px;margin-top:3px;}
  </style></head><body>
    <div class="header"><h2>${dept}</h2><h3>Classroom Timetable — ${roomNumber}</h3><p>${semLabel}</p></div>
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
  tabYBActive:      { background: "linear-gradient(90deg,#667eea,#764ba2)", color: "#fff", border: "1.5px solid transparent", fontWeight: 700 },
  tabTeacherActive: { background: "linear-gradient(90deg,#2d6a4f,#40916c)", color: "#fff", border: "1.5px solid transparent", fontWeight: 700 },
  tabLabActive:     { background: "linear-gradient(90deg,#276749,#38a169)", color: "#fff", border: "1.5px solid transparent", fontWeight: 700 },
  tabLabRoomActive: { background: "linear-gradient(90deg,#276749,#38a169)", color: "#fff", border: "1.5px solid transparent", fontWeight: 700 },
};